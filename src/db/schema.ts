import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const apps = pgTable('apps', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const draftPicks = pgTable('draft_picks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  pickNumber: integer('pick_number').notNull(),
  teamName: text('team_name'),
  playerName: text('player_name'),
  position: text('position'),
  doubleScorePick: boolean('double_score_pick').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const draftablePlayers = pgTable('draftable_players', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  rank: integer('rank').notNull(),
  playerName: text('player_name').notNull(),
  school: text('school').notNull(),
  position: text('position').notNull(),
})

export const draftSettings = pgTable('draft_settings', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  draftStartedAt: timestamp('draft_started_at'),
})

/** Persisted mock simulation state so reload/restart keeps current reveal progress. */
export const draftMockState = pgTable('draft_mock_state', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  revealedCount: integer('revealed_count').notNull().default(0),
  nextRevealAtMs: bigint('next_reveal_at_ms', { mode: 'number' }).notNull(),
  picksJson: jsonb('picks_json')
    .$type<
      Array<{ pickNumber: number; playerName: string; teamName: string; position: string | null }>
    >()
    .notNull(),
})

export const officialDraftResults = pgTable(
  'official_draft_results',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id')
      .references(() => apps.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    round: integer('round'),
    pickNumber: integer('pick_number').notNull(),
    playerName: text('player_name'),
    teamName: text('team_name'),
    position: text('position'),
    college: text('college'),
    contractOutcome: text('contract_outcome'), // TOP_OF_MARKET, MARKET_OR_ABOVE, etc.
  },
  (t) => ({
    idxOfficialDraftResultsYear: index('idx_official_draft_results_year').on(t.year),
    idxOfficialDraftResultsAppYearPick: index('idx_official_draft_results_app_year_pick').on(
      t.appId,
      t.year,
      t.pickNumber
    ),
    idxOfficialDraftResultsYearTeam: index('idx_official_draft_results_year_team').on(
      t.year,
      t.teamName
    ),
    idxOfficialDraftResultsPlayer: index('idx_official_draft_results_player').on(t.playerName),
  })
)

/**
 * Cached LLM-generated analysis for a draft pick.
 * Generated on demand by the writeups cron after a pick is announced.
 */
export const pickWriteups = pgTable(
  'pick_writeups',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id')
      .references(() => apps.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    pickNumber: integer('pick_number').notNull(),
    playerName: text('player_name'),
    writeup: text('writeup'),
    sources: jsonb('sources'),
    gradeLetter: text('grade_letter'),
    gradeNumeric: text('grade_numeric'),
    gradeSourceCount: integer('grade_source_count'),
    gradeBreakdown: jsonb('grade_breakdown'),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqApp_year_pick: unique().on(t.appId, t.year, t.pickNumber),
  })
)

