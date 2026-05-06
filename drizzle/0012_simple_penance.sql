CREATE TABLE "pff_career_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"pff_player_id" integer,
	"raw_position" text,
	"franchise_position" text NOT NULL,
	"side" text NOT NULL,
	"three_good_years" double precision NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pff_career_summary_player_name_side_unique" UNIQUE("player_name","side")
);
--> statement-breakpoint
CREATE TABLE "player_contract_signal" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"franchise_position" text NOT NULL,
	"best_contract_percentile" double precision NOT NULL,
	"best_year_signed" integer NOT NULL,
	"qualifies_non_rookie" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_contract_signal_player_name_unique" UNIQUE("player_name")
);
--> statement-breakpoint
CREATE INDEX "idx_pff_career_franchise_pos" ON "pff_career_summary" USING btree ("franchise_position");--> statement-breakpoint
CREATE INDEX "idx_contract_signal_franchise_pos" ON "player_contract_signal" USING btree ("franchise_position");