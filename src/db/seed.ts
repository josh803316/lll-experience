import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { apps, draftablePlayers, draftSettings } from "./schema.js";
import { eq, and } from "drizzle-orm";
import { CONSENSUS_PLAYERS_2026 } from "../config/draft-data.js";

const SEED_YEAR = 2026;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("DIRECT_URL environment variable is required for seeding");
  process.exit(1);
}

const client = postgres(DIRECT_URL, { max: 1 });
const db = drizzle(client);

console.log("Seeding database...");

let app = (await db.select().from(apps).where(eq(apps.slug, "nfl-draft")).limit(1))[0];
if (!app) {
  const inserted = await db.insert(apps).values({
    slug: "nfl-draft",
    name: "NFL Draft Predictor",
    description: "Build your 32-pick mock draft and compare with friends.",
    isActive: true,
    createdAt: new Date(),
  }).returning();
  app = inserted[0];
  console.log("Inserted: nfl-draft app");
} else {
  console.log("Already exists: nfl-draft app — skipping");
}

const existingPlayers = await db.select().from(draftablePlayers).where(and(eq(draftablePlayers.appId, app.id), eq(draftablePlayers.year, SEED_YEAR))).limit(1);
if (existingPlayers.length === 0) {
  await db.insert(draftablePlayers).values(
    CONSENSUS_PLAYERS_2026.map((p) => ({
      appId: app!.id,
      year: SEED_YEAR,
      rank: p.rank,
      playerName: p.playerName,
      school: p.school,
      position: p.position,
    }))
  );
  console.log(`Inserted: draftable_players (consensus ${SEED_YEAR})`);
}

const existingSettings = await db.select().from(draftSettings).where(and(eq(draftSettings.appId, app.id), eq(draftSettings.year, SEED_YEAR))).limit(1);
if (existingSettings.length === 0) {
  await db.insert(draftSettings).values({ appId: app.id, year: SEED_YEAR });
  console.log(`Inserted: draft_settings for nfl-draft year ${SEED_YEAR}`);
}

console.log("Seed complete.");
await client.end();
