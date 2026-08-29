CREATE TABLE "fantasy_records" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"value_num" double precision,
	"value_text" text,
	"holder_slug" text,
	"season" integer,
	"week" integer,
	"detail" text,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_records" ADD CONSTRAINT "fantasy_records_holder_slug_fantasy_managers_slug_fk" FOREIGN KEY ("holder_slug") REFERENCES "public"."fantasy_managers"("slug") ON DELETE no action ON UPDATE no action;