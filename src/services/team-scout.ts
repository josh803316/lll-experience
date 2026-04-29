import {getDB} from '../db/index.js';
import {officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, sql, gte, lte, and} from 'drizzle-orm';
import {LLLRatingEngine, canonicalTeam, EXPECTED_VALUE_BY_ROUND} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;
const DEFAULT_WINDOW = 6;

export interface TeamSuccessRow {
  teamKey: string; // canonical abbr (used for routing)
  team: string; // display name (city + nickname)
  totalPicks: number;
  hits: number;
  busts: number;
  hitRate: number; // 0–100, % of picks with delta > 0.5
  avgDelta: number; // raw avg LLL delta
  value: number; // 0–100 (avgDelta mapped onto a UI bar)
  grade: string; // A+–F
  topPick?: {name: string; rating: number; delta: number; round: number; year: number};
  worstPick?: {name: string; rating: number; delta: number; round: number; year: number};
}

export class TeamScoutService {
  /**
   * Aggregate every team's draft picks across a fair window and grade them
   * against per-round expected value.
   *
   *  - Window default: 6 years ending at LATEST_FAIR_DRAFT_YEAR (gives players
   *    at least ~3 NFL seasons before we evaluate).
   *  - Per-season-equivalent rating (cumulative w_av / years-since-draft).
   *  - Picks without a rating or team are excluded (no silent default-to-5).
   *  - Retired franchises (OAK, SDG, STL) merged into their successors.
   */
  static async getTeamSuccessLeaderboard(
    window: number = DEFAULT_WINDOW,
    endYear: number = LATEST_FAIR_DRAFT_YEAR,
  ): Promise<TeamSuccessRow[]> {
    const db = getDB();
    const startYear = endYear - window + 1;
    const evalYear = new Date().getFullYear();

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

    const ratings = await db
      .select({
        playerName: playerPerformanceRatings.playerName,
        draftYear: playerPerformanceRatings.draftYear,
        rating: playerPerformanceRatings.rating,
        metadata: playerPerformanceRatings.metadata,
      })
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));

    const ratingByName = new Map<string, (typeof ratings)[number]>();
    for (const r of ratings) {
      ratingByName.set(LLLRatingEngine.normalizeName(r.playerName), r);
    }

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

      const rating = ratingByName.get(LLLRatingEngine.normalizeName(p.playerName));
      if (!rating) {
        continue;
      }

      const wav = (rating.metadata as {wav?: number} | null)?.wav ?? 0;
      const yearsSinceDraft = Math.max(1, evalYear - rating.draftYear);
      const normalizedRating = LLLRatingEngine.normalizeWavToRating(wav, yearsSinceDraft);

      const performanceScore = LLLRatingEngine.calculateFinalPerformanceScore(
        [normalizedRating],
        p.contractOutcome || undefined,
      );
      const delta = LLLRatingEngine.calculateFinalGrade(performanceScore, p.round);

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
        agg.bestPick = {
          name: p.playerName,
          rating: normalizedRating,
          delta,
          round: p.round,
          year: p.year,
        };
      }
      if (delta < agg.worstDelta) {
        agg.worstDelta = delta;
        agg.worstPick = {
          name: p.playerName,
          rating: normalizedRating,
          delta,
          round: p.round,
          year: p.year,
        };
      }
    }

    const interim = Object.entries(teamAgg).map(([abbr, a]) => {
      const avgDelta = Number((a.deltaSum / a.totalPicks).toFixed(2));
      const hitRate = Math.round((a.hits / a.totalPicks) * 100);
      return {abbr, a, avgDelta, hitRate};
    });

    interim.sort((x, y) => y.avgDelta - x.avgDelta);

    // Bar runs from worst-team (0) → best-team (100) on the actual league spread.
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
   * Top movers across the league: highest-delta and lowest-delta picks
   * within the fair window. Powers the Dashboard "Index Movers" sidebar.
   */
  static async getTopMovers(window: number = DEFAULT_WINDOW, endYear: number = LATEST_FAIR_DRAFT_YEAR) {
    const db = getDB();
    const startYear = endYear - window + 1;
    const evalYear = new Date().getFullYear();

    const picks = await db
      .select()
      .from(officialDraftResults)
      .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear)));

    const ratings = await db
      .select()
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));
    const ratingByName = new Map<string, (typeof ratings)[number]>();
    for (const r of ratings) {
      ratingByName.set(LLLRatingEngine.normalizeName(r.playerName), r);
    }

    const scored: Array<{
      name: string;
      team: string;
      teamKey: string;
      round: number;
      year: number;
      rating: number;
      expected: number;
      delta: number;
    }> = [];

    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }
      const rating = ratingByName.get(LLLRatingEngine.normalizeName(p.playerName));
      if (!rating) {
        continue;
      }

      const wav = (rating.metadata as {wav?: number} | null)?.wav ?? 0;
      const yearsSinceDraft = Math.max(1, evalYear - rating.draftYear);
      const normalized = LLLRatingEngine.normalizeWavToRating(wav, yearsSinceDraft);
      const perf = LLLRatingEngine.calculateFinalPerformanceScore([normalized], p.contractOutcome || undefined);
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);

      scored.push({
        name: p.playerName,
        team: `${team.city} ${team.name}`,
        teamKey: team.abbr,
        round: p.round,
        year: p.year,
        rating: normalized,
        expected: EXPECTED_VALUE_BY_ROUND[p.round] ?? 0,
        delta,
      });
    }

    scored.sort((a, b) => b.delta - a.delta);
    const topHits = scored.slice(0, 5);
    const topBusts = scored.slice(-5).reverse();
    return {topHits, topBusts, totalScored: scored.length};
  }
}

export const TEAM_WINDOW_DEFAULT = DEFAULT_WINDOW;
export const TEAM_WINDOW_END_DEFAULT = LATEST_FAIR_DRAFT_YEAR;
