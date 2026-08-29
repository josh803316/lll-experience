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

export interface FantasyEvolutionPoint extends FantasyTimelinePoint {
  projectedWins: number
  projectedLosses: number
  projectedTies: number
  projectedWinPct: number
  projectedRank: number
  standingsRank: number
  standingsChange: number
}

export interface TimelineDecisionPlayer {
  playerId: string
  playerName: string
  points: number
  kind: 'add' | 'drop'
}

export interface TimelineDecision {
  transactionId: string
  week: number
  type: string
  rosterId: number
  slug: string
  displayName: string
  addedPoints: number
  droppedPoints: number
  netDelta: number
  choiceBonus: number
  doubleNegative: number
  label:
    | 'Choice bonus'
    | 'Double negative'
    | 'FA hit'
    | 'Winning move'
    | 'Opportunity cost'
    | 'Neutral'
  players: TimelineDecisionPlayer[]
}

export interface EvolutionMovement {
  rosterId: number
  slug: string
  displayName: string
  fromRank: number
  toRank: number
  change: number
}

export interface FantasyEvolutionResult {
  points: FantasyEvolutionPoint[]
  decisions: TimelineDecision[]
  risers: EvolutionMovement[]
  fallers: EvolutionMovement[]
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

function rankRecords(records: { winPct: number; fpts: number }[]): number[] {
  const indexed = records.map((record, index) => ({ ...record, index }))
  indexed.sort((a, b) => b.winPct - a.winPct || b.fpts - a.fpts)
  const ranks = new Array<number>(records.length)
  for (let index = 0; index < indexed.length; index++) {
    const previous = indexed[index - 1]
    const same =
      previous && previous.winPct === indexed[index].winPct && previous.fpts === indexed[index].fpts
    ranks[indexed[index].index] = same ? ranks[previous.index] : index + 1
  }
  return ranks
}

function postTransactionPoints(
  playerId: string,
  week: number,
  weeklyPoints: TimelinePlayerWeek[]
): number {
  return weeklyPoints
    .filter((row) => row.playerId === playerId && row.week >= week)
    .reduce((sum, row) => sum + row.points, 0)
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

export function buildFantasyEvolution(input: FantasyTimelineInput): FantasyEvolutionResult {
  const basePoints = buildFantasyTimeline(input)
  const snapshots = replayRosterSnapshots(
    input.rosters,
    input.draftPicks,
    input.transactions,
    input.maxWeek,
    input.playerNames
  )
  const points = pointMap(input.weeklyPoints)
  const sourceWeeks = [...new Set(input.weeklyPoints.map((row) => row.week))].sort((a, b) => a - b)
  const byKey = new Map(basePoints.map((point) => [`${point.week}|${point.rosterId}`, point]))
  const evolution: FantasyEvolutionPoint[] = []
  const previousStandings = new Map<number, number>()

  for (const snapshot of snapshots) {
    const weeklyScores = new Map<number, Map<number, number>>()
    for (const roster of input.rosters) {
      const rosterScores = new Map<number, number>()
      const playerIds = snapshot.rosters.get(roster.rosterId) ?? []
      for (const week of sourceWeeks) {
        rosterScores.set(
          week,
          lineupPoints(playerIds, week, points, input.playerPositions, input.rosterPositions)
        )
      }
      weeklyScores.set(roster.rosterId, rosterScores)
    }

    const projectedRecords = input.rosters.map((roster) => {
      const scores = weeklyScores.get(roster.rosterId) ?? new Map()
      const record = { wins: 0, losses: 0, ties: 0, fpts: 0 }
      for (const week of sourceWeeks) {
        const score = scores.get(week) ?? 0
        const roomScores = input.rosters.map(
          (other) => weeklyScores.get(other.rosterId)?.get(week) ?? 0
        )
        const opponentScores = input.rosters
          .filter((other) => other.rosterId !== roster.rosterId)
          .map((other) => weeklyScores.get(other.rosterId)?.get(week) ?? 0)
        if (roomScores.length > 1 && roomScores.every((value) => value === 0)) {
          continue
        }
        record.fpts += score
        for (const opponent of opponentScores) {
          if (opponent < score) {
            record.wins++
          } else if (opponent > score) {
            record.losses++
          } else {
            record.ties++
          }
        }
      }
      return record
    })
    const projectedRanks = rankRecords(
      projectedRecords.map((record) => ({
        winPct: winPct(record.wins, record.losses, record.ties),
        fpts: record.fpts,
      }))
    )

    for (let index = 0; index < input.rosters.length; index++) {
      const roster = input.rosters[index]
      const base = byKey.get(`${snapshot.week}|${roster.rosterId}`)
      if (!base) {
        continue
      }
      const projectedRecord = projectedRecords[index]
      const standingsRank = base.performanceRank || projectedRanks[index]
      evolution.push({
        ...base,
        projectedWins: projectedRecord.wins,
        projectedLosses: projectedRecord.losses,
        projectedTies: projectedRecord.ties,
        projectedWinPct: winPct(projectedRecord.wins, projectedRecord.losses, projectedRecord.ties),
        projectedRank: projectedRanks[index],
        standingsRank,
        standingsChange:
          snapshot.week === 0
            ? 0
            : (previousStandings.get(roster.rosterId) ?? standingsRank) - standingsRank,
      })
      previousStandings.set(roster.rosterId, standingsRank)
    }
  }

  const decisionGroups = new Map<string, TimelineEvent[]>()
  const transactionEventsById = new Map<string, TimelineEvent[]>()
  const transactionOrder = new Map(
    orderedTransactions(input.transactions).map((transaction, index) => [
      transaction.transactionId,
      index,
    ])
  )
  for (const snapshot of snapshots) {
    for (const event of snapshot.events) {
      const key = `${event.transactionId}|${event.rosterId}`
      const group = decisionGroups.get(key) ?? []
      group.push(event)
      decisionGroups.set(key, group)
      const allEvents = transactionEventsById.get(event.transactionId) ?? []
      allEvents.push(event)
      transactionEventsById.set(event.transactionId, allEvents)
    }
  }
  const decisions: TimelineDecision[] = []
  for (const events of decisionGroups.values()) {
    const first = events[0]
    const adds = events.filter((event) => event.kind === 'add')
    const drops = events.filter((event) => event.kind === 'drop')
    const addedPoints = adds.reduce(
      (sum, event) => sum + postTransactionPoints(event.playerId, first.week, input.weeklyPoints),
      0
    )
    const droppedPoints = drops.reduce(
      (sum, event) => sum + postTransactionPoints(event.playerId, first.week, input.weeklyPoints),
      0
    )
    const choiceBonus = adds
      .filter((add) =>
        [...transactionEventsById.values()].some((events) =>
          events.some(
            (event) =>
              event.kind === 'drop' &&
              event.playerId === add.playerId &&
              event.rosterId !== first.rosterId &&
              (event.transactionId === first.transactionId ||
                (transactionOrder.get(event.transactionId) ?? Infinity) <
                  (transactionOrder.get(first.transactionId) ?? Infinity))
          )
        )
      )
      .reduce(
        (sum, event) => sum + postTransactionPoints(event.playerId, first.week, input.weeklyPoints),
        0
      )
    const doubleNegative = Math.max(0, droppedPoints - addedPoints)
    const netDelta = addedPoints - droppedPoints
    let label: TimelineDecision['label'] = 'Neutral'
    if (choiceBonus > 0 && netDelta > 0) {
      label = 'Choice bonus'
    } else if (doubleNegative > 0) {
      label = 'Double negative'
    } else if (adds.length > 0 && drops.length === 0 && addedPoints > 0) {
      label = 'FA hit'
    } else if (netDelta > 0) {
      label = 'Winning move'
    } else if (netDelta < 0) {
      label = 'Opportunity cost'
    }
    decisions.push({
      transactionId: first.transactionId,
      week: first.week,
      type: first.type,
      rosterId: first.rosterId,
      slug: first.rosterId
        ? (input.rosters.find((r) => r.rosterId === first.rosterId)?.slug ?? '')
        : '',
      displayName: input.rosters.find((r) => r.rosterId === first.rosterId)?.displayName ?? '',
      addedPoints,
      droppedPoints,
      netDelta,
      choiceBonus,
      doubleNegative,
      label,
      players: events.map((event) => ({
        playerId: event.playerId,
        playerName: event.playerName,
        points: postTransactionPoints(event.playerId, first.week, input.weeklyPoints),
        kind: event.kind,
      })),
    })
  }
  decisions.sort((a, b) => b.netDelta - a.netDelta || a.week - b.week)

  const finalWeek = Math.max(...snapshots.map((snapshot) => snapshot.week), 0)
  const priorWeek = Math.max(0, finalWeek - 1)
  const current = evolution.filter((point) => point.week === finalWeek)
  const prior = new Map(
    evolution
      .filter((point) => point.week === priorWeek)
      .map((point) => [point.rosterId, point.standingsRank])
  )
  const movements = current
    .map((point) => ({
      rosterId: point.rosterId,
      slug: point.slug,
      displayName: point.displayName,
      fromRank: prior.get(point.rosterId) ?? point.standingsRank,
      toRank: point.standingsRank,
      change: (prior.get(point.rosterId) ?? point.standingsRank) - point.standingsRank,
    }))
    .filter((movement) => movement.change !== 0)
  return {
    points: evolution,
    decisions,
    risers: movements.filter((movement) => movement.change > 0).sort((a, b) => b.change - a.change),
    fallers: movements
      .filter((movement) => movement.change < 0)
      .sort((a, b) => a.change - b.change),
  }
}
