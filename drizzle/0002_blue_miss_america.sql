ALTER TABLE "draft_settings" DROP CONSTRAINT "draft_settings_app_id_unique";--> statement-breakpoint
ALTER TABLE "draft_picks" ADD COLUMN "year" integer NOT NULL DEFAULT 2026;--> statement-breakpoint
ALTER TABLE "draft_settings" ADD COLUMN "year" integer NOT NULL DEFAULT 2026;--> statement-breakpoint
ALTER TABLE "draftable_players" ADD COLUMN "year" integer NOT NULL DEFAULT 2026;--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD COLUMN "year" integer NOT NULL DEFAULT 2026;