CREATE TABLE "analyzer_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"data_version" bigint NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyzer_data_version" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the single version row (id is fixed at 1).
INSERT INTO "analyzer_data_version" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Bump the data version on any write to a source table. STATEMENT-level (not
-- row-level) so a bulk ingest of N rows bumps once, not N times.
CREATE OR REPLACE FUNCTION bump_analyzer_version() RETURNS trigger AS $$
BEGIN
  UPDATE "analyzer_data_version" SET "version" = "version" + 1, "updated_at" = now() WHERE "id" = 1;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_bump_analyzer_ppr ON "player_performance_ratings";
--> statement-breakpoint
CREATE TRIGGER trg_bump_analyzer_ppr AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "player_performance_ratings"
  FOR EACH STATEMENT EXECUTE FUNCTION bump_analyzer_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_bump_analyzer_rankings ON "expert_rankings";
--> statement-breakpoint
CREATE TRIGGER trg_bump_analyzer_rankings AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "expert_rankings"
  FOR EACH STATEMENT EXECUTE FUNCTION bump_analyzer_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_bump_analyzer_draft_results ON "official_draft_results";
--> statement-breakpoint
CREATE TRIGGER trg_bump_analyzer_draft_results AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "official_draft_results"
  FOR EACH STATEMENT EXECUTE FUNCTION bump_analyzer_version();
