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

export interface ExpertCallRow {
  playerName: string;
  year: number;
  predictedRank: number;
  actualPick: number | null;
  actualRating: number;
  expectedRating: number;
  rankAccuracy: number; // |predicted - actual pick|; -1 if no actual pick available
  talentDelta: number; // expectedRating - actualRating
  outcome: 'NAILED IT' | 'CLOSE' | 'OFF' | 'WAY OFF';
  flavor: string;
}

export interface ExpertYearGroup {
  year: number;
  rmse: number;
  talentDelta: number;
  sample: number;
  bestCall?: ExpertCallRow;
  worstCall?: ExpertCallRow;
}

export interface ExpertProfile {
  slug: string;
  name: string;
  org: string | null;
  oracleRank: number | null;
  oracleTotal: number;
  scoutRank: number | null;
  scoutTotal: number;
  rmse: number;
  talentDelta: number;
  letter: string;
  sampleSize: number;
  yearsCovered: number[];
  bestCalls: ExpertCallRow[];
  worstMisses: ExpertCallRow[];
  byYear: ExpertYearGroup[];
}

function classifyCall(
  rankAccuracy: number,
  talentDelta: number,
): {
  outcome: ExpertCallRow['outcome'];
  flavor: string;
} {
  const rankClose = rankAccuracy >= 0 && rankAccuracy <= 8;
  const talentClose = Math.abs(talentDelta) <= 1.5;
  if (rankClose && talentClose) {
    return {outcome: 'NAILED IT', flavor: 'Right player. League agreed. Talent matched.'};
  }
  if (talentClose && !rankClose) {
    return {outcome: 'CLOSE', flavor: 'Saw the talent; got the slot wrong.'};
  }
  if (rankClose && !talentClose) {
    return {
      outcome: 'CLOSE',
      flavor: talentDelta > 0 ? 'Right slot; player did not hit.' : 'Right slot; player exceeded the rank.',
    };
  }
  if (Math.abs(talentDelta) > 3) {
    return {
      outcome: 'WAY OFF',
      flavor:
        talentDelta > 0
          ? 'Overhyped \u2014 talent did not match the ranking.'
          : 'Buried him \u2014 player turned into a real hit.',
    };
  }
  return {outcome: 'OFF', flavor: 'Misread the talent.'};
}

export async function getExpertProfile(slug: string): Promise<ExpertProfile | null> {
  const db = getDB();
  const evalYear = new Date().getFullYear();

  const expert = (await db.select().from(experts).where(eq(experts.slug, slug)).limit(1))[0];
  if (!expert) {
    return null;
  }

  const myRankings = await db.select().from(expertRankings).where(eq(expertRankings.expertId, expert.id));
  const allResults = await db.select().from(officialDraftResults);
  const allRatings = await db
    .select()
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, true));

  const resultIndex = new Map<string, {pickNumber: number}>();
  for (const r of allResults) {
    if (r.year > LATEST_FAIR_DRAFT_YEAR) {
      continue;
    }
    if (!r.playerName || !r.pickNumber) {
      continue;
    }
    resultIndex.set(`${r.year}::${LLLRatingEngine.normalizeName(r.playerName)}`, {pickNumber: r.pickNumber});
  }

  const ratingByName = new Map<string, (typeof allRatings)[number]>();
  for (const r of allRatings) {
    ratingByName.set(LLLRatingEngine.normalizeName(r.playerName), r);
  }

  const calls: ExpertCallRow[] = [];
  for (const rk of myRankings) {
    if (rk.year > LATEST_FAIR_DRAFT_YEAR) {
      continue;
    }
    if (!rk.rank) {
      continue;
    }
    const norm = LLLRatingEngine.normalizeName(rk.playerName);
    const rating = ratingByName.get(norm);
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
    const actualPick = resultIndex.get(`${rk.year}::${norm}`)?.pickNumber ?? null;
    const rankAccuracy = actualPick !== null ? Math.abs(rk.rank - actualPick) : -1;
    const talentDelta = expectedRating - actualRating;
    const {outcome, flavor} = classifyCall(rankAccuracy, talentDelta);

    calls.push({
      playerName: rk.playerName,
      year: rk.year,
      predictedRank: rk.rank,
      actualPick,
      actualRating,
      expectedRating,
      rankAccuracy,
      talentDelta,
      outcome,
      flavor,
    });
  }

  if (calls.length === 0) {
    return null;
  }

  const score = (c: ExpertCallRow) => Math.abs(c.talentDelta) * 1.5 + (c.rankAccuracy >= 0 ? c.rankAccuracy * 0.05 : 1);
  const bestCalls = [...calls].sort((a, b) => score(a) - score(b)).slice(0, 5);
  const worstMisses = [...calls].sort((a, b) => Math.abs(b.talentDelta) - Math.abs(a.talentDelta)).slice(0, 5);

  const yearMap = new Map<number, ExpertCallRow[]>();
  for (const c of calls) {
    const arr = yearMap.get(c.year) ?? [];
    arr.push(c);
    yearMap.set(c.year, arr);
  }
  const byYear: ExpertYearGroup[] = [...yearMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => {
      const rmsePairs = list.filter((c) => c.actualPick !== null);
      const rmse = LLLRatingEngine.calculateRMSE(
        rmsePairs.map((c) => ({predicted: c.predictedRank, actual: c.actualPick as number})),
      );
      const talentDelta = LLLRatingEngine.calculateTalentDelta(
        list.map((c) => ({expectedRating: c.expectedRating, actualRating: c.actualRating})),
      );
      return {
        year,
        rmse: Number(rmse.toFixed(1)),
        talentDelta,
        sample: list.length,
        bestCall: [...list].sort((a, b) => score(a) - score(b))[0],
        worstCall: [...list].sort((a, b) => Math.abs(b.talentDelta) - Math.abs(a.talentDelta))[0],
      };
    });

  const [oracle, scoutLb] = await Promise.all([
    ExpertAuditService.getOracleLeaderboard(),
    ExpertAuditService.getScoutLeaderboard(),
  ]);
  const oracleIdx = oracle.findIndex((o) => o.expertSlug === slug);
  const scoutIdx = scoutLb.findIndex((s) => s.expertSlug === slug);

  return {
    slug: expert.slug,
    name: expert.name,
    org: expert.organization,
    oracleRank: oracleIdx >= 0 ? oracleIdx + 1 : null,
    oracleTotal: oracle.length,
    scoutRank: scoutIdx >= 0 ? scoutIdx + 1 : null,
    scoutTotal: scoutLb.length,
    rmse: oracleIdx >= 0 ? oracle[oracleIdx].rmse : 0,
    talentDelta: scoutIdx >= 0 ? scoutLb[scoutIdx].talentDelta : 0,
    letter: scoutIdx >= 0 ? scoutLb[scoutIdx].letter : '\u2014',
    sampleSize: calls.length,
    yearsCovered: [...new Set(calls.map((c) => c.year))].sort(),
    bestCalls,
    worstMisses,
    byYear,
  };
}
