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
