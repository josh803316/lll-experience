import { Elysia } from 'elysia'
import { authGuard } from '../guards/auth-guard.js'
import { CommissionerRanking } from '../services/commissioner-ranking.js'
import { FantasyScout } from '../services/fantasy-scout.js'
import {
  fantasyBargainsPage,
  fantasyCommissionerPage,
  fantasyDashboard,
  fantasyDraftPage,
  fantasyEvolutionPage,
  fantasyLiveScoringPanel,
  fantasyManagerNotFound,
  fantasyManagerPage,
  fantasyPlayerCard,
  fantasyPlayerNotFound,
  fantasyPlayerPage,
  fantasyRankingsPage,
  fantasyRecordsPage,
  fantasyReportCardPage,
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
    const data = await FantasyScout.allTime()
    return fantasyDashboard(data, CLERK_KEY)
  })
  .post('/live-sync', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    try {
      return fantasyLiveScoringPanel(await FantasyScout.liveScoring())
    } catch (error) {
      console.error('[FANTASY] live sync error:', error instanceof Error ? error.message : error)
      return fantasyLiveScoringPanel(
        undefined,
        'Sleeper did not return live scores. Try Refresh scores again.'
      )
    }
  })
  .get('/season/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const { summary, standings, heatmap, extras } = await FantasyScout.season(year)
    return fantasySeasonPage(summary, standings, seasons, heatmap, CLERK_KEY, extras)
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
  .get('/records', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const data = await FantasyScout.records()
    const seasons = await FantasyScout.listSeasons()
    return fantasyRecordsPage(data, seasons, CLERK_KEY)
  })
  .get('/commissioner/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const data = await CommissionerRanking.forSeason(year)
    if (!data) {
      return fantasyCommissionerPage(
        {
          season: year,
          commissionerName: 'Tim',
          label: 'Commissioner rankings',
          importedAt: new Date().toISOString(),
          rankedPlayerCount: 0,
          replacementPremium: {},
          gms: [],
        },
        seasons,
        CLERK_KEY
      )
    }
    return fantasyCommissionerPage(data, seasons, CLERK_KEY)
  })
  .get('/reportcard/:year', async (ctx) => {
    ctx.set.headers['Content-Type'] = 'text/html'
    const year = Number(ctx.params.year)
    const seasons = await FantasyScout.listSeasons()
    const data =
      (await FantasyScout.reportCard(year)) ??
      ({
        season: year,
        projectionsLoaded: 0,
        baselineSource: 'live' as const,
        snappedAt: null,
        seasonComplete: false,
        cortanhaGrade: '—',
        meanAbsFinishError: 0,
        withinTwoSpots: 0,
        teamCount: 0,
        beatFinishCount: 0,
        beatGradeCount: 0,
        rows: [],
      } as const)
    return fantasyReportCardPage(data, seasons, CLERK_KEY)
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
    const seasonRaw = Number(ctx.query.season)
    const season = Number.isFinite(seasonRaw) && seasonRaw > 0 ? seasonRaw : undefined
    const seasons = await FantasyScout.listSeasons()
    const {
      gm,
      season: seasonRow,
      team,
      draftPicks,
      wire,
      missed,
      extras,
    } = await FantasyScout.manager(ctx.params.slug, season)
    if (!gm) {
      return fantasyManagerNotFound(ctx.params.slug, CLERK_KEY)
    }
    const showMissed = ctx.query.missed === '1' || ctx.query.missed === 'true'
    return fantasyManagerPage(
      gm,
      team,
      draftPicks,
      wire,
      missed,
      seasons,
      showMissed,
      CLERK_KEY,
      seasonRow,
      extras
    )
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
