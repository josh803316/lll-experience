-- 0009 heals migration drift between schema.ts and the migration history.
-- Tables `experts`, `expert_rankings`, `expert_team_grades`,
-- `expert_accuracy_scores`, `player_performance_ratings`,
-- `team_draft_analysis`, and `draft_timeline_events` were added to
-- schema.ts and provisioned directly in production but never tracked in
-- a migration; the four `official_draft_results` columns followed the
-- same path. This migration declares the canonical DDL for all of
-- them, and is the first migration to introduce `pff_player_stats`.
-- Every statement is idempotent so re-running on prod is a no-op.

CREATE TABLE IF NOT EXISTS "draft_timeline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"event_date" timestamp NOT NULL,
	"type" text,
	"title" text NOT NULL,
	"content" text,
	"player_name" text,
	"team_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expert_accuracy_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"expert_id" integer NOT NULL,
	"year" integer NOT NULL,
	"accuracy_delta" integer,
	"ranking_success" integer,
	"grade_success" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expert_rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"expert_id" integer NOT NULL,
	"year" integer NOT NULL,
	"player_name" text NOT NULL,
	"rank" integer,
	"grade" text,
	"commentary" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expert_team_grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"expert_id" integer NOT NULL,
	"year" integer NOT NULL,
	"team_name" text NOT NULL,
	"grade" text NOT NULL,
	"commentary" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"photo_url" text,
	"bio" text,
	CONSTRAINT "experts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pff_player_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"pff_id" integer,
	"season" integer NOT NULL,
	"position" text,
	"team_abbr" text,
	"category" text NOT NULL,
	"grade" double precision,
	"stats" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pff_player_stats_player_name_season_category_unique" UNIQUE("player_name", "season", "category")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_performance_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"draft_year" integer NOT NULL,
	"evaluation_year" integer NOT NULL,
	"rating" double precision NOT NULL,
	"is_career_rating" boolean DEFAULT false NOT NULL,
	"justification" text,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_draft_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"year" integer NOT NULL,
	"retention_score" integer,
	"performance_score" integer,
	"value_score" integer,
	"overall_grade" text
);
--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD COLUMN IF NOT EXISTS "round" integer;--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD COLUMN IF NOT EXISTS "position" text;--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD COLUMN IF NOT EXISTS "college" text;--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD COLUMN IF NOT EXISTS "contract_outcome" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "expert_accuracy_scores" ADD CONSTRAINT "expert_accuracy_scores_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."experts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "expert_rankings" ADD CONSTRAINT "expert_rankings_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."experts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "expert_team_grades" ADD CONSTRAINT "expert_team_grades_expert_id_experts_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."experts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "pff_player_stats" ADD CONSTRAINT "pff_player_stats_player_name_season_category_unique" UNIQUE ("player_name", "season", "category");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
