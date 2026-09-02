CREATE TABLE "fantasy_cortanha_baselines" (
	"season" integer PRIMARY KEY NOT NULL,
	"label" text DEFAULT 'opening-day' NOT NULL,
	"snapped_at" timestamp DEFAULT now() NOT NULL,
	"projection_count" integer DEFAULT 0 NOT NULL,
	"rows" jsonb NOT NULL,
	"note" text
);
