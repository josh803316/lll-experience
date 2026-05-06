/**
 * Market-tier talent score: blends Tim's PFF "3 good years" grade with the
 * per-player best-contract market percentile, on the same 0-10 scale used
 * everywhere else in the analyzer (so the new lens drops into the existing
 * round-delta math unchanged).
 *
 *   pffTier      = percentile bin (1-10) of three_good_years within franchise position
 *   contractTier = percentile bin (1-10) of (1 - best_contract_percentile) within franchise position
 *                  (top of market → tier 10)
 *   talentScore  = qualifiesNonRookie ? wPff * pffTier + wContract * contractTier : pffTier
 *
 * Default weights: 0.5 / 0.5. Tunable via opts so the controller can expose
 * URL params for live A/B without redeploys.
 */
import {getDB} from '../db/index.js';
import {pffCareerSummary, playerContractSignal, officialDraftResults} from '../db/schema.js';
import {LLLRatingEngine} from './lll-rating-engine.js';

/**
 * Tim's column-O formula falls back to MAX or AVG-of-2 when a player has
 * fewer than 3 NFL seasons — that small-sample rating is unreliable and
 * tends to over-rank players like Cameron Latu (1 fluky season). We
 * suppress those from the percentile pool unless the player has a
 * qualifying non-rookie contract (the league has signaled belief).
 */
const MIN_PFF_SEASONS_FOR_PERCENTILE = 3;

/**
 * Tim's "Best Contract Once" picks the lowest-percentile contract across a
 * player's career — but in cohorts dominated by backups, even a tiny
 * deal can land top-decile (Trey Lance's 2026 LAC $2.5M backup pact is the
 * canonical case). We additionally require the contract to be ≥ ~2% of
 * cap (~$5M APY at current cap levels) to count as "the league believes
 * in this player." Below that, signal falls back to PFF-only.
 */
const MIN_QUALIFYING_APY_CAP_PCT = 0.02;

export interface MarketTierWeights {
  pff: number;
  contract: number;
}

export const DEFAULT_MARKET_WEIGHTS: MarketTierWeights = {pff: 0.5, contract: 0.5};

export interface PlayerTalentScore {
  pffTier: number | null;
  contractTier: number | null;
  qualifiesNonRookie: boolean;
  talentScore: number; // 0-10, drops into LLLRatingEngine.calculateFinalGrade
  pffGrade: number | null;
  contractPercentile: number | null;
}

interface CareerSummaryRow {
  playerName: string;
  franchisePosition: string;
  threeGoodYears: number;
  seasonsCount: number;
}

interface ContractSignalRow {
  playerName: string;
  franchisePosition: string;
  bestContractPercentile: number;
  bestApyCapPct: number | null;
  qualifiesNonRookie: boolean;
}

/** Bucket a value's rank within a sorted list (ascending) into 1-10 percentile bins. */
function percentileTier(rank0Indexed: number, total: number): number {
  if (total <= 0) {
    return 1;
  }
  const pct = (rank0Indexed + 0.5) / total; // mid-rank percentile, 0..1
  return Math.min(10, Math.max(1, Math.floor(pct * 10) + 1));
}

/**
 * Map a "lower is better" percentile (Tim's column W) directly to a 1-10 tier.
 *   pct = 0.05 (top 5% deal)  → tier 10
 *   pct = 0.55 (mid-pack)     → tier 5
 *   pct = 0.99 (bottom)       → tier 1
 * Used instead of re-binning because Tim's percentile is already the cohort-relative rank we want.
 */
function contractPercentileToTier(pct: number): number {
  if (!Number.isFinite(pct)) {
    return 1;
  }
  return Math.min(10, Math.max(1, 11 - Math.ceil(Math.max(0.0001, Math.min(1, pct)) * 10)));
}

/**
 * Build per-franchise-position percentile lookups for both signals.
 * Higher input → higher tier for PFF (better player). Lower input → higher tier for contract
 * (lower percentile = better contract = top of market).
 */
function buildTierLookup<T>(
  rows: T[],
  positionOf: (r: T) => string,
  valueOf: (r: T) => number,
  ascending: boolean,
): Map<T, number> {
  const byPos = new Map<string, T[]>();
  for (const r of rows) {
    const pos = positionOf(r);
    const list = byPos.get(pos) ?? [];
    list.push(r);
    byPos.set(pos, list);
  }
  const out = new Map<T, number>();
  for (const [, list] of byPos) {
    list.sort((a, b) => (ascending ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)));
    list.forEach((r, idx) => {
      out.set(r, percentileTier(idx, list.length));
    });
  }
  return out;
}

export class MarketTierService {
  private static cacheByKey = new Map<string, Map<string, PlayerTalentScore>>();
  private static loadingByKey = new Map<string, Promise<Map<string, PlayerTalentScore>>>();

