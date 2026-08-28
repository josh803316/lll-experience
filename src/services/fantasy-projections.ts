import type {WeekMatchupRow} from './fantasy-metrics.js';

const SKIP_STAT = /^(adp_|pos_adp_|pts_ppr$|pts_half_ppr$|pts_std$|pts$|gp$|category$)/;

export function scoreStats(
  scoring: Record<string, unknown> | null | undefined,
  stats: Record<string, unknown> | null | undefined,
): number {
  if (!scoring || !stats) {
    return 0;
  }
  let pts = 0;
  for (const [key, raw] of Object.entries(scoring)) {
    if (SKIP_STAT.test(key) || typeof raw !== 'number' || raw === 0) {
      continue;
    }
    const v = stats[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      pts += v * raw;
    }
  }
  return pts;
}

export function normalizePosition(position: string | null | undefined): string {
  const pos = (position || 'UNK').toUpperCase();
  if (pos === 'FB') {
    return 'RB';
  }
  return pos;
}

const FLEX_ELIGIBLE: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
};

function slotEligible(slot: string): string[] {
  if (FLEX_ELIGIBLE[slot]) {
    return FLEX_ELIGIBLE[slot];
  }
  return [slot];
}

export function starterSlots(rosterPositions: string[] | null | undefined): string[] {
  return (rosterPositions ?? []).filter((s) => s !== 'BN' && s !== 'IR' && s !== 'TAXI');
}

export interface LineupPlayer {
  playerId: string;
  position: string;
  pts: number;
}

/** Greedy: fill positional slots first (highest pts), then flex. */
export function bestBallScore(players: LineupPlayer[], slots: string[]): number {
  const remaining = players
    .map((p) => ({...p, position: normalizePosition(p.position)}))
    .sort((a, b) => b.pts - a.pts);
  const used = new Set<string>();
  let total = 0;
  const fill = (slot: string) => {
    const eligible = slotEligible(slot);
    const pick = remaining.find((p) => !used.has(p.playerId) && eligible.includes(p.position));
    if (!pick) {
      return;
    }
    used.add(pick.playerId);
    total += pick.pts;
  };
  for (const slot of slots.filter((s) => !s.includes('FLEX'))) {
    fill(slot);
  }
  for (const slot of slots.filter((s) => s.includes('FLEX'))) {
    fill(slot);
  }
  return total;
}

export interface ProjWeekPts {
  week: number;
  playerId: string;
  pts: number;
}

export interface DraftedPlayer {
  rosterId: number;
  playerId: string;
  position: string | null;
}

export function projectedWeeklyScores(
  drafted: DraftedPlayer[],
  weeklyPts: ProjWeekPts[],
  slots: string[],
): WeekMatchupRow[] {
  const weeks = new Set<number>();
  const pts = new Map<string, number>();
  for (const w of weeklyPts) {
    weeks.add(w.week);
    pts.set(`${w.week}|${w.playerId}`, w.pts);
  }
  const rosters = new Map<number, DraftedPlayer[]>();
  for (const p of drafted) {
    const list = rosters.get(p.rosterId) ?? [];
    list.push(p);
    rosters.set(p.rosterId, list);
  }
  const rows: WeekMatchupRow[] = [];
  for (const week of [...weeks].sort((a, b) => a - b)) {
    for (const [rosterId, squad] of rosters) {
      const players = squad.map((p) => ({
        playerId: p.playerId,
        position: p.position ?? 'UNK',
        pts: pts.get(`${week}|${p.playerId}`) ?? 0,
      }));
      rows.push({
        week,
        rosterId,
        matchupId: week,
        points: bestBallScore(players, slots),
      });
    }
  }
  return rows;
}

export function sumProjectedPts(weeklyPts: ProjWeekPts[], playerId: string): number {
  let t = 0;
  for (const w of weeklyPts) {
    if (w.playerId === playerId) {
      t += w.pts;
    }
  }
  return t;
}
