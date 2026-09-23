ALTER TABLE "referral_reward" DROP CONSTRAINT "referral_reward_user_id_tier_pk";--> statement-breakpoint
ALTER TABLE "referral_reward" ADD COLUMN "filleul_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_user_id_filleul_id_tier_pk" PRIMARY KEY("user_id","filleul_id","tier");--> statement-breakpoint
ALTER TABLE "referral_reward" ADD CONSTRAINT "referral_reward_filleul_id_user_id_fk" FOREIGN KEY ("filleul_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;