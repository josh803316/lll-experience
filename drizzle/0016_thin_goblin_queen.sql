CREATE TABLE "fantasy_draft_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"pick_no" integer NOT NULL,
	"round" integer NOT NULL,
	"roster_id" integer NOT NULL,
	"sleeper_user_id" text,
	"player_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"position" text,
	"is_keeper" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fantasy_draft_picks_draft_id_pick_no_unique" UNIQUE("draft_id","pick_no")
);
--> statement-breakpoint
CREATE TABLE "fantasy_drafts" (
	"draft_id" text PRIMARY KEY NOT NULL,
	"sleeper_league_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"budget" integer,
	"rounds" integer,
	"settings" jsonb
);
--> statement-breakpoint
CREATE TABLE "fantasy_leagues" (
	"sleeper_league_id" text PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"previous_league_id" text,
	"draft_id" text,
	"settings" jsonb NOT NULL,
	"scoring_settings" jsonb,
	"roster_positions" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_managers" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"sleeper_user_id" text NOT NULL,
	CONSTRAINT "fantasy_managers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "fantasy_managers_sleeper_user_id_unique" UNIQUE("sleeper_user_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"sleeper_league_id" text NOT NULL,
	"week" integer NOT NULL,
	"roster_id" integer NOT NULL,
	"matchup_id" integer,
	"points" double precision DEFAULT 0 NOT NULL,
	"starters" jsonb,
	CONSTRAINT "fantasy_matchups_sleeper_league_id_week_roster_id_unique" UNIQUE("sleeper_league_id","week","roster_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_player_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"sleeper_league_id" text NOT NULL,
	"week" integer NOT NULL,
	"roster_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"points" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "fantasy_player_weeks_sleeper_league_id_week_roster_id_player_id_unique" UNIQUE("sleeper_league_id","week","roster_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_players" (
	"player_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"position" text,
	"team" text,
	"fantasy_positions" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"sleeper_league_id" text NOT NULL,
	"roster_id" integer NOT NULL,
	"sleeper_user_id" text,
	"team_name" text,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"fpts" double precision DEFAULT 0 NOT NULL,
	"fpts_against" double precision DEFAULT 0 NOT NULL,
	"waiver_budget_used" integer DEFAULT 0 NOT NULL,
	"waiver_position" integer,
	CONSTRAINT "fantasy_rosters_sleeper_league_id_roster_id_unique" UNIQUE("sleeper_league_id","roster_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_transactions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"sleeper_league_id" text NOT NULL,
	"week" integer NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"roster_ids" jsonb NOT NULL,
	"adds" jsonb,
	"drops" jsonb,
	"waiver_bid" integer,
	"created_at_ms" bigint
);
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_draft_id_fantasy_drafts_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."fantasy_drafts"("draft_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_drafts" ADD CONSTRAINT "fantasy_drafts_sleeper_league_id_fantasy_leagues_sleeper_league_id_fk" FOREIGN KEY ("sleeper_league_id") REFERENCES "public"."fantasy_leagues"("sleeper_league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD CONSTRAINT "fantasy_matchups_sleeper_league_id_fantasy_leagues_sleeper_league_id_fk" FOREIGN KEY ("sleeper_league_id") REFERENCES "public"."fantasy_leagues"("sleeper_league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_player_weeks" ADD CONSTRAINT "fantasy_player_weeks_sleeper_league_id_fantasy_leagues_sleeper_league_id_fk" FOREIGN KEY ("sleeper_league_id") REFERENCES "public"."fantasy_leagues"("sleeper_league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_rosters" ADD CONSTRAINT "fantasy_rosters_sleeper_league_id_fantasy_leagues_sleeper_league_id_fk" FOREIGN KEY ("sleeper_league_id") REFERENCES "public"."fantasy_leagues"("sleeper_league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_transactions" ADD CONSTRAINT "fantasy_transactions_sleeper_league_id_fantasy_leagues_sleeper_league_id_fk" FOREIGN KEY ("sleeper_league_id") REFERENCES "public"."fantasy_leagues"("sleeper_league_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fantasy_draft_picks_player" ON "fantasy_draft_picks" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_fantasy_leagues_season" ON "fantasy_leagues" USING btree ("season");--> statement-breakpoint
CREATE INDEX "idx_fantasy_matchups_week" ON "fantasy_matchups" USING btree ("sleeper_league_id","week");--> statement-breakpoint
CREATE INDEX "idx_fantasy_player_weeks_player" ON "fantasy_player_weeks" USING btree ("player_id","sleeper_league_id");--> statement-breakpoint
CREATE INDEX "idx_fantasy_players_name" ON "fantasy_players" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "idx_fantasy_rosters_user" ON "fantasy_rosters" USING btree ("sleeper_user_id");--> statement-breakpoint
CREATE INDEX "idx_fantasy_tx_league_week" ON "fantasy_transactions" USING btree ("sleeper_league_id","week");--> statement-breakpoint
CREATE INDEX "idx_fantasy_tx_type" ON "fantasy_transactions" USING btree ("type","status");