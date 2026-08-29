import { Elysia } from 'elysia'
import { authGuard } from '../guards/auth-guard.js'
import { FantasyScout } from '../services/fantasy-scout.js'
import {
  fantasyBargainsPage,
  fantasyDashboard,
  fantasyDraftPage,
  fantasyEvolutionPage,
  fantasyManagerNotFound,
  fantasyManagerPage,
  fantasyPlayerCard,
  fantasyPlayerNotFound,
  fantasyPlayerPage,
  fantasyRankingsPage,
  fantasySeasonPage,
  fantasyTimelineOverviewPage,
  fantasyTimelinePage,
  fantasyWirePage,
} from '../views/fantasy-templates.js'

const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY

export const fantasyController = new Elysia({ prefix: '/fantasy' })
  .onBeforeHandle((ctx) => authGuard(ctx))
  .get('/', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const { seasons, gms } = await FantasyScout.allTime()
    return fantasyDashboard(gms, seasons, CLERK_KEY)
  })
  .get('/season/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const { summary, standings, heatmap } = await FantasyScout.season(year)
    return fantasySeasonPage(summary, standings, seasons, heatmap, CLERK_KEY)
  })
  .get('/draft/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const { summary, picks } = await FantasyScout.draft(year)
    return fantasyDraftPage(summary, picks, seasons, CLERK_KEY)
  })
  .get('/wire/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const { summary, rows, missed } = await FantasyScout.wire(year)
    const showMissed = ctx.query.missed === '1' || ctx.query.missed === 'true'
    return fantasyWirePage(summary, rows, missed, seasons, showMissed, CLERK_KEY)
  })
  .get('/bargains', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const { seasons, rows, byGm } = await FantasyScout.bargains()
    return fantasyBargainsPage(byGm, rows, seasons, CLERK_KEY)
  })
  .get('/rankings', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const { seasons, gms } = await FantasyScout.rankings()
    const meta = await FantasyScout.listSeasons()
    return fantasyRankingsPage(seasons, gms, meta, CLERK_KEY)
  })
  .get('/evolution', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const seasonRaw = Number(ctx.query.season)
    const season = Number.isFinite(seasonRaw) && seasonRaw > 0 ? seasonRaw : undefined
    const seasons = await FantasyScout.listSeasons()
    const data = await FantasyScout.evolution(season)
    return fantasyEvolutionPage(data, seasons, CLERK_KEY)
  })
  .get('/manager/:slug/timeline', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    if (ctx.query.season === 'all') {
      const allData = await FantasyScout.timelines(ctx.params.slug)
      if (allData.length === 0) {
        return fantasyManagerNotFound(ctx.params.slug, CLERK_KEY)
      }
      const seasons = await FantasyScout.listSeasons()
      return fantasyTimelineOverviewPage(allData, seasons, CLERK_KEY)
    }
    const seasonRaw = Number(ctx.query.season)
    const season = Number.isFinite(seasonRaw) && seasonRaw > 0 ? seasonRaw : undefined
    const data = await FantasyScout.timeline(ctx.params.slug, season)
    if (!data) {
      return fantasyManagerNotFound(ctx.params.slug, CLERK_KEY)
    }
    const seasons = await FantasyScout.listSeasons()
    return fantasyTimelinePage(data, seasons, CLERK_KEY)
  })
  .get('/manager/:slug', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const seasons = await FantasyScout.listSeasons()
    const { gm, draftPicks, wire, missed } = await FantasyScout.manager(ctx.params.slug)
    if (!gm) {
      return fantasyManagerNotFound(ctx.params.slug, CLERK_KEY)
    }
    const showMissed = ctx.query.missed === '1' || ctx.query.missed === 'true'
    return fantasyManagerPage(gm, draftPicks, wire, missed, seasons, showMissed, CLERK_KEY)
  })
  .get('/player/:id/card', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const seasonRaw = Number(ctx.query.season)
    const season = Number.isFinite(seasonRaw) && seasonRaw > 0 ? seasonRaw : undefined
    const data = await FantasyScout.playerCard(ctx.params.id, season)
    if (!data) {
      ctx.set.status = 404
      return `<div class="lll-player-card"><p class="text-muted text-sm">No player.</p></div>`
    }
    return fantasyPlayerCard(data)
  })
  .get('/player/:id', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const seasons = await FantasyScout.listSeasons()
    const data = await FantasyScout.player(ctx.params.id)
    if (!data) {
      return fantasyPlayerNotFound(ctx.params.id, CLERK_KEY)
    }
    return fantasyPlayerPage(data, seasons, CLERK_KEY)
  })
