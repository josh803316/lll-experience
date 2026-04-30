/**
 * LLL Proprietary Rating Engine
 * Methodology (per group consensus):
 *  - 0–10 player success scale (per-season ratings get an award floor before averaging)
 *  - Career Rating = best-4 average of a player's per-season ratings
 *  - Performance Score = Career Rating + Contract Bonus (career view only)
 *  - Final Grade = Performance Score − Round Expected (Tim's value chart)
 *
 * Trajectory was originally part of Option B but never fired in practice
 * (every callsite passes a single pre-aggregated rating, not yearly
 * scores), so it has been removed in favor of an explicit single-step
 * pipeline. If we ever want it back, it should be a deliberate change to
 * the Career Rating step that operates on per-season scores directly.
 */

export interface LLLRatingDefinition {
  value: number;
  label: string;
  description: string;
}

export interface AwardFlags {
  proBowl?: boolean;
  allPro1?: boolean;
  allPro2?: boolean;
  mvp?: boolean;
  opoy?: boolean;
  dpoy?: boolean;
  oroy?: boolean;
  droy?: boolean;
}

export const LLL_RATING_SCALE: Record<number, LLLRatingDefinition> = {
  10: {value: 10, label: 'Franchise', description: 'Cornerstone player, face of the franchise'},
  9: {value: 9, label: 'Top 5', description: 'Elite performer, top 5 at their position'},
  8: {value: 8, label: 'Top 10', description: 'Great starter, top 10 at their position'},
  7: {value: 7, label: 'All-Star', description: 'Key player, Pro-Bowl caliber'},
  6: {value: 6, label: 'Contributor', description: 'Solid contributor, important to team success'},
  5: {value: 5, label: 'Rotational', description: 'Average starter, specialist, or rotational player'},
  4: {value: 4, label: 'Below Avg', description: 'Just below average but still plays'},
  3: {value: 3, label: 'Backup', description: 'Average quality backup'},
  2: {value: 2, label: 'Replaceable', description: 'Backup who could easily be replaced'},
  1: {value: 1, label: 'Roster', description: 'Made the roster or practice squad'},
  0: {value: 0, label: 'Cut', description: 'Released from the team'},
};

// Tim's value chart: per-round expected LLL rating
export const EXPECTED_VALUE_BY_ROUND: Record<number, number> = {
  1: 7.5,
  2: 6.0,
  3: 5.0,
  4: 4.0,
  5: 3.0,
  6: 2.0,
  7: 1.0,
};

export const CONTRACT_BONUSES: Record<string, number> = {
  TOP_OF_MARKET: 2.0,
  MARKET_OR_ABOVE: 1.5,
  OTHER_TEAM_PAID: 1.0,
  FIFTH_YEAR_PICKED_UP: 0.5,
  WALKED_FOR_CHEAP: 0,
  CUT_BEFORE_END: -1.0,
  CUT_FIRST_2_YEARS: -2.0,
};

export class LLLRatingEngine {
  /**
   * Convert a cumulative w_av total to a per-season-equivalent 0–10 rating.
   *
   * Cumulative w_av punishes recent draft classes (2024 rookie can't out-accumulate
   * a 2015 vet). Dividing by years-since-draft yields a "typical season AV" we can
   * compare across classes. Per-season AV ~15 = MVP, ~8 = solid starter, ~3 = backup.
   */
  static normalizeWavToRating(wav: number, yearsSinceDraft: number): number {
    if (!Number.isFinite(wav) || wav <= 0 || yearsSinceDraft < 1) {
      return 0;
    }
    const perYear = wav / yearsSinceDraft;
    // Map per-year AV 0–15 onto 0–10 (factor 0.667), cap at 10.
    return Math.min(10, Math.max(0, Number((perYear * 0.667).toFixed(2))));
  }

