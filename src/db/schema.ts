import {text, timestamp, pgTable, serial, integer, boolean, bigint, jsonb, unique} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const apps = pgTable('apps', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const draftPicks = pgTable('draft_picks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  pickNumber: integer('pick_number').notNull(),
  teamName: text('team_name'),
  playerName: text('player_name'),
  position: text('position'),
  doubleScorePick: boolean('double_score_pick').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const draftablePlayers = pgTable('draftable_players', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  rank: integer('rank').notNull(),
  playerName: text('player_name').notNull(),
  school: text('school').notNull(),
  position: text('position').notNull(),
});

export const draftSettings = pgTable('draft_settings', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  draftStartedAt: timestamp('draft_started_at'),
});

/** Persisted mock simulation state so reload/restart keeps current reveal progress. */
export const draftMockState = pgTable('draft_mock_state', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  revealedCount: integer('revealed_count').notNull().default(0),
  nextRevealAtMs: bigint('next_reveal_at_ms', {mode: 'number'}).notNull(),
  picksJson: jsonb('picks_json')
    .$type<Array<{pickNumber: number; playerName: string; teamName: string; position: string | null}>>()
    .notNull(),
});

export const officialDraftResults = pgTable('official_draft_results', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  pickNumber: integer('pick_number').notNull(),
  playerName: text('player_name'),
  teamName: text('team_name'),
});

/**
 * Cached LLM-generated analysis for a draft pick.
 * Generated on demand by the writeups cron after a pick is announced.
 */
export const pickWriteups = pgTable(
  'pick_writeups',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id')
      .references(() => apps.id, {onDelete: 'cascade'})
      .notNull(),
    year: integer('year').notNull(),
    pickNumber: integer('pick_number').notNull(),
    playerName: text('player_name'),
    writeup: text('writeup'),
    sources: jsonb('sources'),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqApp_year_pick: unique().on(t.appId, t.year, t.pickNumber),
  }),
);

export const draftHistoricalWinners = pgTable('draft_historical_winners', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  rank: integer('rank').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  score: integer('score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Chat ────────────────────────────────────────────────────────────────────

export const chatGroups = pgTable('chat_groups', {
  id: serial('id').primaryKey(),
  appId: integer('app_id')
    .references(() => apps.id, {onDelete: 'cascade'})
    .notNull(),
  year: integer('year').notNull(),
  name: text('name').notNull(),
  createdBy: integer('created_by')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatGroupMembers = pgTable('chat_group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => chatGroups.id, {onDelete: 'cascade'})
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => chatGroups.id, {onDelete: 'cascade'})
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatMessageReactions = pgTable('chat_message_reactions', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .references(() => chatMessages.id, {onDelete: 'cascade'})
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
