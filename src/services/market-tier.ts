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
import {pffCareerSummary, playerContractSignal} from '../db/schema.js';
import {LLLRatingEngine} from './lll-rating-engine.js';

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
}

interface ContractSignalRow {
  playerName: string;
  franchisePosition: string;
  bestContractPercentile: number;
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
      const [pffRows, contractRows] = await Promise.all([
        db
          .select({
            playerName: pffCareerSummary.playerName,
            franchisePosition: pffCareerSummary.franchisePosition,
            threeGoodYears: pffCareerSummary.threeGoodYears,
          })
          .from(pffCareerSummary),
        db
          .select({
            playerName: playerContractSignal.playerName,
            franchisePosition: playerContractSignal.franchisePosition,
            bestContractPercentile: playerContractSignal.bestContractPercentile,
            qualifiesNonRookie: playerContractSignal.qualifiesNonRookie,
          })
          .from(playerContractSignal),
      ]);

      // PFF: keep highest 3-good-years per (normalized name) — multiple rows can exist
      // when a player appears on Offense + Defense tabs (rare but possible).
      type PffBest = CareerSummaryRow & {key: string};
      const pffByKey = new Map<string, PffBest>();
      for (const r of pffRows) {
        const key = LLLRatingEngine.normalizeName(r.playerName);
        const cur = pffByKey.get(key);
        if (!cur || r.threeGoodYears > cur.threeGoodYears) {
          pffByKey.set(key, {...r, key});
        }
      }
      const pffList = Array.from(pffByKey.values());
      const pffTierMap = buildTierLookup(
        pffList,
        (r) => r.franchisePosition,
        (r) => r.threeGoodYears,
        true, // ascending: highest grade → highest tier
      );

      // Contracts: one row per player already (filtered to "Best Contract Once").
      const contractByKey = new Map<string, ContractSignalRow & {key: string}>();
      for (const r of contractRows) {
        const key = LLLRatingEngine.normalizeName(r.playerName);
        contractByKey.set(key, {...r, key});
      }
      const contractList = Array.from(contractByKey.values()).filter((c) => c.qualifiesNonRookie);
      const contractTierMap = buildTierLookup(
        contractList,
        (r) => r.franchisePosition,
        (r) => r.bestContractPercentile,
        false, // descending so lowest percentile (best deal) lands at idx 0 → tier 10
      );

      const out = new Map<string, PlayerTalentScore>();

      // Players with PFF data drive the universe; contract-only with no PFF is rare in our drafted population.
      for (const pff of pffList) {
        const pffTier = pffTierMap.get(pff) ?? null;
        const contract = contractByKey.get(pff.key);
        const contractTier = contract && contract.qualifiesNonRookie ? (contractTierMap.get(contract) ?? null) : null;
        const qualifies = !!contract && contract.qualifiesNonRookie;

        let talentScore: number;
        if (qualifies && contractTier !== null && pffTier !== null) {
          const wSum = weights.pff + weights.contract;
          talentScore = (weights.pff * pffTier + weights.contract * contractTier) / wSum;
        } else if (pffTier !== null) {
          talentScore = pffTier;
        } else {
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

      // Add contract-only players (have a qualifying contract but no PFF row in our import).
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
