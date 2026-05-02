import {getDB} from '../db/index.js';
import {experts, expertRankings, officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, lte} from 'drizzle-orm';
import type {ExpertPairwiseRow} from './expert-pairwise-rank.js';
import {LLLRatingEngine, PlayerPerformanceRegistry} from './lll-rating-engine.js';
import {ExpertPairwiseRankService} from './expert-pairwise-rank.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;

/** Mean of percentile ranks across Oracle / Scout / Pairwise boards (lower = better). */
export interface ExpertBlendRow {
  expertSlug: string;
  expertName: string;
  org: string | null;
  avgRank: number;
  nComponents: number;
  oracleRank: number | null;
  scoutRank: number | null;
  pairwiseRank: number | null;
  sampleSize: number;
}

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

export interface Take {
  expertSlug: string;
  expertName: string;
  org: string | null;
  playerName: string;
  year: number;
  predictedRank: number;
  consensusRank: number; // median rank across all experts who ranked this player
  rankerCount: number;
  consensusExpected: number; // rankToExpectedRating(consensusRank)
  actualCareerRating: number;
  careerDelta: number; // actual − consensusExpected
  contrarianScore: number; // signed: + = contrarian-and-right, − = contrarian-and-wrong
  flavor: 'unique-hit' | 'unique-fade' | 'oversold' | 'undersold';
  headline: string; // short human-readable summary
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
    const allRankings = await db.select().from(expertRankings).where(lte(expertRankings.year, LATEST_FAIR_DRAFT_YEAR));
    const allResults = await db
      .select()
      .from(officialDraftResults)
      .where(lte(officialDraftResults.year, LATEST_FAIR_DRAFT_YEAR));

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

