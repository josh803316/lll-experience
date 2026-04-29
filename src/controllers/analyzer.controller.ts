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
import {TeamScoutService, TEAM_WINDOW_DEFAULT, TEAM_WINDOW_END_DEFAULT} from '../services/team-scout.js';
import {getDB} from '../db/index.js';
import {experts, officialDraftResults} from '../db/schema.js';
import {sql, gte, lte, and} from 'drizzle-orm';

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  const db = getDB();
  const startYear = TEAM_WINDOW_END_DEFAULT - TEAM_WINDOW_DEFAULT + 1;

  const [pickRow] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, TEAM_WINDOW_END_DEFAULT)));
  const [expertRow] = await db.select({c: sql<number>`COUNT(*)::int`}).from(experts);

  const [movers, oracle, scout] = await Promise.all([
    TeamScoutService.getTopMovers(undefined, undefined, {limit: 10}),
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
  };
}

export const analyzerController = new Elysia({prefix: '/analyzer'})
  .onBeforeHandle((ctx) => {
    return authGuard(ctx);
  })

  // --- HTML ROUTES ---
  .get('/', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const snapshot = await buildDashboardSnapshot();
    return analyzerDashboard(snapshot, CLERK_KEY);
  })
  .get('', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    const snapshot = await buildDashboardSnapshot();
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
    const data = await TeamScoutService.getTeamSuccessLeaderboard();
    ctx.set.headers['Content-Type'] = 'text/html';
    return teamLeaderboard(data, CLERK_KEY);
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
    const window = Number(query.window) || TEAM_WINDOW_DEFAULT;
    return await TeamScoutService.getTeamSuccessLeaderboard(window);
  })
  .get('/api/movers', async ({query}) => {
    const draftYear = query.year && query.year !== 'all' ? Number(query.year) : undefined;
    return await TeamScoutService.getTopMovers(undefined, undefined, {draftYear, limit: 10});
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
    const window = Number(query.window) || TEAM_WINDOW_DEFAULT;
    const data = await TeamScoutService.getTeamSuccessLeaderboard(window);
    return successLeaderboard(data.slice(0, 10));
  })

  .get('/fragment/team-breakdown/:teamKey', async ({params, query, set}) => {
    const window = Number(query.window) || TEAM_WINDOW_DEFAULT;
    const breakdown = await TeamScoutService.getTeamBreakdown(params.teamKey, window);
    set.headers['Content-Type'] = 'text/html';
    return breakdown ? teamBreakdownModal(breakdown) : teamBreakdownNotFound(params.teamKey);
  })

  .get('/fragment/movers', async ({query, set}) => {
    const draftYear = query.year && query.year !== 'all' ? Number(query.year) : undefined;
    const movers = await TeamScoutService.getTopMovers(undefined, undefined, {draftYear, limit: 10});
    set.headers['Content-Type'] = 'text/html';
    return renderMovers(movers.topHits, movers.topBusts);
  });
