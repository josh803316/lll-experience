CREATE TABLE "pick_writeups" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"year" integer NOT NULL,
	"pick_number" integer NOT NULL,
	"player_name" text,
	"writeup" text,
	"sources" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pick_writeups_app_id_year_pick_number_unique" UNIQUE("app_id","year","pick_number")
);
--> statement-breakpoint
ALTER TABLE "pick_writeups" ADD CONSTRAINT "pick_writeups_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;