  /**
   * @param weights blend weights; if both signals are missing the player is omitted from the map.
   *                Pure-PFF players (no qualifying contract) use pffTier directly as talentScore.
   */
  static getTalentScoreMap(
    weights: MarketTierWeights = DEFAULT_MARKET_WEIGHTS,
  ): Promise<Map<string, PlayerTalentScore>> {
    const cacheKey = `${weights.pff}_${weights.contract}`;
    const cached = this.cacheByKey.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }
    const inflight = this.loadingByKey.get(cacheKey);
    if (inflight) {
      return inflight;
    }
    const promise = (async () => {
      const db = getDB();
      const [pffRows, contractRows, draftedRows] = await Promise.all([
        db
          .select({
            playerName: pffCareerSummary.playerName,
            franchisePosition: pffCareerSummary.franchisePosition,
            threeGoodYears: pffCareerSummary.threeGoodYears,
            seasonsCount: pffCareerSummary.seasonsCount,
          })
          .from(pffCareerSummary),
        db
          .select({
            playerName: playerContractSignal.playerName,
            franchisePosition: playerContractSignal.franchisePosition,
            bestContractPercentile: playerContractSignal.bestContractPercentile,
            bestApyCapPct: playerContractSignal.bestApyCapPct,
            qualifiesNonRookie: playerContractSignal.qualifiesNonRookie,
          })
          .from(playerContractSignal),
        db.select({playerName: officialDraftResults.playerName}).from(officialDraftResults),
      ]);

      // Drafted-only universe — UDFAs / non-drafted PFF entries don't shape our
      // percentile tiers (they pollute the pool with marginal NFL players).
      const draftedKeys = new Set<string>();
      for (const d of draftedRows) {
        if (d.playerName) {
          draftedKeys.add(LLLRatingEngine.normalizeName(d.playerName));
        }
      }

      // PFF: keep highest 3-good-years per (normalized name) — multiple rows can exist
      // when a player appears on Offense + Defense tabs (rare but possible).
      type PffBest = CareerSummaryRow & {key: string};
      const pffByKey = new Map<string, PffBest>();
      for (const r of pffRows) {
        const key = LLLRatingEngine.normalizeName(r.playerName);
        if (!draftedKeys.has(key)) {
          continue;
        }
        const cur = pffByKey.get(key);
        if (!cur || r.threeGoodYears > cur.threeGoodYears) {
          pffByKey.set(key, {...r, key});
        }
      }
      const pffListAll = Array.from(pffByKey.values());

      // Suppress small-sample players from the percentile pool — Tim's column-O
      // formula falls back to MAX/AVG-2 below 3 seasons, which over-rates 1-game
      // anomalies (Cameron Latu being the textbook case). They can still get a
      // contract-only score if the league has signed them to a real deal.
      const pffListForRanking = pffListAll.filter((p) => p.seasonsCount >= MIN_PFF_SEASONS_FOR_PERCENTILE);
      const pffTierMap = buildTierLookup(
        pffListForRanking,
        (r) => r.franchisePosition,
        (r) => r.threeGoodYears,
        true, // ascending: highest grade → highest tier
      );

      // Contracts: one row per player already (filtered to "Best Contract Once").
      // Apply additional dollar-value gate: backup-pay deals don't count as the
      // league validating the player even if they top a small cohort's percentile.
      const contractByKey = new Map<string, ContractSignalRow & {key: string}>();
      for (const r of contractRows) {
        const key = LLLRatingEngine.normalizeName(r.playerName);
        const apyOk = r.bestApyCapPct !== null && r.bestApyCapPct >= MIN_QUALIFYING_APY_CAP_PCT;
        contractByKey.set(key, {...r, qualifiesNonRookie: r.qualifiesNonRookie && apyOk, key});
      }
      const contractList = Array.from(contractByKey.values()).filter(
        (c) => c.qualifiesNonRookie && draftedKeys.has(c.key),
      );
      // Direct mapping from Tim's already-computed cohort percentile to 1-10
      // — re-ranking within the qualifying-only pool would distort top-of-market
      // signals (e.g. Bosa's 5% percentile would mid-pack against a small filtered pool).
      const contractTierMap = new Map<ContractSignalRow & {key: string}, number>();
      for (const c of contractList) {
        contractTierMap.set(c, contractPercentileToTier(c.bestContractPercentile));
      }

      const out = new Map<string, PlayerTalentScore>();

      // Iterate full PFF universe (drafted) so even small-sample players show up
      // *if* they have a qualifying contract. Otherwise we skip them — small
      // sample with no league belief = no signal.
      for (const pff of pffListAll) {
        const pffTier = pffTierMap.get(pff) ?? null; // null when sample is small
        const contract = contractByKey.get(pff.key);
        const contractTier = contract && contract.qualifiesNonRookie ? (contractTierMap.get(contract) ?? null) : null;
        const qualifies = !!contract && contract.qualifiesNonRookie;

        let talentScore: number;
        if (qualifies && contractTier !== null && pffTier !== null) {
          const wSum = weights.pff + weights.contract;
          talentScore = (weights.pff * pffTier + weights.contract * contractTier) / wSum;
        } else if (qualifies && contractTier !== null) {
          // Big contract but small PFF sample — trust the league.
          talentScore = contractTier;
        } else if (pffTier !== null) {
          // Multi-season PFF, no qualifying contract yet.
          talentScore = pffTier;
        } else {
          // Small-sample PFF and no qualifying contract → no signal, skip.
          continue;
        }

        out.set(pff.key, {
          pffTier,
          contractTier,
          qualifiesNonRookie: qualifies,
          talentScore: Number(talentScore.toFixed(2)),
          pffGrade: pff.threeGoodYears,
          contractPercentile: contract?.bestContractPercentile ?? null,
        });
      }

      // Add drafted contract-only players (have a qualifying contract but no PFF row in our import).
      for (const c of contractList) {
        if (out.has(c.key)) {
          continue;
        }
        const contractTier = contractTierMap.get(c) ?? null;
        if (contractTier === null) {
          continue;
        }
        out.set(c.key, {
          pffTier: null,
          contractTier,
          qualifiesNonRookie: true,
          talentScore: contractTier,
          pffGrade: null,
          contractPercentile: c.bestContractPercentile,
        });
      }

      this.cacheByKey.set(cacheKey, out);
      this.loadingByKey.delete(cacheKey);
      return out;
    })();
    this.loadingByKey.set(cacheKey, promise);
    return promise;
  }

  static invalidate() {
    this.cacheByKey.clear();
    this.loadingByKey.clear();
  }
}
