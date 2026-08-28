import type { WeekMatchupRow } from './fantasy-metrics.js'

const SKIP_STAT = /^(adp_|pos_adp_|pts_ppr$|pts_half_ppr$|pts_std$|pts$|gp$|category$)/

export function scoreStats(
  scoring: Record<string, unknown> | null | undefined,
  stats: Record<string, unknown> | null | undefined
): number {
  if (!scoring || !stats) {
    return 0
  }
  let pts = 0
  for (const [key, raw] of Object.entries(scoring)) {
    if (SKIP_STAT.test(key) || typeof raw !== 'number' || raw === 0) {
      continue
    }
    const v = stats[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      pts += v * raw
    }
  }
  return pts
}

export function normalizePosition(position: string | null | undefined): string {
  const pos = (position || 'UNK').toUpperCase()
  if (pos === 'FB') {
    return 'RB'
  }
  return pos
}

const FLEX_ELIGIBLE: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
}

function slotEligible(slot: string): string[] {
  if (FLEX_ELIGIBLE[slot]) {
    return FLEX_ELIGIBLE[slot]
  }
  return [slot]
}

export function starterSlots(rosterPositions: string[] | null | undefined): string[] {
  return (rosterPositions ?? []).filter((s) => s !== 'BN' && s !== 'IR' && s !== 'TAXI')
}

export interface LineupPlayer {
  playerId: string
  position: string
  pts: number
}

/** Greedy: fill positional slots first (highest pts), then flex. */
export function bestBallScore(players: LineupPlayer[], slots: string[]): number {
  const remaining = players
    .map((p) => ({ ...p, position: normalizePosition(p.position) }))
    .sort((a, b) => b.pts - a.pts)
  const used = new Set<string>()
  let total = 0
  const fill = (slot: string) => {
    const eligible = slotEligible(slot)
    const pick = remaining.find((p) => !used.has(p.playerId) && eligible.includes(p.position))
    if (!pick) {
      return
    }
    used.add(pick.playerId)
    total += pick.pts
  }
  for (const slot of slots.filter((s) => !s.includes('FLEX'))) {
    fill(slot)
  }
  for (const slot of slots.filter((s) => s.includes('FLEX'))) {
    fill(slot)
  }
  return total
}

export interface ProjWeekPts {
  week: number
  playerId: string
  pts: number
}

export interface DraftedPlayer {
  rosterId: number
  playerId: string
  position: string | null
}

export function projectedWeeklyScores(
  drafted: DraftedPlayer[],
  weeklyPts: ProjWeekPts[],
  slots: string[]
): WeekMatchupRow[] {
  const weeks = new Set<number>()
  const pts = new Map<string, number>()
  for (const w of weeklyPts) {
    weeks.add(w.week)
    pts.set(`${w.week}|${w.playerId}`, w.pts)
  }
  const rosters = new Map<number, DraftedPlayer[]>()
  for (const p of drafted) {
    const list = rosters.get(p.rosterId) ?? []
    list.push(p)
    rosters.set(p.rosterId, list)
  }
  const rows: WeekMatchupRow[] = []
  for (const week of [...weeks].sort((a, b) => a - b)) {
    for (const [rosterId, squad] of rosters) {
      const players = squad.map((p) => ({
        playerId: p.playerId,
        position: p.position ?? 'UNK',
        pts: pts.get(`${week}|${p.playerId}`) ?? 0,
      }))
      rows.push({
        week,
        rosterId,
        matchupId: week,
        points: bestBallScore(players, slots),
      })
    }
  }
  return rows
}

export interface SourceProjRow {
  season: number
  week: number
  playerId: string
  source: string
  opponent: string | null
  stats: Record<string, number>
  pts: number
}

