import {getDB} from '../db/index.js';
import {officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, gte, lte, and} from 'drizzle-orm';
import {LLLRatingEngine, canonicalTeam, EXPECTED_VALUE_BY_ROUND} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;
const DEFAULT_WINDOW = 6;

export type ScoutMode = 'career' | 'season';

export interface ScoutOptions {
  mode?: ScoutMode;
  season?: number;
  window?: number;
  endYear?: number;
}

interface RatingLookup {
  // Returns 0-10 rating for a player, or null when no rating exists for the requested mode/season.
  get(playerName: string): number | null;
}

async function loadRatingLookup(opts: ScoutOptions): Promise<RatingLookup> {
  const db = getDB();
  const evalYear = new Date().getFullYear();
  const map = new Map<string, number>();

  if (opts.mode === 'season' && opts.season) {
    const rows = await db
      .select({
        playerName: playerPerformanceRatings.playerName,
        rating: playerPerformanceRatings.rating,
      })
      .from(playerPerformanceRatings)
      .where(
        and(
          eq(playerPerformanceRatings.isCareerRating, false),
          eq(playerPerformanceRatings.evaluationYear, opts.season),
        ),
      );
    for (const r of rows) {
      map.set(LLLRatingEngine.normalizeName(r.playerName), r.rating);
    }
  } else {
    // Career mode: per Tim's methodology, use Option B = best-4-of-6 of the
    // per-season ratings. This rewards peak performance and isn't dragged
    // down by injury years (Bosa, Aiyuk, Deebo all moved up correctly when
    // we A/B'd this against the cumulative-wav shortcut).
    //
    // Players with no per-season ratings (mostly OL — nflverse doesn't ship
    // their stats) fall back to the cumulative-wav baseline so they aren't
    // unfairly excluded.
    const [seasonRows, careerRows] = await Promise.all([
      db
        .select({
          playerName: playerPerformanceRatings.playerName,
          rating: playerPerformanceRatings.rating,
        })
        .from(playerPerformanceRatings)
        .where(eq(playerPerformanceRatings.isCareerRating, false)),
      db
        .select({
          playerName: playerPerformanceRatings.playerName,
          draftYear: playerPerformanceRatings.draftYear,
          metadata: playerPerformanceRatings.metadata,
        })
        .from(playerPerformanceRatings)
        .where(eq(playerPerformanceRatings.isCareerRating, true)),
    ]);

    // Group season ratings by player.
    const seasonsByName = new Map<string, number[]>();
    for (const r of seasonRows) {
      const key = LLLRatingEngine.normalizeName(r.playerName);
      const list = seasonsByName.get(key) ?? [];
      list.push(r.rating);
      seasonsByName.set(key, list);
    }

    // Best-4-of-6 from per-season ratings where available.
    for (const [key, ratings] of seasonsByName) {
      const sorted = [...ratings].sort((a, b) => b - a);
      const top4 = sorted.slice(0, 4);
      const avg = top4.reduce((s, r) => s + r, 0) / top4.length;
      map.set(key, Number(avg.toFixed(2)));
    }

    // Fallback for players with no season data: cumulative-wav baseline.
    for (const r of careerRows) {
      const key = LLLRatingEngine.normalizeName(r.playerName);
      if (map.has(key)) {
        continue;
      }
      const wav = (r.metadata as {wav?: number} | null)?.wav ?? 0;
      const ysd = Math.max(1, evalYear - r.draftYear);
      map.set(key, LLLRatingEngine.normalizeWavToRating(wav, ysd));
    }
  }

  return {
    get(playerName: string) {
      const v = map.get(LLLRatingEngine.normalizeName(playerName));
      return v === undefined ? null : v;
    },
  };
}

export interface ScoredPick {
  name: string;
  team: string;
  teamKey: string;
  round: number;
  pickNumber: number | null;
  year: number;
  position: string | null;
  rating: number;
  expected: number;
  delta: number;
  outcome: string;
}

