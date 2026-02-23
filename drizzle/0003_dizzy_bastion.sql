CREATE TABLE "draft_historical_winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"year" integer NOT NULL,
	"rank" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_historical_winners" ADD CONSTRAINT "draft_historical_winners_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;