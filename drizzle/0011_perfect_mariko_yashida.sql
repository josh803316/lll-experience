CREATE INDEX IF NOT EXISTS "idx_expert_rankings_year" ON "expert_rankings" USING btree ("year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expert_rankings_expert_year" ON "expert_rankings" USING btree ("expert_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expert_rankings_player" ON "expert_rankings" USING btree ("player_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_official_draft_results_year" ON "official_draft_results" USING btree ("year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_official_draft_results_app_year_pick" ON "official_draft_results" USING btree ("app_id","year","pick_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_official_draft_results_year_team" ON "official_draft_results" USING btree ("year","team_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_official_draft_results_player" ON "official_draft_results" USING btree ("player_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_player_performance_career_player" ON "player_performance_ratings" USING btree ("is_career_rating","player_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_player_performance_player_eval_year" ON "player_performance_ratings" USING btree ("player_name","evaluation_year");