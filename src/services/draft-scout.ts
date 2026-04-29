import {getDB} from '../db/index.js';
import {expertRankings, playerPerformanceRatings, experts, officialDraftResults} from '../db/schema.js';
import {eq, and, sql, inArray} from 'drizzle-orm';
import {LLLRatingEngine, EXPECTED_VALUE_BY_ROUND, canonicalTeam} from './lll-rating-engine.js';

export interface SeasonRow {
  season: number;
  rating: number;
  prodScore?: number;
  games?: number;
  side?: string;
  position?: string;
  stats?: Record<string, number>;
}

/**
 * Multiple methods of converting a player's career into a single 0-10 LLL
 * rating. Surfaces them all so admins can compare the algorithm's choices
 * against what looks right by eye.
 */
export interface AltRatingResults {
  careerCumulative: {rating: number; formula: string};
  best4of6: {rating: number; formula: string; usedSeasons: number[]};
  peakSeason: {rating: number; year?: number};
  recentAvg: {rating: number; window: string};
}

export interface PlayerProfileData {
  playerName: string;
  position: string | null;
  team: string | null;
  teamKey: string | null;
  draftYear: number | null;
  round: number | null;
  pickNumber: number | null;
  contractOutcome: string | null;
  cumulativeWav: number | null;
  yearsSinceDraft: number | null;
  expectedForRound: number;
  // Algorithmic outputs
  careerRating: number;
  finalGrade: number;
  outcome: string;
  altRatings: AltRatingResults;
  // Raw histories
  seasonHistory: SeasonRow[];
  careerHistory: SeasonRow[];
  // Expert calls
  expertRankings: Array<{
    expertName: string;
    expertOrg: string | null;
    year: number;
    rank: number | null;
    grade: string | null;
    commentary: string | null;
  }>;
  accuracySummary: Array<{
    expert: string;
    predictedRank: number | null;
    impliedRating: number | null;
    actualSuccess: string;
    isAccurate: boolean;
  }>;
}

export class DraftScoutService {
  /**
   * Comprehensive profile for a single player. Returns career + per-season
   * ratings, raw stat metadata, expert rankings, and several alternative
   * rating computations so admins can see which method best matches reality.
   */
  static async getPlayerCareerProfile(playerName: string): Promise<PlayerProfileData> {
    const db = getDB();
    const evalYear = new Date().getFullYear();

    const [allRatings, rankings, officialPickRow] = await Promise.all([
      db
        .select()
        .from(playerPerformanceRatings)
        .where(eq(playerPerformanceRatings.playerName, playerName))
        .orderBy(playerPerformanceRatings.evaluationYear),
      db
        .select({
          expertName: experts.name,
          expertOrg: experts.organization,
          year: expertRankings.year,
          rank: expertRankings.rank,
          grade: expertRankings.grade,
          commentary: expertRankings.commentary,
        })
        .from(expertRankings)
        .innerJoin(experts, eq(expertRankings.expertId, experts.id))
        .where(eq(expertRankings.playerName, playerName)),
      db.select().from(officialDraftResults).where(eq(officialDraftResults.playerName, playerName)).limit(1),
    ]);

    const officialPick = officialPickRow[0];
    const round = officialPick?.round ?? null;
    const draftYear = officialPick?.year ?? null;
    const yearsSinceDraft = draftYear !== null ? Math.max(1, evalYear - draftYear) : null;
    const team = canonicalTeam(officialPick?.teamName);

    const careerRow = allRatings.find((r) => r.isCareerRating);
    const seasonRows = allRatings.filter((r) => !r.isCareerRating).sort((a, b) => a.evaluationYear - b.evaluationYear);

    const cumulativeWav =
      careerRow && careerRow.metadata && typeof (careerRow.metadata as {wav?: number}).wav === 'number'
        ? (careerRow.metadata as {wav: number}).wav
        : null;

    // Career rating (current production calculation): normalized per-season AV.
    const careerRating =
      cumulativeWav !== null && yearsSinceDraft !== null
        ? LLLRatingEngine.normalizeWavToRating(cumulativeWav, yearsSinceDraft)
        : (careerRow?.rating ?? 0);

    const seasonHistory: SeasonRow[] = seasonRows.map((r) => {
      const meta = (r.metadata as Record<string, unknown> | null) ?? {};
      return {
        season: r.evaluationYear,
        rating: r.rating,
        prodScore: typeof meta.prodScore === 'number' ? meta.prodScore : undefined,
        games: typeof meta.games === 'number' ? meta.games : undefined,
        side: typeof meta.side === 'string' ? meta.side : undefined,
        position: officialPick?.position ?? undefined,
        stats: meta.stats as Record<string, number> | undefined,
      };
    });

    // ── Alternative rating methods (for admin tuning) ──────────────────────────
    const best4of6 = (() => {
      if (seasonHistory.length === 0) {
        return {rating: 0, formula: 'no per-season data', usedSeasons: [] as number[]};
      }
      const last6 = seasonHistory.slice(-6);
      const sorted = [...last6].sort((a, b) => b.rating - a.rating);
      const top4 = sorted.slice(0, 4);
      const avg = top4.reduce((s, r) => s + r.rating, 0) / top4.length;
      return {
        rating: Number(avg.toFixed(2)),
        formula: `avg(${top4.map((r) => `${r.season}:${r.rating.toFixed(2)}`).join(', ')})`,
        usedSeasons: top4.map((r) => r.season).sort(),
      };
    })();

    const peakSeason = (() => {
      if (seasonHistory.length === 0) {
        return {rating: 0};
      }
      const peak = [...seasonHistory].sort((a, b) => b.rating - a.rating)[0];
      return {rating: peak.rating, year: peak.season};
    })();

    const recentAvg = (() => {
      if (seasonHistory.length === 0) {
        return {rating: 0, window: 'no per-season data'};
      }
      const last3 = seasonHistory.slice(-3);
      const avg = last3.reduce((s, r) => s + r.rating, 0) / last3.length;
      return {rating: Number(avg.toFixed(2)), window: `${last3[0].season}–${last3[last3.length - 1].season}`};
    })();

    const altRatings: AltRatingResults = {
      careerCumulative: {
        rating: careerRating,
        formula:
          cumulativeWav !== null && yearsSinceDraft !== null
            ? `(${cumulativeWav} w_av / ${yearsSinceDraft} years) × 0.667 = ${careerRating.toFixed(2)}`
            : 'no career w_av',
      },
      best4of6,
      peakSeason,
      recentAvg,
    };

    // Final grade + delta against round expectation (using current career method).
    const performanceScore = LLLRatingEngine.calculateFinalPerformanceScore(
      [careerRating],
      officialPick?.contractOutcome || undefined,
    );
    const expectedForRound = round ? (EXPECTED_VALUE_BY_ROUND[round] ?? 0) : 0;
    const finalGrade = LLLRatingEngine.calculateFinalGrade(performanceScore, round ?? 1);
    const outcome = LLLRatingEngine.getGradeOutcomeLabel(finalGrade);

    const accuracySummary = rankings.map((r) => {
      const implied = r.rank ? LLLRatingEngine.rankToExpectedRating(r.rank) : null;
      const closeEnough = implied !== null && Math.abs(implied - careerRating) < 1.5;
      return {
        expert: r.expertName,
        predictedRank: r.rank,
        impliedRating: implied,
        actualSuccess: LLLRatingEngine.getRatingLabel(careerRating),
        isAccurate: closeEnough,
      };
    });

    return {
      playerName,
      position: officialPick?.position ?? null,
      team: team ? `${team.city} ${team.name}` : (officialPick?.teamName ?? null),
      teamKey: team?.abbr ?? null,
      draftYear,
      round,
      pickNumber: officialPick?.pickNumber ?? null,
      contractOutcome: officialPick?.contractOutcome ?? null,
      cumulativeWav,
      yearsSinceDraft,
      expectedForRound,
      careerRating,
      finalGrade,
      outcome,
      altRatings,
      seasonHistory,
      careerHistory: careerRow
        ? [
            {
              season: careerRow.evaluationYear,
              rating: careerRow.rating,
              ...(careerRow.metadata as Record<string, unknown>),
            } as SeasonRow,
          ]
        : [],
      expertRankings: rankings,
      accuracySummary,
    };
  }

