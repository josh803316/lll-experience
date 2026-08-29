import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  canonicalManager,
  managerForSleeperUser,
  normPlayerName,
} from '../config/fantasy-managers.js'
import { getDB } from '../db/index.js'
import {
  fantasyDraftPicks,
  fantasyDrafts,
  fantasyLeagues,
  fantasyManagers,
  fantasyMatchups,
  fantasyPlayers,
  fantasyPlayerWeeks,
  fantasyProjections,
  fantasyRecords,
  fantasyRosters,
  fantasyTransactions,
  pffPlayerStats,
} from '../db/schema.js'
import {
  allPlayFromMatchups,
  applyDraftLetters,
  dollarOneReplacement,
  finishRanks,
  median,
  type ScoredPick,
  scoreDraftPicks,
  type TxEvent,
  winPct,
  wireStints,
} from './fantasy-metrics.js'
import {
  blendWeeklyPts,
  blendWeeklyStats,
  type CountingStat,
  countingStatsForPosition,
  type HeatCell,
  positionalHeatmapWeekly,
  projectedWeeklyScores,
  starterSlots,
} from './fantasy-projections.js'
import {
  buildFantasyEvolution,
  buildFantasyTimeline,
  type FantasyEvolutionResult,
  type FantasyTimelineInput,
  type FantasyTimelinePoint,
  replayRosterSnapshots,
} from './fantasy-timeline.js'

export interface SeasonSummary {
  season: number
  sleeperLeagueId: string
  status: string
  name: string
  teamCount: number
  draftStatus: string | null
}

export interface GmSeasonRow {
  slug: string
  displayName: string
  sleeperUserId: string | null
  teamName: string | null
  season: number
  sleeperLeagueId: string
  rosterId: number
  wins: number
  losses: number
  ties: number
  winPct: number
  fpts: number
  fptsAgainst: number
  games: number
  weeksPlayed: number
  pfPerWeek: number
  finish: number
  waiverBudgetUsed: number
  draftSurplus: number
  draftGrade: string
  draftProjected: boolean
  wireFpts: number
  lateFpts: number
  projected: boolean
}

export interface HeatmapTeam {
  slug: string
  displayName: string
  projected: boolean
  ovr: HeatCell
  qb: HeatCell
  rb: HeatCell
  wr: HeatCell
  te: HeatCell
  flex: HeatCell
  def: HeatCell
}

export interface GmAllTimeRow {
  slug: string
  displayName: string
  sleeperUserId: string | null
  seasons: number
  wins: number
  losses: number
  ties: number
  winPct: number
  fpts: number
  fptsAgainst: number
  pfPerWeek: number
  avgFinish: number
  sparkline: number[] // finish by season ascending, 0 = DNP
  draftSurplus: number
  draftGrade: string
  draftProjected: boolean
  wireFpts: number
  lateFpts: number
  years: GmSeasonRow[]
}

export interface DraftPickRow extends ScoredPick {
  playerName: string
  slug: string
  displayName: string
  pffGrade: number | null
  isKeeper: boolean
  pickNo: number
}

export interface WireRow {
  slug: string
  displayName: string
  playerId: string
  playerName: string
  addWeek: number
  dropWeek: number
  type: string
  waiverBid: number
  fpts: number
  value: number
}

export interface PlayerCardWeek {
  week: number
  points: number
}

export interface PlayerCardData {
  playerId: string
  name: string
  position: string | null
  team: string | null
  season: number
  projected: boolean
  fpts: number
  avg: number
  high: number
  owner: string | null
  amount: number | null
  surplus: number | null
  weeks: PlayerCardWeek[]
  stats: CountingStat[]
}

export interface FantasyTimelineData {
  season: number
  projected: boolean
  manager: { slug: string; displayName: string }
  points: FantasyTimelinePoint[]
  room: FantasyTimelinePoint[]
}

export interface FantasyEvolutionData extends FantasyEvolutionResult {
  season: number
  projected: boolean
  strengthBasis: 'retrospective actuals' | 'current projections'
}

export interface H2HCell {
  a: string
  b: string
  wins: number
  losses: number
  ties: number
  games: number
}

export interface FantasyWeeklyScore {
  season: number
  week: number
  rosterId: number
  slug: string
  displayName: string
  teamName: string | null
  points: number
  rank: number
}

export interface FantasyRecordRow {
  key: string
  label: string
  valueNum: number | null
  valueText: string
  holderSlug: string | null
  holderName: string
  season: number | null
  week: number | null
  detail: string
}

export interface FantasyRecordsData {
  records: FantasyRecordRow[]
  badges: FantasyRecordRow[]
}

export interface FantasyCohortRow {
  cohort: 'dad' | 'kid'
  wins: number
  losses: number
  ties: number
  winPct: number
  members: { slug: string; displayName: string; winPct: number }[]
}

export interface FantasySeasonExtras {
  weekly: FantasyWeeklyScore[]
  h2h: H2HCell[]
  highWeek: number
  leagueAverage: number
  leagueMedian: number
}

export interface FantasyManagerExtras {
  weekly: FantasyWeeklyScore[]
  leagueMedian: number
  heatmap: HeatmapTeam | null
  h2h: H2HCell[]
}

export interface ManagerTeamPlayer {
  playerId: string
  playerName: string
  position: string | null
  source: 'auction' | 'in-season'
  addWeek: number | null
}

function pffCategory(position: string | null): string | null {
  const pos = (position || '').toUpperCase()
  if (pos === 'QB') {
    return 'passing'
  }
  if (pos === 'RB' || pos === 'FB') {
    return 'rushing'
  }
  if (pos === 'WR' || pos === 'TE') {
    return 'receiving'
  }
  return null
}

async function loadContext() {
  const db = getDB()
  const [leagues, managers, rosters, drafts, picks, matchups, playerWeeks, txs, projections] =
    await Promise.all([
      db.select().from(fantasyLeagues).orderBy(asc(fantasyLeagues.season)),
      db.select().from(fantasyManagers),
      db.select().from(fantasyRosters),
      db.select().from(fantasyDrafts),
      db.select().from(fantasyDraftPicks),
      db.select().from(fantasyMatchups),
      db.select().from(fantasyPlayerWeeks),
      db.select().from(fantasyTransactions),
      db
        .select({
          season: fantasyProjections.season,
          week: fantasyProjections.week,
          playerId: fantasyProjections.playerId,
          pts: fantasyProjections.pts,
        })
        .from(fantasyProjections),
    ])
  const ids = new Set<string>()
  for (const p of picks) {
    ids.add(p.playerId)
  }
  for (const w of playerWeeks) {
    ids.add(w.playerId)
  }
  for (const tx of txs) {
    for (const id of Object.keys(tx.adds ?? {})) {
      ids.add(id)
    }
    for (const id of Object.keys(tx.drops ?? {})) {
      ids.add(id)
    }
  }
  const idList = [...ids]
  const players =
    idList.length === 0
      ? []
      : await db.select().from(fantasyPlayers).where(inArray(fantasyPlayers.playerId, idList))
  const managerBySleeper = new Map(managers.map((m) => [m.sleeperUserId, m]))
  const playerById = new Map(players.map((p) => [p.playerId, p]))
  return {
    db,
    leagues,
    managers,
    rosters,
    drafts,
    picks,
    matchups,
    playerWeeks,
    txs,
    playerById,
    managerBySleeper,
    projections,
  }
}

type Ctx = Awaited<ReturnType<typeof loadContext>>

function ident(ctx: Ctx, sleeperUserId: string | null, fallback?: string | null) {
  const known = canonicalManager(sleeperUserId)
  if (known) {
    return { slug: known.slug, displayName: known.displayName }
  }
  if (sleeperUserId) {
    const row = ctx.managerBySleeper.get(sleeperUserId)
    if (row) {
      return { slug: row.slug, displayName: row.displayName }
    }
  }
  return managerForSleeperUser(sleeperUserId, fallback)
}

function playerName(ctx: Ctx, playerId: string): string {
  return ctx.playerById.get(playerId)?.fullName || playerId
}

function seasonPtsMap(ctx: Ctx, leagueId: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of ctx.playerWeeks) {
    if (w.sleeperLeagueId !== leagueId) {
      continue
    }
    map.set(w.playerId, (map.get(w.playerId) ?? 0) + w.points)
  }
  return map
}

function maxWeek(ctx: Ctx, leagueId: string): number {
  let max = 1
  for (const m of ctx.matchups) {
    if (m.sleeperLeagueId === leagueId && m.week > max) {
      max = m.week
    }
  }
  return max
}

