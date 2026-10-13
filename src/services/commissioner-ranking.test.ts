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

  test('matches L.A. Rams to the Los Angeles Rams', () => {
    const lookup = CommissionerRanking._buildLookup([
      {
        name: 'L.A. Rams',
        position: 'DEF',
        team: 'L.A. Rams',
        rank: 7,
        projectedPoints: 2,
        premium: 2,
        norm: normPlayerName('L.A. Rams'),
      },
    ])
    expect(lookup.matchDef('Los Angeles Rams')?.rank).toBe(7)
  })

  test('matches Kenny Gainwell to Kenneth Gainwell', () => {
    const lookup = CommissionerRanking._buildLookup([
      {
        name: 'Kenneth Gainwell',
        position: 'RB',
        team: 'TB',
        rank: 35,
        projectedPoints: 149,
        premium: 1,
        norm: normPlayerName('Kenneth Gainwell'),
      },
    ])
    const pick = {
      playerName: 'Kenny Gainwell',
      position: 'RB',
    } as DraftPickRow
    expect(CommissionerRanking._matchPick(pick, lookup)?.rank).toBe(35)
  })
})
