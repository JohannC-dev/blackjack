ALTER TABLE "player_profile" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profile" ADD COLUMN "earnings_visibility" text DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_visibility_values" CHECK ("player_profile"."visibility" in ('public', 'friends', 'private'));--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_earnings_visibility_values" CHECK ("player_profile"."earnings_visibility" in ('public', 'friends', 'private'));