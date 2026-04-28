import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, expertRankings, officialDraftResults, playerPerformanceRatings, apps} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function seed() {
  console.log('--- SEEDING 3-YEAR PILOT DATA (2023-2025) ---');

  const app = (await db.select().from(apps).where(eq(apps.slug, 'analyzer')).limit(1))[0];
  if (!app) {throw new Error('Run seed-analyzer.ts first');}

  // 1. Seed Experts
  const expertData = [
    {slug: 'dj', name: 'Daniel Jeremiah', org: 'NFL Network'},
    {slug: 'brugler', name: 'Dane Brugler', org: 'The Athletic'},
    {slug: 'kiper', name: 'Mel Kiper Jr.', org: 'ESPN'},
  ];

  for (const e of expertData) {
    const existing = (await db.select().from(experts).where(eq(experts.slug, e.slug)).limit(1))[0];
    if (!existing) {
      await db.insert(experts).values({slug: e.slug, name: e.name, organization: e.org});
    }
  }

  const dj = (await db.select().from(experts).where(eq(experts.slug, 'dj')).limit(1))[0];
  const brugler = (await db.select().from(experts).where(eq(experts.slug, 'brugler')).limit(1))[0];

  // 2. Seed Sample Picks (2023)
  // CJ Stroud - Houston Texans (Pick #2)
  await db
    .insert(officialDraftResults)
    .values({
      appId: app.id,
      year: 2023,
      pickNumber: 2,
      playerName: 'C.J. Stroud',
      teamName: 'Houston Texans',
    })
    .onConflictDoNothing();

  // Bryce Young - Carolina Panthers (Pick #1)
  await db
    .insert(officialDraftResults)
    .values({
      appId: app.id,
      year: 2023,
      pickNumber: 1,
      playerName: 'Bryce Young',
      teamName: 'Carolina Panthers',
    })
    .onConflictDoNothing();

  // 3. Seed Expert Rankings for those picks (What they thought THEN)
  await db
    .insert(expertRankings)
    .values([
      {expertId: dj.id, year: 2023, playerName: 'C.J. Stroud', rank: 2, grade: 'A'},
      {expertId: brugler.id, year: 2023, playerName: 'C.J. Stroud', rank: 3, grade: 'A-'},
      {expertId: dj.id, year: 2023, playerName: 'Bryce Young', rank: 1, grade: 'A+'},
      {expertId: brugler.id, year: 2023, playerName: 'Bryce Young', rank: 1, grade: 'A+'},
    ])
    .onConflictDoNothing();

  // 4. Seed LLL Performance Ratings (What happened SINCE)
  // CJ Stroud: Year 1 = 9 (Top 5), Year 2 = 10 (Franchise)
  await db.insert(playerPerformanceRatings).values([
    {
      playerName: 'C.J. Stroud',
      draftYear: 2023,
      evaluationYear: 2023,
      rating: 9,
      justification: 'Instant impact, led team to playoffs.',
      metadata: {gs: 15, pb: 1, av: 18},
    },
    {
      playerName: 'C.J. Stroud',
      draftYear: 2023,
      evaluationYear: 2024,
      rating: 10,
      justification: 'Certified franchise cornerstone.',
      metadata: {gs: 17, pb: 2, av: 20},
    },
    // Bryce Young: Year 1 = 4 (Below Avg), Year 2 = 3 (Backup)
    {
      playerName: 'Bryce Young',
      draftYear: 2023,
      evaluationYear: 2023,
      rating: 4,
      justification: 'Struggled with protection and size.',
      metadata: {gs: 16, pb: 0, av: 6},
    },
    {
      playerName: 'Bryce Young',
      draftYear: 2023,
      evaluationYear: 2024,
      rating: 3,
      justification: 'Benched for performance.',
      metadata: {gs: 2, pb: 0, av: 1},
    },
  ]);

  console.log('Pilot Seeding Complete!');
}

seed()
  .catch(console.error)
  .finally(() => client.end());
