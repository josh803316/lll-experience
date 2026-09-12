import { describe, expect, test } from 'bun:test'
import type { FantasyLiveScoringData } from '../services/fantasy-scout.js'
import { fantasyLiveScoringPanel } from './fantasy-templates.js'

describe('fantasyLiveScoringPanel', () => {
  test('loads scores once when the empty panel first appears', () => {
    const html = fantasyLiveScoringPanel()

    expect(html).toContain('hx-post="/fantasy/live-sync"')
    expect(html).toContain('hx-trigger="load"')
    expect(html).toContain('hx-target="this"')
  })

  test('shows counting players, weekly matchups, and live standings', () => {
    const team = {
      rosterId: 1,
      matchupId: 7,
      slug: 'josh',
      displayName: 'Josh',
      teamName: 'PurdyGoodTeam',
      points: 34.9,
      players: [
        { playerId: 'deebo', playerName: 'Deebo Samuel', points: 18, counts: true },
        { playerId: 'evans', playerName: 'Mike Evans', points: 16.9, counts: true },
        { playerId: 'bench', playerName: 'Bench Player', points: 2, counts: false },
      ],
    }
    const data: FantasyLiveScoringData = {
      season: 2026,
      week: 1,
      seasonType: 'regular',
      fetchedAt: '2026-09-12T00:28:24.000Z',
      rows: [team],
      matchups: [{ matchupId: 7, teams: [team] }],
      standings: [
        {
          rank: 1,
          slug: 'josh',
          displayName: 'Josh',
          teamName: 'PurdyGoodTeam',
          wins: 9,
          losses: 0,
          ties: 0,
          points: 34.9,
        },
      ],
    }

    const html = fantasyLiveScoringPanel(data)
    expect(html).not.toContain('hx-trigger="load"')
    expect(html).toContain('Optimized best-ball totals')
    expect(html).toContain('Deebo Samuel')
    expect(html).toContain('Mike Evans')
    expect(html).not.toContain('Bench Player')
    expect(html).toContain('WEEK 1 MATCHUPS')
    expect(html).toContain('LIVE ALL-PLAY STANDINGS')
    expect(html).toContain('9-0')
  })
})