  /**
   * Batch-fetch per-season ratings for a set of players, keyed by normalized name.
   * Used by the team breakdown modal so admins can expand each pick inline.
   */
  static async getSeasonHistoriesForPlayers(playerNames: string[]): Promise<Map<string, SeasonRow[]>> {
    const result = new Map<string, SeasonRow[]>();
    if (playerNames.length === 0) {
      return result;
    }
    const db = getDB();
    const rows = await db
      .select()
      .from(playerPerformanceRatings)
      .where(
        and(
          eq(playerPerformanceRatings.isCareerRating, false),
          inArray(playerPerformanceRatings.playerName, playerNames),
        ),
      );
    for (const r of rows) {
      const key = LLLRatingEngine.normalizeName(r.playerName);
      let arr = result.get(key);
      if (!arr) {
        arr = [];
        result.set(key, arr);
      }
      const meta = (r.metadata as Record<string, unknown> | null) ?? {};
      arr.push({
        season: r.evaluationYear,
        rating: r.rating,
        prodScore: typeof meta.prodScore === 'number' ? meta.prodScore : undefined,
        games: typeof meta.games === 'number' ? meta.games : undefined,
        side: typeof meta.side === 'string' ? meta.side : undefined,
        stats: meta.stats as Record<string, number> | undefined,
      });
    }
    for (const arr of result.values()) {
      arr.sort((a, b) => a.season - b.season);
    }
    return result;
  }

  /**
   * Performs a global search across players, experts, and teams using ILIKE
   * (Standard Postgres fuzzy search).
   */
  static async search(query: string) {
    const db = getDB();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      return {players: [], experts: []};
    }

    const players = await db
      .select({
        name: officialDraftResults.playerName,
        year: officialDraftResults.year,
        team: officialDraftResults.teamName,
      })
      .from(officialDraftResults)
      .where(sql`player_name ILIKE ${'%' + cleanQuery + '%'}`)
      .limit(10);

    const expertMatches = await db
      .select({
        name: experts.name,
        slug: experts.slug,
        org: experts.organization,
      })
      .from(experts)
      .where(sql`name ILIKE ${'%' + cleanQuery + '%'}`)
      .limit(5);

    return {players, experts: expertMatches};
  }
}
