import { allPlayFromMatchups, winPct } from './fantasy-metrics.js'
import { bestBallScore, type LineupPlayer } from './fantasy-projections.js'

export interface TimelineDraftPick {
  playerId: string
  rosterId: number
  position: string | null
}

export interface TimelineTransaction {
  transactionId: string
  week: number
  type: string
  status: string
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  waiverBid: number | null
  createdAtMs: number | null
}

export interface TimelineRoster {
  rosterId: number
  slug: string
  displayName: string
}

export interface TimelineEvent {
  transactionId: string
  week: number
  type: string
  kind: 'add' | 'drop'
  playerId: string
  playerName: string
  rosterId: number
  waiverBid: number | null
  pointDelta: number
}

export interface TimelineRosterSnapshot {
  week: number
  rosters: Map<number, string[]>
  events: TimelineEvent[]
}

export interface TimelinePlayerWeek {
  week: number
  playerId: string
  points: number
}

export interface TimelineMatchupWeek {
  week: number
  rosterId: number
  points: number
}

export interface FantasyTimelinePoint {
  week: number
  rosterId: number
  slug: string
  displayName: string
  strengthPoints: number
  strengthRank: number
  performancePoints: number
  performanceRank: number
  performanceWins: number
  performanceLosses: number
  performanceTies: number
  performanceWinPct: number
  performanceChange: number
  cumulativePerformance: number
  strengthDelta: number
  draftSurplus: number
  draftGrade: string
  valueRank: number
  projected: boolean
  strengthBasis: 'retrospective actuals' | 'current projections'
  insight: string
  events: TimelineEvent[]
}

export interface FantasyTimelineInput {
  rosters: TimelineRoster[]
  draftPicks: TimelineDraftPick[]
  transactions: TimelineTransaction[]
  playerPositions: Map<string, string | null>
  playerNames: Map<string, string>
  rosterPositions: string[]
  weeklyPoints: TimelinePlayerWeek[]
  actualMatchups: TimelineMatchupWeek[]
  draftSurplusByRoster: Map<number, number>
  draftGradeByRoster: Map<number, string>
  maxWeek: number
  projected: boolean
}

function rankDescending(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((a, b) => b.value - a.value)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i + 1
    while (j < indexed.length && indexed[j].value === indexed[i].value) {
      j++
    }
    const rank = i + 1
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = rank
    }
    i = j
  }
  return ranks
}

function transactionEvents(
  tx: TimelineTransaction,
  playerNames: Map<string, string>
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const [playerId, rawRosterId] of Object.entries(tx.drops ?? {})) {
    events.push({
      transactionId: tx.transactionId,
      week: tx.week,
      type: tx.type,
      kind: 'drop',
      playerId,
      playerName: playerNames.get(playerId) ?? playerId,
      rosterId: Number(rawRosterId),
      waiverBid: tx.waiverBid,
      pointDelta: 0,
    })
  }
  for (const [playerId, rawRosterId] of Object.entries(tx.adds ?? {})) {
    events.push({
      transactionId: tx.transactionId,
      week: tx.week,
      type: tx.type,
      kind: 'add',
      playerId,
      playerName: playerNames.get(playerId) ?? playerId,
      rosterId: Number(rawRosterId),
      waiverBid: tx.waiverBid,
      pointDelta: 0,
    })
  }
  return events
}

function orderedTransactions(transactions: TimelineTransaction[]): TimelineTransaction[] {
  return transactions
    .filter((tx) => tx.status === 'complete')
    .slice()
    .sort(
      (a, b) =>
        a.week - b.week ||
        (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0) ||
        a.transactionId.localeCompare(b.transactionId)
    )
}

/**
 * Replays the draft roster and settled Sleeper transactions into weekly
 * start-of-week states. Transactions in week N are applied before snapshot N.
 */