export const draftHistoricalWinners = pgTable('draft_historical_winners', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  rank: integer('rank').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  score: integer('score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── Chat ────────────────────────────────────────────────────────────────────

export const chatGroups = pgTable('chat_groups', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  name: text('name').notNull(),
  createdBy: integer('created_by')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const chatGroupMembers = pgTable('chat_group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => chatGroups.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => chatGroups.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const chatMessageReactions = pgTable('chat_message_reactions', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .references(() => chatMessages.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── Draft Analyzer ──────────────────────────────────────────────────────────

export const experts = pgTable('experts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  organization: text('organization'),
  photoUrl: text('photo_url'),
  bio: text('bio'),
})

export const expertRankings = pgTable(
  'expert_rankings',
  {
    id: serial('id').primaryKey(),
    expertId: integer('expert_id')
      .references(() => experts.id, { onDelete: 'cascade' })
      .notNull(),
    year: integer('year').notNull(),
    playerName: text('player_name').notNull(),
    rank: integer('rank'),
    grade: text('grade'),
    commentary: text('commentary'),
  },
  (t) => ({
    idxExpertRankingsYear: index('idx_expert_rankings_year').on(t.year),
    idxExpertRankingsExpertYear: index('idx_expert_rankings_expert_year').on(t.expertId, t.year),
    idxExpertRankingsPlayer: index('idx_expert_rankings_player').on(t.playerName),
  })
)

export const teamDraftAnalysis = pgTable('team_draft_analysis', {
  id: serial('id').primaryKey(),
  teamName: text('team_name').notNull(),
  year: integer('year').notNull(),
  retentionScore: integer('retention_score'), // 0-100 (percentage of picks still on roster)
  performanceScore: integer('performance_score'), // 0-100 (aggregated performance vs expectation)
  valueScore: integer('value_score'), // 0-100 (surplus value vs draft slot)
  overallGrade: text('overall_grade'),
})

export const expertTeamGrades = pgTable('expert_team_grades', {
  id: serial('id').primaryKey(),
  expertId: integer('expert_id')
    .references(() => experts.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  teamName: text('team_name').notNull(),
  grade: text('grade').notNull(),
  commentary: text('commentary'),
})

export const playerPerformanceRatings = pgTable(
  'player_performance_ratings',
  {
    id: serial('id').primaryKey(),
    playerName: text('player_name').notNull(),
    draftYear: integer('draft_year').notNull(),
    evaluationYear: integer('evaluation_year').notNull(), // Year the rating was given
    rating: doublePrecision('rating').notNull(), // 0-10 scale
    isCareerRating: boolean('is_career_rating').default(false).notNull(),
    justification: text('justification'),
    metadata: jsonb('metadata'), // Stats, snaps, etc.
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    idxPlayerPerformanceCareerPlayer: index('idx_player_performance_career_player').on(
      t.isCareerRating,
      t.playerName
    ),
    idxPlayerPerformancePlayerEvalYear: index('idx_player_performance_player_eval_year').on(
      t.playerName,
      t.evaluationYear
    ),
  })
)

export const expertAccuracyScores = pgTable('expert_accuracy_scores', {
  id: serial('id').primaryKey(),
  expertId: integer('expert_id')
    .references(() => experts.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  accuracyDelta: integer('accuracy_delta'), // Difference between predicted and LLL actual
  rankingSuccess: integer('ranking_success'), // Percentile accuracy
  gradeSuccess: integer('grade_success'),
})

export const draftTimelineEvents = pgTable('draft_timeline_events', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  eventDate: timestamp('event_date').notNull(),
  type: text('type'), // 'combine', 'mini-camp', 'pre-season', 'news'
  title: text('title').notNull(),
  content: text('content'),
  playerName: text('player_name'),
  teamName: text('team_name'),
})

export const pffPlayerStats = pgTable(
  'pff_player_stats',
  {
    id: serial('id').primaryKey(),
    playerName: text('player_name').notNull(),
    pffId: integer('pff_id'),
    season: integer('season').notNull(),
    position: text('position'),
    teamAbbr: text('team_abbr'),
    category: text('category').notNull(), // 'passing', 'rushing', 'receiving', 'defense', 'blocking'
    grade: doublePrecision('grade'), // Overall PFF grade for that category
    stats: jsonb('stats').notNull(), // All other metrics from the CSV
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqPlayerSeasonCat: unique().on(t.playerName, t.season, t.category),
  })
)

/**
 * Per-player career PFF summary, sourced from Tim's pff_summary_2016_2025.xlsx
 * Column O ("3 good years"). The source formula deliberately drops the top
 * year to suppress small-sample anomalies (e.g. backup posting 90+ in 4 games):
 *   - 4+ seasons: avg of 2nd, 3rd, 4th best
 *   - 3 seasons : avg of 2nd, 3rd best
 *   - 2 seasons : avg of 1st, 2nd best
 *   - 1 season  : that season's grade
 * Ingested as source of truth — re-run when Tim updates the spreadsheet.
 */
export const pffCareerSummary = pgTable(
  'pff_career_summary',
  {
    id: serial('id').primaryKey(),
    playerName: text('player_name').notNull(),
    pffPlayerId: integer('pff_player_id'),
    rawPosition: text('raw_position'), // e.g. 'C', 'CB', 'LT'
    franchisePosition: text('franchise_position').notNull(), // 'OL', 'CB', 'OL'
    side: text('side').notNull(), // 'offense' | 'defense' | 'special'
    threeGoodYears: doublePrecision('three_good_years').notNull(), // 0-100 PFF grade
    seasonsCount: integer('seasons_count').default(0).notNull(), // # of non-null season cells (D-M)
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqPffPlayerSide: unique().on(t.playerName, t.side),
    idxPffCareerFranchisePos: index('idx_pff_career_franchise_pos').on(t.franchisePosition),
  })
)

/**
 * Per-player best-contract market signal, sourced from Tim's
 * "Best Contract Once" column (only the row representing the player's
 * single best percentile is non-blank). Lower percentile = better contract
 * (top-of-market = ~0%, bottom = ~100%). Ranked within franchise position
 * × year_signed cohort.
 */
export const playerContractSignal = pgTable(
  'player_contract_signal',
  {
    id: serial('id').primaryKey(),
    playerName: text('player_name').notNull().unique(),
    franchisePosition: text('franchise_position').notNull(),
    bestContractPercentile: doublePrecision('best_contract_percentile').notNull(), // 0-1 (lower=better)
    bestApyCapPct: doublePrecision('best_apy_cap_pct'), // 0-1, dollar value of the best contract
    bestYearSigned: integer('best_year_signed').notNull(),
    qualifiesNonRookie: boolean('qualifies_non_rookie').default(false).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    idxContractSignalFranchisePos: index('idx_contract_signal_franchise_pos').on(
      t.franchisePosition
    ),
  })
)

