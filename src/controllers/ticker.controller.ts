import {Elysia} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {getDB} from '../db/index.js';
import {apps} from '../db/schema.js';
import {eq} from 'drizzle-orm';
import {buildTickerData, getPickDetail} from '../services/ticker.js';
import {chatTickerFragment, pickModalFragment, pickModalEmptyFragment} from '../views/chat-templates.js';

function parseYear(param: string | undefined): number | null {
  if (param == null) {
    return null;
  }
  const y = Number(param);
  return Number.isInteger(y) && y >= 2020 && y <= 2040 ? y : null;
}

async function getDraftApp() {
  const db = getDB();
  const result = await db.select().from(apps).where(eq(apps.slug, 'nfl-draft')).limit(1);
  return result[0] ?? null;
}

export const tickerController = new Elysia({prefix: '/draft'})
  .onBeforeHandle((ctx) => authGuard(ctx))

  // GET /draft/:year/ticker — site-wide draft ticker fragment
  .get('/:year/ticker', async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return '';
    }

    const app = await getDraftApp();
    if (!app) {
      return '';
    }

    const ticker = await buildTickerData(app.id, year);
    const requestedRound = Number(ctx.query?.round) || ticker.currentRound;
    ctx.set.headers['Content-Type'] = 'text/html';
    return chatTickerFragment(ticker.picks, ticker.draftLive || ticker.mockActive, requestedRound);
  })

  // GET /draft/:year/pick/:n — modal HTML for a single pick
  .get('/:year/pick/:n', async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    const pickNum = Number(ctx.params?.n);
    if (year == null || !Number.isInteger(pickNum) || pickNum < 1 || pickNum > 300) {
      ctx.set.status = 404;
      return '';
    }

    const detail = await getPickDetail(year, pickNum);
    ctx.set.headers['Content-Type'] = 'text/html';
    if (!detail) {
      return pickModalEmptyFragment(pickNum, year);
    }
    return pickModalFragment(detail);
  });
