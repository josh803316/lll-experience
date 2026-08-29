import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  CANONICAL_MANAGERS,
  managerForSleeperUser,
  SLEEPER_ID_ALIASES,
  UCSB_LEGACY_LEAGUE_ID,
} from '../config/fantasy-managers.js'
import { getDB } from '../db/index.js'
import {
  fantasyDraftPicks,
  fantasyDrafts,
  fantasyLeagues,
  fantasyManagers,
  fantasyMatchups,
  fantasyPlayers,
  fantasyPlayerWeeks,
  fantasyProjections,
  fantasyRosters,
  fantasyTransactions,
} from '../db/schema.js'
import { fetchEspnWeeklyProjections } from './espn-projections.js'
import { type SourceProjRow, scoreStats } from './fantasy-projections.js'
import { FantasyScout } from './fantasy-scout.js'
import { fetchFantasyProsWeeklyProjections } from './fantasypros-projections.js'
import {
  combineFpts,
  type SleeperLeague,
  type SleeperNflPlayer,
  type SleeperUser,
  sleeperClient,
} from './sleeper-client.js'

const MAX_WEEK = 18
const CHUNK = 200

type Db = ReturnType<typeof getDB>

export interface IngestResult {
  leagues: number
  rosters: number
  picks: number
  matchups: number
  playerWeeks: number
  transactions: number
  players: number
  projections: number
  records: number
  seasons: number[]
}

function playerFullName(p: SleeperNflPlayer, playerId: string): string {
  if (p.full_name) {
    return p.full_name
  }
  const joined = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return joined || playerId
}

async function insertChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    if (chunk.length > 0) {
      await write(chunk)
    }
  }
}

async function upsertManagers(db: Db, usersByLeague: SleeperUser[][]): Promise<void> {
  const aliasIds = Object.keys(SLEEPER_ID_ALIASES)
  if (aliasIds.length > 0) {
    await db.delete(fantasyManagers).where(inArray(fantasyManagers.sleeperUserId, aliasIds))
  }
  for (const m of CANONICAL_MANAGERS) {
    await db
      .update(fantasyManagers)
      .set({ slug: `tmp-${m.sleeperUserId}` })
      .where(
        and(eq(fantasyManagers.slug, m.slug), ne(fantasyManagers.sleeperUserId, m.sleeperUserId))
      )
  }

  const seen = new Map<string, { slug: string; displayName: string }>()
  const slugs = new Set<string>()
  for (const m of CANONICAL_MANAGERS) {
    seen.set(m.sleeperUserId, { slug: m.slug, displayName: m.displayName })
    slugs.add(m.slug)
  }
  for (const users of usersByLeague) {
    for (const u of users) {
      if (seen.has(u.user_id) || SLEEPER_ID_ALIASES[u.user_id]) {
        continue
      }
      const ident = managerForSleeperUser(u.user_id, u.display_name || u.username)
      if (slugs.has(ident.slug)) {
        continue
      }
      seen.set(u.user_id, ident)
      slugs.add(ident.slug)
    }
  }
  const rows = [...seen.entries()].map(([sleeperUserId, ident]) => ({
    slug: ident.slug,
    displayName: ident.displayName,
    sleeperUserId,
  }))
  await insertChunks(rows, (chunk) =>
    db
      .insert(fantasyManagers)
      .values(chunk)
      .onConflictDoUpdate({
        target: fantasyManagers.sleeperUserId,
        set: { slug: sql`excluded.slug`, displayName: sql`excluded.display_name` },
      })
  )
}