  /**
   * Apply the cumulative-experience bonus to a single-season production rating.
   * Per group spec: a 3rd-year solid season counts more than a rookie's because
   * it represents proven, sustained production.
   *
   *   Y1: +0   Y2: +0   Y3: +0.25   Y4: +0.50   Y5: +0.75   Y6+: +1.00
   */
  static applyCareerBonus(seasonRating: number, yearsInNFL: number): number {
    const bonus = Math.min(1.0, Math.max(0, (yearsInNFL - 2) * 0.25));
    return Math.min(10, Number((seasonRating + bonus).toFixed(2)));
  }

  /**
   * Per Jeff/Tim spec: a player who won DPOY / MVP / All-Pro can never grade
   * BUST for that season. Honors observed by the league set a hard floor on
   * the season rating.
   *
   *   Pro Bowl                  → ≥ 5.5
   *   2nd-team All-Pro          → ≥ 6.5
   *   1st-team All-Pro          → ≥ 8.0
   *   MVP / OPOY / DPOY         → ≥ 9.0
   *   OROY / DROY (rookie year) → ≥ 7.5
   */
  static applyAwardFloor(seasonRating: number, awards: AwardFlags | null | undefined): number {
    if (!awards) {
      return seasonRating;
    }
    let floor = 0;
    if (awards.proBowl) {
      floor = Math.max(floor, 5.5);
    }
    if (awards.allPro2) {
      floor = Math.max(floor, 6.5);
    }
    if (awards.allPro1) {
      floor = Math.max(floor, 8.0);
    }
    if (awards.oroy || awards.droy) {
      floor = Math.max(floor, 7.5);
    }
    if (awards.mvp || awards.opoy || awards.dpoy) {
      floor = Math.max(floor, 9.0);
    }
    return Math.max(seasonRating, floor);
  }

  /**
   * Calculates a single season's score based on the 30/30/40 split.
   * (Reserved for when we ingest per-season component data.)
   */
  static calculateSeasonScore(peerScore: number, prodScore: number, roleScore: number): number {
    return peerScore * 0.3 + prodScore * 0.3 + roleScore * 0.4;
  }

  /**
   * Performance Score = Career Rating + Contract Bonus.
   * Callers pass an already-aggregated career rating (best-4 of seasons,
   * with award floors applied upstream). The contract lookup is the only
   * thing this function does — kept as a method so the bonus and the
   * 0-10 ceiling stay in one place.
   */
  static applyContractBonus(careerRating: number, contractType?: string | null): number {
    const bonus = contractType ? (CONTRACT_BONUSES[contractType] ?? 0) : 0;
    return Number((careerRating + bonus).toFixed(2));
  }

  /**
   * Player Grade = Actual Performance Score − Expected Score (by round)
   */
  static calculateFinalGrade(performanceScore: number, round: number): number {
    const expected = EXPECTED_VALUE_BY_ROUND[round] || 0;
    return Number((performanceScore - expected).toFixed(2));
  }

  /**
   * Bucket a Final Grade delta into a descriptive label.
   */
  static getGradeOutcomeLabel(delta: number): string {
    if (delta >= 1.5) {
      return 'ELITE HIT';
    }
    if (delta > 0.5) {
      return 'HIT';
    }
    if (delta >= -0.5) {
      return 'MET EXPECTATION';
    }
    if (delta >= -1.5) {
      return 'UNDERPERFORMED';
    }
    return 'BUST';
  }

  static getRatingLabel(rating: number): string {
    return LLL_RATING_SCALE[Math.round(rating)]?.label || 'Unknown';
  }

  /**
   * Map an A–F team grade onto the 0–10 LLL scale.
   * Used when ingesting expert team grades.
   */
  static mapLetterGradeToScale(grade: string): number {
    const mapping: Record<string, number> = {
      'A+': 10,
      A: 9.5,
      'A-': 9,
      'B+': 8.5,
      B: 7.5,
      'B-': 7,
      'C+': 6.5,
      C: 5.5,
      'C-': 5,
      'D+': 4,
      D: 3,
      F: 0,
    };
    return mapping[grade.toUpperCase()] || 5;
  }