/**
 * Per-contract dollar data for drafted players. Populated additively
 * alongside official_draft_results.contractOutcome (which keeps the
 * categorical 7-bucket signal). Lets us weight by APY-as-cap-%, total
 * value, guarantees, etc., when we choose to swap the rating method.
 */
export const playerContracts = pgTable(
  'player_contracts',
  {
    id: serial('id').primaryKey(),
    playerName: text('player_name').notNull(),
    teamAbbr: text('team_abbr'), // canonical (e.g. 'SF'); null if unmapped
    position: text('position'),
    yearSigned: integer('year_signed').notNull(),
    yearsLength: integer('years_length'), // contract length in years
    valueTotal: doublePrecision('value_total'), // total $ over the deal
    apy: doublePrecision('apy'), // annual avg $
    guaranteed: doublePrecision('guaranteed'), // initial/practical guarantee $
    apyCapPct: doublePrecision('apy_cap_pct'), // APY as % of league cap that year (0-1)
    isSecondContract: boolean('is_second_contract').default(false).notNull(),
    draftYear: integer('draft_year'),
    draftOverall: integer('draft_overall'),
    source: text('source').notNull(), // 'nflverse' | 'spotrac'
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqPlayerYearSource: unique().on(t.playerName, t.yearSigned, t.source),
  })
)

// ── Analyzer result cache ───────────────────────────────────────────────────
// Computed leaderboard payloads stored as JSON so routes serve a single indexed
// read instead of re-running the heavy expert leaderboards. Invalidated by
// data_version (bumped by DB triggers whenever a source table changes), so the
// cache is correct without any TTL guessing. See services/analyzer-cache.ts.
export const analyzerCache = pgTable('analyzer_cache', {
  key: text('key').primaryKey(), // e.g. 'experts-bundle'
  payload: jsonb('payload').notNull(),
  dataVersion: bigint('data_version', { mode: 'number' }).notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
})

