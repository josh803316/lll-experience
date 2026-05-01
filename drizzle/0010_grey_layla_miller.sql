CREATE TABLE "player_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"team_abbr" text,
	"position" text,
	"year_signed" integer NOT NULL,
	"years_length" integer,
	"value_total" double precision,
	"apy" double precision,
	"guaranteed" double precision,
	"apy_cap_pct" double precision,
	"is_second_contract" boolean DEFAULT false NOT NULL,
	"draft_year" integer,
	"draft_overall" integer,
	"source" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_contracts_player_name_year_signed_source_unique" UNIQUE("player_name","year_signed","source")
);
