CREATE TABLE "friendship" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendship_distinct_players" CHECK ("friendship"."requester_id" <> "friendship"."addressee_id"),
	CONSTRAINT "friendship_status_valid" CHECK ("friendship"."status" in ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE TABLE "player_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"friend_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_profile_friend_code_format" CHECK ("player_profile"."friend_code" ~ '^[A-Z0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendship_pair_idx" ON "friendship" USING btree (least("requester_id", "addressee_id"),greatest("requester_id", "addressee_id"));--> statement-breakpoint
CREATE INDEX "friendship_requester_idx" ON "friendship" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "friendship_addressee_idx" ON "friendship" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "player_profile_friend_code_idx" ON "player_profile" USING btree ("friend_code");