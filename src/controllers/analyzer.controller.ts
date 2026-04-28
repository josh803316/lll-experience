import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {analyzerDashboard, expertLeaderboard, teamLeaderboard} from '../views/analyzer-templates.js';
import {DraftScoutService} from '../services/draft-scout.js';
import {ExpertAuditService} from '../services/expert-audit.js';

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

export const analyzerController = new Elysia({prefix: '/analyzer'})
  .onBeforeHandle((ctx) => {
    return authGuard(ctx);
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
    const data = await ExpertAuditService.getOracleLeaderboard(2023);
    ctx.set.headers['Content-Type'] = 'text/html';
    return expertLeaderboard(data, CLERK_KEY);
  })

  .get('/teams', (ctx) => {
    const data = [
      {team: 'Detroit Lions', retention: 92, value: 85, grade: 'A'},
      {team: 'Houston Texans', retention: 88, value: 94, grade: 'A+'},
      {team: 'Carolina Panthers', retention: 42, value: 15, grade: 'D'},
    ];
    ctx.set.headers['Content-Type'] = 'text/html';
    return teamLeaderboard(data, CLERK_KEY);
  })

  // --- API ROUTES (JSON - For Web HTMX & Future Mobile App) ---

  /** Get career profile for a player with historical data */
  .get('/api/player/:name', async ({params}) => {
    return await DraftScoutService.getPlayerCareerProfile(params.name);
  })

  /** Expert Accuracy Rankings */
  .get('/api/experts/leaderboard', () => {
    // This will eventually query the expertAccuracyScores table
    return [
      {id: 1, name: 'Daniel Jeremiah', org: 'NFL Network', accuracy: 94.2, grade: 'A+'},
      {id: 2, name: 'Dane Brugler', org: 'The Athletic', accuracy: 91.8, grade: 'A'},
      {id: 3, name: 'Mel Kiper Jr.', org: 'ESPN', accuracy: 78.4, grade: 'B-'},
    ];
  })

  /** Team Draft Success (The 3-Year Lookback) */
  .get('/api/teams/success', ({query}) => {
    // const window = Number(query.window) || 3;
    // Mock data for the "Foundational" build
    return [
      {team: 'DET', retention: 88, value: 92, grade: 'A'},
      {team: 'BAL', retention: 84, value: 89, grade: 'A-'},
      {team: 'KC', retention: 81, value: 85, grade: 'B+'},
    ];
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
    // Reuses the API logic but returns HTML
    return `
      <div class="space-y-4">
        <div class="border-l-4 border-black pl-4 py-2">
          <span class="text-xs font-bold uppercase tracking-widest text-accent">Combine Update</span>
          <h3 class="font-bold text-lg text-black">Lions' core metrics show high retention</h3>
          <p class="text-sm text-muted">Analysis of 2024-2025 draft cycles indicates Detroit leads the league.</p>
        </div>
      </div>
    `;
  });
