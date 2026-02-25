CREATE TABLE "draft_mock_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"year" integer NOT NULL,
	"revealed_count" integer DEFAULT 0 NOT NULL,
	"next_reveal_at_ms" bigint NOT NULL,
	"picks_json" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_mock_state" ADD CONSTRAINT "draft_mock_state_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;