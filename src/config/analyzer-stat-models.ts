/**
 * Statistical "lens" for the Draft Analyzer — A/B-style comparison without separate deployments.
 * Each model stresses a different algorithmic story (baseline LLL, shrinkage, pairwise order, etc.).
 */

export const STAT_MODEL_IDS = ['baseline', 'shrinkage', 'premium', 'oracle', 'scout', 'pairwise', 'blend'] as const;

export type StatModelId = (typeof STAT_MODEL_IDS)[number];

export const DEFAULT_STAT_MODEL: StatModelId = 'baseline';

export interface StatModelMeta {
  id: StatModelId;
  label: string;
  shortLabel: string;
  /** One line — shown under the selector */
  description: string;
}

export const STAT_MODELS: StatModelMeta[] = [
  {
    id: 'baseline',
    label: 'Baseline LLL',
    shortLabel: 'LLL',
    description: 'Standard avg Δ vs round expectation — default franchise & expert tables.',
  },
  {
    id: 'shrinkage',
    label: 'Shrinkage (EB)',
    shortLabel: 'EB',
    description: 'Team ranks use empirical-Bayes shrunk averages — small draft classes pull toward the league mean.',
  },
  {
    id: 'premium',
    label: 'Capital-weighted',
    shortLabel: 'Cap',
    description: 'Early-round picks weigh more (round 1 ≈ 7× late-day-3). Highlights premium-slot outcomes.',
  },
  {
    id: 'oracle',
    label: 'Oracle-first',
    shortLabel: 'Mock',
    description: 'Expert lens: mock draft accuracy (rank vs actual slot) leads the UI.',
  },
  {
    id: 'scout',
    label: 'Scout-first',
    shortLabel: 'Talent',
    description: 'Expert lens: talent Δ (rank-implied vs career rating) leads the UI.',
  },
  {
    id: 'pairwise',
    label: 'Pairwise order',
    shortLabel: 'Pair',
    description: 'Expert lens: board pairwise concordance with post-hoc career order (Bradley–Terry–style evidence).',
  },
  {
    id: 'blend',
    label: 'Rank blend',
    shortLabel: 'Blend',
    description: 'Expert lens: mean percentile rank across Oracle, Scout, and Pairwise where data exists.',
  },
];

const MODEL_SET = new Set<string>(STAT_MODEL_IDS);

export function parseStatModel(query: Record<string, string | undefined>): StatModelId {
  const raw = query.model ?? query.lens ?? query.stat;
  if (!raw || !MODEL_SET.has(raw)) {
    return DEFAULT_STAT_MODEL;
  }
  return raw as StatModelId;
}

export function statModelMeta(id: StatModelId): StatModelMeta {
  return STAT_MODELS.find((m) => m.id === id) ?? STAT_MODELS[0];
}

/** Query string fragment for analyzer URLs (leading "&" or "" when empty base). */
export function appendStatModel(model: StatModelId): string {
  if (model === DEFAULT_STAT_MODEL) {
    return '';
  }
  return `&model=${model}`;
}

export function buildAnalyzerQueryString(opts: {
  mode?: 'career' | 'season';
  season?: number;
  window?: number;
  model?: StatModelId;
  debug?: boolean;
}): string {
  const p = new URLSearchParams();
  if (opts.mode === 'season' && opts.season !== undefined) {
    p.set('mode', 'season');
    p.set('season', String(opts.season));
  } else {
    p.set('mode', 'career');
  }
  if (opts.window !== undefined) {
    p.set('window', String(opts.window));
  }
  if (opts.model && opts.model !== DEFAULT_STAT_MODEL) {
    p.set('model', opts.model);
  }
  if (opts.debug) {
    p.set('debug', '1');
  }
  return p.toString();
}
