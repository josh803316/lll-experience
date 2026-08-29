import { describe, expect, test } from 'bun:test'
import {
  buildFantasyEvolution,
  buildFantasyTimeline,
  replayRosterSnapshots,
  type TimelineDraftPick,
  type TimelineTransaction,
} from './fantasy-timeline.js'

const tx = (overrides: Partial<TimelineTransaction>): TimelineTransaction => ({
  transactionId: 'tx',
  week: 1,
  type: 'waiver',
  status: 'complete',
  adds: null,
  drops: null,
  waiverBid: 0,
  createdAtMs: 1,
  ...overrides,
})

describe('fantasy roster timeline', () => {
  test('replays settled transactions in deterministic timestamp order', () => {
    const picks: TimelineDraftPick[] = [
      { playerId: 'a', rosterId: 1, position: 'QB' },
      { playerId: 'b', rosterId: 2, position: 'QB' },
    ]
    const snapshots = replayRosterSnapshots(
      [
        { rosterId: 1, slug: 'one', displayName: 'One' },
        { rosterId: 2, slug: 'two', displayName: 'Two' },
      ],
      picks,
      [
        tx({
          transactionId: 'failed',
          status: 'failed',
          drops: { a: 1 },
          createdAtMs: 1,
        }),
        tx({
          transactionId: 'trade',
          type: 'trade',
          drops: { a: 1, b: 2 },
          adds: { b: 1, a: 2 },
          createdAtMs: 3,
        }),
        tx({
          transactionId: 'waiver',
          adds: { c: 1 },
          createdAtMs: 2,
          waiverBid: 7,
        }),
      ],
      1
    )

    expect(snapshots[0].rosters.get(1)).toEqual(['a'])
    expect(snapshots[1].rosters.get(1)).toEqual(['c', 'b'])
    expect(snapshots[1].rosters.get(2)).toEqual(['a'])
    expect(snapshots[1].events.map((event) => event.transactionId)).toEqual([
      'waiver',
      'trade',
      'trade',
      'trade',
      'trade',
    ])
    expect(snapshots[1].events.find((event) => event.transactionId === 'waiver')?.waiverBid).toBe(7)
  })

  test('classifies value and roster strength as separate axes', () => {
    const points = buildFantasyTimeline({
      rosters: [
        { rosterId: 1, slug: 'wlampe', displayName: 'wlampe' },
        { rosterId: 2, slug: 'jeff', displayName: 'Jeff' },
        { rosterId: 3, slug: 'tim', displayName: 'Tim' },
      ],
      draftPicks: [
        { playerId: 'a', rosterId: 1, position: 'QB' },
        { playerId: 'b', rosterId: 2, position: 'QB' },
        { playerId: 'c', rosterId: 3, position: 'QB' },
      ],
      transactions: [],
      playerPositions: new Map([
        ['a', 'QB'],
        ['b', 'QB'],
        ['c', 'QB'],
      ]),
      playerNames: new Map([
        ['a', 'A'],
        ['b', 'B'],
        ['c', 'C'],
      ]),
      rosterPositions: ['QB'],
      weeklyPoints: [
        { week: 1, playerId: 'a', points: 5 },
        { week: 1, playerId: 'b', points: 30 },
        { week: 1, playerId: 'c', points: 10 },
      ],
      actualMatchups: [
        { week: 1, rosterId: 1, points: 5 },
        { week: 1, rosterId: 2, points: 30 },
        { week: 1, rosterId: 3, points: 10 },
      ],
      draftSurplusByRoster: new Map([
        [1, 100],
        [2, -100],
        [3, 0],
      ]),
      draftGradeByRoster: new Map([
        [1, 'A'],
        [2, 'C'],
        [3, 'F'],
      ]),
      maxWeek: 1,
      projected: false,
    })

    const weekZero = points.filter((point) => point.week === 0)
    expect(weekZero.find((point) => point.slug === 'wlampe')?.insight).toBe(
      'Great value, weak roster'
    )
    expect(weekZero.find((point) => point.slug === 'jeff')?.insight).toBe(
      'Strong roster, expensive build'
    )
    expect(weekZero.find((point) => point.slug === 'tim')?.insight).toBe('Balanced build')
    const wlampeWeekOne = points.find((point) => point.slug === 'wlampe' && point.week === 1)
    expect(wlampeWeekOne?.performanceRank).toBe(3)
    expect(wlampeWeekOne?.performanceWins).toBe(0)
    expect(wlampeWeekOne?.performanceLosses).toBe(2)
    expect(wlampeWeekOne?.strengthDelta).toBe(0)
  })

  test('marks transaction point deltas and keeps future performance unranked', () => {
    const points = buildFantasyTimeline({
      rosters: [{ rosterId: 1, slug: 'one', displayName: 'One' }],
      draftPicks: [{ playerId: 'a', rosterId: 1, position: 'QB' }],
      transactions: [
        tx({
          transactionId: 'add-b',
          adds: { b: 1 },
          week: 1,
        }),
      ],
      playerPositions: new Map([
        ['a', 'QB'],
        ['b', 'QB'],
      ]),
      playerNames: new Map([
        ['a', 'A'],
        ['b', 'B'],
      ]),
      rosterPositions: ['QB'],
      weeklyPoints: [{ week: 1, playerId: 'b', points: 12 }],
      actualMatchups: [],
      draftSurplusByRoster: new Map([[1, 4]]),
      draftGradeByRoster: new Map([[1, 'B']]),
      maxWeek: 1,
      projected: true,
    })

    const weekOne = points.find((point) => point.week === 1)
    expect(weekOne?.events[0].pointDelta).toBe(12)
    expect(weekOne?.strengthDelta).toBe(12)
    expect(weekOne?.strengthBasis).toBe('current projections')
    expect(weekOne?.performanceRank).toBe(0)
  })

  test('resolves transaction-only names and scores decisions from the move week forward', () => {
    const input = {
      rosters: [
        { rosterId: 1, slug: 'one', displayName: 'One' },
        { rosterId: 2, slug: 'two', displayName: 'Two' },
        { rosterId: 3, slug: 'three', displayName: 'Three' },
      ],
      draftPicks: [
        { playerId: 'a', rosterId: 1, position: 'QB' },
        { playerId: 'b', rosterId: 2, position: 'QB' },
        { playerId: 'c', rosterId: 3, position: 'QB' },
        { playerId: 'd', rosterId: 2, position: 'QB' },
      ],
      transactions: [
        tx({
          transactionId: 'trade',
          type: 'trade',
          adds: { d: 1, a: 2 },
          drops: { a: 1, d: 2 },
        }),
      ],
      playerPositions: new Map([
        ['a', 'QB'],
        ['b', 'QB'],
        ['c', 'QB'],
        ['d', 'QB'],
      ]),
      playerNames: new Map([
        ['a', 'Player A'],
        ['b', 'Player B'],
        ['c', 'Player C'],
        ['d', 'Juwan Johnson'],
      ]),
      rosterPositions: ['QB'],
      weeklyPoints: [
        { week: 1, playerId: 'a', points: 5 },
        { week: 1, playerId: 'b', points: 10 },
        { week: 1, playerId: 'c', points: 1 },
        { week: 1, playerId: 'd', points: 20 },
      ],
      actualMatchups: [],
      draftSurplusByRoster: new Map([
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
      draftGradeByRoster: new Map([
        [1, 'C'],
        [2, 'C'],
        [3, 'C'],
      ]),
      maxWeek: 1,
      projected: true,
    }

    const evolution = buildFantasyEvolution(input)
    const weekOne = evolution.points.filter((point) => point.week === 1)
    const oneDecision = evolution.decisions.find((decision) => decision.rosterId === 1)
    const twoDecision = evolution.decisions.find((decision) => decision.rosterId === 2)

    expect(
      weekOne.find((point) => point.rosterId === 1)?.events.find((event) => event.playerId === 'd')
        ?.playerName
    ).toBe('Juwan Johnson')
    expect(oneDecision?.addedPoints).toBe(20)
    expect(oneDecision?.droppedPoints).toBe(5)
    expect(oneDecision?.netDelta).toBe(15)
    expect(oneDecision?.choiceBonus).toBe(20)
    expect(oneDecision?.bestBallBefore).toBe(5)
    expect(oneDecision?.bestBallAfter).toBe(20)
    expect(oneDecision?.bestBallDelta).toBe(15)
    expect(twoDecision?.bestBallDelta).toBe(-10)
    expect(twoDecision?.depthBefore.QB).toBe(2)
    expect(twoDecision?.depthAfter.QB).toBe(2)
    expect(oneDecision?.label).toBe('Choice bonus')
    expect(twoDecision?.doubleNegative).toBe(15)
    expect(twoDecision?.label).toBe('Double negative')
    expect(weekOne.find((point) => point.rosterId === 1)?.projectedWins).toBe(2)
    expect(weekOne.find((point) => point.rosterId === 1)?.projectedRank).toBe(1)
    expect(evolution.risers[0]?.slug).toBe('one')
    expect(evolution.risers[0]?.change).toBe(1)
    expect(evolution.fallers[0]?.slug).toBe('two')
    expect(evolution.fallers[0]?.change).toBe(-1)
  })
})