function projectedPtsMap(ctx: Ctx, season: number): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of blendWeeklyPts(ctx.projections, season)) {
    map.set(w.playerId, (map.get(w.playerId) ?? 0) + w.pts)
  }
  return map
}

function scoredPicksForLeague(
  ctx: Ctx,
  leagueId: string,
  ptsOverride?: Map<string, number>
): ScoredPick[] {
  const draft = ctx.drafts.find((d) => d.sleeperLeagueId === leagueId)
  if (!draft) {
    return []
  }
  const picks = ctx.picks.filter((p) => p.draftId === draft.draftId)
  let pts = ptsOverride ?? seasonPtsMap(ctx, leagueId)
  if (!ptsOverride) {
    const actual = [...pts.values()].reduce((s, v) => s + v, 0)
    const league = ctx.leagues.find((l) => l.sleeperLeagueId === leagueId)
    if (actual === 0 && league) {
      const proj = projectedPtsMap(ctx, league.season)
      if (proj.size > 0) {
        pts = proj
      }
    }
  }
  return scoreDraftPicks(
    picks.map((p) => ({
      playerId: p.playerId,
      rosterId: p.rosterId,
      sleeperUserId: p.sleeperUserId,
      amount: p.amount,
      round: p.round,
      position: p.position,
    })),
    [...pts.entries()].map(([playerId, fpts]) => ({ playerId, fpts })),
    draft.rounds ?? 13
  )
}

function wireForLeague(ctx: Ctx, leagueId: string): { rows: WireRow[]; missed: WireRow[] } {
  const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === leagueId)
  const rosterOwner = new Map(leagueRosters.map((r) => [r.rosterId, r.sleeperUserId]))
  const stints = wireStints(
    txEventsForLeague(ctx, leagueId),
    ctx.playerWeeks
      .filter((w) => w.sleeperLeagueId === leagueId)
      .map((w) => ({ week: w.week, rosterId: w.rosterId, playerId: w.playerId, points: w.points })),
    maxWeek(ctx, leagueId)
  )
  const toRow = (s: (typeof stints)[0]): WireRow => {
    const id = ident(ctx, rosterOwner.get(s.rosterId) ?? null)
    return {
      slug: id.slug,
      displayName: id.displayName,
      playerId: s.playerId,
      playerName: playerName(ctx, s.playerId),
      addWeek: s.addWeek,
      dropWeek: s.dropWeek,
      type: s.type,
      waiverBid: s.waiverBid,
      fpts: s.fpts,
      value: s.fpts / Math.max(s.waiverBid, 1),
    }
  }
  const rows = stints.map(toRow).sort((a, b) => b.fpts - a.fpts)
  const missed: WireRow[] = []
  for (const tx of ctx.txs) {
    if (tx.sleeperLeagueId !== leagueId || tx.status === 'complete') {
      continue
    }
    if (tx.type !== 'waiver' && tx.type !== 'free_agent') {
      continue
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.adds ?? {})) {
      const rosterId = Number(rawRosterId)
      const id = ident(ctx, rosterOwner.get(rosterId) ?? null)
      missed.push({
        slug: id.slug,
        displayName: id.displayName,
        playerId,
        playerName: playerName(ctx, playerId),
        addWeek: tx.week,
        dropWeek: tx.week,
        type: tx.type,
        waiverBid: tx.waiverBid ?? 0,
        fpts: 0,
        value: 0,
      })
    }
  }
  return { rows, missed }
}

function txEventsForLeague(ctx: Ctx, leagueId: string): TxEvent[] {
  const events: TxEvent[] = []
  for (const tx of ctx.txs) {
    if (tx.sleeperLeagueId !== leagueId) {
      continue
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.adds ?? {})) {
      events.push({
        week: tx.week,
        type: tx.type,
        status: tx.status,
        rosterId: Number(rawRosterId),
        playerId,
        kind: 'add',
        waiverBid: tx.waiverBid,
      })
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.drops ?? {})) {
      events.push({
        week: tx.week,
        type: tx.type,
        status: tx.status,
        rosterId: Number(rawRosterId),
        playerId,
        kind: 'drop',
        waiverBid: tx.waiverBid,
      })
    }
  }
  return events
}

function buildSeasonRows(ctx: Ctx): GmSeasonRow[] {
  const rows: GmSeasonRow[] = []
  for (const league of ctx.leagues) {
    const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId)
    let allPlay = allPlayFromMatchups(
      ctx.matchups
        .filter((m) => m.sleeperLeagueId === league.sleeperLeagueId)
        .map((m) => ({
          week: m.week,
          rosterId: m.rosterId,
          matchupId: m.matchupId,
          points: m.points,
        }))
    )
    const hasActual = [...allPlay.values()].some((r) => r.weeksPlayed > 0 && r.fpts > 0)
    const projPts = projectedPtsMap(ctx, league.season)
    const useProjected = !hasActual && projPts.size > 0
    if (useProjected) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
      const drafted = ctx.picks
        .filter((p) => draft && p.draftId === draft.draftId)
        .map((p) => ({ rosterId: p.rosterId, playerId: p.playerId, position: p.position }))
      const weekly = blendWeeklyPts(ctx.projections, league.season)
      allPlay = allPlayFromMatchups(
        projectedWeeklyScores(drafted, weekly, starterSlots(league.rosterPositions))
      )
    }
    const ranked = finishRanks(
      leagueRosters.map((r) => {
        const rec = allPlay.get(r.rosterId)
        return {
          ...r,
          wins: rec?.wins ?? 0,
          losses: rec?.losses ?? 0,
          ties: rec?.ties ?? 0,
          fpts: rec?.fpts ?? r.fpts,
          weeksPlayed: rec?.weeksPlayed ?? 0,
        }
      })
    )
    const scored = scoredPicksForLeague(
      ctx,
      league.sleeperLeagueId,
      useProjected ? projPts : undefined
    )
    const stints = wireStints(
      txEventsForLeague(ctx, league.sleeperLeagueId),
      ctx.playerWeeks
        .filter((w) => w.sleeperLeagueId === league.sleeperLeagueId)
        .map((w) => ({
          week: w.week,
          rosterId: w.rosterId,
          playerId: w.playerId,
          points: w.points,
        })),
      maxWeek(ctx, league.sleeperLeagueId)
    )
    const seasonRows: GmSeasonRow[] = []
    for (const r of ranked) {
      const id = ident(ctx, r.sleeperUserId, r.teamName)
      const games = r.wins + r.losses + r.ties
      const gmPicks = scored.filter((p) => p.rosterId === r.rosterId)
      const totalSurplus = gmPicks.reduce((s, p) => s + p.surplus, 0)
      const wireFpts = stints
        .filter((s) => s.rosterId === r.rosterId)
        .reduce((s, x) => s + x.fpts, 0)
      const lateFpts = gmPicks.filter((p) => p.late).reduce((s, p) => s + p.fpts, 0)
      seasonRows.push({
        slug: id.slug,
        displayName: id.displayName,
        sleeperUserId: r.sleeperUserId,
        teamName: r.teamName,
        season: league.season,
        sleeperLeagueId: league.sleeperLeagueId,
        rosterId: r.rosterId,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        winPct: winPct(r.wins, r.losses, r.ties),
        fpts: r.fpts,
        fptsAgainst: r.fptsAgainst,
        games,
        weeksPlayed: r.weeksPlayed,
        pfPerWeek: r.weeksPlayed ? r.fpts / r.weeksPlayed : 0,
        finish: r.finish,
        waiverBudgetUsed: r.waiverBudgetUsed,
        draftSurplus: totalSurplus,
        draftGrade: gmPicks.length > 0 ? '' : '—',
        draftProjected: useProjected,
        wireFpts,
        lateFpts,
        projected: useProjected,
      })
    }
    rows.push(...applyDraftLetters(seasonRows))
  }
  return rows
}

