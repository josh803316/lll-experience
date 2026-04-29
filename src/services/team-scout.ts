import {getDB} from '../db/index.js';
import {officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, gte, lte, and} from 'drizzle-orm';
import {LLLRatingEngine, canonicalTeam, EXPECTED_VALUE_BY_ROUND} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;
const DEFAULT_WINDOW = 6;

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

interface RatingRow {
  playerName: string;
  draftYear: number;
  metadata: unknown;
}

function ratingsByName(rows: RatingRow[]): Map<string, RatingRow> {
  const m = new Map<string, RatingRow>();
  for (const r of rows) {
    m.set(LLLRatingEngine.normalizeName(r.playerName), r);
  }
  return m;
}

function deltaFor(
  pick: {round: number; playerName: string; contractOutcome: string | null},
  rating: RatingRow | undefined,
  evalYear: number,
): {delta: number; rating: number} | null {
  if (!rating) {
    return null;
  }
  const wav = (rating.metadata as {wav?: number} | null)?.wav ?? 0;
  const yearsSinceDraft = Math.max(1, evalYear - rating.draftYear);
  const normalized = LLLRatingEngine.normalizeWavToRating(wav, yearsSinceDraft);
  const perf = LLLRatingEngine.calculateFinalPerformanceScore([normalized], pick.contractOutcome || undefined);
  return {delta: LLLRatingEngine.calculateFinalGrade(perf, pick.round), rating: normalized};
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
        metadata: playerPerformanceRatings.metadata,
      })
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));
    const ratingByName = ratingsByName(ratings);

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

      const ratingRow = ratingByName.get(LLLRatingEngine.normalizeName(p.playerName));
      const computed = deltaFor(
        {round: p.round, playerName: p.playerName, contractOutcome: p.contractOutcome},
        ratingRow,
        evalYear,
      );
      if (!computed) {
        continue;
      }
      const {delta, rating: normalizedRating} = computed;

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
   * Top hits & busts across the league. Optionally narrowed to a specific
   * draft year; otherwise spans the full fair window.
   */
  static async getTopMovers(
    window: number = DEFAULT_WINDOW,
    endYear: number = LATEST_FAIR_DRAFT_YEAR,
    options: {draftYear?: number; limit?: number} = {},
  ) {
    const db = getDB();
    const evalYear = new Date().getFullYear();
    const limit = options.limit ?? 10;

    const startYear = options.draftYear ?? endYear - window + 1;
    const stopYear = options.draftYear ?? endYear;

    const picks = await db
      .select()
      .from(officialDraftResults)
      .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, stopYear)));

    const ratings = await db
      .select({
        playerName: playerPerformanceRatings.playerName,
        draftYear: playerPerformanceRatings.draftYear,
        metadata: playerPerformanceRatings.metadata,
      })
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));
    const ratingByName = ratingsByName(ratings);

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
      const ratingRow = ratingByName.get(LLLRatingEngine.normalizeName(p.playerName));
      const computed = deltaFor(
        {round: p.round, playerName: p.playerName, contractOutcome: p.contractOutcome},
        ratingRow,
        evalYear,
      );
      if (!computed) {
        continue;
      }
      scored.push({
        name: p.playerName,
        team: `${team.city} ${team.name}`,
        teamKey: team.abbr,
        round: p.round,
        year: p.year,
        rating: computed.rating,
        expected: EXPECTED_VALUE_BY_ROUND[p.round] ?? 0,
        delta: computed.delta,
      });
    }

    scored.sort((a, b) => b.delta - a.delta);
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
  static async getTeamBreakdown(
    teamKey: string,
    window: number = DEFAULT_WINDOW,
    endYear: number = LATEST_FAIR_DRAFT_YEAR,
  ): Promise<TeamBreakdown | null> {
    const leaderboard = await TeamScoutService.getTeamSuccessLeaderboard(window, endYear);
    const targetKey = teamKey.toUpperCase();
    const idx = leaderboard.findIndex((t) => t.teamKey === targetKey);
    if (idx === -1) {
      return null;
    }
    const row = leaderboard[idx];

    const db = getDB();
    const startYear = endYear - window + 1;
    const evalYear = new Date().getFullYear();

    const ratings = await db
      .select({
        playerName: playerPerformanceRatings.playerName,
        draftYear: playerPerformanceRatings.draftYear,
        metadata: playerPerformanceRatings.metadata,
      })
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));
    const ratingByName = ratingsByName(ratings);

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

      const ratingRow = ratingByName.get(LLLRatingEngine.normalizeName(p.playerName));
      const computed = deltaFor(
        {round: p.round, playerName: p.playerName, contractOutcome: p.contractOutcome},
        ratingRow,
        evalYear,
      );

      const outcome: PickOutcome = computed
        ? (LLLRatingEngine.getGradeOutcomeLabel(computed.delta) as PickOutcome)
        : 'PENDING';

      const breakdown: BreakdownPick = {
        name: p.playerName,
        round: p.round,
        pickNumber: p.pickNumber,
        position: p.position,
        outcome,
      };

      if (computed && computed.delta > bestDelta) {
        bestDelta = computed.delta;
        topPick = {name: p.playerName, round: p.round, year: p.year, outcome};
      }
      if (computed && computed.delta < worstDelta) {
        worstDelta = computed.delta;
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
