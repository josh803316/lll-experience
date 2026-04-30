import {getDB} from '../db/index.js';
import {officialDraftResults} from '../db/schema.js';
import {gte, lte, and} from 'drizzle-orm';
import {
  LLLRatingEngine,
  canonicalTeam,
  EXPECTED_VALUE_BY_ROUND,
  CONTRACT_BONUSES,
  PlayerPerformanceRegistry,
} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;
const DEFAULT_WINDOW = 6;

export const TEAM_WINDOW_DEFAULT = DEFAULT_WINDOW;
export const TEAM_WINDOW_END_DEFAULT = LATEST_FAIR_DRAFT_YEAR;

export type ScoutMode = 'career' | 'season';

export interface ScoutOptions {
  mode?: ScoutMode;
  season?: number;
  window?: number;
  endYear?: number;
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
  contractOutcome: string | null;
  contractBonus: number;
  performanceScore: number;
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
  eliteCount: number;
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
  eliteCount: number;
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

/**
 * High-performance scouter for teams.
 */
export class TeamScoutService {
  /**
   * Aggregate every team's draft picks across a fair window and grade them
   * against per-round expected value.
   */
  static async getTeamSuccessLeaderboard(opts: ScoutOptions = {}): Promise<TeamSuccessRow[]> {
    const window = opts.window ?? DEFAULT_WINDOW;
    const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
    const startYear = endYear - window + 1;
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const db = getDB();

    // 1. Use centralized registry (eliminates redundant O(N) calculations)
    const [lookupMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select({
          playerName: officialDraftResults.playerName,
          teamName: officialDraftResults.teamName,
          round: officialDraftResults.round,
          contractOutcome: officialDraftResults.contractOutcome,
          year: officialDraftResults.year,
        })
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const teamAgg: Record<
      string,
      {
        city: string;
        name: string;
        totalPicks: number;
        hits: number;
        busts: number;
        eliteCount: number;
        deltaSum: number;
        bestDelta: number;
        bestPick?: TeamSuccessRow['topPick'];
        worstDelta: number;
        worstPick?: TeamSuccessRow['worstPick'];
      }
    > = {};

    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }

      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;
      if (rating === null) {
        continue;
      }

      const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
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
          eliteCount: 0,
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
      if (rating >= 8.0) {
        agg.eliteCount++;
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
      eliteCount: i.a.eliteCount,
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
    const [lookupMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, stopYear))),
    ]);

    const scored: ScoredPick[] = [];
    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }
      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;
      if (rating === null) {
        continue;
      }

      const contractBonus = useContractBonus && p.contractOutcome ? (CONTRACT_BONUSES[p.contractOutcome] ?? 0) : 0;
      const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
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
        contractOutcome: p.contractOutcome ?? null,
        contractBonus,
        performanceScore: perf,
        expected: EXPECTED_VALUE_BY_ROUND[p.round] ?? 0,
        delta,
        outcome,
      });
    }

    scored.sort((a, b) => b.delta - a.delta);
    return scored;
  }

  /**
   * Top hits & busts across the league.
   */
  static async getTopMovers(opts: ScoutOptions & {draftYear?: number; limit?: number} = {}) {
    const limit = opts.limit ?? 10;
    const scored = await TeamScoutService.getAllScoredPicks(opts);
    return {
      topHits: scored.slice(0, limit),
      topBusts: scored.slice(-limit).reverse(),
    };
  }

  /**
   * Per-team explainer used by the dashboard modal.
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

    const [lookupMap, allPicks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const myPicks = allPicks.filter((p) => canonicalTeam(p.teamName)?.abbr === targetKey);

    const yearMap = new Map<number, BreakdownPick[]>();
    let topPick: TeamBreakdown['topPick'];
    let worstPick: TeamBreakdown['worstPick'];
    let bestDelta = -Infinity;
    let worstDelta = Infinity;
    let eliteCount = 0;

    for (const p of myPicks) {
      if (!p.round || !p.playerName || !p.pickNumber) {
        continue;
      }

      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;
      const futurePick = opts.mode === 'season' && opts.season !== undefined && p.year > opts.season;

      let outcome: PickOutcome = 'PENDING';
      let delta: number | null = null;
      if (rating !== null && !futurePick) {
        const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
        delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
        outcome = LLLRatingEngine.getGradeOutcomeLabel(delta) as PickOutcome;

        if (rating >= 8.0) {
          eliteCount++;
        }
      }

      const breakdown: BreakdownPick = {
        name: p.playerName,
        round: p.round,
        pickNumber: p.pickNumber,
        position: p.position,
        outcome,
      };

      if (delta !== null) {
        if (delta > bestDelta) {
          bestDelta = delta;
          topPick = {name: p.playerName, round: p.round, year: p.year, outcome};
        }
        if (delta < worstDelta) {
          worstDelta = delta;
          worstPick = {name: p.playerName, round: p.round, year: p.year, outcome};
        }
      }

      const yearList = yearMap.get(p.year) ?? [];
      yearList.push(breakdown);
      yearMap.set(p.year, yearList);
    }

    const years: BreakdownYear[] = Array.from(yearMap.entries())
      .map(([year, picks]) => {
        const hits = picks.filter((p) => p.outcome === 'ELITE HIT' || p.outcome === 'HIT').length;
        const busts = picks.filter((p) => p.outcome === 'BUST').length;
        const pendingCount = picks.filter((p) => p.outcome === 'PENDING').length;
        return {
          year,
          color: colorForYear(picks),
          hits,
          busts,
          pendingCount,
          picks: picks.sort((a, b) => a.round - b.round),
          headline: headlineForYear(picks),
        };
      })
      .sort((a, b) => b.year - a.year);

    return {
      teamKey: row.teamKey,
      team: row.team,
      grade: row.grade,
      rank: idx + 1,
      totalTeams: leaderboard.length,
      totalPicks: row.totalPicks,
      hits: row.hits,
      busts: row.busts,
      eliteCount,
      topPick,
      worstPick,
      windowStart: startYear,
      windowEnd: endYear,
      years,
    };
  }
}
