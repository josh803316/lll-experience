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

  const posFpts = new Map<string, number>();
  const posDollars = new Map<string, number>();
  for (const p of prelim) {
    posFpts.set(p.position, (posFpts.get(p.position) ?? 0) + p.fpts);
    posDollars.set(p.position, (posDollars.get(p.position) ?? 0) + p.amount);
  }

  return prelim.map((p) => {
    const dollars = posDollars.get(p.position) ?? 0;
    const rate = dollars > 0 ? (posFpts.get(p.position) ?? 0) / dollars : 0;
    return {
      playerId: p.playerId,
      rosterId: p.rosterId,
      sleeperUserId: p.sleeperUserId,
      amount: p.amount,
      round: p.round,
      position: p.position,
      fpts: p.fpts,
      value: p.value,
      surplus: p.fpts - p.amount * rate,
      late: p.late,
      bucket: p.bucket,
    };
  });
}

const LETTER_BANDS = ['A', 'B', 'C', 'D', 'F'] as const;

/**
 * Grade GMs against each other, not against an absolute surplus cutoff.
 * Quintiles of rank (1=best): A B C D F. Ties share a letter. All-equal → ungraded.
 */
export function lettersForScores(scores: number[]): string[] {
  if (scores.length === 0) {
    return [];
  }
  const first = scores[0];
  if (scores.every((s) => s === first)) {
    return scores.map(() => '—');
  }
  const indexed = scores.map((value, index) => ({value, index}));
  indexed.sort((a, b) => b.value - a.value);
  const out = new Array<string>(scores.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i + 1;
    while (j < indexed.length && indexed[j].value === indexed[i].value) {
      j++;
    }
    const rank = i + 1;
    const band = Math.min(
      LETTER_BANDS.length - 1,
      Math.floor(((rank - 1) / (indexed.length - 1)) * LETTER_BANDS.length),
    );
    const letter = LETTER_BANDS[band];
    for (let k = i; k < j; k++) {
      out[indexed[k].index] = letter;
    }
    i = j;
  }
  return out;
}

export function applyDraftLetters<T extends {draftSurplus: number; draftGrade: string}>(rows: T[]): T[] {
  const eligible: number[] = [];
  const scores: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].draftGrade !== '—') {
      eligible.push(i);
      scores.push(rows[i].draftSurplus);
    }
  }
  const letters = lettersForScores(scores);
  const byIndex = new Map(eligible.map((rowIndex, slot) => [rowIndex, letters[slot]]));
  return rows.map((row, i) => {
    const letter = byIndex.get(i);
    return letter == null ? row : {...row, draftGrade: letter};
  });
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