export function blendWeeklyPts(
  rows: { season: number; week: number; playerId: string; pts: number }[],
  season: number
): ProjWeekPts[] {
  const bag = new Map<string, number[]>()
  for (const r of rows) {
    if (r.season !== season) {
      continue
    }
    const key = `${r.week}|${r.playerId}`
    const list = bag.get(key) ?? []
    list.push(r.pts)
    bag.set(key, list)
  }
  return [...bag.entries()].map(([key, pts]) => {
    const [week, playerId] = key.split('|')
    return { week: Number(week), playerId, pts: pts.reduce((s, n) => s + n, 0) / pts.length }
  })
}

export interface StatLine {
  key: string
  label: string
  digits: number
}

const POS_STAT_LINES: Record<string, StatLine[]> = {
  QB: [
    { key: 'pass_yd', label: 'Pass Yds', digits: 0 },
    { key: 'pass_td', label: 'Pass TD', digits: 1 },
    { key: 'pass_int', label: 'INT', digits: 1 },
    { key: 'rush_yd', label: 'Rush Yds', digits: 0 },
    { key: 'rush_td', label: 'Rush TD', digits: 1 },
  ],
  RB: [
    { key: 'rush_yd', label: 'Rush Yds', digits: 0 },
    { key: 'rush_td', label: 'Rush TD', digits: 1 },
    { key: 'rec', label: 'Rec', digits: 1 },
    { key: 'rec_yd', label: 'Rec Yds', digits: 0 },
    { key: 'rec_td', label: 'Rec TD', digits: 1 },
  ],
  WR: [
    { key: 'rec', label: 'Rec', digits: 1 },
    { key: 'rec_yd', label: 'Rec Yds', digits: 0 },
    { key: 'rec_td', label: 'Rec TD', digits: 1 },
    { key: 'rush_yd', label: 'Rush Yds', digits: 0 },
  ],
  TE: [
    { key: 'rec', label: 'Rec', digits: 1 },
    { key: 'rec_yd', label: 'Rec Yds', digits: 0 },
    { key: 'rec_td', label: 'Rec TD', digits: 1 },
  ],
  DEF: [
    { key: 'sack', label: 'Sack', digits: 1 },
    { key: 'int', label: 'INT', digits: 1 },
    { key: 'fum_rec', label: 'FR', digits: 1 },
    { key: 'ff', label: 'FF', digits: 1 },
    { key: 'def_td', label: 'TD', digits: 1 },
  ],
}

/** Average counting stats across sources for each week, then sum the season. */
export function blendWeeklyStats(
  rows: { season: number; week: number; playerId: string; stats: Record<string, number> | null }[],
  season: number,
  playerId: string
): Record<string, number> {
  const byWeek = new Map<number, Record<string, number>[]>()
  for (const r of rows) {
    if (r.season !== season || r.playerId !== playerId || !r.stats) {
      continue
    }
    const list = byWeek.get(r.week) ?? []
    list.push(r.stats)
    byWeek.set(r.week, list)
  }
  const totals: Record<string, number> = {}
  for (const list of byWeek.values()) {
    const keys = new Set<string>()
    for (const stats of list) {
      for (const k of Object.keys(stats)) {
        keys.add(k)
      }
    }
    for (const k of keys) {
      const vals = list
        .map((s) => s[k])
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      if (vals.length === 0) {
        continue
      }
      totals[k] = (totals[k] ?? 0) + vals.reduce((s, n) => s + n, 0) / vals.length
    }
  }
  return totals
}

export interface CountingStat {
  label: string
  value: number
  digits: number
}

export function countingStatsForPosition(
  position: string | null | undefined,
  totals: Record<string, number>
): CountingStat[] {
  const pos = normalizePosition(position)
  const spec = POS_STAT_LINES[pos] ?? POS_STAT_LINES.WR
  return spec
    .filter((s) => typeof totals[s.key] === 'number' && totals[s.key] !== 0)
    .map((s) => ({ label: s.label, value: totals[s.key], digits: s.digits }))
}

export type HeatPos = 'ovr' | 'qb' | 'rb' | 'wr' | 'te' | 'flex' | 'def'