    const ranked: ExpertOracleRow[] = [];
    const empty: ExpertOracleRow[] = [];
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
        empty.push({
          expertSlug: expert.slug,
          expertName: expert.name,
          org: expert.organization,
          rmse: 0,
          sampleSize: 0,
          yearsCovered: [],
        });
        continue;
      }

      const rmse = LLLRatingEngine.calculateRMSE(matched);
      ranked.push({
        expertSlug: expert.slug,
        expertName: expert.name,
        org: expert.organization,
        rmse: Number(rmse.toFixed(1)),
        sampleSize: matched.length,
        yearsCovered: [...new Set(matched.map((m) => m.year))].sort(),
      });
    }

    ranked.sort((a, b) => a.rmse - b.rmse);
    empty.sort((a, b) => String(a.expertName ?? '').localeCompare(String(b.expertName ?? '')));
    return [...ranked, ...empty];
  }

  /**
   * Scout Leaderboard — Talent Delta.
   * For each expert, compare the LLL career rating implied by their big-board rank
   * to the player's actual career rating from PlayerPerformanceRegistry (best-4 seasons
   * or WAV fallback — same construction as team draft grades). RMSE — lower is better.
   * Only counts players from <= LATEST_FAIR_DRAFT_YEAR with at least 2 NFL seasons.
   */
  static async getScoutLeaderboard(): Promise<ExpertScoutRow[]> {
    const db = getDB();
    const evalYear = new Date().getFullYear();

    const [allExperts, allRankings, allRatings, careerMap] = await Promise.all([
      db.select().from(experts),
      db.select().from(expertRankings).where(lte(expertRankings.year, LATEST_FAIR_DRAFT_YEAR)),
      db.select().from(playerPerformanceRatings).where(eq(playerPerformanceRatings.isCareerRating, true)),
      PlayerPerformanceRegistry.getCareerRatingMap(),
    ]);

    // Draft year for maturity filter (same names as career rows).
    const ratingByName = new Map<string, (typeof allRatings)[number]>();
    for (const r of allRatings) {
      ratingByName.set(LLLRatingEngine.normalizeName(r.playerName), r);
    }

    const ranked: ExpertScoutRow[] = [];
    const empty: ExpertScoutRow[] = [];
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
        const norm = LLLRatingEngine.normalizeName(rk.playerName);
        const row = ratingByName.get(norm);
        if (!row) {
          continue;
        }
        const yearsSinceDraft = Math.max(1, evalYear - row.draftYear);
        if (yearsSinceDraft < 2) {
          continue;
        }

        const actualRating = careerMap.get(norm);
        if (actualRating === undefined) {
          continue;
        }

        const expectedRating = LLLRatingEngine.rankToExpectedRating(rk.rank);

        pairs.push({expectedRating, actualRating, year: rk.year});
      }

      if (pairs.length === 0) {
        empty.push({
          expertSlug: expert.slug,
          expertName: expert.name,
          org: expert.organization,
          talentDelta: 0,
          sampleSize: 0,
          yearsCovered: [],
          letter: '—',
        });
        continue;
      }

      const talentDelta = LLLRatingEngine.calculateTalentDelta(pairs);
      ranked.push({
        expertSlug: expert.slug,
        expertName: expert.name,
        org: expert.organization,
        talentDelta,
        sampleSize: pairs.length,
        yearsCovered: [...new Set(pairs.map((p) => p.year))].sort(),
        letter: scoutDeltaToLetter(talentDelta),
      });
    }

    ranked.sort((a, b) => a.talentDelta - b.talentDelta);
    empty.sort((a, b) => String(a.expertName ?? '').localeCompare(String(b.expertName ?? '')));
    return [...ranked, ...empty];
  }

  /**
   * Blend leaderboard — average rank position across Oracle, Scout, and Pairwise tables
   * (each expert ranked 1..n among those with data in that slice). Lower avgRank = better.
   * Pass preloaded leaderboards to avoid re-querying (e.g. dashboard already loaded them).
   */
  static blendLeaderboardFrom(
    oracle: ExpertOracleRow[],
    scout: ExpertScoutRow[],
    pairwise: ExpertPairwiseRow[],
  ): ExpertBlendRow[] {
    const oracleRanked = oracle.filter((e) => e.sampleSize > 0);
    const scoutRanked = scout.filter((e) => e.sampleSize > 0);
    const pairRanked = pairwise.filter((e) => e.pairCount > 0);

    const slugSet = new Set<string>();
    for (const e of oracleRanked) {
      slugSet.add(e.expertSlug);
    }
    for (const e of scoutRanked) {
      slugSet.add(e.expertSlug);
    }
    for (const e of pairRanked) {
      slugSet.add(e.expertSlug);
    }

    const rows: ExpertBlendRow[] = [];
    for (const slug of slugSet) {
      const oi = oracleRanked.findIndex((e) => e.expertSlug === slug);
      const si = scoutRanked.findIndex((e) => e.expertSlug === slug);
      const pi = pairRanked.findIndex((e) => e.expertSlug === slug);

      const oR = oi >= 0 ? oi + 1 : null;
      const sR = si >= 0 ? si + 1 : null;
      const pR = pi >= 0 ? pi + 1 : null;
      const parts = [oR, sR, pR].filter((x): x is number => x !== null);
      if (parts.length === 0) {
        continue;
      }

      const oEx = oi >= 0 ? oracleRanked[oi] : oracle.find((e) => e.expertSlug === slug);
      const sEx = si >= 0 ? scoutRanked[si] : scout.find((e) => e.expertSlug === slug);
      const pEx = pi >= 0 ? pairRanked[pi] : undefined;
      const name = oEx?.expertName ?? sEx?.expertName ?? pEx?.expertName ?? slug;
      const org = oEx?.org ?? sEx?.org ?? pEx?.org ?? null;
      const sampleSize = Math.max(oEx?.sampleSize ?? 0, sEx?.sampleSize ?? 0, pEx?.pairCount ?? 0);

      rows.push({
        expertSlug: slug,
        expertName: name,
        org,
        avgRank: Number((parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(2)),
        nComponents: parts.length,
        oracleRank: oR,
        scoutRank: sR,
        pairwiseRank: pR,
        sampleSize,
      });
    }

    rows.sort((a, b) => a.avgRank - b.avgRank);
    return rows;
  }

  static async getBlendLeaderboard(): Promise<ExpertBlendRow[]> {
    const [oracle, scout, pairwise] = await Promise.all([
      ExpertAuditService.getOracleLeaderboard(),
      ExpertAuditService.getScoutLeaderboard(),
      ExpertPairwiseRankService.getPairwiseLeaderboard(),
    ]);
    return ExpertAuditService.blendLeaderboardFrom(oracle, scout, pairwise);
  }

  /**
   * Best/Worst Takes — contrarian calls that aged well or poorly.
   *
   * For each (year, player), we compute a consensus rank (median across
   * every expert who ranked them). A "take" only counts when the expert's
   * own rank diverges meaningfully from consensus AND the player's actual
   * career rating diverges meaningfully from what consensus implied.
   *
   * Best Take = contrarian + correct (signs of rank-deviation and career-
   * delta agree). Worst Take = contrarian + wrong (signs disagree).
   *
   * Filters: rank ≤ 60, year ≤ LATEST_FAIR_DRAFT_YEAR, player has ≥ 2
   * NFL seasons, ≥3 experts ranked the player, |deviation| ≥ 5 spots,
   * |careerDelta| ≥ 0.8 rating points.
   */
  static async getBestWorstTakes(limit = 10): Promise<{best: Take[]; worst: Take[]}> {
    const db = getDB();
    const evalYear = new Date().getFullYear();

    const [allExperts, allRankings, allRatings, careerMap] = await Promise.all([
      db.select().from(experts),
      db.select().from(expertRankings).where(lte(expertRankings.year, LATEST_FAIR_DRAFT_YEAR)),
      db.select().from(playerPerformanceRatings).where(eq(playerPerformanceRatings.isCareerRating, true)),
      PlayerPerformanceRegistry.getCareerRatingMap(),
    ]);
    const expertById = new Map(allExperts.map((e) => [e.id, e]));

    const ratingByName = new Map<string, {rating: number}>();
    for (const r of allRatings) {
      const ysd = Math.max(1, evalYear - r.draftYear);
      if (ysd < 2) {
        continue;
      }
      const norm = LLLRatingEngine.normalizeName(r.playerName);
      const cr = careerMap.get(norm);
      if (cr === undefined) {
        continue;
      }
      ratingByName.set(norm, {rating: cr});
    }

    type RankRow = (typeof allRankings)[number];
    const groups = new Map<string, {year: number; player: string; rows: RankRow[]}>();
    for (const rk of allRankings) {
      if (rk.year > LATEST_FAIR_DRAFT_YEAR) {
        continue;
      }
      if (!rk.rank || rk.rank > 60) {
        continue;
      }
      const norm = LLLRatingEngine.normalizeName(rk.playerName);
      const key = `${rk.year}::${norm}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(rk);
      } else {
        groups.set(key, {year: rk.year, player: rk.playerName, rows: [rk]});
      }
    }

    const MIN_RANKERS = 3;
    const MIN_DEVIATION = 5;
    const MIN_RATING_DELTA = 0.8;

    const takes: Take[] = [];
    for (const g of groups.values()) {
      if (g.rows.length < MIN_RANKERS) {
        continue;
      }
      const careerInfo = ratingByName.get(LLLRatingEngine.normalizeName(g.player));
      if (!careerInfo) {
        continue;
      }
      const allRanks = g.rows.map((r) => r.rank ?? 0).sort((a, b) => a - b);
      const consensusRank =
        allRanks.length % 2 === 1
          ? allRanks[(allRanks.length - 1) / 2]
          : (allRanks[allRanks.length / 2 - 1] + allRanks[allRanks.length / 2]) / 2;
      const consensusExpected = LLLRatingEngine.rankToExpectedRating(Math.round(consensusRank));
      const careerDelta = careerInfo.rating - consensusExpected;
      if (Math.abs(careerDelta) < MIN_RATING_DELTA) {
        continue;
      }

      for (const rk of g.rows) {
        const expert = expertById.get(rk.expertId);
        if (!expert) {
          continue;
        }
        const expertRank = rk.rank ?? 0;
        if (expertRank === 0) {
          continue;
        }
        const deviation = consensusRank - expertRank; // + = expert higher than consensus
        if (Math.abs(deviation) < MIN_DEVIATION) {
          continue;
        }

        // Sign convention: + deviation = bullish; + careerDelta = player exceeded consensus.
        // Aligned (both + or both −) ⇒ contrarian and right ⇒ Best.
        // Misaligned ⇒ contrarian and wrong ⇒ Worst.
        const alignment = deviation * careerDelta;

        let flavor: Take['flavor'];
        let headline: string;
        if (deviation > 0 && careerDelta > 0) {
          flavor = 'unique-hit';
          headline = `Saw ${g.player} before consensus — ranked #${expertRank} when consensus had him #${consensusRank.toFixed(0)}`;
        } else if (deviation < 0 && careerDelta < 0) {
          flavor = 'unique-fade';
          headline = `Faded ${g.player} when others didn't — ranked #${expertRank} vs consensus #${consensusRank.toFixed(0)}, player flopped`;
        } else if (deviation > 0 && careerDelta < 0) {
          flavor = 'oversold';
          headline = `Bought the hype on ${g.player} — ranked #${expertRank} (consensus #${consensusRank.toFixed(0)}), player busted`;
        } else {
          flavor = 'undersold';
          headline = `Slept on ${g.player} — ranked #${expertRank} when consensus had him #${consensusRank.toFixed(0)}, player became elite`;
        }

        takes.push({
          expertSlug: expert.slug,
          expertName: expert.name,
          org: expert.organization,
          playerName: g.player,
          year: g.year,
          predictedRank: expertRank,
          consensusRank: Number(consensusRank.toFixed(1)),
          rankerCount: g.rows.length,
          consensusExpected: Number(consensusExpected.toFixed(2)),
          actualCareerRating: Number(careerInfo.rating.toFixed(2)),
          careerDelta: Number(careerDelta.toFixed(2)),
          contrarianScore: Number(alignment.toFixed(2)),
          flavor,
          headline,
        });
      }
    }

    const best = takes.filter((t) => t.contrarianScore > 0).sort((a, b) => b.contrarianScore - a.contrarianScore);
    const worst = takes.filter((t) => t.contrarianScore < 0).sort((a, b) => a.contrarianScore - b.contrarianScore);

    // De-dupe: at most one take per expert in each list (their best/worst).
    const dedupe = (list: Take[]) => {
      const seen = new Set<string>();
      const out: Take[] = [];
      for (const t of list) {
        if (seen.has(t.expertSlug)) {
          continue;
        }
        seen.add(t.expertSlug);
        out.push(t);
        if (out.length >= limit) {
          break;
        }
      }
      return out;
    };

    return {best: dedupe(best), worst: dedupe(worst)};
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

  const [myRankings, allResults, allRatings, careerMap] = await Promise.all([
    db.select().from(expertRankings).where(eq(expertRankings.expertId, expert.id)),
    db.select().from(officialDraftResults),
    db.select().from(playerPerformanceRatings).where(eq(playerPerformanceRatings.isCareerRating, true)),
    PlayerPerformanceRegistry.getCareerRatingMap(),
  ]);

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

    const actualRating = careerMap.get(norm);
    if (actualRating === undefined) {
      continue;
    }

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
