import {dollarBucket, isLatePick} from '../config/fantasy-managers.js';

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function winPct(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties;
  return games === 0 ? 0 : wins / games;
}

export interface WeekMatchupRow {
  week: number;
  rosterId: number;
  matchupId: number | null;
  points: number;
}

export interface AllPlayRecord {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  weeksPlayed: number;
  fpts: number;
}

/**
 * Each week every roster plays every other roster (best-ball points).
 * Weeks where every team scored 0 are skipped (season not started).
 */
export function allPlayFromMatchups(rows: WeekMatchupRow[]): Map<number, AllPlayRecord> {
  const byRoster = new Map<number, AllPlayRecord>();
  const ensure = (rosterId: number): AllPlayRecord => {
    let rec = byRoster.get(rosterId);
    if (!rec) {
      rec = {rosterId, wins: 0, losses: 0, ties: 0, weeksPlayed: 0, fpts: 0};
      byRoster.set(rosterId, rec);
    }
    return rec;
  };

  const byWeek = new Map<number, WeekMatchupRow[]>();
  for (const row of rows) {
    const list = byWeek.get(row.week) ?? [];
    list.push(row);
    byWeek.set(row.week, list);
    ensure(row.rosterId);
  }

  for (const weekRows of byWeek.values()) {
    if (weekRows.length < 2 || weekRows.every((r) => r.points === 0)) {
      continue;
    }
    for (const row of weekRows) {
      const rec = ensure(row.rosterId);
      rec.weeksPlayed += 1;
      rec.fpts += row.points;
    }
    for (let i = 0; i < weekRows.length; i++) {
      for (let j = i + 1; j < weekRows.length; j++) {
        const a = weekRows[i];
        const b = weekRows[j];
        const left = ensure(a.rosterId);
        const right = ensure(b.rosterId);
        if (a.points > b.points) {
          left.wins += 1;
          right.losses += 1;
        } else if (b.points > a.points) {
          right.wins += 1;
          left.losses += 1;
        } else {
          left.ties += 1;
          right.ties += 1;
        }
      }
    }
  }
  return byRoster;
}

export interface DraftPickInput {
  playerId: string;
  rosterId: number;
  sleeperUserId: string | null;
  amount: number;
  round: number;
  position: string | null;
}

export interface PlayerSeasonPts {
  playerId: string;
  fpts: number;
}

export interface ScoredPick {
  playerId: string;
  rosterId: number;
  sleeperUserId: string | null;
  amount: number;
  round: number;
  position: string;
  fpts: number;
  value: number;
  surplus: number;
  late: boolean;
  bucket: string;
}

export function scoreDraftPicks(
  picks: DraftPickInput[],
  seasonPts: PlayerSeasonPts[],
  totalRounds: number,
): ScoredPick[] {
  const ptsByPlayer = new Map(seasonPts.map((p) => [p.playerId, p.fpts]));
  const prelim = picks.map((p) => {
    const position = (p.position || 'UNK').toUpperCase();
    const fpts = ptsByPlayer.get(p.playerId) ?? 0;
    return {
      ...p,
      position,
      fpts,
      value: fpts / Math.max(p.amount, 1),
      bucket: dollarBucket(p.amount),
      late: isLatePick(p.round, p.amount, totalRounds),
    };
  });

  const expected = new Map<string, number>();
  const groups = new Map<string, number[]>();
  for (const p of prelim) {
    const key = `${p.position}|${p.bucket}`;
    const list = groups.get(key) ?? [];
    list.push(p.fpts);
    groups.set(key, list);
  }
  for (const [key, vals] of groups) {
    expected.set(key, median(vals));
  }

  return prelim.map((p) => ({
    playerId: p.playerId,
    rosterId: p.rosterId,
    sleeperUserId: p.sleeperUserId,
    amount: p.amount,
    round: p.round,
    position: p.position,
    fpts: p.fpts,
    value: p.value,
    surplus: p.fpts - (expected.get(`${p.position}|${p.bucket}`) ?? 0),
    late: p.late,
    bucket: p.bucket,
  }));
}

export interface TxEvent {
  week: number;
  type: string;
  status: string;
  rosterId: number;
  playerId: string;
  kind: 'add' | 'drop';
  waiverBid: number | null;
}

export interface WireStint {
  rosterId: number;
  playerId: string;
  addWeek: number;
  dropWeek: number;
  type: string;
  waiverBid: number;
  fpts: number;
}

export interface PlayerWeekPts {
  week: number;
  rosterId: number;
  playerId: string;
  points: number;
}

/**
 * Complete waiver/FA adds become stints until the next drop of that player
 * on the same roster, else `seasonEndWeek`.
 */
export function wireStints(
  events: TxEvent[],
  playerWeeks: PlayerWeekPts[],
  seasonEndWeek: number,
): WireStint[] {
  const complete = events
    .filter((e) => e.status === 'complete' && (e.type === 'waiver' || e.type === 'free_agent'))
    .sort((a, b) => a.week - b.week || a.kind.localeCompare(b.kind));

  const ptsIndex = new Map<string, number>();
  for (const w of playerWeeks) {
    const key = `${w.rosterId}|${w.playerId}|${w.week}`;
    ptsIndex.set(key, (ptsIndex.get(key) ?? 0) + w.points);
  }

  const stints: WireStint[] = [];
  for (const add of complete.filter((e) => e.kind === 'add')) {
    const drop = complete.find(
      (e) =>
        e.kind === 'drop' &&
        e.rosterId === add.rosterId &&
        e.playerId === add.playerId &&
        e.week >= add.week &&
        e !== add,
    );
    const dropWeek = drop ? drop.week : seasonEndWeek;
    let fpts = 0;
    for (let week = add.week; week <= dropWeek; week++) {
      fpts += ptsIndex.get(`${add.rosterId}|${add.playerId}|${week}`) ?? 0;
    }
    stints.push({
      rosterId: add.rosterId,
      playerId: add.playerId,
      addWeek: add.week,
      dropWeek,
      type: add.type,
      waiverBid: add.waiverBid ?? 0,
      fpts,
    });
  }
  return stints;
}

export function finishRanks<T extends {wins: number; fpts: number}>(rows: T[]): (T & {finish: number})[] {
  const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);
  return sorted.map((row, i) => ({...row, finish: i + 1}));
}

export function dollarOneReplacement(picks: ScoredPick[]): number {
  return median(picks.filter((p) => p.amount <= 1).map((p) => p.fpts));
}
