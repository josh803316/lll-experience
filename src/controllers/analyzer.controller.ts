import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {
  analyzerDashboard,
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
  const window = opts.window ?? TEAM_WINDOW_DEFAULT;
  const endYear = opts.endYear ?? TEAM_WINDOW_END_DEFAULT;
  const startYear = endYear - window + 1;

  const [pickRow] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear)));
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
    windowEnd: endYear,
    topMovers: movers.topHits,
    bustMovers: movers.topBusts,
    oracleTop: oracle,
    scoutTop: scout,
    mode: opts.mode ?? 'career',
    selectedSeason: opts.season,
    window,
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
    return teamLeaderboard(data, CLERK_KEY, {mode: opts.mode, season: opts.season, window: opts.window});
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

  .get('/players', async (ctx) => {
    const q = ctx.query as Record<string, string | undefined>;
    const opts = parseScoutOpts(q);
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

    filtered.sort((a, b) => {
      const mul = dir === 'asc' ? 1 : -1;
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name) * mul;
        case 'team':
          return a.team.localeCompare(b.team) * mul;
        case 'round':
          return (a.round - b.round) * mul;
        case 'year':
          return (a.year - b.year) * mul;
        case 'position':
          return (a.position ?? '').localeCompare(b.position ?? '') * mul;
        case 'delta':
        default:
          return (a.delta - b.delta) * mul;
      }
    });

    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    ctx.set.headers['Content-Type'] = 'text/html';
    return playersGrid(
      rows,
      filtered.length,
      {
        mode: opts.mode ?? 'career',
        selectedSeason: opts.season ?? 2024,
        window: opts.window ?? TEAM_WINDOW_DEFAULT,
        filter,
        sort,
        dir,
        page,
        pageSize,
      },
      CLERK_KEY,
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