async function ingestLeague(
  db: Db,
  league: SleeperLeague
): Promise<{
  rosters: number
  picks: number
  matchups: number
  playerWeeks: number
  transactions: number
  users: SleeperUser[]
  playerIds: string[]
  scoring: Record<string, unknown> | null
}> {
  const season = Number(league.season)
  await db
    .insert(fantasyLeagues)
    .values({
      sleeperLeagueId: league.league_id,
      season,
      name: league.name,
      status: league.status,
      previousLeagueId: league.previous_league_id,
      draftId: league.draft_id,
      settings: league.settings ?? {},
      scoringSettings: league.scoring_settings ?? {},
      rosterPositions: league.roster_positions ?? [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: fantasyLeagues.sleeperLeagueId,
      set: {
        season,
        name: league.name,
        status: league.status,
        previousLeagueId: league.previous_league_id,
        draftId: league.draft_id,
        settings: league.settings ?? {},
        scoringSettings: league.scoring_settings ?? {},
        rosterPositions: league.roster_positions ?? [],
        updatedAt: new Date(),
      },
    })

  const [users, rosters, drafts] = await Promise.all([
    sleeperClient.getUsers(league.league_id),
    sleeperClient.getRosters(league.league_id),
    sleeperClient.getDrafts(league.league_id),
  ])

  const rosterRows = rosters.map((r) => {
    const owner = users.find((u) => u.user_id === r.owner_id)
    return {
      sleeperLeagueId: league.league_id,
      rosterId: r.roster_id,
      sleeperUserId: r.owner_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || null,
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      fpts: combineFpts(r.settings?.fpts, r.settings?.fpts_decimal),
      fptsAgainst: combineFpts(r.settings?.fpts_against, r.settings?.fpts_against_decimal),
      waiverBudgetUsed: r.settings?.waiver_budget_used ?? 0,
      waiverPosition: r.settings?.waiver_position ?? null,
    }
  })
  await insertChunks(rosterRows, (chunk) =>
    db
      .insert(fantasyRosters)
      .values(chunk)
      .onConflictDoUpdate({
        target: [fantasyRosters.sleeperLeagueId, fantasyRosters.rosterId],
        set: {
          sleeperUserId: sql`excluded.sleeper_user_id`,
          teamName: sql`excluded.team_name`,
          wins: sql`excluded.wins`,
          losses: sql`excluded.losses`,
          ties: sql`excluded.ties`,
          fpts: sql`excluded.fpts`,
          fptsAgainst: sql`excluded.fpts_against`,
          waiverBudgetUsed: sql`excluded.waiver_budget_used`,
          waiverPosition: sql`excluded.waiver_position`,
        },
      })
  )

  let pickCount = 0
  const playerIds = new Set<string>()
  for (const draft of drafts) {
    await db
      .insert(fantasyDrafts)
      .values({
        draftId: draft.draft_id,
        sleeperLeagueId: league.league_id,
        type: draft.type,
        status: draft.status,
        budget: draft.settings?.budget ?? null,
        rounds: draft.settings?.rounds ?? null,
        settings: draft.settings ?? {},
      })
      .onConflictDoUpdate({
        target: fantasyDrafts.draftId,
        set: {
          type: draft.type,
          status: draft.status,
          budget: draft.settings?.budget ?? null,
          rounds: draft.settings?.rounds ?? null,
          settings: draft.settings ?? {},
        },
      })

    const picks = await sleeperClient.getDraftPicks(draft.draft_id)
    pickCount += picks.length
    for (const pick of picks) {
      if (pick.player_id) {
        playerIds.add(pick.player_id)
      }
    }
    const pickRows = picks.map((pick) => ({
      draftId: pick.draft_id,
      pickNo: pick.pick_no,
      round: pick.round,
      rosterId: Number(pick.roster_id),
      sleeperUserId: pick.picked_by || null,
      playerId: pick.player_id,
      amount: Number(pick.metadata?.amount ?? 0) || 0,
      position: pick.metadata?.position ?? null,
      isKeeper: Boolean(pick.is_keeper),
    }))
    await insertChunks(pickRows, (chunk) =>
      db
        .insert(fantasyDraftPicks)
        .values(chunk)
        .onConflictDoUpdate({
          target: [fantasyDraftPicks.draftId, fantasyDraftPicks.pickNo],
          set: {
            round: sql`excluded.round`,
            rosterId: sql`excluded.roster_id`,
            sleeperUserId: sql`excluded.sleeper_user_id`,
            playerId: sql`excluded.player_id`,
            amount: sql`excluded.amount`,
            position: sql`excluded.position`,
            isKeeper: sql`excluded.is_keeper`,
          },
        })
    )
  }

  const matchupRows: (typeof fantasyMatchups.$inferInsert)[] = []
  const playerWeekRows: (typeof fantasyPlayerWeeks.$inferInsert)[] = []
  const txRows: (typeof fantasyTransactions.$inferInsert)[] = []

  for (let week = 0; week <= MAX_WEEK; week++) {
    const [matchups, txs] = await Promise.all([
      week === 0 ? Promise.resolve([]) : sleeperClient.getMatchups(league.league_id, week),
      sleeperClient.getTransactions(league.league_id, week),
    ])
    for (const m of matchups) {
      matchupRows.push({
        sleeperLeagueId: league.league_id,
        week,
        rosterId: m.roster_id,
        matchupId: m.matchup_id,
        points: m.custom_points ?? m.points ?? 0,
        starters: m.starters ?? [],
      })
      for (const [playerId, pointsVal] of Object.entries(m.players_points ?? {})) {
        playerWeekRows.push({
          sleeperLeagueId: league.league_id,
          week,
          rosterId: m.roster_id,
          playerId,
          points: typeof pointsVal === 'number' ? pointsVal : Number(pointsVal) || 0,
        })
      }
    }
    for (const tx of txs) {
      txRows.push({
        transactionId: tx.transaction_id,
        sleeperLeagueId: league.league_id,
        week: tx.leg ?? week,
        type: tx.type,
        status: tx.status,
        rosterIds: tx.roster_ids ?? [],
        adds: tx.adds,
        drops: tx.drops,
        waiverBid: tx.settings?.waiver_bid ?? null,
        createdAtMs: tx.created ?? null,
      })
    }
  }

  await insertChunks(matchupRows, (chunk) =>
    db
      .insert(fantasyMatchups)
      .values(chunk)
      .onConflictDoUpdate({
        target: [fantasyMatchups.sleeperLeagueId, fantasyMatchups.week, fantasyMatchups.rosterId],
        set: {
          matchupId: sql`excluded.matchup_id`,
          points: sql`excluded.points`,
          starters: sql`excluded.starters`,
        },
      })
  )
  await insertChunks(playerWeekRows, (chunk) =>
    db
      .insert(fantasyPlayerWeeks)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          fantasyPlayerWeeks.sleeperLeagueId,
          fantasyPlayerWeeks.week,
          fantasyPlayerWeeks.rosterId,
          fantasyPlayerWeeks.playerId,
        ],
        set: { points: sql`excluded.points` },
      })
  )
  await insertChunks(txRows, (chunk) =>
    db
      .insert(fantasyTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: fantasyTransactions.transactionId,
        set: {
          week: sql`excluded.week`,
          type: sql`excluded.type`,
          status: sql`excluded.status`,
          rosterIds: sql`excluded.roster_ids`,
          adds: sql`excluded.adds`,
          drops: sql`excluded.drops`,
          waiverBid: sql`excluded.waiver_bid`,
          createdAtMs: sql`excluded.created_at_ms`,
        },
      })
  )

  return {
    rosters: rosters.length,
    picks: pickCount,
    matchups: matchupRows.length,
    playerWeeks: playerWeekRows.length,
    transactions: txRows.length,
    users,
    playerIds: [...playerIds],
    scoring: league.scoring_settings ?? null,
  }
}