export interface HeatCell {
  rank: number
  pts: number
}

export interface HeatRow {
  rosterId: number
  ovr: HeatCell
  qb: HeatCell
  rb: HeatCell
  wr: HeatCell
  te: HeatCell
  flex: HeatCell
  def: HeatCell
}

function slotGroup(slot: string): Exclude<HeatPos, 'ovr'> | null {
  if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') {
    return null
  }
  if (slot.includes('FLEX')) {
    return 'flex'
  }
  if (slot === 'QB') {
    return 'qb'
  }
  if (slot === 'RB' || slot === 'FB') {
    return 'rb'
  }
  if (slot === 'WR') {
    return 'wr'
  }
  if (slot === 'TE') {
    return 'te'
  }
  if (slot === 'DEF' || slot === 'DST') {
    return 'def'
  }
  return null
}

/** Fill starters like best-ball; return slot-group totals (FLEX = leftover WR/RB/TE). */
export function positionalTotals(
  players: LineupPlayer[],
  slots: string[]
): Record<Exclude<HeatPos, 'ovr'>, number> {
  const remaining = players
    .map((p) => ({ ...p, position: normalizePosition(p.position) }))
    .sort((a, b) => b.pts - a.pts)
  const used = new Set<string>()
  const totals: Record<Exclude<HeatPos, 'ovr'>, number> = {
    qb: 0,
    rb: 0,
    wr: 0,
    te: 0,
    flex: 0,
    def: 0,
  }
  const fill = (slot: string) => {
    const group = slotGroup(slot)
    if (!group) {
      return
    }
    const eligible = slotEligible(slot)
    const pick = remaining.find((p) => !used.has(p.playerId) && eligible.includes(p.position))
    if (!pick) {
      return
    }
    used.add(pick.playerId)
    totals[group] += pick.pts
  }
  for (const slot of slots.filter((s) => !s.includes('FLEX'))) {
    fill(slot)
  }
  for (const slot of slots.filter((s) => s.includes('FLEX'))) {
    fill(slot)
  }
  return totals
}

function rankDescending(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => b.v - a.v)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i + 1
    while (j < indexed.length && indexed[j].v === indexed[i].v) {
      j++
    }
    const rank = i + 1
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = rank
    }
    i = j
  }
  return ranks
}

export function positionalHeatmap(
  rosters: { rosterId: number; players: LineupPlayer[] }[],
  slots: string[]
): HeatRow[] {
  const posKeys: Exclude<HeatPos, 'ovr'>[] = ['qb', 'rb', 'wr', 'te', 'flex', 'def']
  const built = rosters.map((r) => {
    const pos = positionalTotals(r.players, slots)
    const ovr = pos.qb + pos.rb + pos.wr + pos.te + pos.flex + pos.def
    return { rosterId: r.rosterId, pos, ovr }
  })
  const ovrRanks = rankDescending(built.map((b) => b.ovr))
  const posRanks = Object.fromEntries(
    posKeys.map((k) => [k, rankDescending(built.map((b) => b.pos[k]))])
  ) as Record<Exclude<HeatPos, 'ovr'>, number[]>
  return built.map((b, i) => ({
    rosterId: b.rosterId,
    ovr: { rank: ovrRanks[i], pts: b.ovr },
    qb: { rank: posRanks.qb[i], pts: b.pos.qb },
    rb: { rank: posRanks.rb[i], pts: b.pos.rb },
    wr: { rank: posRanks.wr[i], pts: b.pos.wr },
    te: { rank: posRanks.te[i], pts: b.pos.te },
    flex: { rank: posRanks.flex[i], pts: b.pos.flex },
    def: { rank: posRanks.def[i], pts: b.pos.def },
  }))
}

export function sumProjectedPts(weeklyPts: ProjWeekPts[], playerId: string): number {
  let t = 0
  for (const w of weeklyPts) {
    if (w.playerId === playerId) {
      t += w.pts
    }
  }
  return t
}