function rollupAllTime(seasonRows: GmSeasonRow[], seasons: number[]): GmAllTimeRow[] {
  const bySlug = new Map<string, GmSeasonRow[]>()
  for (const row of seasonRows) {
    const list = bySlug.get(row.slug) ?? []
    list.push(row)
    bySlug.set(row.slug, list)
  }
  const out: GmAllTimeRow[] = []
  for (const [slug, years] of bySlug) {
    years.sort((a, b) => a.season - b.season)
    const live = years.filter((y) => !y.projected)
    const wins = live.reduce((s, y) => s + y.wins, 0)
    const losses = live.reduce((s, y) => s + y.losses, 0)
    const ties = live.reduce((s, y) => s + y.ties, 0)
    const fpts = live.reduce((s, y) => s + y.fpts, 0)
    const fptsAgainst = live.reduce((s, y) => s + y.fptsAgainst, 0)
    const weeksPlayed = live.reduce((s, y) => s + y.weeksPlayed, 0)
    const gradedYears = years.filter((y) => y.draftGrade !== '—')
    const draftSurplus =
      gradedYears.length > 0
        ? gradedYears.reduce((s, y) => s + y.draftSurplus, 0) / gradedYears.length
        : 0
    const sparkline = seasons.map((season) => {
      const y = years.find((row) => row.season === season)
      if (!y || y.projected) {
        return 0
      }
      return y.finish
    })
    out.push({
      slug,
      displayName: years[years.length - 1].displayName,
      sleeperUserId: years[years.length - 1].sleeperUserId,
      seasons: years.length,
      wins,
      losses,
      ties,
      winPct: winPct(wins, losses, ties),
      fpts,
      fptsAgainst,
      pfPerWeek: weeksPlayed ? fpts / weeksPlayed : 0,
      avgFinish: live.length > 0 ? live.reduce((s, y) => s + y.finish, 0) / live.length : 0,
      sparkline,
      draftSurplus,
      draftGrade: gradedYears.length > 0 ? '' : '—',
      draftProjected: gradedYears.some((y) => y.draftProjected),
      wireFpts: years.reduce((s, y) => s + y.wireFpts, 0),
      lateFpts: years.reduce((s, y) => s + y.lateFpts, 0),
      years,
    })
  }
  const graded = applyDraftLetters(out)
  graded.sort((a, b) => b.winPct - a.winPct || b.fpts - a.fpts)
  return graded
}

let pffCache: Map<string, number> | null = null

async function pffMap(db: Ctx['db'], seasons: number[]): Promise<Map<string, number>> {
  if (pffCache) {
    return pffCache
  }
  const rows =
    seasons.length === 0
      ? []
      : await db
          .select({
            playerName: pffPlayerStats.playerName,
            season: pffPlayerStats.season,
            category: pffPlayerStats.category,
            grade: pffPlayerStats.grade,
          })
          .from(pffPlayerStats)
          .where(inArray(pffPlayerStats.season, seasons))
  const map = new Map<string, number>()
  for (const r of rows) {
    if (r.grade == null) {
      continue
    }
    map.set(`${normPlayerName(r.playerName)}|${r.season}|${r.category}`, r.grade)
  }
  pffCache = map
  return map
}

function lookupPff(
  map: Map<string, number>,
  name: string,
  season: number,
  position: string | null
): number | null {
  const cat = pffCategory(position)
  if (!cat) {
    return null
  }
  return map.get(`${normPlayerName(name)}|${season}|${cat}`) ?? null
}

function buildHeatmap(ctx: Ctx, year: number): HeatmapTeam[] {
  const league = ctx.leagues.find((l) => l.season === year)
  if (!league) {
    return []
  }
  const actualWeeks = ctx.playerWeeks.filter((w) => w.sleeperLeagueId === league.sleeperLeagueId)
  const hasActual = actualWeeks.some((w) => w.points > 0)
  const weekly = hasActual
    ? actualWeeks.map((w) => ({ week: w.week, playerId: w.playerId, pts: w.points }))
    : blendWeeklyPts(ctx.projections, year)
  const projected = !hasActual && weekly.length > 0
  if (weekly.length === 0) {
    return []
  }
  const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
  const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId)
  const byRoster = new Map<number, { playerId: string; position: string }[]>()
  for (const p of ctx.picks.filter((x) => draft && x.draftId === draft.draftId)) {
    const list = byRoster.get(p.rosterId) ?? []
    list.push({
      playerId: p.playerId,
      position: p.position ?? 'UNK',
    })
    byRoster.set(p.rosterId, list)
  }
  const heat = positionalHeatmapWeekly(
    leagueRosters.map((r) => ({ rosterId: r.rosterId, players: byRoster.get(r.rosterId) ?? [] })),
    weekly,
    starterSlots(league.rosterPositions)
  )
  const out: HeatmapTeam[] = heat.map((h) => {
    const roster = leagueRosters.find((r) => r.rosterId === h.rosterId)
    const id = ident(ctx, roster?.sleeperUserId ?? null, roster?.teamName)
    return {
      slug: id.slug,
      displayName: id.displayName,
      projected,
      ovr: h.ovr,
      qb: h.qb,
      rb: h.rb,
      wr: h.wr,
      te: h.te,
      flex: h.flex,
      def: h.def,
    }
  })
  out.sort((a, b) => a.ovr.rank - b.ovr.rank || b.ovr.pts - a.ovr.pts)
  return out
}

function weeklyScores(ctx: Ctx, year?: number): FantasyWeeklyScore[] {
  const out: FantasyWeeklyScore[] = []
  for (const league of ctx.leagues) {
    if (year != null && league.season !== year) {
      continue
    }
    const rosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId)
    const rosterById = new Map(rosters.map((r) => [r.rosterId, r]))
    const byWeek = new Map<number, typeof ctx.matchups>()
    for (const matchup of ctx.matchups.filter(
      (row) => row.sleeperLeagueId === league.sleeperLeagueId
    )) {
      const rows = byWeek.get(matchup.week) ?? []
      rows.push(matchup)
      byWeek.set(matchup.week, rows)
    }
    for (const [week, rows] of byWeek) {
      if (rows.length < 2 || rows.every((row) => row.points === 0)) {
        continue
      }
      const ranked = [...rows].sort((a, b) => b.points - a.points)
      for (const row of rows) {
        const roster = rosterById.get(row.rosterId)
        const id = ident(ctx, roster?.sleeperUserId ?? null, roster?.teamName)
        out.push({
          season: league.season,
          week,
          rosterId: row.rosterId,
          slug: id.slug,
          displayName: id.displayName,
          teamName: roster?.teamName ?? null,
          points: row.points,
          rank: ranked.findIndex((candidate) => candidate.rosterId === row.rosterId) + 1,
        })
      }
    }
  }
  return out.sort((a, b) => a.season - b.season || a.week - b.week || a.rank - b.rank)
}