export interface TeamSuccessRow {
  teamKey: string;
  team: string;
  totalPicks: number;
  hits: number;
  busts: number;
  hitRate: number;
  avgDelta: number;
  value: number;
  grade: string;
  topPick?: {name: string; rating: number; delta: number; round: number; year: number};
  worstPick?: {name: string; rating: number; delta: number; round: number; year: number};
}

export type PickOutcome = 'ELITE HIT' | 'HIT' | 'MET EXPECTATION' | 'UNDERPERFORMED' | 'BUST' | 'PENDING';

export interface BreakdownPick {
  name: string;
  round: number;
  pickNumber: number;
  position: string | null;
  outcome: PickOutcome;
}

export interface BreakdownYear {
  year: number;
  color: 'green' | 'orange' | 'red' | 'gray';
  hits: number;
  busts: number;
  pendingCount: number;
  picks: BreakdownPick[];
  headline: string;
}

export interface TeamBreakdown {
  teamKey: string;
  team: string;
  grade: string;
  rank: number;
  totalTeams: number;
  totalPicks: number;
  hits: number;
  busts: number;
  topPick?: {name: string; round: number; year: number; outcome: PickOutcome};
  worstPick?: {name: string; round: number; year: number; outcome: PickOutcome};
  windowStart: number;
  windowEnd: number;
  years: BreakdownYear[];
}

function colorForYear(picks: BreakdownPick[]): BreakdownYear['color'] {
  const rated = picks.filter((p) => p.outcome !== 'PENDING');
  if (rated.length === 0) {
    return 'gray';
  }
  const hits = rated.filter((p) => p.outcome === 'ELITE HIT' || p.outcome === 'HIT').length;
  const busts = rated.filter((p) => p.outcome === 'BUST').length;
  if (hits >= 1 && busts <= hits) {
    return 'green';
  }
  if (busts >= 2 && hits === 0) {
    return 'red';
  }
  return 'orange';
}

function headlineForYear(picks: BreakdownPick[]): string {
  const elite = picks.find((p) => p.outcome === 'ELITE HIT');
  if (elite) {
    return `${elite.name} broke the class open.`;
  }
  const hit = picks.find((p) => p.outcome === 'HIT');
  if (hit) {
    return `${hit.name} carried the year.`;
  }
  const premiumBust = picks.find((p) => p.outcome === 'BUST' && p.round <= 2);
  if (premiumBust) {
    return `${premiumBust.name} (R${premiumBust.round}) burned premium capital.`;
  }
  const anyBust = picks.find((p) => p.outcome === 'BUST');
  if (anyBust) {
    return `Late-round swings missed.`;
  }
  const met = picks.filter((p) => p.outcome === 'MET EXPECTATION').length;
  if (met >= 2) {
    return `Class hit its number, no upside.`;
  }
  if (picks.every((p) => p.outcome === 'PENDING')) {
    return `Class still developing.`;
  }
  return `Quiet class — no breakouts.`;
}