  /**
   * Map a team's RANK among all teams onto an A+–F letter grade.
   *
   * Tim's expected-value chart treats Round 1 = 7.5 (Top-10-at-position).
   * Reality: only ~30% of R1 picks reach that bar, so every team's avg
   * delta is negative on the absolute scale. Using rank-based tiers
   * preserves the underlying delta signal while letting the league spread
   * across A+→F for at-a-glance comparison. Raw avgDelta is still shown
   * alongside the letter so the absolute math is never hidden.
   */
  static rankToLetterGrade(rank1Indexed: number, total: number): string {
    if (total <= 0) {
      return 'F';
    }
    const tiers = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
    const ratio = (rank1Indexed - 1) / total;
    const idx = Math.min(tiers.length - 1, Math.floor(ratio * tiers.length));
    return tiers[idx];
  }

  /**
   * Mock Accuracy: RMSE of predicted vs actual rank.
   * Lower is better (0 = perfect).
   */
  static calculateRMSE(predictions: {predicted: number; actual: number}[]): number {
    if (predictions.length === 0) {
      return 0;
    }
    const sumOfSquares = predictions.reduce((sum, p) => sum + Math.pow(p.predicted - p.actual, 2), 0);
    return Math.sqrt(sumOfSquares / predictions.length);
  }

  /**
   * Translate an expert's big-board rank into the LLL career rating they implicitly predicted.
   * Anchored against the round expected values:
   *   rank 1   -> ~8.0   (top of round 1)
   *   rank 32  -> ~7.5   (round 1 ceiling expectation)
   *   rank 64  -> ~6.0   (round 2)
   *   rank 100 -> ~5.0   (round 3)
   *   rank 200 -> ~2.0   (round 6)
   * Smoothed exponential: 8.5 * exp(-rank/120), floored at 1.
   */
  static rankToExpectedRating(rank: number): number {
    if (rank <= 0) {
      return 8.5;
    }
    return Math.max(1, Number((8.5 * Math.exp(-rank / 120)).toFixed(2)));
  }

  /**
   * Talent Delta: how close did the expert's implied quality come to the actual career rating?
   * Returns RMSE (lower is better — they accurately rated talent).
   */
  static calculateTalentDelta(predictions: {expectedRating: number; actualRating: number}[]): number {
    if (predictions.length === 0) {
      return 0;
    }
    const sumOfSquares = predictions.reduce((sum, p) => sum + Math.pow(p.expectedRating - p.actualRating, 2), 0);
    return Number(Math.sqrt(sumOfSquares / predictions.length).toFixed(2));
  }

