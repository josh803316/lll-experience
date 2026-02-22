import { getDB } from "./index.ts";
import { apps } from "./schema.ts";
import { eq } from "drizzle-orm";

const db = getDB();

console.log("Seeding database...");

// Upsert the NFL Draft app
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
process.exit(0);
