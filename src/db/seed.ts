import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { apps } from "./schema.ts";
import { eq } from "drizzle-orm";

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("DIRECT_URL environment variable is required for seeding");
  process.exit(1);
}

const client = postgres(DIRECT_URL, { max: 1 });
const db = drizzle(client);

console.log("Seeding database...");

const existing = await db.select().from(apps).where(eq(apps.slug, "nfl-draft")).limit(1);

if (existing.length === 0) {
  await db.insert(apps).values({
    slug: "nfl-draft",
    name: "NFL Draft Predictor",
    description: "Build your 32-pick mock draft and compare with friends.",
    isActive: true,
    createdAt: new Date(),
  });
  console.log("Inserted: nfl-draft app");
} else {
  console.log("Already exists: nfl-draft app — skipping");
}

console.log("Seed complete.");
await client.end();