export function headToHeadFromScores(scores: FantasyWeeklyScore[]): H2HCell[] {
  const byWeek = new Map<string, FantasyWeeklyScore[]>()
  for (const score of scores) {
    const key = `${score.season}|${score.week}`
    const rows = byWeek.get(key) ?? []
    rows.push(score)
    byWeek.set(key, rows)
  }
  const cells = new Map<string, H2HCell>()
  for (const rows of byWeek.values()) {
    for (const a of rows) {
      for (const b of rows) {
        if (a.slug === b.slug) {
          continue
        }
        const key = `${a.slug}|${b.slug}`
        const current = cells.get(key) ?? {
          a: a.slug,
          b: b.slug,
          wins: 0,
          losses: 0,
          ties: 0,
          games: 0,
        }
        current.games += 1
        if (a.points > b.points) {
          current.wins += 1
        } else if (a.points < b.points) {
          current.losses += 1
        } else {
          current.ties += 1
        }
        cells.set(key, current)
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.a.localeCompare(b.a) || a.b.localeCompare(b.b))
}

function recordRow(
  key: string,
  label: string,
  valueNum: number | null,
  valueText: string,
  holderSlug: string | null,
  holderName: string,
  season: number | null,
  week: number | null,
  detail: string
): FantasyRecordRow {
  return { key, label, valueNum, valueText, holderSlug, holderName, season, week, detail }
}

function buildRecords(ctx: Ctx, seasonRows: GmSeasonRow[]): FantasyRecordsData {
  const scores = weeklyScores(ctx)
  const bySlug = new Map<string, string>()
  for (const score of scores) {
    bySlug.set(score.slug, score.displayName)
  }
  for (const row of seasonRows) {
    bySlug.set(row.slug, row.displayName)
  }
  const records: FantasyRecordRow[] = []
  const highest = [...scores].sort((a, b) => b.points - a.points)[0]
  const lowest = [...scores].sort((a, b) => a.points - b.points)[0]
  if (highest) {
    records.push(
      recordRow(
        'highest_week',
        'Highest week ever',
        highest.points,
        fmtRecordNumber(highest.points),
        highest.slug,
        highest.displayName,
        highest.season,
        highest.week,
        `${highest.displayName} posted the highest best-ball score in Week ${highest.week}, ${highest.season}.`
      )
    )
  }
  if (lowest) {
    records.push(
      recordRow(
        'lowest_week',
        'Lowest week',
        lowest.points,
        fmtRecordNumber(lowest.points),
        lowest.slug,
        lowest.displayName,
        lowest.season,
        lowest.week,
        `${lowest.displayName} had the lowest recorded best-ball score in Week ${lowest.week}, ${lowest.season}.`
      )
    )
  }

  const scoreGroups = new Map<string, FantasyWeeklyScore[]>()
  for (const score of scores) {
    const key = `${score.season}|${score.week}`
    const group = scoreGroups.get(key) ?? []
    group.push(score)
    scoreGroups.set(key, group)
  }
  let closest: { a: FantasyWeeklyScore; b: FantasyWeeklyScore; diff: number } | null = null
  let worstAllPlay: {
    score: FantasyWeeklyScore
    wins: number
    losses: number
    ties: number
  } | null = null
  for (const group of scoreGroups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const diff = Math.abs(group[i].points - group[j].points)
        if (diff > 0 && (!closest || diff < closest.diff)) {
          closest = { a: group[i], b: group[j], diff }
        }
      }
      const wins = group.filter((other) => group[i].points > other.points).length
      const losses = group.filter((other) => group[i].points < other.points).length
      const ties = group.filter((other) => group[i].points === other.points).length - 1
      if (
        !worstAllPlay ||
        wins / Math.max(wins + losses + ties, 1) <
          worstAllPlay.wins /
            Math.max(worstAllPlay.wins + worstAllPlay.losses + worstAllPlay.ties, 1)
      ) {
        worstAllPlay = { score: group[i], wins, losses, ties }
      }
    }
  }
  if (closest) {
    records.push(
      recordRow(
        'closest_week',
        'Closest all-play week',
        closest.diff,
        fmtRecordNumber(closest.diff),
        closest.a.slug,
        `${closest.a.displayName} over ${closest.b.displayName}`,
        closest.a.season,
        closest.a.week,
        `${closest.a.displayName} and ${closest.b.displayName} were separated by ${fmtRecordNumber(closest.diff)} points.`
      )
    )
  }
  if (worstAllPlay) {
    records.push(
      recordRow(
        'worst_allplay_week',
        'Worst all-play week',
        worstAllPlay.wins,
        `${worstAllPlay.wins}–${worstAllPlay.losses}`,
        worstAllPlay.score.slug,
        worstAllPlay.score.displayName,
        worstAllPlay.score.season,
        worstAllPlay.score.week,
        `Week ${worstAllPlay.score.week} finished ${worstAllPlay.wins}–${worstAllPlay.losses} against the room.`
      )
    )
  }

  const liveRows = seasonRows.filter((row) => !row.projected).sort((a, b) => a.season - b.season)
  let biggestClimb: {
    slug: string
    displayName: string
    season: number
    change: number
    from: number
    to: number
  } | null = null
  const rowsBySlug = new Map<string, GmSeasonRow[]>()
  for (const row of liveRows) {
    const rows = rowsBySlug.get(row.slug) ?? []
    rows.push(row)
    rowsBySlug.set(row.slug, rows)
  }
  for (const rows of rowsBySlug.values()) {
    for (let i = 1; i < rows.length; i++) {
      const change = rows[i - 1].finish - rows[i].finish
      if (!biggestClimb || change > biggestClimb.change) {
        biggestClimb = {
          slug: rows[i].slug,
          displayName: rows[i].displayName,
          season: rows[i].season,
          change,
          from: rows[i - 1].finish,
          to: rows[i].finish,
        }
      }
    }
  }
  if (biggestClimb && biggestClimb.change > 0) {
    records.push(
      recordRow(
        'biggest_climb',
        'Biggest climb',
        biggestClimb.change,
        `+${biggestClimb.change}`,
        biggestClimb.slug,
        biggestClimb.displayName,
        biggestClimb.season,
        null,
        `Moved from ${ordinalRecord(biggestClimb.from)} to ${ordinalRecord(biggestClimb.to)} in ${biggestClimb.season}.`
      )
    )
  }

  const allPicks = ctx.leagues.flatMap((league) =>
    scoredPicksForLeague(ctx, league.sleeperLeagueId)
  )
  const bestDollar = [...allPicks]
    .filter((pick) => pick.amount <= 1)
    .sort((a, b) => b.surplus - a.surplus)[0]
  if (bestDollar) {
    const holder = ident(ctx, bestDollar.sleeperUserId)
    records.push(
      recordRow(
        'best_dollar_pick',
        'Best $1 pick',
        bestDollar.surplus,
        `+${fmtRecordNumber(bestDollar.surplus)}`,
        holder.slug,
        holder.displayName,
        null,
        null,
        `${playerName(ctx, bestDollar.playerId)} returned ${fmtRecordNumber(bestDollar.fpts)} FPTS for $${bestDollar.amount}.`
      )
    )
  }
  const worstBust = [...allPicks]
    .filter((pick) => pick.amount >= 40)
    .sort((a, b) => a.surplus - b.surplus)[0]
  if (worstBust) {
    const holder = ident(ctx, worstBust.sleeperUserId)
    records.push(
      recordRow(
        'worst_bust',
        'Worst expensive bust',
        worstBust.surplus,
        fmtRecordNumber(worstBust.surplus),
        holder.slug,
        holder.displayName,
        null,
        null,
        `${playerName(ctx, worstBust.playerId)} cost $${worstBust.amount} and finished ${fmtRecordNumber(worstBust.surplus)} below expectation.`
      )
    )
  }
  const faabBySlug = new Map<string, number>()
  for (const row of seasonRows) {
    faabBySlug.set(row.slug, (faabBySlug.get(row.slug) ?? 0) + row.waiverBudgetUsed)
  }
  const mostFaab = [...faabBySlug.entries()].sort((a, b) => b[1] - a[1])[0]
  if (mostFaab) {
    records.push(
      recordRow(
        'most_faab',
        'Most FAAB spent',
        mostFaab[1],
        `$${mostFaab[1]}`,
        mostFaab[0],
        bySlug.get(mostFaab[0]) ?? mostFaab[0],
        null,
        null,
        `${bySlug.get(mostFaab[0]) ?? mostFaab[0]} has spent the most waiver budget across the league history.`
      )
    )
  }
  const worstDraft = [...seasonRows].sort((a, b) => a.draftSurplus - b.draftSurplus)[0]
  if (worstDraft) {
    records.push(
      recordRow(
        'worst_draft_surplus',
        'Worst draft surplus',
        worstDraft.draftSurplus,
        fmtRecordNumber(worstDraft.draftSurplus),
        worstDraft.slug,
        worstDraft.displayName,
        worstDraft.season,
        null,
        `${worstDraft.displayName}'s ${worstDraft.season} auction finished below the room's spend curve.`
      )
    )
  }
  const zeroFaab = seasonRows.find((row) => row.waiverBudgetUsed === 0)
  if (zeroFaab) {
    records.push(
      recordRow(
        'zero_faab',
        'Never used FAAB',
        0,
        '$0',
        zeroFaab.slug,
        zeroFaab.displayName,
        zeroFaab.season,
        null,
        `${zeroFaab.displayName} made it through ${zeroFaab.season} without a recorded waiver bid.`
      )
    )
  }

  const latestSeason = Math.max(...ctx.leagues.map((league) => league.season), 0)
  const badges: FantasyRecordRow[] = []
  const latestLeague = ctx.leagues.find((league) => league.season === latestSeason)
  if (latestLeague) {
    const latestRows = seasonRows.filter((row) => row.season === latestSeason)
    const latestPicks = scoredPicksForLeague(ctx, latestLeague.sleeperLeagueId)
    const latestWire = wireForLeague(ctx, latestLeague.sleeperLeagueId).rows
    const badge = (key: string, label: string, row: FantasyRecordRow) =>
      badges.push({ ...row, key: `badge_${key}`, label, season: latestSeason })
    const bargain = new Map<string, number>()
    for (const pick of latestPicks.filter((pick) => pick.amount < 5)) {
      const owner = ident(ctx, pick.sleeperUserId)
      bargain.set(owner.slug, (bargain.get(owner.slug) ?? 0) + pick.surplus)
    }
    const bargainWinner = [...bargain.entries()].sort((a, b) => b[1] - a[1])[0]
    if (bargainWinner) {
      badge(
        'bargain_hunter',
        'Bargain Hunter',
        recordRow(
          'badge_bargain_hunter',
          '',
          bargainWinner[1],
          fmtRecordNumber(bargainWinner[1]),
          bargainWinner[0],
          bySlug.get(bargainWinner[0]) ?? bargainWinner[0],
          latestSeason,
          null,
          'Most total surplus from picks under $5.'
        )
      )
    }
    const wireWinner = [
      ...new Map(
        latestWire.map((row) => [
          row.slug,
          latestWire.filter((x) => x.slug === row.slug).reduce((sum, x) => sum + x.fpts, 0),
        ])
      ).entries(),
    ].sort((a, b) => b[1] - a[1])[0]
    if (wireWinner) {
      badge(
        'wire_wizard',
        'Wire Wizard',
        recordRow(
          'badge_wire_wizard',
          '',
          wireWinner[1],
          fmtRecordNumber(wireWinner[1]),
          wireWinner[0],
          bySlug.get(wireWinner[0]) ?? wireWinner[0],
          latestSeason,
          null,
          'Most points added after the auction.'
        )
      )
    }
    const lowWeeks = new Map<string, number>()
    for (const score of scores.filter(
      (score) => score.season === latestSeason && score.points < 130
    )) {
      lowWeeks.set(score.slug, (lowWeeks.get(score.slug) ?? 0) + 1)
    }
    const floorWinner = [...latestRows].sort(
      (a, b) => (lowWeeks.get(a.slug) ?? 0) - (lowWeeks.get(b.slug) ?? 0)
    )[0]
    if (floorWinner) {
      badge(
        'iron_floor',
        'Iron Floor',
        recordRow(
          'badge_iron_floor',
          '',
          lowWeeks.get(floorWinner.slug) ?? 0,
          String(lowWeeks.get(floorWinner.slug) ?? 0),
          floorWinner.slug,
          floorWinner.displayName,
          latestSeason,
          null,
          'Fewest weeks below 130 points.'
        )
      )
    }
    const roomChampion = [...latestRows].sort((a, b) => a.finish - b.finish)[0]
    if (roomChampion) {
      badge(
        'room_champion',
        'Room Champion',
        recordRow(
          'badge_room_champion',
          '',
          roomChampion.finish,
          ordinalRecord(roomChampion.finish),
          roomChampion.slug,
          roomChampion.displayName,
          latestSeason,
          null,
          'Finished first in all-play wins.'
        )
      )
    }
    const sniper = new Map<string, { surplus: number; dollars: number }>()
    for (const pick of latestPicks) {
      const owner = ident(ctx, pick.sleeperUserId)
      const current = sniper.get(owner.slug) ?? { surplus: 0, dollars: 0 }
      current.surplus += pick.surplus
      current.dollars += pick.amount
      sniper.set(owner.slug, current)
    }
    const sniperWinner = [...sniper.entries()].sort(
      (a, b) => b[1].surplus / Math.max(b[1].dollars, 1) - a[1].surplus / Math.max(a[1].dollars, 1)
    )[0]
    if (sniperWinner) {
      const ratio = sniperWinner[1].surplus / Math.max(sniperWinner[1].dollars, 1)
      badge(
        'auction_sniper',
        'Auction Sniper',
        recordRow(
          'badge_auction_sniper',
          '',
          ratio,
          fmtRecordNumber(ratio),
          sniperWinner[0],
          bySlug.get(sniperWinner[0]) ?? sniperWinner[0],
          latestSeason,
          null,
          'Best mean surplus per dollar spent.'
        )
      )
    }
    const lateWinner = [...latestRows].sort((a, b) => b.lateFpts - a.lateFpts)[0]
    if (lateWinner) {
      badge(
        'late_bloomer',
        'Late Bloomer',
        recordRow(
          'badge_late_bloomer',
          '',
          lateWinner.lateFpts,
          fmtRecordNumber(lateWinner.lateFpts),
          lateWinner.slug,
          lateWinner.displayName,
          latestSeason,
          null,
          'Most points from the last three auction rounds.'
        )
      )
    }
    const rockBottom = [...scores]
      .filter((score) => score.season === latestSeason)
      .sort((a, b) => a.points - b.points)[0]
    if (rockBottom) {
      badge(
        'rock_bottom',
        'Rock Bottom',
        recordRow(
          'badge_rock_bottom',
          '',
          rockBottom.points,
          fmtRecordNumber(rockBottom.points),
          rockBottom.slug,
          rockBottom.displayName,
          latestSeason,
          rockBottom.week,
          'Held the season’s lowest recorded week.'
        )
      )
    }
    const fastStart = new Map<string, number>()
    for (const score of scores.filter(
      (score) => score.season === latestSeason && score.week <= 4
    )) {
      fastStart.set(
        score.slug,
        (fastStart.get(score.slug) ?? 0) + (standingsRankScore(score, scores) ?? 0)
      )
    }
    const fastWinner = [...fastStart.entries()].sort((a, b) => b[1] - a[1])[0]
    if (fastWinner) {
      badge(
        'fast_start',
        'Fast Start',
        recordRow(
          'badge_fast_start',
          '',
          fastWinner[1],
          String(fastWinner[1]),
          fastWinner[0],
          bySlug.get(fastWinner[0]) ?? fastWinner[0],
          latestSeason,
          4,
          'Best all-play record through Week 4.'
        )
      )
    }
  }
  const badgeLabels: [string, string][] = [
    ['bargain_hunter', 'Bargain Hunter'],
    ['wire_wizard', 'Wire Wizard'],
    ['iron_floor', 'Iron Floor'],
    ['auction_sniper', 'Auction Sniper'],
    ['late_bloomer', 'Late Bloomer'],
    ['rock_bottom', 'Rock Bottom'],
    ['fast_start', 'Fast Start'],
    ['room_champion', 'Room Champion'],
  ]
  for (const [key, label] of badgeLabels) {
    if (!badges.some((badge) => badge.key === `badge_${key}`)) {
      badges.push(
        recordRow(
          `badge_${key}`,
          label,
          null,
          '—',
          null,
          '—',
          latestSeason || null,
          null,
          'This badge will fill as qualifying league data is recorded.'
        )
      )
    }
  }
  return { records, badges }
}

