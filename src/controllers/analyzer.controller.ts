import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {
  analyzerDashboard,
  expertLeaderboard,
  teamLeaderboard,
  topExpertsMini,
  playerProfile,
  timelineFragment,
  searchResultsFragment,
  successLeaderboard,
} from '../views/analyzer-templates.js';
import type {ExpertAccuracy} from '../views/analyzer-templates.js';
import {DraftScoutService} from '../services/draft-scout.js';
import {ExpertAuditService} from '../services/expert-audit.js';
import {TeamScoutService} from '../services/team-scout.js';

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

export const analyzerController = new Elysia({prefix: '/analyzer'})
  .onBeforeHandle((ctx) => {
    return authGuard(ctx) as any;
  })

  // --- HTML ROUTES (Web Frontend) ---
  .get('/', (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    return analyzerDashboard(CLERK_KEY);
  })
  .get('', (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    return analyzerDashboard(CLERK_KEY);
  })

  .get('/experts', async (ctx) => {
    const data = (await ExpertAuditService.getOracleLeaderboard()) as ExpertAccuracy[];
    ctx.set.headers['Content-Type'] = 'text/html';
    return expertLeaderboard(data, CLERK_KEY);
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

  // --- API ROUTES (JSON - For Web HTMX & Future Mobile App) ---

  /** Get career profile for a player with historical data */
  .get('/api/player/:name', async ({params}) => {
    return await DraftScoutService.getPlayerCareerProfile(params.name);
  })

  /** Expert Accuracy Rankings */
  .get('/api/experts/leaderboard', async () => {
    return (await ExpertAuditService.getOracleLeaderboard()) as ExpertAccuracy[];
  })

  /** Team Draft Success (The 3-Year Lookback) */
  .get('/api/teams/success', async () => {
    return await TeamScoutService.getTeamSuccessLeaderboard();
  })

  /** Intel Timeline (News updates during combine, pre-season, etc) */
  .get('/api/timeline', () => {
    return [
      {
        id: 1,
        type: 'combine',
        title: 'Combine Performance Delta',
        content: 'Player X exceeded athletic expectations; proprietary LLL value increased by 4.2%.',
        date: new Date().toISOString(),
      },
    ];
  })

  // --- HTMX FRAGMENTS (For the Web Frontend only) ---
  .get('/fragment/timeline', () => {
    const events = [
      {
        id: 1,
        type: 'Combine',
        title: "Lions' core metrics show high retention",
        content:
          'Analysis of 2024-2025 draft cycles indicates Detroit leads the league in "Pick to Roster" percentage.',
        date: new Date().toISOString(),
      },
      {
        id: 2,
        type: 'Scouting',
        title: 'Expert Accuracy Report: Kiper vs Jeremiah',
        content:
          'A look back at 3 years of historical rankings reveals a significant drift in value prediction for QBs.',
        date: new Date().toISOString(),
      },
    ];
    return timelineFragment(events);
  })

  .get('/fragment/top-experts-mini', async () => {
    const data = (await ExpertAuditService.getOracleLeaderboard()) as ExpertAccuracy[];
    return topExpertsMini(data);
  })

  .get('/api/search', async ({query}) => {
    const results = await DraftScoutService.search(query.q || '');
    return searchResultsFragment(results);
  })

  .get('/fragment/success-leaderboard', async () => {
    const data = await TeamScoutService.getTeamSuccessLeaderboard();
    // Only show top 5 on dashboard
    return successLeaderboard(data.slice(0, 5));
  });