// Single-row counter bumped by triggers on every write to a source table.
// The cache row is fresh iff its data_version equals the current version.
export const analyzerDataVersion = pgTable('analyzer_data_version', {
  id: integer('id').primaryKey().default(1),
  version: bigint('version', { mode: 'number' }).notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── UCSB Legacy (Sleeper fantasy GM lab) ─────────────────────────────────────

export const fantasyLeagues = pgTable(
  'fantasy_leagues',
  {
    sleeperLeagueId: text('sleeper_league_id').primaryKey(),
    season: integer('season').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    previousLeagueId: text('previous_league_id'),
    draftId: text('draft_id'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
    scoringSettings: jsonb('scoring_settings').$type<Record<string, unknown>>(),
    rosterPositions: jsonb('roster_positions').$type<string[]>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    idxFantasyLeaguesSeason: index('idx_fantasy_leagues_season').on(t.season),
  })
)

export const fantasyManagers = pgTable('fantasy_managers', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  sleeperUserId: text('sleeper_user_id').notNull().unique(),
})

export const fantasyRosters = pgTable(
  'fantasy_rosters',
  {
    id: serial('id').primaryKey(),
    sleeperLeagueId: text('sleeper_league_id')
      .references(() => fantasyLeagues.sleeperLeagueId, { onDelete: 'cascade' })
      .notNull(),
    rosterId: integer('roster_id').notNull(),
    sleeperUserId: text('sleeper_user_id'),
    teamName: text('team_name'),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    ties: integer('ties').notNull().default(0),
    fpts: doublePrecision('fpts').notNull().default(0),
    fptsAgainst: doublePrecision('fpts_against').notNull().default(0),
    waiverBudgetUsed: integer('waiver_budget_used').notNull().default(0),
    waiverPosition: integer('waiver_position'),
  },
  (t) => ({
    uniqFantasyRoster: unique().on(t.sleeperLeagueId, t.rosterId),
    idxFantasyRostersUser: index('idx_fantasy_rosters_user').on(t.sleeperUserId),
  })
)

export const fantasyDrafts = pgTable('fantasy_drafts', {
  draftId: text('draft_id').primaryKey(),
  sleeperLeagueId: text('sleeper_league_id')
    .references(() => fantasyLeagues.sleeperLeagueId, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  budget: integer('budget'),
  rounds: integer('rounds'),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
})

export const fantasyDraftPicks = pgTable(
  'fantasy_draft_picks',
  {
    id: serial('id').primaryKey(),
    draftId: text('draft_id')
      .references(() => fantasyDrafts.draftId, { onDelete: 'cascade' })
      .notNull(),
    pickNo: integer('pick_no').notNull(),
    round: integer('round').notNull(),
    rosterId: integer('roster_id').notNull(),
    sleeperUserId: text('sleeper_user_id'),
    playerId: text('player_id').notNull(),
    amount: integer('amount').notNull().default(0),
    position: text('position'),
    isKeeper: boolean('is_keeper').notNull().default(false),
  },
  (t) => ({
    uniqFantasyDraftPick: unique().on(t.draftId, t.pickNo),
    idxFantasyDraftPicksPlayer: index('idx_fantasy_draft_picks_player').on(t.playerId),
  })
)

export const fantasyMatchups = pgTable(
  'fantasy_matchups',
  {
    id: serial('id').primaryKey(),
    sleeperLeagueId: text('sleeper_league_id')
      .references(() => fantasyLeagues.sleeperLeagueId, { onDelete: 'cascade' })
      .notNull(),
    week: integer('week').notNull(),
    rosterId: integer('roster_id').notNull(),
    matchupId: integer('matchup_id'),
    points: doublePrecision('points').notNull().default(0),
    starters: jsonb('starters').$type<string[]>(),
  },
  (t) => ({
    uniqFantasyMatchup: unique().on(t.sleeperLeagueId, t.week, t.rosterId),
    idxFantasyMatchupsWeek: index('idx_fantasy_matchups_week').on(t.sleeperLeagueId, t.week),
  })
)

export const fantasyPlayerWeeks = pgTable(
  'fantasy_player_weeks',
  {
    id: serial('id').primaryKey(),
    sleeperLeagueId: text('sleeper_league_id')
      .references(() => fantasyLeagues.sleeperLeagueId, { onDelete: 'cascade' })
      .notNull(),
    week: integer('week').notNull(),
    rosterId: integer('roster_id').notNull(),
    playerId: text('player_id').notNull(),
    points: doublePrecision('points').notNull().default(0),
  },
  (t) => ({
    uniqFantasyPlayerWeek: unique().on(t.sleeperLeagueId, t.week, t.rosterId, t.playerId),
    idxFantasyPlayerWeeksPlayer: index('idx_fantasy_player_weeks_player').on(
      t.playerId,
      t.sleeperLeagueId
    ),
  })
)

export const fantasyTransactions = pgTable(
  'fantasy_transactions',
  {
    transactionId: text('transaction_id').primaryKey(),
    sleeperLeagueId: text('sleeper_league_id')
      .references(() => fantasyLeagues.sleeperLeagueId, { onDelete: 'cascade' })
      .notNull(),
    week: integer('week').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    rosterIds: jsonb('roster_ids').$type<number[]>().notNull(),
    adds: jsonb('adds').$type<Record<string, number> | null>(),
    drops: jsonb('drops').$type<Record<string, number> | null>(),
    waiverBid: integer('waiver_bid'),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }),
  },
  (t) => ({
    idxFantasyTxLeagueWeek: index('idx_fantasy_tx_league_week').on(t.sleeperLeagueId, t.week),
    idxFantasyTxType: index('idx_fantasy_tx_type').on(t.type, t.status),
  })
)

