import { text, timestamp, pgTable, serial, integer, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const apps = pgTable("apps", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const draftPicks = pgTable("draft_picks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  appId: integer("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  pickNumber: integer("pick_number").notNull(),
  teamName: text("team_name"),
  playerName: text("player_name"),
  position: text("position"),
  doubleScorePick: boolean("double_score_pick").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const draftablePlayers = pgTable("draftable_players", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  rank: integer("rank").notNull(),
  playerName: text("player_name").notNull(),
  school: text("school").notNull(),
  position: text("position").notNull(),
});

export const draftSettings = pgTable("draft_settings", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  draftStartedAt: timestamp("draft_started_at"),
});

export const officialDraftResults = pgTable("official_draft_results", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  pickNumber: integer("pick_number").notNull(),
  playerName: text("player_name"),
  teamName: text("team_name"),
});

export const draftHistoricalWinners = pgTable("draft_historical_winners", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").references(() => apps.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  rank: integer("rank").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  score: integer("score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
