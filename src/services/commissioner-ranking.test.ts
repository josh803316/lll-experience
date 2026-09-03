import { describe, expect, test } from 'bun:test'
import { normPlayerName } from '../config/fantasy-managers.js'
import type { CommissionerPlayerRow } from './commissioner-ranking.js'
import { CommissionerRanking } from './commissioner-ranking.js'
import type { DraftPickRow } from './fantasy-scout.js'

const players: CommissionerPlayerRow[] = [
  {
    name: 'Josh Allen',
    position: 'QB',
    team: 'BUF',
    rank: 1,
    projectedPoints: 415,
    premium: 55,
    norm: normPlayerName('Josh Allen'),
  },
  {
    name: 'Denver',
    position: 'DEF',
    team: 'Denver',
    rank: 1,
    projectedPoints: 2.5,
    premium: 2,
    norm: normPlayerName('Denver'),
  },
]

describe('commissioner ranking', () => {
  test('matches skill players by normalized name and position', () => {
    const lookup = CommissionerRanking._buildLookup(players)
    const pick = {
      playerName: 'Josh Allen',
      position: 'QB',
    } as DraftPickRow
    const row = CommissionerRanking._matchPick(pick, lookup)
    expect(row?.rank).toBe(1)
    expect(row?.premium).toBe(55)
  })

  test('matches defenses by city nickname', () => {
    const lookup = CommissionerRanking._buildLookup(players)
    const pick = {
      playerName: 'Denver Broncos',
      position: 'DEF',
    } as DraftPickRow
    const row = CommissionerRanking._matchPick(pick, lookup)
    expect(row?.rank).toBe(1)
  })
})