export function replayRosterSnapshots(
  rosters: TimelineRoster[],
  draftPicks: TimelineDraftPick[],
  transactions: TimelineTransaction[],
  maxWeek: number,
  playerNames = new Map<string, string>()
): TimelineRosterSnapshot[] {
  const state = new Map<number, Set<string>>()
  for (const roster of rosters) {
    state.set(roster.rosterId, new Set())
  }
  for (const pick of draftPicks) {
    const players = state.get(pick.rosterId)
    if (players) {
      players.add(pick.playerId)
    }
  }

  const snapshots: TimelineRosterSnapshot[] = [
    {
      week: 0,
      rosters: new Map([...state].map(([rosterId, players]) => [rosterId, [...players]])),
      events: [],
    },
  ]
  const ordered = orderedTransactions(transactions)
  let cursor = 0

  for (let week = 1; week <= maxWeek; week++) {
    const events: TimelineEvent[] = []
    while (cursor < ordered.length && ordered[cursor].week <= week) {
      const tx = ordered[cursor]
      for (const event of transactionEvents(tx, playerNames)) {
        const players = state.get(event.rosterId)
        if (!players) {
          continue
        }
        if (event.kind === 'drop') {
          players.delete(event.playerId)
        } else {
          players.add(event.playerId)
        }
        events.push(event)
      }
      cursor++
    }
    snapshots.push({
      week,
      rosters: new Map([...state].map(([rosterId, players]) => [rosterId, [...players]])),
      events,
    })
  }
  return snapshots
}

