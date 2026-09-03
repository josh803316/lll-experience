import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normPlayerName } from '../config/fantasy-managers.js'
import { applyDraftLetters, lettersForScores } from './fantasy-metrics.js'
import type { DraftPickRow } from './fantasy-scout.js'
import { FantasyScout } from './fantasy-scout.js'

type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF'

export interface CommissionerPlayerRow {
  name: string
  position: Pos
  team: string | null
  rank: number
  projectedPoints: number
  premium: number
  norm: string
}

export interface CommissionerRankingFile {
  season: number
  commissioner: string
  commissionerName: string
  label: string
  sourceFile?: string
  importedAt: string
  players: CommissionerPlayerRow[]
}

export interface CommissionerPickRow {
  playerId: string
  playerName: string
  position: string
  amount: number
  slug: string
  displayName: string
  commissionerRank: number | null
  projectedPoints: number | null
  premium: number | null
  matched: boolean
}

export interface CommissionerGmRow {
  slug: string
  displayName: string
  totalPremium: number
  totalProjectedPoints: number
  avgRank: number
  matchedPicks: number
  draftPicks: number
  commissionerGrade: string
  byPosition: Partial<Record<Pos, { picks: number; premium: number; avgRank: number }>>
  picks: CommissionerPickRow[]
}

export interface CommissionerRankingData {
  season: number
  commissionerName: string
  label: string
  importedAt: string
  sourceFile?: string
  rankedPlayerCount: number
  replacementPremium: Partial<Record<Pos, number>>
  gms: CommissionerGmRow[]
}

/** Tim's DEF sheet uses city nicknames; Sleeper uses full team names. */
const DEF_CITY_TO_KEYWORDS: Record<string, string[]> = {
  denver: ['denver', 'broncos'],
  houston: ['houston', 'texans'],
  'l.a. chargers': ['chargers'],
  minnesota: ['minnesota', 'vikings'],
  seattle: ['seattle', 'seahawks'],
  detroit: ['detroit', 'lions'],
  'l.a. rams': ['rams'],
  atlanta: ['atlanta', 'falcons'],
  philadelphia: ['philadelphia', 'eagles'],
  baltimore: ['baltimore', 'ravens'],
  'new orleans': ['new orleans', 'saints'],
  cleveland: ['cleveland', 'browns'],
  pittsburgh: ['pittsburgh', 'steelers'],
  buffalo: ['buffalo', 'bills'],
  'new england': ['new england', 'patriots'],
  chicago: ['chicago', 'bears'],
  'kansas city': ['kansas city', 'chiefs'],
  cincinnati: ['cincinnati', 'bengals'],
  'green bay': ['green bay', 'packers'],
  carolina: ['carolina', 'panthers'],
  miami: ['miami', 'dolphins'],
  indianapolis: ['indianapolis', 'colts'],
  washington: ['washington', 'commanders'],
  tennessee: ['tennessee', 'titans'],
  'tampa bay': ['tampa bay', 'buccaneers'],
  'las vegas': ['las vegas', 'raiders'],
  jacksonville: ['jacksonville', 'jaguars'],
  'n.y. giants': ['giants'],
  dallas: ['dallas', 'cowboys'],
  'san francisco': ['san francisco', '49ers'],
  'n.y. jets': ['jets'],
  arizona: ['arizona', 'cardinals'],
}

function loadRankingFile(season: number): CommissionerRankingFile | null {
  const path = resolve(`src/data/commissioner/tim-${season}.json`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CommissionerRankingFile
  } catch {
    return null
  }
}

function replacementPremiumByPosition(
  players: CommissionerPlayerRow[]
): Partial<Record<Pos, number>> {
  const out: Partial<Record<Pos, number>> = {}
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'DEF'] as const) {
    const atPos = players.filter((p) => p.position === pos && p.premium > 0)
    if (atPos.length === 0) continue
    const sorted = [...atPos].sort((a, b) => b.premium - a.premium)
    const idx = Math.max(0, Math.floor(sorted.length * 0.25) - 1)
    out[pos] = sorted[idx]?.premium ?? 0
  }
  return out
}

interface RankingLookup {
  get(key: string): CommissionerPlayerRow | undefined
  matchDef(sleeperName: string): CommissionerPlayerRow | undefined
}

