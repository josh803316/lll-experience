ALTER TABLE "pick_writeups" ADD COLUMN "grade_letter" text;--> statement-breakpoint
ALTER TABLE "pick_writeups" ADD COLUMN "grade_numeric" text;--> statement-breakpoint
ALTER TABLE "pick_writeups" ADD COLUMN "grade_source_count" integer;--> statement-breakpoint
ALTER TABLE "pick_writeups" ADD COLUMN "grade_breakdown" jsonb;