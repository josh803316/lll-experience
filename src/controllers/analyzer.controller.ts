import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {isAdminUserId} from '../lib/clerk-email.js';
import {
  analyzerDashboard,
  collegeLeaderboard,
  expertLeaderboard,
  expertProfile,
  expertProfileNotFound,
  playersGrid,
  renderMovers,
  teamLeaderboard,
  playerProfile,
  searchResultsFragment,
  successLeaderboard,
  teamBreakdownModal,
  teamBreakdownNotFound,
  type DashboardSnapshot,
  type PlayersGridOptions,
} from '../views/analyzer-templates.js';
import {DraftScoutService, type SeasonRow} from '../services/draft-scout.js';
import {ExpertAuditService, getExpertProfile} from '../services/expert-audit.js';
import {ExpertPairwiseRankService} from '../services/expert-pairwise-rank.js';
import {CollegeScoutService} from '../services/college-scout.js';
import {
  TeamScoutService,
  TEAM_WINDOW_DEFAULT,
  TEAM_WINDOW_END_DEFAULT,
  getOfficialDraftYearBounds,
  pickCapitalWeight,
  type ScoutOptions,
  type ScoutMode,
  type ScoredPick,
} from '../services/team-scout.js';
import {getDB} from '../db/index.js';
import {experts, officialDraftResults} from '../db/schema.js';
import {sql, gte, lte, and} from 'drizzle-orm';
import {parseStatModel} from '../config/analyzer-stat-models.js';

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

function parseScoutOpts(query: Record<string, string | undefined>): ScoutOptions {
  const mode = (query.mode === 'season' ? 'season' : 'career') as ScoutMode;
  const seasonRaw = query.season ? Number(query.season) : NaN;
  const season = mode === 'season' && Number.isFinite(seasonRaw) ? seasonRaw : undefined;
  const windowRaw = query.window ? Number(query.window) : NaN;
  const window = Number.isFinite(windowRaw) ? windowRaw : undefined;
  const statModel = parseStatModel(query);
  return {mode, season, window, statModel};
}

type SeasonBounds = {min: number; max: number};

/** Clamp season to real draft years; default to latest when mode=season and ?season= missing. */
function applySeasonBoundsToScoutOpts(opts: ScoutOptions, bounds: SeasonBounds): ScoutOptions {
  if (opts.mode !== 'season') {
    return opts;
  }
  const season =
    opts.season !== undefined ? Math.min(bounds.max, Math.max(bounds.min, Math.round(opts.season))) : bounds.max;
  return {...opts, season};
}

/** Resolve the current user's admin status + their requested debug flag. */
async function resolveAdminContext(ctx: any): Promise<{
  isAdmin: boolean;
  debug: boolean;
}> {
  const userId = (ctx?.auth?.() as {userId?: string | number} | undefined)?.userId;
  const isAdmin = userId ? await isAdminUserId(String(userId)) : false;
  const q = (ctx?.query ?? {}) as Record<string, string | undefined>;
  const debug = isAdmin && (q.debug === '1' || q.debug === 'true');
  return {isAdmin, debug};
}

async function buildDashboardSnapshot(
  opts: ScoutOptions = {},
  admin: {isAdmin?: boolean; debug?: boolean} = {},
  bounds: SeasonBounds,
): Promise<DashboardSnapshot> {
  const db = getDB();
  const mode = opts.mode ?? 'career';
  const window = opts.window ?? TEAM_WINDOW_DEFAULT;
  const endYear = mode === 'season' ? (opts.season ?? bounds.max) : (opts.endYear ?? TEAM_WINDOW_END_DEFAULT);
  const startYear = mode === 'season' ? endYear : endYear - window + 1;

  const [pickRow] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear)));
  const [expertRow] = await db.select({c: sql<number>`COUNT(*)::int`}).from(experts);

  const [movers, oracle, scout, pairwise] = await Promise.all([
    TeamScoutService.getTopMovers({...opts, limit: 10}),
    ExpertAuditService.getOracleLeaderboard(),
    ExpertAuditService.getScoutLeaderboard(),
    ExpertPairwiseRankService.getPairwiseLeaderboard(),
  ]);
  const blend = ExpertAuditService.blendLeaderboardFrom(oracle, scout, pairwise);

  return {
    totalPicks: pickRow?.c ?? 0,
    totalExperts: expertRow?.c ?? 0,
    windowStart: startYear,
    windowEnd: endYear,
    topMovers: movers.topHits,
    bustMovers: movers.topBusts,
    oracleTop: oracle,
    scoutTop: scout,
    pairwiseTop: pairwise,
    blendTop: blend,
    statModel: opts.statModel ?? 'baseline',
    mode,
    selectedSeason: mode === 'season' ? (opts.season ?? bounds.max) : undefined,
    seasonYearMin: bounds.min,
    seasonYearMax: bounds.max,
    window,
    isAdmin: admin.isAdmin ?? false,
    debug: admin.debug ?? false,
  };
}