function buildLookup(players: CommissionerPlayerRow[]): RankingLookup {
  const skill = new Map<string, CommissionerPlayerRow>()
  const defs: CommissionerPlayerRow[] = []
  for (const row of players) {
    if (row.position === 'DEF') {
      defs.push(row)
      continue
    }
    skill.set(`${row.norm}|${row.position}`, row)
  }

  return {
    get(key: string) {
      return skill.get(key)
    },
    matchDef(sleeperName: string) {
      const norm = normPlayerName(sleeperName)
      for (const row of defs) {
        const city = normPlayerName(row.name)
        const keywords = DEF_CITY_TO_KEYWORDS[city] ?? [city]
        if (keywords.every((kw) => norm.includes(kw))) return row
      }
      return undefined
    },
  }
}

function matchPick(pick: DraftPickRow, lookup: RankingLookup): CommissionerPlayerRow | undefined {
  if (pick.position === 'DEF') {
    return lookup.matchDef(pick.playerName)
  }
  return lookup.get(`${normPlayerName(pick.playerName)}|${pick.position}`)
}

function buildGmRows(picks: DraftPickRow[], file: CommissionerRankingFile): CommissionerGmRow[] {
  const lookup = buildLookup(file.players)
  const bySlug = new Map<string, CommissionerGmRow>()

  for (const pick of picks) {
    const ranked = matchPick(pick, lookup)
    const existing =
      bySlug.get(pick.slug) ??
      ({
        slug: pick.slug,
        displayName: pick.displayName,
        totalPremium: 0,
        totalProjectedPoints: 0,
        avgRank: 0,
        matchedPicks: 0,
        draftPicks: 0,
        commissionerGrade: '—',
        byPosition: {},
        picks: [],
      } satisfies CommissionerGmRow)

    existing.draftPicks++
    const pickRow: CommissionerPickRow = {
      playerId: pick.playerId,
      playerName: pick.playerName,
      position: pick.position,
      amount: pick.amount,
      slug: pick.slug,
      displayName: pick.displayName,
      commissionerRank: ranked?.rank ?? null,
      projectedPoints: ranked?.projectedPoints ?? null,
      premium: ranked?.premium ?? null,
      matched: Boolean(ranked),
    }
    existing.picks.push(pickRow)

    if (ranked) {
      existing.matchedPicks++
      existing.totalPremium += ranked.premium
      existing.totalProjectedPoints += ranked.projectedPoints
      const pos = ranked.position
      const bucket = existing.byPosition[pos] ?? { picks: 0, premium: 0, avgRank: 0 }
      bucket.picks++
      bucket.premium += ranked.premium
      bucket.avgRank += ranked.rank
      existing.byPosition[pos] = bucket
    }

    bySlug.set(pick.slug, existing)
  }

  const gms = [...bySlug.values()].map((gm) => {
    const ranks = gm.picks
      .filter((p) => p.commissionerRank != null)
      .map((p) => p.commissionerRank as number)
    gm.avgRank = ranks.length > 0 ? ranks.reduce((s, n) => s + n, 0) / ranks.length : 0
    for (const pos of Object.keys(gm.byPosition) as Pos[]) {
      const bucket = gm.byPosition[pos]
      if (bucket && bucket.picks > 0) bucket.avgRank /= bucket.picks
    }
    gm.picks.sort((a, b) => (a.commissionerRank ?? 999) - (b.commissionerRank ?? 999))
    return gm
  })

  const graded = applyDraftLetters(
    gms.map((gm) => ({ ...gm, draftSurplus: gm.totalPremium, draftGrade: '' }))
  )
  return graded
    .map((gm) => ({ ...gm, commissionerGrade: gm.draftGrade }))
    .sort((a, b) => b.totalPremium - a.totalPremium)
}

export const CommissionerRanking = {
  availableSeasons(): number[] {
    return [2026]
  },

  async forSeason(year: number): Promise<CommissionerRankingData | null> {
    const file = loadRankingFile(year)
    if (!file) return null
    const { picks } = await FantasyScout.draft(year)
    if (picks.length === 0) return null
    const gms = buildGmRows(picks, file)
    return {
      season: year,
      commissionerName: file.commissionerName,
      label: file.label,
      importedAt: file.importedAt,
      sourceFile: file.sourceFile,
      rankedPlayerCount: file.players.length,
      replacementPremium: replacementPremiumByPosition(file.players),
      gms,
    }
  },

  /** Exported for tests */
  _lettersForScores: lettersForScores,
  _matchPick: matchPick,
  _buildLookup: buildLookup,
}