function standingsRankScore(
  score: FantasyWeeklyScore,
  scores: FantasyWeeklyScore[]
): number | null {
  const peers = scores.filter((row) => row.season === score.season && row.week === score.week)
  return peers.length > 1 ? peers.length - score.rank : null
}

function fmtRecordNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
}

function ordinalRecord(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const suffix = value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'
  return `${value}${suffix}`
}

function cohortSummary(rows: GmAllTimeRow[]): FantasyCohortRow[] {
  const result: FantasyCohortRow[] = []
  for (const cohort of ['dad', 'kid'] as const) {
    const members = rows
      .filter((row) => canonicalManager(row.sleeperUserId)?.cohort === cohort)
      .map((row) => ({
        slug: row.slug,
        displayName: row.displayName,
        winPct: row.winPct,
      }))
    const wins = rows
      .filter((row) => members.some((member) => member.slug === row.slug))
      .reduce((sum, row) => sum + row.wins, 0)
    const losses = rows
      .filter((row) => members.some((member) => member.slug === row.slug))
      .reduce((sum, row) => sum + row.losses, 0)
    const ties = rows
      .filter((row) => members.some((member) => member.slug === row.slug))
      .reduce((sum, row) => sum + row.ties, 0)
    result.push({ cohort, wins, losses, ties, winPct: winPct(wins, losses, ties), members })
  }
  return result
}

function weeklyExtras(scores: FantasyWeeklyScore[]): FantasySeasonExtras {
  const points = scores.map((score) => score.points)
  return {
    weekly: scores,
    h2h: headToHeadFromScores(scores),
    highWeek: points.length > 0 ? Math.max(...points) : 0,
    leagueAverage:
      points.length > 0 ? points.reduce((sum, point) => sum + point, 0) / points.length : 0,
    leagueMedian: median(points),
  }
}