export const analyzerController = new Elysia({prefix: '/analyzer'})
  .onBeforeHandle((ctx) => {
    return authGuard(ctx);
  })

  // --- HTML ROUTES ---
  .get('/', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const snapshot = await buildDashboardSnapshot(opts, admin, bounds);
    return analyzerDashboard(snapshot, CLERK_KEY);
  })
  .get('', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const snapshot = await buildDashboardSnapshot(opts, admin, bounds);
    return analyzerDashboard(snapshot, CLERK_KEY);
  })

  .get('/experts', async (ctx) => {
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const [oracle, scout, takes, pairwise, blend] = await Promise.all([
      ExpertAuditService.getOracleLeaderboard(),
      ExpertAuditService.getScoutLeaderboard(),
      ExpertAuditService.getBestWorstTakes(10),
      ExpertPairwiseRankService.getPairwiseLeaderboard(),
      ExpertAuditService.getBlendLeaderboard(),
    ]);
    ctx.set.headers['Content-Type'] = 'text/html';
    return expertLeaderboard(oracle, scout, takes, CLERK_KEY, {
      ...admin,
      pairwise,
      blend,
      statModel: opts.statModel ?? 'baseline',
      mode: opts.mode ?? 'career',
      season: opts.season,
      window: opts.window ?? TEAM_WINDOW_DEFAULT,
      seasonYearMin: bounds.min,
      seasonYearMax: bounds.max,
    });
  })

  .get('/teams', async (ctx) => {
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const [data, shrinkage] = await Promise.all([
      TeamScoutService.getTeamSuccessLeaderboard(opts),
      admin.debug ? TeamScoutService.getTeamYearShrinkagePrototype(opts) : Promise.resolve(undefined),
    ]);
    ctx.set.headers['Content-Type'] = 'text/html';
    return teamLeaderboard(
      data,
      CLERK_KEY,
      {
        mode: opts.mode,
        season: opts.season,
        window: opts.window,
        statModel: opts.statModel ?? 'baseline',
        seasonYearMin: bounds.min,
        seasonYearMax: bounds.max,
      },
      {
        ...admin,
        shrinkage,
      },
    );
  })

  .get('/colleges', async (ctx) => {
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const data = await CollegeScoutService.getCollegeSuccessLeaderboard();
    ctx.set.headers['Content-Type'] = 'text/html';
    return collegeLeaderboard(data, CLERK_KEY, {
      ...admin,
      statModel: opts.statModel ?? 'baseline',
      mode: opts.mode ?? 'career',
      season: opts.season,
      window: opts.window ?? TEAM_WINDOW_DEFAULT,
      debug: admin.debug,
      seasonYearMin: bounds.min,
      seasonYearMax: bounds.max,
    });
  })

  .get('/player/:name', async (ctx) => {
    const admin = await resolveAdminContext(ctx);
    const data = await DraftScoutService.getPlayerCareerProfile(ctx.params.name);
    ctx.set.headers['Content-Type'] = 'text/html';
    return playerProfile(data, CLERK_KEY, admin);
  })

  .get('/expert/:slug', async (ctx) => {
    const admin = await resolveAdminContext(ctx);
    const data = await getExpertProfile(ctx.params.slug);
    ctx.set.headers['Content-Type'] = 'text/html';
    return data ? expertProfile(data, CLERK_KEY, admin) : expertProfileNotFound(ctx.params.slug, CLERK_KEY, admin);
  })

  .get('/players', async (ctx) => {
    const q = ctx.query as Record<string, string | undefined>;
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(q), bounds);
    const filter: PlayersGridOptions['filter'] = q.filter === 'hits' || q.filter === 'busts' ? q.filter : 'all';
    const allowedSorts: PlayersGridOptions['sort'][] = ['delta', 'name', 'team', 'round', 'year', 'position'];
    const sort: PlayersGridOptions['sort'] = allowedSorts.find((s) => s === q.sort) ?? 'delta';
    const dir: PlayersGridOptions['dir'] = q.dir === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = 25;

    const all = await TeamScoutService.getAllScoredPicks(opts);
    const filtered = all.filter((p) => {
      if (filter === 'hits') {
        return p.delta > 0.5;
      }
      if (filter === 'busts') {
        return p.delta < -1.0;
      }
      return true;
    });

    const statModel = opts.statModel ?? 'baseline';
    const lensScore = (p: ScoredPick) => (statModel === 'premium' ? p.delta * pickCapitalWeight(p.round) : p.delta);

    filtered.sort((a, b) => {
      const mul = dir === 'asc' ? 1 : -1;
      switch (sort) {
        case 'name':
          return String(a.name ?? '').localeCompare(String(b.name ?? '')) * mul;
        case 'team':
          return String(a.team ?? '').localeCompare(String(b.team ?? '')) * mul;
        case 'round':
          return (a.round - b.round) * mul;
        case 'year':
          return (a.year - b.year) * mul;
        case 'position':
          return (a.position ?? '').localeCompare(b.position ?? '') * mul;
        case 'delta':
        default:
          return (lensScore(a) - lensScore(b)) * mul;
      }
    });

    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    ctx.set.headers['Content-Type'] = 'text/html';
    const admin = await resolveAdminContext(ctx);
    return playersGrid(
      rows,
      filtered.length,
      {
        mode: opts.mode ?? 'career',
        selectedSeason: opts.season ?? bounds.max,
        seasonYearMin: bounds.min,
        seasonYearMax: bounds.max,
        window: opts.window ?? TEAM_WINDOW_DEFAULT,
        statModel: opts.statModel ?? 'baseline',
        filter,
        sort,
        dir,
        page,
        pageSize,
      },
      CLERK_KEY,
      admin,
    );
  })

  // --- JSON API ---
  .get('/api/player/:name', async ({params}) => {
    return await DraftScoutService.getPlayerCareerProfile(params.name);
  })
  .get('/api/experts/oracle', async () => {
    return await ExpertAuditService.getOracleLeaderboard();
  })
  .get('/api/experts/scout', async () => {
    return await ExpertAuditService.getScoutLeaderboard();
  })
  .get('/api/experts/pairwise', async () => {
    return await ExpertPairwiseRankService.getPairwiseLeaderboard();
  })
  .get('/api/experts/blend', async () => {
    return await ExpertAuditService.getBlendLeaderboard();
  })
  .get('/api/teams/shrinkage', async ({query}) => {
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(query as Record<string, string | undefined>), bounds);
    return await TeamScoutService.getTeamYearShrinkagePrototype(opts);
  })
  .get('/api/teams/success', async ({query}) => {
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(query as Record<string, string | undefined>), bounds);
    return await TeamScoutService.getTeamSuccessLeaderboard(opts);
  })
  .get('/api/movers', async ({query}) => {
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(query as Record<string, string | undefined>), bounds);
    const draftYear = query.year && query.year !== 'all' ? Number(query.year) : undefined;
    return await TeamScoutService.getTopMovers({...opts, draftYear, limit: 10});
  })

  .get('/api/expert/:slug', async ({params}) => {
    return await getExpertProfile(params.slug);
  })

  // --- HTMX FRAGMENTS ---
  .get('/api/search', async ({query}) => {
    const results = await DraftScoutService.search(query.q || '');
    return searchResultsFragment(results);
  })

  .get('/fragment/success-leaderboard', async (ctx) => {
    const [admin, bounds] = await Promise.all([resolveAdminContext(ctx), getOfficialDraftYearBounds()]);
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(ctx.query as Record<string, string | undefined>), bounds);
    const data = await TeamScoutService.getTeamSuccessLeaderboard(opts);
    return successLeaderboard(data.slice(0, 10), {...opts, debug: admin.debug});
  })

  .get('/fragment/team-breakdown/:teamKey', async (ctx) => {
    const {params, query, set} = ctx;
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(query as Record<string, string | undefined>), bounds);
    const admin = await resolveAdminContext(ctx);
    const breakdown = await TeamScoutService.getTeamBreakdown(params.teamKey, opts);
    let scored: ScoredPick[] = [];
    let seasonHistories: Map<string, SeasonRow[]> | undefined;
    if (admin.isAdmin && breakdown) {
      const all = await TeamScoutService.getAllScoredPicks(opts);
      scored = all.filter((p) => p.teamKey === breakdown.teamKey);
      seasonHistories = await DraftScoutService.getSeasonHistoriesForPlayers(scored.map((p) => p.name));
    }
    set.headers['Content-Type'] = 'text/html';
    return breakdown
      ? teamBreakdownModal(breakdown, {...admin, debugPicks: scored, seasonHistories})
      : teamBreakdownNotFound(params.teamKey);
  })

  .get('/fragment/movers', async ({query, set}) => {
    const bounds = await getOfficialDraftYearBounds();
    const opts = applySeasonBoundsToScoutOpts(parseScoutOpts(query as Record<string, string | undefined>), bounds);
    const draftYear = query.year && query.year !== 'all' ? Number(query.year) : undefined;
    const movers = await TeamScoutService.getTopMovers({...opts, draftYear, limit: 10});
    set.headers['Content-Type'] = 'text/html';
    return renderMovers(movers.topHits, movers.topBusts);
  });