function pointMap(rows: TimelinePlayerWeek[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.week}|${row.playerId}`
    out.set(key, Math.max(out.get(key) ?? 0, row.points))
  }
  return out
}

function lineupPoints(
  playerIds: string[],
  week: number,
  points: Map<string, number>,
  positions: Map<string, string | null>,
  rosterPositions: string[]
): number {
  const players: LineupPlayer[] = playerIds.map((playerId) => ({
    playerId,
    position: positions.get(playerId) ?? 'UNK',
    pts: points.get(`${week}|${playerId}`) ?? 0,
  }))
  return bestBallScore(players, rosterPositions)
}

function band(rank: number, count: number): 'strong' | 'middle' | 'weak' {
  const third = Math.max(1, Math.ceil(count / 3))
  if (rank <= third) {
    return 'strong'
  }
  if (rank > count - third) {
    return 'weak'
  }
  return 'middle'
}

function insight(valueRank: number, strengthRank: number, count: number): string {
  const value = band(valueRank, count)
  const strength = band(strengthRank, count)
  if (value === 'strong' && strength === 'weak') {
    return 'Great value, weak roster'
  }
  if (value === 'weak' && strength === 'strong') {
    return 'Strong roster, expensive build'
  }
  if (value === 'weak' && strength === 'weak') {
    return 'Weak value, weak roster'
  }
  if (value === 'strong' && strength === 'strong') {
    return 'Strong value, strong roster'
  }
  return 'Balanced build'
}

export function buildFantasyTimeline(input: FantasyTimelineInput): FantasyTimelinePoint[] {
  const snapshots = replayRosterSnapshots(
    input.rosters,
    input.draftPicks,
    input.transactions,
    input.maxWeek,
    input.playerNames
  )
  const points = pointMap(input.weeklyPoints)
  const seasonPointsByPlayer = new Map<string, number>()
  const countedWeeks = new Set<string>()
  for (const row of input.weeklyPoints) {
    const key = `${row.week}|${row.playerId}`
    if (countedWeeks.has(key)) {
      continue
    }
    countedWeeks.add(key)
    seasonPointsByPlayer.set(
      row.playerId,
      (seasonPointsByPlayer.get(row.playerId) ?? 0) + (points.get(key) ?? 0)
    )
  }
  for (const snapshot of snapshots) {
    for (const event of snapshot.events) {
      const total = seasonPointsByPlayer.get(event.playerId) ?? 0
      event.pointDelta = event.kind === 'add' ? total : -total
    }
  }
  const actualByRosterWeek = new Map<string, number>()
  for (const row of input.actualMatchups) {
    actualByRosterWeek.set(`${row.week}|${row.rosterId}`, row.points)
  }
  const hasActualPerformance = input.actualMatchups.some((row) => row.points > 0)
  const valueRanks = new Map(input.rosters.map((roster, index) => [roster.rosterId, index]))
  const surplusRanks = rankDescending(
    input.rosters.map((roster) => input.draftSurplusByRoster.get(roster.rosterId) ?? 0)
  )
  input.rosters.forEach((roster, index) => valueRanks.set(roster.rosterId, surplusRanks[index]))

  const sourceWeeks = [...new Set(input.weeklyPoints.map((row) => row.week))].sort((a, b) => a - b)
  const strengthByWeek = new Map<number, Map<number, number>>()
  for (const snapshot of snapshots) {
    const strengths = new Map<number, number>()
    for (const roster of input.rosters) {
      const playerIds = snapshot.rosters.get(roster.rosterId) ?? []
      const strength = sourceWeeks.reduce(
        (sum, week) =>
          sum + lineupPoints(playerIds, week, points, input.playerPositions, input.rosterPositions),
        0
      )
      strengths.set(roster.rosterId, strength)
    }
    strengthByWeek.set(snapshot.week, strengths)
  }

  const out: FantasyTimelinePoint[] = []
  for (const snapshot of snapshots) {
    const strengths = strengthByWeek.get(snapshot.week) ?? new Map()
    const strengthRanks = rankDescending(input.rosters.map((r) => strengths.get(r.rosterId) ?? 0))
    const performanceRecords = allPlayFromMatchups(
      input.actualMatchups
        .filter((row) => row.week <= snapshot.week)
        .map((row) => ({ ...row, matchupId: null }))
    )
    const performanceOrder = input.rosters
      .map((roster, index) => ({
        index,
        record: performanceRecords.get(roster.rosterId),
      }))
      .sort((a, b) => {
        const aRecord = a.record
        const bRecord = b.record
        const aPct = aRecord ? winPct(aRecord.wins, aRecord.losses, aRecord.ties) : 0
        const bPct = bRecord ? winPct(bRecord.wins, bRecord.losses, bRecord.ties) : 0
        return bPct - aPct || (bRecord?.fpts ?? 0) - (aRecord?.fpts ?? 0)
      })
    const performanceRanks = new Array<number>(input.rosters.length).fill(0)
    for (let index = 0; index < performanceOrder.length; index++) {
      performanceRanks[performanceOrder[index].index] = hasActualPerformance ? index + 1 : 0
    }
    for (let index = 0; index < input.rosters.length; index++) {
      const roster = input.rosters[index]
      const strengthPoints = strengths.get(roster.rosterId) ?? 0
      const performancePoints = actualByRosterWeek.get(`${snapshot.week}|${roster.rosterId}`) ?? 0
      const performanceRecord = performanceRecords.get(roster.rosterId)
      const previousPerformance =
        snapshot.week > 0
          ? (actualByRosterWeek.get(`${snapshot.week - 1}|${roster.rosterId}`) ?? 0)
          : 0
      const draftSurplus = input.draftSurplusByRoster.get(roster.rosterId) ?? 0
      out.push({
        week: snapshot.week,
        rosterId: roster.rosterId,
        slug: roster.slug,
        displayName: roster.displayName,
        strengthPoints,
        strengthRank: strengthRanks[index],
        performancePoints,
        performanceRank: snapshot.week === 0 || !hasActualPerformance ? 0 : performanceRanks[index],
        performanceWins: performanceRecord?.wins ?? 0,
        performanceLosses: performanceRecord?.losses ?? 0,
        performanceTies: performanceRecord?.ties ?? 0,
        performanceWinPct: performanceRecord
          ? winPct(performanceRecord.wins, performanceRecord.losses, performanceRecord.ties)
          : 0,
        performanceChange: snapshot.week === 0 ? 0 : performancePoints - previousPerformance,
        cumulativePerformance: performanceRecord?.fpts ?? 0,
        strengthDelta:
          strengthPoints - (strengthByWeek.get(0)?.get(roster.rosterId) ?? strengthPoints),
        draftSurplus,
        draftGrade: input.draftGradeByRoster.get(roster.rosterId) ?? '—',
        valueRank: valueRanks.get(roster.rosterId) ?? 0,
        projected: input.projected,
        strengthBasis: input.projected ? 'current projections' : 'retrospective actuals',
        insight: insight(
          valueRanks.get(roster.rosterId) ?? input.rosters.length,
          strengthRanks[index],
          input.rosters.length
        ),
        events: snapshot.events.filter((event) => event.rosterId === roster.rosterId),
      })
    }
  }
  return out
}