function timelineInputForContext(ctx: Ctx, year: number): FantasyTimelineInput | null {
  const league = ctx.leagues.find((l) => l.season === year)
  if (!league) {
    return null
  }
  const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
  const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId)
  const draftPicks = ctx.picks
    .filter((pick) => draft && pick.draftId === draft.draftId)
    .map((pick) => ({
      playerId: pick.playerId,
      rosterId: pick.rosterId,
      position: pick.position,
    }))
  const actualWeeks = ctx.playerWeeks.filter((w) => w.sleeperLeagueId === league.sleeperLeagueId)
  const hasActual = actualWeeks.some((w) => w.points > 0)
  const weeklyPoints = hasActual
    ? actualWeeks.map((w) => ({ week: w.week, playerId: w.playerId, points: w.points }))
    : blendWeeklyPts(ctx.projections, year).map((w) => ({
        week: w.week,
        playerId: w.playerId,
        points: w.pts,
      }))
  const actualMatchups = ctx.matchups
    .filter((m) => m.sleeperLeagueId === league.sleeperLeagueId)
    .map((m) => ({ week: m.week, rosterId: m.rosterId, points: m.points }))
  const seasonRows = buildSeasonRows(ctx).filter((row) => row.season === year)
  const draftSurplusByRoster = new Map(seasonRows.map((row) => [row.rosterId, row.draftSurplus]))
  const draftGradeByRoster = new Map(seasonRows.map((row) => [row.rosterId, row.draftGrade]))
  const playerPositions = new Map<string, string | null>()
  const playerNames = new Map<string, string>()
  for (const pick of draftPicks) {
    playerPositions.set(
      pick.playerId,
      pick.position ?? ctx.playerById.get(pick.playerId)?.position ?? null
    )
    playerNames.set(pick.playerId, playerName(ctx, pick.playerId))
  }
  for (const playerId of new Set(weeklyPoints.map((row) => row.playerId))) {
    if (!playerPositions.has(playerId)) {
      playerPositions.set(playerId, ctx.playerById.get(playerId)?.position ?? null)
    }
    playerNames.set(playerId, playerName(ctx, playerId))
  }
  const transactions = ctx.txs
    .filter((tx) => tx.sleeperLeagueId === league.sleeperLeagueId)
    .map((tx) => ({
      transactionId: tx.transactionId,
      week: tx.week,
      type: tx.type,
      status: tx.status,
      adds: tx.adds,
      drops: tx.drops,
      waiverBid: tx.waiverBid,
      createdAtMs: tx.createdAtMs,
    }))
  for (const tx of transactions) {
    for (const playerId of [...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]) {
      if (!playerPositions.has(playerId)) {
        playerPositions.set(playerId, ctx.playerById.get(playerId)?.position ?? null)
      }
      playerNames.set(playerId, playerName(ctx, playerId))
    }
  }
  const maxWeek = Math.max(
    0,
    ...ctx.matchups.filter((m) => m.sleeperLeagueId === league.sleeperLeagueId).map((m) => m.week),
    ...weeklyPoints.map((row) => row.week)
  )
  return {
    rosters: leagueRosters.map((roster) => {
      const id = ident(ctx, roster.sleeperUserId, roster.teamName)
      return { rosterId: roster.rosterId, slug: id.slug, displayName: id.displayName }
    }),
    draftPicks,
    transactions,
    playerPositions,
    playerNames,
    rosterPositions: starterSlots(league.rosterPositions),
    weeklyPoints,
    actualMatchups,
    draftSurplusByRoster,
    draftGradeByRoster,
    maxWeek,
    projected: !hasActual && weeklyPoints.length > 0,
  }
}

function buildTimeline(ctx: Ctx, year: number): FantasyTimelinePoint[] {
  const input = timelineInputForContext(ctx, year)
  return input ? buildFantasyTimeline(input) : []
}

function buildEvolution(ctx: Ctx, year: number): FantasyEvolutionData | null {
  const input = timelineInputForContext(ctx, year)
  if (!input) {
    return null
  }
  const result = buildFantasyEvolution(input)
  return {
    ...result,
    season: year,
    projected: input.projected,
    strengthBasis: input.projected ? 'current projections' : 'retrospective actuals',
  }
}

function timelineDataForContext(
  ctx: Ctx,
  slug: string,
  season: number
): FantasyTimelineData | null {
  const room = buildTimeline(ctx, season)
  const managerPoint = room.find((point) => point.slug === slug)
  if (!managerPoint) {
    return null
  }
  return {
    season,
    projected: managerPoint.projected,
    manager: { slug: managerPoint.slug, displayName: managerPoint.displayName },
    points: room.filter((point) => point.slug === slug).sort((a, b) => a.week - b.week),
    room,
  }
}