export const fantasyRecords = pgTable('fantasy_records', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  valueNum: doublePrecision('value_num'),
  valueText: text('value_text'),
  holderSlug: text('holder_slug').references(() => fantasyManagers.slug),
  season: integer('season'),
  week: integer('week'),
  detail: text('detail'),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
})

export const fantasyPlayers = pgTable(
  'fantasy_players',
  {
    playerId: text('player_id').primaryKey(),
    fullName: text('full_name').notNull(),
    position: text('position'),
    team: text('team'),
    fantasyPositions: jsonb('fantasy_positions').$type<string[]>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    idxFantasyPlayersName: index('idx_fantasy_players_name').on(t.fullName),
  })
)

/** RotoWire weekly counting stats via Sleeper, scored with UCSB settings. */
export const fantasyProjections = pgTable(
  'fantasy_projections',
  {
    id: serial('id').primaryKey(),
    season: integer('season').notNull(),
    week: integer('week').notNull(),
    playerId: text('player_id').notNull(),
    source: text('source').notNull().default('rotowire'),
    opponent: text('opponent'),
    stats: jsonb('stats').$type<Record<string, number>>().notNull(),
    pts: doublePrecision('pts').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqFantasyProjection: unique().on(t.season, t.week, t.playerId, t.source),
    idxFantasyProjPlayer: index('idx_fantasy_proj_player').on(t.season, t.playerId),
  })
)

/** Frozen opening-day projected standings for end-of-season Cortanha grading. */
export interface CortanhaBaselineGm {
  slug: string
  displayName: string
  finish: number
  winPct: number
  pfPerWeek: number
  draftGrade: string
  draftSurplus: number
}

export const fantasyCortanhaBaselines = pgTable('fantasy_cortanha_baselines', {
  season: integer('season').primaryKey(),
  label: text('label').notNull().default('opening-day'),
  snappedAt: timestamp('snapped_at').defaultNow().notNull(),
  projectionCount: integer('projection_count').notNull().default(0),
  rows: jsonb('rows').$type<CortanhaBaselineGm[]>().notNull(),
  note: text('note'),
})
