import {Elysia} from 'elysia';
import {swagger} from '@elysiajs/swagger';
import {cors} from '@elysiajs/cors';
import {clerkPlugin} from 'elysia-clerk';

import {draftController} from './controllers/draft.controller.js';
import {adminController} from './controllers/admin.controller.js';
import {chatController} from './controllers/chat.controller.js';
import {tickerController} from './controllers/ticker.controller.js';
import {analyzerController} from './controllers/analyzer.controller.js';
import {authGuard} from './guards/auth-guard.js';
import {useLogger} from './middleware/logger.middleware.js';
import {isProtectedRoute} from './config/route-protection.js';
import {getDB} from './db/index.js';
import {apps} from './db/schema.js';
import {eq} from 'drizzle-orm';
import {landingPage, appsPage} from './views/templates.js';
import {CURRENT_DRAFT_YEAR} from './config/draft-data.js';
import {runDraftAutoTick} from './services/draft-auto.js';
import {generatePendingPickWriteups} from './services/pick-writeup-cron.js';

const PORT = Number(process.env.PORT ?? 3000);
const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

/** Drizzle often wraps the driver error; include `cause` so logs show the real PG reason. */
const getErrorMessage = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current != null; depth++) {
    if (current instanceof Error) {
      if (current.message) {
        parts.push(current.message);
      }
      current = (current as Error & {cause?: unknown}).cause;
    } else if (typeof current === 'object' && current !== null) {
      const o = current as {message?: string; code?: string; detail?: string; cause?: unknown};
      const bit = [o.code, o.message, o.detail].filter(Boolean).join(' — ');
      if (bit) {
        parts.push(bit);
      }
      const next = o.cause;
      if (next === undefined) {
        break;
      }
      current = next;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const merged = parts.filter(Boolean).join(' | ');
  return merged || String(error);
};

const baseApp = new Elysia().use(swagger({path: '/docs'})).use(cors());

useLogger(baseApp);

const app = baseApp
  .use(
    clerkPlugin({
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    } as any),
  )

  .onBeforeHandle((ctx) => {
    const path = new URL(ctx.request.url).pathname;
    if (isProtectedRoute(path)) {
      return authGuard(ctx);
    }
  })

  .onRequest(({request}) => {
    console.log(`[REQUEST] ${request.method} ${new URL(request.url).pathname}`);
  })

  .get('/health', () => ({status: 'ok'}))

  .get('/', (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html';
    return landingPage(CLERK_KEY);
  })

  .get('/apps', async (ctx) => {
    const db = getDB();
    const activeApps = await db.select().from(apps).where(eq(apps.isActive, true));
    ctx.set.headers['Content-Type'] = 'text/html';
    return appsPage(activeApps, CLERK_KEY);
  })

  .get('/nfl-draft', ({redirect}) => redirect('/draft'))

  // Vercel Cron: sync official draft picks from ESPN + auto-start draft when countdown expires
  .get('/api/cron/sync-draft-picks', async ({request, set}) => {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      set.status = 401;
      return {error: 'Unauthorized'};
    }
    try {
      await runDraftAutoTick(CURRENT_DRAFT_YEAR);
      return {ok: true, year: CURRENT_DRAFT_YEAR};
    } catch (err: any) {
      console.error('[CRON] sync-draft-picks error:', err?.message ?? err);
      set.status = 500;
      return {error: err?.message ?? 'Unknown error'};
    }
  })

  // Cron: generate cached LLM writeups for picks lacking them.
  // Bounded — processes up to 3 picks per call. Point a frequent ping at this
  // during the draft (every 60–90s) to keep modals pre-populated.
  .get('/api/cron/generate-writeups', async ({request, set, query}) => {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      set.status = 401;
      return {error: 'Unauthorized'};
    }
    const batch = Math.min(Math.max(Number(query?.batch) || 3, 1), 5);
    const force = query?.force === '1' || query?.force === 'true';
    try {
      const result = await generatePendingPickWriteups(CURRENT_DRAFT_YEAR, batch, {force});
      return {ok: true, year: CURRENT_DRAFT_YEAR, force, ...result};
    } catch (err: any) {
      console.error('[CRON] generate-writeups error:', err?.message ?? err);
      set.status = 500;
      return {error: err?.message ?? 'Unknown error'};
    }
  })

  .use(draftController)
  .use(chatController)
  .use(tickerController)
  .use(adminController)
  .use(analyzerController)

  .onError(({error, code, request}) => {
    const url = new URL(request.url);
    const msg = getErrorMessage(error);
    if (String(code) === 'NOT_FOUND') {
      console.log(`[404] ${request.method} ${url.pathname}`);
      return new Response(`<html><body><h1>404 — Not Found</h1><a href="/">Go home</a></body></html>`, {
        status: 404,
        headers: {'Content-Type': 'text/html'},
      });
    }
    console.error(`[ERROR] ${request.method} ${url.pathname} - ${code} - ${msg}`);
  });

// Only start a local HTTP server when not running on Vercel.
if (process.env.VERCEL !== '1') {
  app.listen(PORT);
  console.log(`LLL Experience running at http://localhost:${PORT}`);
  const {startDraftAutoPolling} = await import('./services/draft-auto.js');
  startDraftAutoPolling(); // local only — on Vercel, the cron at /api/cron/sync-draft-picks handles this
}

export type App = typeof app;
export default app;