  /**
   * Normalize a player name for cross-table joining (handles "C.J." vs "CJ", trailing Jr., etc.).
   */
  static normalizeName(name: string | null | undefined): string {
    if (!name) {
      return '';
    }
    return name
      .toLowerCase()
      .replace(/\bjr\.?\b|\bsr\.?\b|\bii+\b|\biv\b/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * NFL franchise canonical-name mapping for nflverse abbreviations.
 * Merges relocated franchises (OAK→LVR, SDG→LAC, STL→LAR).
 * `espn` is the lowercase logo slug used on ESPN's CDN.
 */
export interface TeamCanonical {
  abbr: string;
  city: string;
  name: string;
  espn: string;
}

export const TEAM_CANONICAL: Record<string, TeamCanonical> = {
  ARI: {abbr: 'ARI', city: 'Arizona', name: 'Cardinals', espn: 'ari'},
  ATL: {abbr: 'ATL', city: 'Atlanta', name: 'Falcons', espn: 'atl'},
  BAL: {abbr: 'BAL', city: 'Baltimore', name: 'Ravens', espn: 'bal'},
  BUF: {abbr: 'BUF', city: 'Buffalo', name: 'Bills', espn: 'buf'},
  CAR: {abbr: 'CAR', city: 'Carolina', name: 'Panthers', espn: 'car'},
  CHI: {abbr: 'CHI', city: 'Chicago', name: 'Bears', espn: 'chi'},
  CIN: {abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', espn: 'cin'},
  CLE: {abbr: 'CLE', city: 'Cleveland', name: 'Browns', espn: 'cle'},
  DAL: {abbr: 'DAL', city: 'Dallas', name: 'Cowboys', espn: 'dal'},
  DEN: {abbr: 'DEN', city: 'Denver', name: 'Broncos', espn: 'den'},
  DET: {abbr: 'DET', city: 'Detroit', name: 'Lions', espn: 'det'},
  GNB: {abbr: 'GB', city: 'Green Bay', name: 'Packers', espn: 'gb'},
  HOU: {abbr: 'HOU', city: 'Houston', name: 'Texans', espn: 'hou'},
  IND: {abbr: 'IND', city: 'Indianapolis', name: 'Colts', espn: 'ind'},
  JAX: {abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', espn: 'jax'},
  KAN: {abbr: 'KC', city: 'Kansas City', name: 'Chiefs', espn: 'kc'},
  LAC: {abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', espn: 'lac'},
  SDG: {abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', espn: 'lac'}, // legacy SD
  LAR: {abbr: 'LAR', city: 'Los Angeles', name: 'Rams', espn: 'lar'},
  STL: {abbr: 'LAR', city: 'Los Angeles', name: 'Rams', espn: 'lar'}, // legacy STL
  LVR: {abbr: 'LV', city: 'Las Vegas', name: 'Raiders', espn: 'lv'},
  OAK: {abbr: 'LV', city: 'Las Vegas', name: 'Raiders', espn: 'lv'}, // legacy OAK
  MIA: {abbr: 'MIA', city: 'Miami', name: 'Dolphins', espn: 'mia'},
  MIN: {abbr: 'MIN', city: 'Minnesota', name: 'Vikings', espn: 'min'},
  NWE: {abbr: 'NE', city: 'New England', name: 'Patriots', espn: 'ne'},
  NOR: {abbr: 'NO', city: 'New Orleans', name: 'Saints', espn: 'no'},
  NYG: {abbr: 'NYG', city: 'New York', name: 'Giants', espn: 'nyg'},
  NYJ: {abbr: 'NYJ', city: 'New York', name: 'Jets', espn: 'nyj'},
  PHI: {abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', espn: 'phi'},
  PIT: {abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', espn: 'pit'},
  SFO: {abbr: 'SF', city: 'San Francisco', name: '49ers', espn: 'sf'},
  SEA: {abbr: 'SEA', city: 'Seattle', name: 'Seahawks', espn: 'sea'},
  TAM: {abbr: 'TB', city: 'Tampa Bay', name: 'Buccaneers', espn: 'tb'},
  TEN: {abbr: 'TEN', city: 'Tennessee', name: 'Titans', espn: 'ten'},
  WAS: {abbr: 'WAS', city: 'Washington', name: 'Commanders', espn: 'wsh'},
};

export function canonicalTeam(raw: string | null | undefined): TeamCanonical | null {
  if (!raw) {
    return null;
  }
  const key = raw.trim().toUpperCase();
  return TEAM_CANONICAL[key] || null;
}

/**
 * Look up by either source (GNB, SFO) or display (GB, SF) abbreviation —
 * client-side links and route params pass display abbrs back to us.
 */
export function teamByAnyAbbr(abbr: string | null | undefined): TeamCanonical | null {
  if (!abbr) {
    return null;
  }
  const upper = abbr.trim().toUpperCase();
  if (TEAM_CANONICAL[upper]) {
    return TEAM_CANONICAL[upper];
  }
  for (const v of Object.values(TEAM_CANONICAL)) {
    if (v.abbr === upper) {
      return v;
    }
  }
  return null;
}

export function teamLogoUrl(abbr: string | null | undefined): string | null {
  const team = teamByAnyAbbr(abbr);
  return team ? `https://a.espncdn.com/i/teamlogos/nfl/500/${team.espn}.png` : null;
}
