import { describe, expect, test } from 'bun:test'
import {
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
})