async function refreshPlayers(db: Db): Promise<number> {
  const all = await sleeperClient.getPlayers()
  const rows = Object.entries(all).map(([id, p]) => ({
    playerId: p.player_id || id,
    fullName: playerFullName(p, id),
    position: p.position ?? null,
    team: p.team ?? null,
    fantasyPositions: p.fantasy_positions ?? null,
    updatedAt: new Date(),
  }))
  await insertChunks(rows, (chunk) =>
    db
      .insert(fantasyPlayers)
      .values(chunk)
      .onConflictDoUpdate({
        target: fantasyPlayers.playerId,
        set: {
          fullName: sql`excluded.full_name`,
          position: sql`excluded.position`,
          team: sql`excluded.team`,
          fantasyPositions: sql`excluded.fantasy_positions`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  )
  return rows.length
}

async function poolMap<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

async function ingestSeasonProjections(
  db: Db,
  season: number,
  playerIds: string[],
  scoring: Record<string, unknown> | null
): Promise<number> {
  if (playerIds.length === 0) {
    return 0
  }
  const counts: number[] = []
  await poolMap(playerIds, 8, async (playerId) => {
    const weeks = await sleeperClient.getPlayerWeeklyProjections(playerId, season)
    const rows = weeks
      .filter((w) => w.stats && (w.category == null || w.category === 'proj') && w.week)
      .map((w) => ({
        season,
        week: w.week,
        playerId,
        source: (w.company || 'rotowire').toLowerCase(),
        opponent: w.opponent ?? null,
        stats: w.stats as Record<string, number>,
        pts: scoreStats(scoring, w.stats),
        updatedAt: new Date(),
      }))
    if (rows.length === 0) {
      counts.push(0)
      return
    }
    counts.push(rows.length)
    await insertChunks(rows, (chunk) =>
      db
        .insert(fantasyProjections)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            fantasyProjections.season,
            fantasyProjections.week,
            fantasyProjections.playerId,
            fantasyProjections.source,
          ],
          set: {
            opponent: sql`excluded.opponent`,
            stats: sql`excluded.stats`,
            pts: sql`excluded.pts`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
    )
  })
  return counts.reduce((s, c) => s + c, 0)
}

async function insertProjectionRows(db: Db, rows: SourceProjRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0
  }
  const uniq = new Map<string, SourceProjRow>()
  for (const r of rows) {
    uniq.set(`${r.season}|${r.week}|${r.playerId}|${r.source}`, r)
  }
  const withTs = [...uniq.values()].map((r) => ({ ...r, updatedAt: new Date() }))
  await insertChunks(withTs, (chunk) =>
    db
      .insert(fantasyProjections)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          fantasyProjections.season,
          fantasyProjections.week,
          fantasyProjections.playerId,
          fantasyProjections.source,
        ],
        set: {
          opponent: sql`excluded.opponent`,
          stats: sql`excluded.stats`,
          pts: sql`excluded.pts`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  )
  return rows.length
}

export async function ingestSleeperLeague(
  startLeagueId: string = process.env.SLEEPER_LEAGUE_ID || UCSB_LEGACY_LEAGUE_ID,
  opts: { refreshPlayers?: boolean; refreshProjections?: boolean } = {}
): Promise<IngestResult> {
  const db = getDB()
  const seasons: number[] = []
  const usersByLeague: SleeperUser[][] = []
  const totals: IngestResult = {
    leagues: 0,
    rosters: 0,
    picks: 0,
    matchups: 0,
    playerWeeks: 0,
    transactions: 0,
    players: 0,
    projections: 0,
    records: 0,
    seasons,
  }
  const projectionJobs: {
    season: number
    playerIds: string[]
    scoring: Record<string, unknown> | null
    status: string
  }[] = []

  let leagueId: string | null = startLeagueId
  const seen = new Set<string>()
  while (leagueId && !seen.has(leagueId)) {
    seen.add(leagueId)
    const league = await sleeperClient.getLeague(leagueId)
    if (!league) {
      break
    }
    console.log(
      `[sleeper-ingest] ${league.season} ${league.name} ${league.league_id} (${league.status})`
    )
    const result = await ingestLeague(db, league)
    usersByLeague.push(result.users)
    seasons.push(Number(league.season))
    totals.leagues += 1
    totals.rosters += result.rosters
    totals.picks += result.picks
    totals.matchups += result.matchups
    totals.playerWeeks += result.playerWeeks
    totals.transactions += result.transactions
    if (league.status !== 'complete') {
      projectionJobs.push({
        season: Number(league.season),
        playerIds: result.playerIds,
        scoring: result.scoring,
        status: league.status,
      })
    }
    leagueId = league.previous_league_id
  }

  await upsertManagers(db, usersByLeague)

  if (opts.refreshPlayers !== false) {
    console.log('[sleeper-ingest] refreshing NFL player cache…')
    totals.players = await refreshPlayers(db)
  }

  if (opts.refreshProjections !== false) {
    for (const job of projectionJobs) {
      console.log(
        `[sleeper-ingest] ${job.season} weekly projections for ${job.playerIds.length} drafted players…`
      )
      const sleeperIds = new Set(job.playerIds)
      totals.projections += await ingestSeasonProjections(
        db,
        job.season,
        job.playerIds,
        job.scoring
      )
      try {
        const espn = await fetchEspnWeeklyProjections(job.season, job.scoring, sleeperIds)
        console.log(`[sleeper-ingest] ${job.season} ESPN weekly rows ${espn.length}`)
        totals.projections += await insertProjectionRows(db, espn)
      } catch (err) {
        console.log(
          '[sleeper-ingest] ESPN projections failed',
          err instanceof Error ? err.message : err
        )
      }
      try {
        const fp = await fetchFantasyProsWeeklyProjections(job.season, job.scoring, sleeperIds)
        console.log(`[sleeper-ingest] ${job.season} FantasyPros weekly rows ${fp.length}`)
        totals.projections += await insertProjectionRows(db, fp)
      } catch (err) {
        console.log(
          '[sleeper-ingest] FantasyPros projections failed',
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  totals.records = await FantasyScout.refreshRecords()
  seasons.sort((a, b) => a - b)
  return totals
}
