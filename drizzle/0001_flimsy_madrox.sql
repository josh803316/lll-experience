CREATE TABLE "draft_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"draft_started_at" timestamp,
	CONSTRAINT "draft_settings_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
CREATE TABLE "draftable_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"player_name" text NOT NULL,
	"school" text NOT NULL,
	"position" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "official_draft_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"pick_number" integer NOT NULL,
	"player_name" text,
	"team_name" text
);
--> statement-breakpoint
ALTER TABLE "draft_picks" ADD COLUMN "double_score_pick" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_settings" ADD CONSTRAINT "draft_settings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draftable_players" ADD CONSTRAINT "draftable_players_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_draft_results" ADD CONSTRAINT "official_draft_results_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;