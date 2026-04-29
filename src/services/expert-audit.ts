import {getDB} from '../db/index.js';
import {experts, expertRankings, officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq} from 'drizzle-orm';
import {LLLRatingEngine} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;

export interface ExpertOracleRow {
  expertSlug: string;
  expertName: string;
  org: string | null;
  rmse: number; // mock accuracy
  sampleSize: number;
  yearsCovered: number[];
}

export interface ExpertScoutRow {
  expertSlug: string;
  expertName: string;
  org: string | null;
  talentDelta: number; // RMSE between rank-implied rating & actual career rating
  sampleSize: number;
  yearsCovered: number[];
  letter: string; // Letter grade from talentDelta thresholds
}

export class ExpertAuditService {
  /**
   * Oracle Leaderboard — Mock Draft Accuracy.
   * For each expert, compute RMSE(predicted big-board rank, actual draft pick number).
   * Joined on normalized player name to handle "C.J." vs "CJ" and similar.
   * Constrained to draft years <= LATEST_FAIR_DRAFT_YEAR so we exclude unfinished classes.
   */
  static async getOracleLeaderboard(): Promise<ExpertOracleRow[]> {
    const db = getDB();

    const allExperts = await db.select().from(experts);
    const allRankings = await db.select().from(expertRankings);
    const allResults = await db.select().from(officialDraftResults);

    // Build a (year, normalizedName) -> pickNumber index.
    const resultIndex = new Map<string, number>();
    for (const r of allResults) {
      if (r.year > LATEST_FAIR_DRAFT_YEAR) {
        continue;
      }
      if (!r.playerName || !r.pickNumber) {
        continue;
      }
      const k = `${r.year}::${LLLRatingEngine.normalizeName(r.playerName)}`;
      resultIndex.set(k, r.pickNumber);
    }

    const rows: ExpertOracleRow[] = [];
    for (const expert of allExperts) {
      const myRankings = allRankings.filter((rk) => rk.expertId === expert.id);
      const matched: {predicted: number; actual: number; year: number}[] = [];

      for (const rk of myRankings) {
        if (rk.year > LATEST_FAIR_DRAFT_YEAR) {
          continue;
        }
        if (!rk.rank) {
          continue;
        }
        const k = `${rk.year}::${LLLRatingEngine.normalizeName(rk.playerName)}`;
        const actual = resultIndex.get(k);
        if (actual === undefined) {
          continue;
        }
        matched.push({predicted: rk.rank, actual, year: rk.year});
      }

      if (matched.length === 0) {
        continue;
      }

      const rmse = LLLRatingEngine.calculateRMSE(matched);
      rows.push({
        expertSlug: expert.slug,
        expertName: expert.name,
        org: expert.organization,
        rmse: Number(rmse.toFixed(1)),
        sampleSize: matched.length,
        yearsCovered: [...new Set(matched.map((m) => m.year))].sort(),
      });
    }

    return rows.sort((a, b) => a.rmse - b.rmse);
  }

  /**
   * Scout Leaderboard — Talent Delta.
   * For each expert, compare the LLL career rating implied by their big-board rank
   * to the player's actual normalized career rating. RMSE — lower is better.
   * Only counts players from <= LATEST_FAIR_DRAFT_YEAR with at least 2 NFL seasons.
   */
  static async getScoutLeaderboard(): Promise<ExpertScoutRow[]> {
    const db = getDB();
    const evalYear = new Date().getFullYear();

    const allExperts = await db.select().from(experts);
    const allRankings = await db.select().from(expertRankings);
    const allRatings = await db
      .select()
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));

    // (normalizedName) -> career rating record.
    const ratingByName = new Map<string, (typeof allRatings)[number]>();
    for (const r of allRatings) {
      ratingByName.set(LLLRatingEngine.normalizeName(r.playerName), r);
    }

    const rows: ExpertScoutRow[] = [];
    for (const expert of allExperts) {
      const mine = allRankings.filter((rk) => rk.expertId === expert.id);
      const pairs: {expectedRating: number; actualRating: number; year: number}[] = [];

      for (const rk of mine) {
        if (rk.year > LATEST_FAIR_DRAFT_YEAR) {
          continue;
        }
        if (!rk.rank) {
          continue;
        }
        const rating = ratingByName.get(LLLRatingEngine.normalizeName(rk.playerName));
        if (!rating) {
          continue;
        }
        const yearsSinceDraft = Math.max(1, evalYear - rating.draftYear);
        if (yearsSinceDraft < 2) {
          continue;
        }

        const wav = (rating.metadata as {wav?: number} | null)?.wav ?? 0;
        const actualRating = LLLRatingEngine.normalizeWavToRating(wav, yearsSinceDraft);
        const expectedRating = LLLRatingEngine.rankToExpectedRating(rk.rank);

        pairs.push({expectedRating, actualRating, year: rk.year});
      }

      if (pairs.length === 0) {
        continue;
      }

      const talentDelta = LLLRatingEngine.calculateTalentDelta(pairs);
      rows.push({
        expertSlug: expert.slug,
        expertName: expert.name,
        org: expert.organization,
        talentDelta,
        sampleSize: pairs.length,
        yearsCovered: [...new Set(pairs.map((p) => p.year))].sort(),
        letter: scoutDeltaToLetter(talentDelta),
      });
    }

    return rows.sort((a, b) => a.talentDelta - b.talentDelta);
  }
}

function scoutDeltaToLetter(delta: number): string {
  if (delta <= 2.0) {
    return 'A+';
  }
  if (delta <= 2.5) {
    return 'A';
  }
  if (delta <= 3.0) {
    return 'A-';
  }
  if (delta <= 3.5) {
    return 'B+';
  }
  if (delta <= 4.0) {
    return 'B';
  }
  if (delta <= 4.5) {
    return 'B-';
  }
  if (delta <= 5.0) {
    return 'C+';
  }
  if (delta <= 5.5) {
    return 'C';
  }
  return 'D';
}
