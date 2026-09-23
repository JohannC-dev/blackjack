CREATE TABLE "player_game_result" (
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"play_id" text NOT NULL,
	"net_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_result_user_id_game_play_id_pk" PRIMARY KEY("user_id","game","play_id")
);
--> statement-breakpoint
CREATE TABLE "player_game_stats" (
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wagered_minor" bigint DEFAULT 0 NOT NULL,
	"delta_minor" bigint DEFAULT 0 NOT NULL,
	"max_win_minor" bigint DEFAULT 0 NOT NULL,
	"max_loss_minor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "player_game_stats_user_id_game_pk" PRIMARY KEY("user_id","game"),
	CONSTRAINT "player_game_stats_played_nonnegative" CHECK ("player_game_stats"."played" >= 0),
	CONSTRAINT "player_game_stats_wagered_nonnegative" CHECK ("player_game_stats"."wagered_minor" >= 0),
	CONSTRAINT "player_game_stats_max_win_nonnegative" CHECK ("player_game_stats"."max_win_minor" >= 0),
	CONSTRAINT "player_game_stats_max_loss_nonnegative" CHECK ("player_game_stats"."max_loss_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "player_game_result" ADD CONSTRAINT "player_game_result_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "player_game_stats" ("user_id", "game")
SELECT u."id", g."game"
FROM "user" AS u
CROSS JOIN (VALUES ('blackjack'), ('roulette'), ('poker'), ('tower'), ('mines')) AS g("game")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION seed_player_game_stats() RETURNS trigger AS $$
BEGIN
  INSERT INTO "player_game_stats" ("user_id", "game")
  VALUES
    (NEW."id", 'blackjack'),
    (NEW."id", 'roulette'),
    (NEW."id", 'poker'),
    (NEW."id", 'tower'),
    (NEW."id", 'mines');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER seed_player_game_stats_after_user_insert
AFTER INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION seed_player_game_stats();
