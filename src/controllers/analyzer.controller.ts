import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {
  analyzerDashboard,
  expertLeaderboard,
  expertProfile,
  expertProfileNotFound,
  renderMovers,
  teamLeaderboard,
  playerProfile,
  searchResultsFragment,
  successLeaderboard,
  teamBreakdownModal,
  teamBreakdownNotFound,
  type DashboardSnapshot,
} from '../views/analyzer-templates.js';
import {DraftScoutService} from '../services/draft-scout.js';
import {ExpertAuditService, getExpertProfile} from '../services/expert-audit.js';
import {
  TeamScoutService,
  TEAM_WINDOW_DEFAULT,
  TEAM_WINDOW_END_DEFAULT,
  type ScoutOptions,
  type ScoutMode,
} from '../services/team-scout.js';
import {getDB} from '../db/index.js';
import {experts, officialDraftResults} from '../db/schema.js';
import {sql, gte, lte, and} from 'drizzle-orm';

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

function parseScoutOpts(query: Record<string, string | undefined>): ScoutOptions {
  const mode = (query.mode === 'season' ? 'season' : 'career') as ScoutMode;
  const seasonRaw = query.season ? Number(query.season) : NaN;
  const season = mode === 'season' && Number.isFinite(seasonRaw) ? seasonRaw : undefined;
  const windowRaw = query.window ? Number(query.window) : NaN;
  const window = Number.isFinite(windowRaw) ? windowRaw : undefined;
  return {mode, season, window};
}

async function buildDashboardSnapshot(opts: ScoutOptions = {}): Promise<DashboardSnapshot> {
  const db = getDB();
  const startYear = TEAM_WINDOW_END_DEFAULT - TEAM_WINDOW_DEFAULT + 1;

  const [pickRow] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, TEAM_WINDOW_END_DEFAULT)));
  const [expertRow] = await db.select({c: sql<number>`COUNT(*)::int`}).from(experts);

  const [movers, oracle, scout] = await Promise.all([
    TeamScoutService.getTopMovers({...opts, limit: 10}),
    ExpertAuditService.getOracleLeaderboard(),
    ExpertAuditService.getScoutLeaderboard(),
  ]);

  return {
    totalPicks: pickRow?.c ?? 0,
    totalExperts: expertRow?.c ?? 0,
    windowStart: startYear,
    windowEnd: TEAM_WINDOW_END_DEFAULT,
    topMovers: movers.topHits,
    bustMovers: movers.topBusts,
    oracleTop: oracle,
    scoutTop: scout,
    mode: opts.mode ?? 'career',
    selectedSeason: opts.season,
  };
}

export const analyzerController = new Elysia({prefix: '/analyzer'})
  .onBeforeHandle((ctx) => {
    return authGuard(ctx);
  })

  // --- HTML ROUTES ---
  .get('/', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const snapshot = await buildDashboardSnapshot(parseScoutOpts(ctx.query as Record<string, string | undefined>));
    return analyzerDashboard(snapshot, CLERK_KEY);
  })
  .get('', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const snapshot = await buildDashboardSnapshot(parseScoutOpts(ctx.query as Record<string, string | undefined>));
    return analyzerDashboard(snapshot, CLERK_KEY);
  })

  .get('/experts', async (ctx) => {
    const [oracle, scout] = await Promise.all([
      ExpertAuditService.getOracleLeaderboard(),
      ExpertAuditService.getScoutLeaderboard(),
    ]);
    ctx.set.headers['Content-Type'] = 'text/html';
    return expertLeaderboard(oracle, scout, CLERK_KEY);
  })

  .get('/teams', async (ctx) => {
    const opts = parseScoutOpts(ctx.query as Record<string, string | undefined>);
    const data = await TeamScoutService.getTeamSuccessLeaderboard(opts);
    ctx.set.headers['Content-Type'] = 'text/html';
    return teamLeaderboard(data, CLERK_KEY, opts);
  })

  .get('/player/:name', async (ctx) => {
    const data = await DraftScoutService.getPlayerCareerProfile(ctx.params.name);
    ctx.set.headers['Content-Type'] = 'text/html';
    return playerProfile(data, CLERK_KEY);
  })

  .get('/expert/:slug', async (ctx) => {
    const data = await getExpertProfile(ctx.params.slug);
    ctx.set.headers['Content-Type'] = 'text/html';
    return data ? expertProfile(data, CLERK_KEY) : expertProfileNotFound(ctx.params.slug, CLERK_KEY);
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
  .get('/api/teams/success', async ({query}) => {
    const opts = parseScoutOpts(query as Record<string, string | undefined>);
    return await TeamScoutService.getTeamSuccessLeaderboard(opts);
  })
  .get('/api/movers', async ({query}) => {
    const opts = parseScoutOpts(query as Record<string, string | undefined>);
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

  .get('/fragment/success-leaderboard', async ({query}) => {
    const opts = parseScoutOpts(query as Record<string, string | undefined>);
    const data = await TeamScoutService.getTeamSuccessLeaderboard(opts);
    return successLeaderboard(data.slice(0, 10), opts);
  })

  .get('/fragment/team-breakdown/:teamKey', async ({params, query, set}) => {
    const opts = parseScoutOpts(query as Record<string, string | undefined>);
    const breakdown = await TeamScoutService.getTeamBreakdown(params.teamKey, opts);
    set.headers['Content-Type'] = 'text/html';
    return breakdown ? teamBreakdownModal(breakdown) : teamBreakdownNotFound(params.teamKey);
  })

  .get('/fragment/movers', async ({query, set}) => {
    const opts = parseScoutOpts(query as Record<string, string | undefined>);
    const draftYear = query.year && query.year !== 'all' ? Number(query.year) : undefined;
    const movers = await TeamScoutService.getTopMovers({...opts, draftYear, limit: 10});
    set.headers['Content-Type'] = 'text/html';
    return renderMovers(movers.topHits, movers.topBusts);
  });
