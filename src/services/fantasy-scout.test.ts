import { describe, expect, test } from 'bun:test'
import { type FantasyWeeklyScore, headToHeadFromScores } from './fantasy-scout.js'

const score = (slug: string, points: number, week: number, rank: number): FantasyWeeklyScore => ({
  season: 2025,
  week,
  rosterId: slug === 'alpha' ? 1 : slug === 'beta' ? 2 : 3,
  slug,
  displayName: slug,
  teamName: null,
  points,
  rank,
})

describe('fantasy scout rollups', () => {
  test('head-to-head is symmetric and retains ties', () => {
    const cells = headToHeadFromScores([
      score('alpha', 100, 1, 1),
      score('beta', 90, 1, 2),
      score('gamma', 100, 1, 1),
      score('alpha', 80, 2, 3),
      score('beta', 95, 2, 1),
      score('gamma', 90, 2, 2),
    ])

    const alphaBeta = cells.find((cell) => cell.a === 'alpha' && cell.b === 'beta')
    const betaAlpha = cells.find((cell) => cell.a === 'beta' && cell.b === 'alpha')
    const alphaGamma = cells.find((cell) => cell.a === 'alpha' && cell.b === 'gamma')

    expect(alphaBeta).toMatchObject({ wins: 1, losses: 1, ties: 0, games: 2 })
    expect(betaAlpha).toMatchObject({ wins: 1, losses: 1, ties: 0, games: 2 })
    expect(alphaGamma).toMatchObject({ wins: 0, losses: 1, ties: 1, games: 2 })
    expect(alphaBeta?.wins).toBe(betaAlpha?.losses)
    expect(alphaBeta?.losses).toBe(betaAlpha?.wins)
  })
})
