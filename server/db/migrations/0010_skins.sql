CREATE TABLE "cosmetic" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"unlock_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"price_credits" bigint,
	"price_cents" integer,
	"price_currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cosmetic_kind_values" CHECK ("cosmetic"."kind" in ('card-back', 'profile-icon', 'chicken', 'mine-gem')),
	CONSTRAINT "cosmetic_rarity_values" CHECK ("cosmetic"."rarity" in ('common', 'rare', 'epic', 'legendary')),
	CONSTRAINT "cosmetic_status_values" CHECK ("cosmetic"."status" in ('draft', 'active', 'retired')),
	CONSTRAINT "cosmetic_price_credits_positive" CHECK ("cosmetic"."price_credits" is null or "cosmetic"."price_credits" > 0),
	CONSTRAINT "cosmetic_price_cents_positive" CHECK ("cosmetic"."price_cents" is null or "cosmetic"."price_cents" > 0),
	CONSTRAINT "cosmetic_price_currency_pair" CHECK (("cosmetic"."price_cents" is null) = ("cosmetic"."price_currency" is null))
);
--> statement-breakpoint
CREATE TABLE "cosmetic_asset" (
	"cosmetic_id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cosmetic_asset_content_type_values" CHECK ("cosmetic_asset"."content_type" in ('image/svg+xml', 'image/png', 'image/webp'))
);
--> statement-breakpoint
CREATE TABLE "player_equipped_cosmetic" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"cosmetic_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_equipped_cosmetic_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cosmetic_id_kind_idx" ON "cosmetic" USING btree ("id","kind");--> statement-breakpoint
ALTER TABLE "cosmetic_asset" ADD CONSTRAINT "cosmetic_asset_cosmetic_id_cosmetic_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_equipped_cosmetic" ADD CONSTRAINT "player_equipped_cosmetic_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_equipped_cosmetic" ADD CONSTRAINT "player_equipped_cosmetic_owned_fk" FOREIGN KEY ("user_id","cosmetic_id") REFERENCES "public"."player_cosmetic"("user_id","cosmetic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_equipped_cosmetic" ADD CONSTRAINT "player_equipped_cosmetic_kind_fk" FOREIGN KEY ("cosmetic_id","kind") REFERENCES "public"."cosmetic"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The parrainage items were owned before the catalogue existed: they must be
-- in it before player_cosmetic points at it. No artwork yet, so not wearable.
INSERT INTO "cosmetic" ("id", "kind", "name", "description", "rarity", "status", "unlock_hint", "sort_order") VALUES
	('card-skin:parrainage', 'card-back', 'Dos Parrainage', 'Le dos de carte réservé aux joueurs venus par un parrain.', 'rare', 'active', 'Rejoignez le club avec un code, ou parrainez un joueur jusqu’au premier palier.', 0),
	('profile-icon:parrainage', 'profile-icon', 'Icône Parrainage', 'L’insigne qui marque les membres du cercle de parrainage.', 'rare', 'active', 'Rejoignez le club avec un code, ou parrainez un joueur jusqu’au premier palier.', 0)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "player_cosmetic" ADD CONSTRAINT "player_cosmetic_cosmetic_id_cosmetic_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetic"("id") ON DELETE no action ON UPDATE no action;