export const FantasyScout = {
  async listSeasons(): Promise<SeasonSummary[]> {
    const ctx = await loadContext()
    return ctx.leagues.map((l) => {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId)
      return {
        season: l.season,
        sleeperLeagueId: l.sleeperLeagueId,
        status: l.status,
        name: l.name,
        teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
        draftStatus: draft?.status ?? null,
      }
    })
  },

  async allTime(): Promise<{
    seasons: SeasonSummary[]
    gms: GmAllTimeRow[]
    cohorts: FantasyCohortRow[]
    records: FantasyRecordsData
    biggestWeek: FantasyWeeklyScore | null
  }> {
    const ctx = await loadContext()
    const seasons = ctx.leagues.map((l) => {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId)
      return {
        season: l.season,
        sleeperLeagueId: l.sleeperLeagueId,
        status: l.status,
        name: l.name,
        teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
        draftStatus: draft?.status ?? null,
      }
    })
    const rows = buildSeasonRows(ctx)
    const gms = rollupAllTime(
      rows,
      seasons.map((s) => s.season)
    )
    const weekly = weeklyScores(ctx)
    return {
      seasons,
      gms,
      cohorts: cohortSummary(gms),
      records: buildRecords(ctx, rows),
      biggestWeek: [...weekly].sort((a, b) => b.points - a.points)[0] ?? null,
    }
  },

  async season(year: number): Promise<{
    summary: SeasonSummary | null
    standings: GmSeasonRow[]
    heatmap: HeatmapTeam[]
    extras: FantasySeasonExtras
  }> {
    const ctx = await loadContext()
    const seasons = ctx.leagues
      .map((l) => {
        const draft = ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId)
        return {
          season: l.season,
          sleeperLeagueId: l.sleeperLeagueId,
          status: l.status,
          name: l.name,
          teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
          draftStatus: draft?.status ?? null,
        }
      })
      .filter((s) => s.season === year)
    const standings = buildSeasonRows(ctx)
      .filter((r) => r.season === year)
      .sort((a, b) => a.finish - b.finish)
    return {
      summary: seasons[0] ?? null,
      standings,
      heatmap: buildHeatmap(ctx, year),
      extras: weeklyExtras(weeklyScores(ctx, year)),
    }
  },

  async timeline(slug: string, year?: number): Promise<FantasyTimelineData | null> {
    const ctx = await loadContext()
    const selectedSeason = year ?? ctx.leagues.at(-1)?.season
    if (!selectedSeason) {
      return null
    }
    return timelineDataForContext(ctx, slug, selectedSeason)
  },

  async timelines(slug: string): Promise<FantasyTimelineData[]> {
    const ctx = await loadContext()
    return ctx.leagues
      .map((league) => timelineDataForContext(ctx, slug, league.season))
      .filter((data): data is FantasyTimelineData => data !== null)
  },

  async evolution(season?: number): Promise<FantasyEvolutionData | null> {
    const ctx = await loadContext()
    const selectedSeason = season ?? ctx.leagues.at(-1)?.season
    return selectedSeason ? buildEvolution(ctx, selectedSeason) : null
  },

  async headToHead(season?: number): Promise<H2HCell[]> {
    const ctx = await loadContext()
    return headToHeadFromScores(weeklyScores(ctx, season))
  },

  async records(): Promise<FantasyRecordsData> {
    const ctx = await loadContext()
    const rows = buildSeasonRows(ctx)
    let stored: (typeof fantasyRecords.$inferSelect)[] = []
    try {
      stored = await ctx.db.select().from(fantasyRecords)
    } catch (error) {
      console.warn('[fantasy] records rollup unavailable; computing records live', error)
    }
    if (stored.length === 0) {
      return buildRecords(ctx, rows)
    }
    const managers = new Map(rows.map((row) => [row.slug, row.displayName]))
    const records = stored
      .filter((row) => !row.key.startsWith('badge_'))
      .map((row) => ({
        key: row.key,
        label: row.label,
        valueNum: row.valueNum,
        valueText: row.valueText ?? '—',
        holderSlug: row.holderSlug,
        holderName: managers.get(row.holderSlug ?? '') ?? row.holderSlug ?? '—',
        season: row.season,
        week: row.week,
        detail: row.detail ?? '',
      }))
    const badges = stored
      .filter((row) => row.key.startsWith('badge_'))
      .map((row) => ({
        key: row.key,
        label: row.label,
        valueNum: row.valueNum,
        valueText: row.valueText ?? '—',
        holderSlug: row.holderSlug,
        holderName: managers.get(row.holderSlug ?? '') ?? row.holderSlug ?? '—',
        season: row.season,
        week: row.week,
        detail: row.detail ?? '',
      }))
    return { records, badges }
  },

  async refreshRecords(): Promise<number> {
    const ctx = await loadContext()
    const data = buildRecords(ctx, buildSeasonRows(ctx))
    const rows = [...data.records, ...data.badges].map((row) => ({
      key: row.key,
      label: row.label,
      valueNum: row.valueNum,
      valueText: row.valueText,
      holderSlug: row.holderSlug,
      season: row.season,
      week: row.week,
      detail: row.detail,
      computedAt: new Date(),
    }))
    await ctx.db.delete(fantasyRecords)
    if (rows.length > 0) {
      await ctx.db.insert(fantasyRecords).values(rows)
    }
    return rows.length
  },

  async draft(year: number): Promise<{
    summary: SeasonSummary | null
    picks: DraftPickRow[]
    replacement: number
  }> {
    const ctx = await loadContext()
    const league = ctx.leagues.find((l) => l.season === year)
    const seasons = await this.listSeasons()
    if (!league) {
      return { summary: null, picks: [], replacement: 0 }
    }
    const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
    const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId)
    const pff = await pffMap(ctx.db, [year])
    const pickMeta = new Map(
      ctx.picks
        .filter((p) => draft && p.draftId === draft.draftId)
        .map((p) => [`${p.playerId}|${p.rosterId}`, p])
    )
    const picks: DraftPickRow[] = scored.map((p) => {
      const id = ident(ctx, p.sleeperUserId)
      const name = playerName(ctx, p.playerId)
      const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`)
      return {
        ...p,
        playerName: name,
        slug: id.slug,
        displayName: id.displayName,
        pffGrade: lookupPff(pff, name, year, p.position),
        isKeeper: Boolean(meta?.isKeeper),
        pickNo: meta?.pickNo ?? 0,
      }
    })
    picks.sort((a, b) => a.pickNo - b.pickNo)
    return {
      summary: seasons.find((s) => s.season === year) ?? null,
      picks,
      replacement: dollarOneReplacement(scored),
    }
  },

  async wire(
    year: number
  ): Promise<{ summary: SeasonSummary | null; rows: WireRow[]; missed: WireRow[] }> {
    const ctx = await loadContext()
    const league = ctx.leagues.find((l) => l.season === year)
    if (!league) {
      return { summary: null, rows: [], missed: [] }
    }
    const { rows, missed } = wireForLeague(ctx, league.sleeperLeagueId)
    const seasons = ctx.leagues.map((l) => ({
      season: l.season,
      sleeperLeagueId: l.sleeperLeagueId,
      status: l.status,
      name: l.name,
      teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
      draftStatus: ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId)?.status ?? null,
    }))
    return { summary: seasons.find((s) => s.season === year) ?? null, rows, missed }
  },

  async bargains(): Promise<{
    seasons: SeasonSummary[]
    rows: (DraftPickRow & { season: number })[]
    byGm: { slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number }[]
  }> {
    const ctx = await loadContext()
    const seasons = await this.listSeasons()
    const pff = await pffMap(
      ctx.db,
      seasons.map((s) => s.season)
    )
    const rows: (DraftPickRow & { season: number })[] = []
    for (const league of ctx.leagues) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
      const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId).filter((p) => p.late)
      const replacement = dollarOneReplacement(scoredPicksForLeague(ctx, league.sleeperLeagueId))
      const pickMeta = new Map(
        ctx.picks
          .filter((p) => draft && p.draftId === draft.draftId)
          .map((p) => [`${p.playerId}|${p.rosterId}`, p])
      )
      for (const p of scored) {
        const id = ident(ctx, p.sleeperUserId)
        const name = playerName(ctx, p.playerId)
        const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`)
        rows.push({
          ...p,
          playerName: name,
          slug: id.slug,
          displayName: id.displayName,
          pffGrade: lookupPff(pff, name, league.season, p.position),
          isKeeper: Boolean(meta?.isKeeper),
          pickNo: meta?.pickNo ?? 0,
          season: league.season,
          surplus: p.fpts - replacement,
        })
      }
    }
    rows.sort((a, b) => b.fpts - a.fpts)
    const bySlug = new Map<
      string,
      { slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number }
    >()
    for (const r of rows) {
      const cur = bySlug.get(r.slug) ?? {
        slug: r.slug,
        displayName: r.displayName,
        lateFpts: 0,
        latePicks: 0,
        hits: 0,
      }
      cur.lateFpts += r.fpts
      cur.latePicks += 1
      if (r.surplus > 0) {
        cur.hits += 1
      }
      bySlug.set(r.slug, cur)
    }
    const byGm = [...bySlug.values()].sort((a, b) => b.lateFpts - a.lateFpts)
    return { seasons, rows, byGm }
  },

  async rankings(): Promise<{ seasons: number[]; gms: GmAllTimeRow[] }> {
    const { seasons, gms } = await this.allTime()
    return { seasons: seasons.map((s) => s.season), gms }
  },

  async manager(
    slug: string,
    season?: number
  ): Promise<{
    gm: GmAllTimeRow | null
    season: GmSeasonRow | null
    team: ManagerTeamPlayer[]
    draftPicks: (DraftPickRow & { season: number })[]
    wire: (WireRow & { season: number })[]
    missed: (WireRow & { season: number })[]
    extras: FantasyManagerExtras
  }> {
    const ctx = await loadContext()
    const seasonNums = ctx.leagues.map((l) => l.season)
    const seasonRows = buildSeasonRows(ctx)
    const gm = rollupAllTime(seasonRows, seasonNums).find((g) => g.slug === slug) ?? null
    const selectedSeason = season
      ? (seasonRows.find((row) => row.season === season && row.slug === slug) ?? null)
      : null
    if (!gm) {
      return {
        gm: null,
        season: selectedSeason,
        team: [],
        draftPicks: [],
        wire: [],
        missed: [],
        extras: { weekly: [], leagueMedian: 0, heatmap: null, h2h: [] },
      }
    }
    const pff = await pffMap(ctx.db, season ? [season] : seasonNums)
    const draftPicks: (DraftPickRow & { season: number })[] = []
    const wire: (WireRow & { season: number })[] = []
    const missed: (WireRow & { season: number })[] = []
    let team: ManagerTeamPlayer[] = []
    for (const league of ctx.leagues.filter(
      (candidate) => !season || candidate.season === season
    )) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId)
      const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId)
      const pickMeta = new Map(
        ctx.picks
          .filter((p) => draft && p.draftId === draft.draftId)
          .map((p) => [`${p.playerId}|${p.rosterId}`, p])
      )
      for (const p of scored) {
        const id = ident(ctx, p.sleeperUserId)
        if (id.slug !== slug) {
          continue
        }
        const name = playerName(ctx, p.playerId)
        const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`)
        draftPicks.push({
          ...p,
          playerName: name,
          slug: id.slug,
          displayName: id.displayName,
          pffGrade: lookupPff(pff, name, league.season, p.position),
          isKeeper: Boolean(meta?.isKeeper),
          pickNo: meta?.pickNo ?? 0,
          season: league.season,
        })
      }
      const w = wireForLeague(ctx, league.sleeperLeagueId)
      wire.push(
        ...w.rows.filter((r) => r.slug === slug).map((r) => ({ ...r, season: league.season }))
      )
      missed.push(
        ...w.missed.filter((r) => r.slug === slug).map((r) => ({ ...r, season: league.season }))
      )
      if (season === league.season && selectedSeason) {
        const input = timelineInputForContext(ctx, league.season)
        if (input) {
          const snapshots = replayRosterSnapshots(
            input.rosters,
            input.draftPicks,
            input.transactions,
            input.maxWeek,
            input.playerNames
          )
          const currentIds = snapshots.at(-1)?.rosters.get(selectedSeason.rosterId) ?? []
          const auctionIds = new Set(
            input.draftPicks
              .filter((pick) => pick.rosterId === selectedSeason.rosterId)
              .map((pick) => pick.playerId)
          )
          const addWeeks = new Map<string, number>()
          for (const transaction of input.transactions) {
            if (transaction.status !== 'complete') {
              continue
            }
            for (const [playerId, rawRosterId] of Object.entries(transaction.adds ?? {})) {
              if (Number(rawRosterId) === selectedSeason.rosterId) {
                addWeeks.set(
                  playerId,
                  Math.min(addWeeks.get(playerId) ?? transaction.week, transaction.week)
                )
              }
            }
          }
          team = currentIds
            .map((playerId) => ({
              playerId,
              playerName: input.playerNames.get(playerId) ?? playerName(ctx, playerId),
              position: input.playerPositions.get(playerId) ?? null,
              source: auctionIds.has(playerId) ? ('auction' as const) : ('in-season' as const),
              addWeek: addWeeks.get(playerId) ?? null,
            }))
            .sort(
              (a, b) =>
                (a.position ?? 'ZZZ').localeCompare(b.position ?? 'ZZZ') ||
                a.playerName.localeCompare(b.playerName)
            )
        }
      }
    }
    const selectedYear = season ?? ctx.leagues.at(-1)?.season
    const weekly = selectedYear ? weeklyScores(ctx, selectedYear) : []
    const heatmap = selectedYear
      ? (buildHeatmap(ctx, selectedYear).find((row) => row.slug === slug) ?? null)
      : null
    return {
      gm,
      season: selectedSeason,
      team,
      draftPicks,
      wire,
      missed,
      extras: {
        weekly,
        leagueMedian: median(weekly.map((row) => row.points)),
        heatmap,
        h2h: headToHeadFromScores(weeklyScores(ctx)),
      },
    }
  },

  async playerCard(playerId: string, seasonHint?: number): Promise<PlayerCardData | null> {
    const db = getDB()
    const [playerRows, pickRows, weekRows, projRows, leagues, drafts] = await Promise.all([
      db.select().from(fantasyPlayers).where(eq(fantasyPlayers.playerId, playerId)),
      db.select().from(fantasyDraftPicks).where(eq(fantasyDraftPicks.playerId, playerId)),
      db.select().from(fantasyPlayerWeeks).where(eq(fantasyPlayerWeeks.playerId, playerId)),
      db.select().from(fantasyProjections).where(eq(fantasyProjections.playerId, playerId)),
      db.select().from(fantasyLeagues),
      db.select().from(fantasyDrafts),
    ])
    const p = playerRows[0]
    if (!p && pickRows.length === 0 && weekRows.length === 0 && projRows.length === 0) {
      return null
    }
    const leagueSeason = new Map(leagues.map((l) => [l.sleeperLeagueId, l.season]))
    const draftLeague = new Map(drafts.map((d) => [d.draftId, d.sleeperLeagueId]))
    const actualBySeason = new Map<number, Map<number, number>>()
    for (const w of weekRows) {
      const season = leagueSeason.get(w.sleeperLeagueId) ?? 0
      const weeks = actualBySeason.get(season) ?? new Map<number, number>()
      weeks.set(w.week, (weeks.get(w.week) ?? 0) + w.points)
      actualBySeason.set(season, weeks)
    }
    const actualSeasons = [...actualBySeason.entries()]
      .filter(([, weeks]) => [...weeks.values()].some((pts) => pts > 0))
      .map(([season]) => season)
    const projSeasons = [...new Set(projRows.map((r) => r.season))]
    let season = 0
    let projected = false
    let weekMap = new Map<number, number>()
    const hintedActual = seasonHint ? actualBySeason.get(seasonHint) : undefined
    const hintedHasActual = Boolean(
      hintedActual && [...hintedActual.values()].some((pts) => pts > 0)
    )
    const hintedHasProj = Boolean(seasonHint && projRows.some((r) => r.season === seasonHint))
    if (seasonHint && hintedHasActual) {
      season = seasonHint
      weekMap = hintedActual ?? new Map()
    } else if (seasonHint && hintedHasProj) {
      season = seasonHint
      projected = true
      for (const w of blendWeeklyPts(projRows, season)) {
        weekMap.set(w.week, w.pts)
      }
    } else if (actualSeasons.length > 0) {
      season = Math.max(...actualSeasons)
      weekMap = actualBySeason.get(season) ?? new Map()
    } else if (projSeasons.length > 0) {
      season = Math.max(...projSeasons)
      projected = true
      for (const w of blendWeeklyPts(projRows, season)) {
        weekMap.set(w.week, w.pts)
      }
    } else {
      season = leagues.at(-1)?.season ?? 0
    }
    const maxWeek = weekMap.size > 0 ? Math.max(...weekMap.keys()) : 0
    const weeks: PlayerCardWeek[] = []
    for (let week = 1; week <= maxWeek; week++) {
      weeks.push({ week, points: weekMap.get(week) ?? 0 })
    }
    const fpts = weeks.reduce((s, w) => s + w.points, 0)
    const scoredWeeks = weeks.filter((w) => w.points > 0)
    const high = weeks.reduce((m, w) => Math.max(m, w.points), 0)
    const seasonPick = pickRows.find((row) => {
      const leagueId = draftLeague.get(row.draftId)
      return (leagueSeason.get(leagueId ?? '') ?? 0) === season
    })
    let owner: string | null = seasonPick
      ? managerForSleeperUser(seasonPick.sleeperUserId).displayName
      : null
    const amount = seasonPick?.amount ?? null
    if (!owner) {
      const latest = weekRows
        .filter((w) => leagueSeason.get(w.sleeperLeagueId) === season)
        .sort((a, b) => b.week - a.week)[0]
      if (latest) {
        const [roster] = await db
          .select()
          .from(fantasyRosters)
          .where(
            and(
              eq(fantasyRosters.sleeperLeagueId, latest.sleeperLeagueId),
              eq(fantasyRosters.rosterId, latest.rosterId)
            )
          )
        if (roster?.sleeperUserId) {
          owner = managerForSleeperUser(roster.sleeperUserId).displayName
        }
      }
    }
    const position = p?.position ?? seasonPick?.position ?? pickRows[0]?.position ?? null
    return {
      playerId,
      name: p?.fullName || playerId,
      position,
      team: p?.team ?? null,
      season,
      projected,
      fpts,
      avg: scoredWeeks.length > 0 ? fpts / scoredWeeks.length : 0,
      high,
      owner,
      amount,
      surplus: null,
      weeks,
      stats: countingStatsForPosition(position, blendWeeklyStats(projRows, season, playerId)),
    }
  },

  async player(playerId: string): Promise<{
    playerId: string
    name: string
    position: string | null
    team: string | null
    drafts: (DraftPickRow & { season: number })[]
    weeks: {
      season: number
      week: number
      points: number
      slug: string
      displayName: string
      projected: boolean
    }[]
    pff: { season: number; category: string; grade: number }[]
  } | null> {
    const ctx = await loadContext()
    const p = ctx.playerById.get(playerId)
    if (!p && !ctx.picks.some((x) => x.playerId === playerId)) {
      return null
    }
    const seasons = await this.listSeasons()
    const drafts: (DraftPickRow & { season: number })[] = []
    for (const s of seasons) {
      const d = await this.draft(s.season)
      drafts.push(
        ...d.picks
          .filter((row) => row.playerId === playerId)
          .map((row) => ({ ...row, season: s.season }))
      )
    }
    const rosterOwner = new Map<string, string | null>()
    for (const r of ctx.rosters) {
      rosterOwner.set(`${r.sleeperLeagueId}|${r.rosterId}`, r.sleeperUserId)
    }
    const leagueSeason = new Map(ctx.leagues.map((l) => [l.sleeperLeagueId, l.season]))
    let weeks = ctx.playerWeeks
      .filter((w) => w.playerId === playerId)
      .map((w) => {
        const id = ident(ctx, rosterOwner.get(`${w.sleeperLeagueId}|${w.rosterId}`) ?? null)
        return {
          season: leagueSeason.get(w.sleeperLeagueId) ?? 0,
          week: w.week,
          points: w.points,
          slug: id.slug,
          displayName: id.displayName,
          projected: false,
        }
      })
      .sort((a, b) => a.season - b.season || a.week - b.week)
    if (!weeks.some((w) => w.points > 0)) {
      const ownerFromPick = drafts[0]
      const projSeasons = [
        ...new Set(ctx.projections.filter((r) => r.playerId === playerId).map((r) => r.season)),
      ]
      weeks = projSeasons.flatMap((season) =>
        blendWeeklyPts(ctx.projections, season)
          .filter((w) => w.playerId === playerId)
          .map((w) => ({
            season,
            week: w.week,
            points: w.pts,
            slug: ownerFromPick?.slug ?? '',
            displayName: ownerFromPick?.displayName ?? '',
            projected: true,
          }))
      )
      weeks.sort((a, b) => a.season - b.season || a.week - b.week)
    }
    const name = p?.fullName || drafts[0]?.playerName || playerId
    const pffRows = await ctx.db
      .select({
        season: pffPlayerStats.season,
        category: pffPlayerStats.category,
        grade: pffPlayerStats.grade,
      })
      .from(pffPlayerStats)
      .where(eq(pffPlayerStats.playerName, name))
    const pff = pffRows
      .filter((r) => r.grade != null)
      .map((r) => ({ season: r.season, category: r.category, grade: r.grade as number }))
    return {
      playerId,
      name,
      position: p?.position ?? drafts[0]?.position ?? null,
      team: p?.team ?? null,
      drafts,
      weeks,
      pff,
    }
  },
}
