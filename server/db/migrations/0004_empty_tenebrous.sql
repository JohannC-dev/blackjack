CREATE TABLE "player_cosmetic" (
	"user_id" text NOT NULL,
	"cosmetic_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_cosmetic_user_id_cosmetic_id_pk" PRIMARY KEY("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "referral" (
	"filleul_id" text PRIMARY KEY NOT NULL,
	"parrain_id" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_distinct_players" CHECK ("referral"."filleul_id" <> "referral"."parrain_id")
);
--> statement-breakpoint
CREATE TABLE "referral_reward" (
	"user_id" text NOT NULL,
	"tier" integer NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_reward_user_id_tier_pk" PRIMARY KEY("user_id","tier"),
	CONSTRAINT "referral_reward_tier_range" CHECK ("referral_reward"."tier" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "player_cosmetic" ADD CONSTRAINT "player_cosmetic_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_filleul_id_user_id_fk" FOREIGN KEY ("filleul_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_parrain_id_user_id_fk" FOREIGN KEY ("parrain_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_parrain_idx" ON "referral" USING btree ("parrain_id","created_at");