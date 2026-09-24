CREATE TABLE "daily_streak" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"last_day" date,
	"run_started_day" date,
	"last_spin_day" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_streak_current_nonnegative" CHECK ("daily_streak"."current" >= 0),
	CONSTRAINT "daily_streak_best_covers_current" CHECK ("daily_streak"."best" >= "daily_streak"."current")
);
--> statement-breakpoint
ALTER TABLE "daily_streak" ADD CONSTRAINT "daily_streak_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The streak skins must be listed before a player reaches them. Their
-- pictures come with the catalogue import.
INSERT INTO "cosmetic" ("id", "kind", "name", "description", "rarity", "status", "unlock_hint", "sort_order") VALUES
	('profile-icon:serie-flamme', 'profile-icon', 'Flamme', 'La flamme de ceux qui reviennent chaque soir.', 'common', 'active', 'Atteignez une série de 20 jours.', 900),
	('card-back:serie-braise', 'card-back', 'Braise', 'Un dos rougeoyant, pour quarante nuits d’affilée.', 'rare', 'active', 'Atteignez une série de 40 jours.', 900),
	('mine-gem:serie-brasier', 'mine-gem', 'Brasier', 'Une gemme en fusion, réservée aux séries de cinquante jours.', 'epic', 'active', 'Atteignez une série de 50 jours.', 900)
ON CONFLICT ("id") DO NOTHING;
