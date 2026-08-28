import {describe, expect, test} from 'bun:test';
import {dollarBucket, isLatePick} from '../config/fantasy-managers.js';
import {
  allPlayFromMatchups,
  applyDraftLetters,
  finishRanks,
  lettersForScores,
  median,
  scoreDraftPicks,
  winPct,
  wireStints,
} from './fantasy-metrics.js';
import {bestBallScore, projectedWeeklyScores, scoreStats} from './fantasy-projections.js';

describe('winPct / median', () => {
  test('win pct includes ties in the denominator', () => {
    expect(winPct(26, 10, 0)).toBeCloseTo(26 / 36);
    expect(winPct(0, 0, 0)).toBe(0);
  });
  test('median even and odd', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 4, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('all-play from weekly scores', () => {
  test('each roster plays every other roster that week', () => {
    const rec = allPlayFromMatchups([
      {week: 1, rosterId: 1, matchupId: 1, points: 120},
      {week: 1, rosterId: 2, matchupId: 1, points: 100},
      {week: 1, rosterId: 3, matchupId: 2, points: 90},
    ]);
    // 120 beats 100 and 90 → 2-0; 100 beats 90 → 1-1; 90 loses both → 0-2
    expect(rec.get(1)).toMatchObject({wins: 2, losses: 0, ties: 0, weeksPlayed: 1, fpts: 120});
    expect(rec.get(2)).toMatchObject({wins: 1, losses: 1, ties: 0, weeksPlayed: 1, fpts: 100});
    expect(rec.get(3)).toMatchObject({wins: 0, losses: 2, ties: 0, weeksPlayed: 1, fpts: 90});
  });
  test('ties count both ways; all-zero weeks are skipped', () => {
    const rec = allPlayFromMatchups([
      {week: 1, rosterId: 1, matchupId: 1, points: 0},
      {week: 1, rosterId: 2, matchupId: 2, points: 0},
      {week: 2, rosterId: 1, matchupId: 1, points: 80},
      {week: 2, rosterId: 2, matchupId: 2, points: 80},
    ]);
    expect(rec.get(1)).toMatchObject({wins: 0, losses: 0, ties: 1, weeksPlayed: 1, fpts: 80});
    expect(rec.get(2)).toMatchObject({wins: 0, losses: 0, ties: 1, weeksPlayed: 1, fpts: 80});
  });
});

describe('auction surplus', () => {
  test('star in a unique $ bucket still scores vs positional pts-per-dollar', () => {
    const scored = scoreDraftPicks(
      [
        {playerId: 'star', rosterId: 1, sleeperUserId: 'u1', amount: 55, round: 1, position: 'RB'},
        {playerId: 'mid', rosterId: 2, sleeperUserId: 'u2', amount: 20, round: 1, position: 'RB'},
        {playerId: 'wr', rosterId: 1, sleeperUserId: 'u1', amount: 1, round: 13, position: 'WR'},
      ],
      [
        {playerId: 'star', fpts: 300},
        {playerId: 'mid', fpts: 80},
        {playerId: 'wr', fpts: 80},
      ],
      13,
    );
    const star = scored.find((p) => p.playerId === 'star')!;
    const mid = scored.find((p) => p.playerId === 'mid')!;
    const wr = scored.find((p) => p.playerId === 'wr')!;
    expect(star.bucket).toBe('51+');
    expect(mid.bucket).toBe('16-30');
    expect(wr.late).toBe(true);
    // RB par = (300+80) / (55+20) = 5.066… pts/$. Unique $ buckets must not zero the star.
    expect(star.surplus).toBeCloseTo(300 - 55 * (380 / 75));
    expect(mid.surplus).toBeCloseTo(80 - 20 * (380 / 75));
    expect(star.surplus).toBeGreaterThan(0);
    expect(mid.surplus).toBeLessThan(0);
    expect(wr.surplus).toBeCloseTo(0);
    expect(wr.value).toBe(80);
  });
  test('same-position picks share one pts/$ rate, not a bucket median', () => {
    const scored = scoreDraftPicks(
      [
        {playerId: 'a', rosterId: 1, sleeperUserId: 'u1', amount: 40, round: 1, position: 'RB'},
        {playerId: 'b', rosterId: 2, sleeperUserId: 'u2', amount: 42, round: 1, position: 'RB'},
      ],
      [
        {playerId: 'a', fpts: 300},
        {playerId: 'b', fpts: 100},
      ],
      13,
    );
    expect(dollarBucket(40)).toBe('31-50');
    const rate = 400 / 82;
    expect(scored[0].surplus).toBeCloseTo(300 - 40 * rate);
    expect(scored[1].surplus).toBeCloseTo(100 - 42 * rate);
  });
});

describe('late pick rule', () => {
  test('last three rounds or $2', () => {
    expect(isLatePick(11, 20, 13)).toBe(true);
    expect(isLatePick(10, 20, 13)).toBe(false);
    expect(isLatePick(3, 2, 13)).toBe(true);
  });
});

describe('wire stints', () => {
  test('add through drop inclusive, else season end', () => {
    const stints = wireStints(
      [
        {week: 3, type: 'waiver', status: 'complete', rosterId: 1, playerId: 'p', kind: 'add', waiverBid: 7},
        {week: 8, type: 'free_agent', status: 'complete', rosterId: 1, playerId: 'p', kind: 'drop', waiverBid: 0},
        {week: 4, type: 'waiver', status: 'failed', rosterId: 2, playerId: 'q', kind: 'add', waiverBid: 11},
        {week: 2, type: 'waiver', status: 'complete', rosterId: 2, playerId: 'r', kind: 'add', waiverBid: 3},
      ],
      [
        {week: 3, rosterId: 1, playerId: 'p', points: 10},
        {week: 4, rosterId: 1, playerId: 'p', points: 12},
        {week: 8, rosterId: 1, playerId: 'p', points: 5},
        {week: 9, rosterId: 1, playerId: 'p', points: 99},
        {week: 2, rosterId: 2, playerId: 'r', points: 8},
        {week: 18, rosterId: 2, playerId: 'r', points: 4},
      ],
      18,
    );
    const p = stints.find((s) => s.playerId === 'p')!;
    expect(p.fpts).toBe(27);
    expect(p.dropWeek).toBe(8);
    expect(stints.find((s) => s.playerId === 'q')).toBeUndefined();
    const r = stints.find((s) => s.playerId === 'r')!;
    expect(r.dropWeek).toBe(18);
    expect(r.fpts).toBe(12);
  });
});

describe('finish ranks', () => {
  test('wins then points, no invented champion', () => {
    const ranked = finishRanks([
      {name: 'a', wins: 22, fpts: 100},
      {name: 'b', wins: 22, fpts: 2400},
      {name: 'c', wins: 28, fpts: 10},
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['c', 'b', 'a']);
    expect(ranked[0].finish).toBe(1);
  });
});

describe('draft letters among GMs', () => {
  test('ten distinct scores spread A through F by quintile, best first', () => {
    expect(lettersForScores([90, 80, 70, 60, 50, 40, 30, 20, 10, 0])).toEqual([
      'A',
      'A',
      'B',
      'B',
      'C',
      'C',
      'D',
      'D',
      'F',
      'F',
    ]);
  });
  test('all equal (or no season yet) is ungraded, not a mass F', () => {
    expect(lettersForScores([0, 0, 0, 0])).toEqual(['—', '—', '—', '—']);
    expect(lettersForScores([12, 12])).toEqual(['—', '—']);
  });
  test('ties share a letter; original order is preserved', () => {
    expect(lettersForScores([20, 50, 50, 10, 0])).toEqual(['C', 'A', 'A', 'D', 'F']);
  });
  test('applyDraftLetters only grades GMs who drafted', () => {
    const rows = applyDraftLetters([
      {draftSurplus: 80, draftGrade: ''},
      {draftSurplus: 0, draftGrade: '—'},
      {draftSurplus: -20, draftGrade: ''},
    ]);
    expect(rows.map((r) => r.draftGrade)).toEqual(['A', '—', 'F']);
  });
});

describe('UCSB scoring of projected stats', () => {
  const ppr = {rec: 1, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_yd: 0.04, pass_td: 6, pass_int: -2};
  test('PPR receiver: rec + yards + TD, ignores pts_ppr and ADP', () => {
    const pts = scoreStats(ppr, {
      rec: 7.28,
      rec_yd: 96.15,
      rec_td: 0.53,
      pts_ppr: 20.48,
      adp_ppr: 4,
    });
    expect(pts).toBeCloseTo(7.28 + 9.615 + 3.18);
  });
  test('DEF uses sack/int buckets, not raw pts_allow', () => {
    const def = {sack: 1, int: 2, pts_allow_14_20: 3, def_td: 6};
    expect(scoreStats(def, {sack: 2.54, int: 0.87, pts_allow: 20.5, pts_allow_14_20: 1, def_td: 0.22})).toBeCloseTo(
      2.54 + 1.74 + 3 + 1.32,
    );
  });
});

describe('best-ball lineup', () => {
  const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'REC_FLEX', 'DEF'];
  test('starts the highest remaining WR/TE in REC_FLEX', () => {
    const pts = bestBallScore(
      [
        {playerId: 'qb', position: 'QB', pts: 20},
        {playerId: 'rb1', position: 'RB', pts: 18},
        {playerId: 'rb2', position: 'RB', pts: 10},
        {playerId: 'wr1', position: 'WR', pts: 22},
        {playerId: 'wr2', position: 'WR', pts: 15},
        {playerId: 'wr3', position: 'WR', pts: 8},
        {playerId: 'wr4', position: 'WR', pts: 12},
        {playerId: 'te', position: 'TE', pts: 9},
        {playerId: 'def', position: 'DEF', pts: 5},
      ],
      slots,
    );
    // QB20 + RB18+10 + WR22+15+12 + TE9 + flex wr4 already in WR3? WR slots take 22,15,12; flex is wr3=8
    // Sorted: wr1 22, qb 20, rb1 18, wr2 15, wr4 12, rb2 10, te 9, wr3 8, def 5
    // QB: 20, RB: 18+10, WR: 22+15+12, TE: 9, DEF: 5, REC_FLEX: wr3 8
    expect(pts).toBe(20 + 18 + 10 + 22 + 15 + 12 + 9 + 8 + 5);
  });
  test('projected weeks emit one score per roster', () => {
    const rows = projectedWeeklyScores(
      [
        {rosterId: 1, playerId: 'a', position: 'QB'},
        {rosterId: 2, playerId: 'b', position: 'QB'},
      ],
      [
        {week: 1, playerId: 'a', pts: 25},
        {week: 1, playerId: 'b', pts: 10},
      ],
      ['QB'],
    );
    expect(rows.find((r) => r.rosterId === 1)?.points).toBe(25);
    expect(rows.find((r) => r.rosterId === 2)?.points).toBe(10);
  });
});