export class TeamScoutService {
  /**
   * Aggregate every team's draft picks across a fair window and grade them
   * against per-round expected value. Letter grade is rank-relative across
   * the league; underlying avg delta is preserved for transparency.
   */
  static async getTeamSuccessLeaderboard(opts: ScoutOptions = {}): Promise<TeamSuccessRow[]> {
    const window = opts.window ?? DEFAULT_WINDOW;
    const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
    const startYear = endYear - window + 1;
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const db = getDB();
    const picks = await db
      .select({
        year: officialDraftResults.year,
        teamName: officialDraftResults.teamName,
        round: officialDraftResults.round,
        playerName: officialDraftResults.playerName,
        contractOutcome: officialDraftResults.contractOutcome,
      })
      .from(officialDraftResults)
      .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear)));

    const lookup = await loadRatingLookup(opts);

    const teamAgg: Record<
      string,
      {
        city: string;
        name: string;
        totalPicks: number;
        hits: number;
        busts: number;
        deltaSum: number;
        bestDelta: number;
        bestPick?: TeamSuccessRow['topPick'];
        worstDelta: number;
        worstPick?: TeamSuccessRow['worstPick'];
      }
    > = {};

    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team) {
        continue;
      }
      if (!p.round || !p.playerName) {
        continue;
      }

      const rating = lookup.get(p.playerName);
      if (rating === null) {
        continue;
      }

      const perf = LLLRatingEngine.calculateFinalPerformanceScore(
        [rating],
        useContractBonus ? p.contractOutcome || undefined : undefined,
      );
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
      const normalizedRating = rating;

      const key = team.abbr;
      if (!teamAgg[key]) {
        teamAgg[key] = {
          city: team.city,
          name: team.name,
          totalPicks: 0,
          hits: 0,
          busts: 0,
          deltaSum: 0,
          bestDelta: -Infinity,
          worstDelta: Infinity,
        };
      }
      const agg = teamAgg[key];
      agg.totalPicks++;
      agg.deltaSum += delta;
      if (delta > 0.5) {
        agg.hits++;
      }
      if (delta < -1.0) {
        agg.busts++;
      }

      if (delta > agg.bestDelta) {
        agg.bestDelta = delta;
        agg.bestPick = {name: p.playerName, rating: normalizedRating, delta, round: p.round, year: p.year};
      }
      if (delta < agg.worstDelta) {
        agg.worstDelta = delta;
        agg.worstPick = {name: p.playerName, rating: normalizedRating, delta, round: p.round, year: p.year};
      }
    }

    const interim = Object.entries(teamAgg).map(([abbr, a]) => {
      const avgDelta = Number((a.deltaSum / a.totalPicks).toFixed(2));
      const hitRate = Math.round((a.hits / a.totalPicks) * 100);
      return {abbr, a, avgDelta, hitRate};
    });

    interim.sort((x, y) => y.avgDelta - x.avgDelta);

    const deltas = interim.map((i) => i.avgDelta);
    const maxD = Math.max(...deltas);
    const minD = Math.min(...deltas);
    const span = Math.max(0.01, maxD - minD);

    return interim.map((i, idx) => ({
      teamKey: i.abbr,
      team: `${i.a.city} ${i.a.name}`,
      totalPicks: i.a.totalPicks,
      hits: i.a.hits,
      busts: i.a.busts,
      hitRate: i.hitRate,
      avgDelta: i.avgDelta,
      value: Math.round(((i.avgDelta - minD) / span) * 100),
      grade: LLLRatingEngine.rankToLetterGrade(idx + 1, interim.length),
      topPick: i.a.bestPick,
      worstPick: i.a.worstPick,
    }));
  }

  /**
   * Score every pick in the requested window/mode and return the full list,
   * sorted desc by delta. Used by both `getTopMovers` (slice) and the
   * /analyzer/players grid (paginate + sort).
   */
  static async getAllScoredPicks(opts: ScoutOptions & {draftYear?: number} = {}): Promise<ScoredPick[]> {
    const window = opts.window ?? DEFAULT_WINDOW;
    const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const startYear = opts.draftYear ?? endYear - window + 1;
    const stopYear = opts.draftYear ?? endYear;

    const db = getDB();
    const picks = await db
      .select()
      .from(officialDraftResults)
      .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, stopYear)));

    const lookup = await loadRatingLookup(opts);

    const scored: ScoredPick[] = [];
    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }
      const rating = lookup.get(p.playerName);
      if (rating === null) {
        continue;
      }
      if (opts.mode === 'season' && opts.season && p.year > opts.season) {
        continue;
      }

      const perf = LLLRatingEngine.calculateFinalPerformanceScore(
        [rating],
        useContractBonus ? p.contractOutcome || undefined : undefined,
      );
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
      const outcome = LLLRatingEngine.getGradeOutcomeLabel(delta);

      scored.push({
        name: p.playerName,
        team: `${team.city} ${team.name}`,
        teamKey: team.abbr,
        round: p.round,
        pickNumber: p.pickNumber,
        year: p.year,
        position: p.position,
        rating,
        expected: EXPECTED_VALUE_BY_ROUND[p.round] ?? 0,
        delta,
        outcome,
      });
    }

    scored.sort((a, b) => b.delta - a.delta);
    return scored;
  }

  /**
   * Top hits & busts across the league. In `career` mode picks are graded
   * against their cumulative LLL rating; in `season` mode the single-NFL-season
   * rating is used (so 2024-only breakouts can rise to the top).
   */
  static async getTopMovers(opts: ScoutOptions & {draftYear?: number; limit?: number} = {}) {
    const limit = opts.limit ?? 10;
    const scored = await TeamScoutService.getAllScoredPicks(opts);
    return {
      topHits: scored.slice(0, limit),
      topBusts: scored.slice(-limit).reverse(),
      totalScored: scored.length,
    };
  }

  /**
   * Per-team explainer used by the dashboard modal.
   * Picks are tagged with qualitative outcome labels only — never exposes
   * the raw 0–10 rating or numeric delta to the client.
   */
  static async getTeamBreakdown(teamKey: string, opts: ScoutOptions = {}): Promise<TeamBreakdown | null> {
    const window = opts.window ?? DEFAULT_WINDOW;
    const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const leaderboard = await TeamScoutService.getTeamSuccessLeaderboard(opts);
    const targetKey = teamKey.toUpperCase();
    const idx = leaderboard.findIndex((t) => t.teamKey === targetKey);
    if (idx === -1) {
      return null;
    }
    const row = leaderboard[idx];

    const db = getDB();
    const startYear = endYear - window + 1;

    const lookup = await loadRatingLookup(opts);

    const myPicks = (
      await db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear)))
    ).filter((p) => canonicalTeam(p.teamName)?.abbr === targetKey);

    const yearMap = new Map<number, BreakdownPick[]>();
    let topPick: TeamBreakdown['topPick'];
    let worstPick: TeamBreakdown['worstPick'];
    let bestDelta = -Infinity;
    let worstDelta = Infinity;

    for (const p of myPicks) {
      if (!p.round || !p.playerName || !p.pickNumber) {
        continue;
      }

      const rating = lookup.get(p.playerName);
      // In season mode, picks drafted after the requested season can't have played yet.
      const futurePick = opts.mode === 'season' && opts.season !== undefined && p.year > opts.season;

      let outcome: PickOutcome = 'PENDING';
      let delta: number | null = null;
      if (rating !== null && !futurePick) {
        const perf = LLLRatingEngine.calculateFinalPerformanceScore(
          [rating],
          useContractBonus ? p.contractOutcome || undefined : undefined,
        );
        delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
        outcome = LLLRatingEngine.getGradeOutcomeLabel(delta) as PickOutcome;
      }

      const breakdown: BreakdownPick = {
        name: p.playerName,
        round: p.round,
        pickNumber: p.pickNumber,
        position: p.position,
        outcome,
      };

      if (delta !== null && delta > bestDelta) {
        bestDelta = delta;
        topPick = {name: p.playerName, round: p.round, year: p.year, outcome};
      }
      if (delta !== null && delta < worstDelta) {
        worstDelta = delta;
        worstPick = {name: p.playerName, round: p.round, year: p.year, outcome};
      }

      const arr = yearMap.get(p.year) ?? [];
      arr.push(breakdown);
      yearMap.set(p.year, arr);
    }

    const years: BreakdownYear[] = [...yearMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, picks]) => {
        picks.sort((a, b) => a.pickNumber - b.pickNumber);
        const rated = picks.filter((p) => p.outcome !== 'PENDING');
        const hits = rated.filter((p) => p.outcome === 'ELITE HIT' || p.outcome === 'HIT').length;
        const busts = rated.filter((p) => p.outcome === 'BUST').length;
        return {
          year,
          color: colorForYear(picks),
          hits,
          busts,
          pendingCount: picks.length - rated.length,
          picks,
          headline: headlineForYear(picks),
        };
      });

    return {
      teamKey: row.teamKey,
      team: row.team,
      grade: row.grade,
      rank: idx + 1,
      totalTeams: leaderboard.length,
      totalPicks: row.totalPicks,
      hits: row.hits,
      busts: row.busts,
      topPick,
      worstPick,
      windowStart: startYear,
      windowEnd: endYear,
      years,
    };
  }
}

export const TEAM_WINDOW_DEFAULT = DEFAULT_WINDOW;
export const TEAM_WINDOW_END_DEFAULT = LATEST_FAIR_DRAFT_YEAR;
