/**
 * Gives a skin to a player by hand, until the shop exists.
 *
 *   bun scripts/cosmetics-grant.ts <joueur> <skin>
 *
 * <joueur> is an email, a friend code (ABCD-EFGH) or a user id. Only an
 * active skin can be given; owning it already changes nothing.
 */
import { eq, or } from "drizzle-orm";
import { normalizeFriendCode } from "../src/lib/social";
import { authDatabase, closeDatabase } from "../server/db/client";
import {
  cosmetic,
  playerCosmetic,
  playerProfile,
  user,
} from "../server/db/schema";

const [target, cosmeticId] = process.argv.slice(2);
if (!target || !cosmeticId) {
  console.error("Usage : bun scripts/cosmetics-grant.ts <joueur> <skin>");
  process.exit(1);
}

try {
  const code = normalizeFriendCode(target);
  const [player] = await authDatabase
    .select({ id: user.id, name: user.name })
    .from(user)
    .leftJoin(playerProfile, eq(playerProfile.userId, user.id))
    .where(
      or(
        eq(user.id, target),
        eq(user.email, target.toLowerCase()),
        code ? eq(playerProfile.friendCode, code) : undefined,
      ),
    )
    .limit(1);
  if (!player) throw new Error(`Aucun joueur ne correspond à « ${target} ».`);

  const [item] = await authDatabase
    .select({ name: cosmetic.name, status: cosmetic.status })
    .from(cosmetic)
    .where(eq(cosmetic.id, cosmeticId));
  if (!item) throw new Error(`Le skin « ${cosmeticId} » n’existe pas.`);
  if (item.status !== "active")
    throw new Error(
      `« ${cosmeticId} » est ${item.status === "draft" ? "en préparation" : "retiré"} : il ne s’octroie plus.`,
    );

  const granted = await authDatabase
    .insert(playerCosmetic)
    .values({ userId: player.id, cosmeticId, source: "grant" })
    .onConflictDoNothing()
    .returning({ userId: playerCosmetic.userId });
  console.log(
    granted.length
      ? `${player.name} possède maintenant ${item.name}.`
      : `${player.name} possédait déjà ${item.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
