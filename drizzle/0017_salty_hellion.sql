CREATE TABLE "fantasy_projections" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"player_id" text NOT NULL,
	"source" text DEFAULT 'rotowire' NOT NULL,
	"opponent" text,
	"stats" jsonb NOT NULL,
	"pts" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_projections_season_week_player_id_source_unique" UNIQUE("season","week","player_id","source")
);
--> statement-breakpoint
CREATE INDEX "idx_fantasy_proj_player" ON "fantasy_projections" USING btree ("season","player_id");