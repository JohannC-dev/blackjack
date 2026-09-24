ALTER TABLE "player_game_stats" ADD COLUMN "won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_won_nonnegative" CHECK ("player_game_stats"."won" >= 0);--> statement-breakpoint
-- Wins were counted from one result row per play; they move to the counters,
-- as a batched result (a Plinko salvo) now stands for several plays.
UPDATE "player_game_stats" AS "stats" SET "won" = "wins"."won" FROM (SELECT "user_id", "game", count(*)::integer AS "won" FROM "player_game_result" WHERE "net_minor" > 0 GROUP BY "user_id", "game") AS "wins" WHERE "stats"."user_id" = "wins"."user_id" AND "stats"."game" = "wins"."game";
