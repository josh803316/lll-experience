import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {sql} from 'drizzle-orm';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DIRECT_URL or DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(databaseUrl, {prepare: false});
const db = drizzle(client);

try {
  const draftCounts = await db.execute(sql`
    SELECT year, COUNT(*)::int AS picks
    FROM official_draft_results
    WHERE year >= 2020
    GROUP BY year
    ORDER BY year
  `);
  console.log('official_draft_results by year:');
  for (const row of draftCounts as unknown as Array<{year: number; picks: number}>) {
    console.log(`  ${row.year}: ${row.picks}`);
  }

  const seasonCounts = await db.execute(sql`
    SELECT seasons_count, COUNT(*)::int AS players
    FROM pff_career_summary
    GROUP BY seasons_count
    ORDER BY seasons_count
  `);
  console.log('\npff_career_summary by seasons_count:');
  for (const row of seasonCounts as unknown as Array<{seasons_count: number; players: number}>) {
    console.log(`  ${row.seasons_count}: ${row.players}`);
  }

  const coverage = await db.execute(sql`
    SELECT
      o.year,
      COUNT(*)::int AS drafted,
      COUNT(pcs.player_name)::int AS in_pff,
      COUNT(*) FILTER (WHERE pcs.seasons_count >= 3)::int AS pff_3plus
    FROM official_draft_results o
    LEFT JOIN pff_career_summary pcs
      ON LOWER(REGEXP_REPLACE(o.player_name, '[^a-zA-Z]', '', 'g'))
      = LOWER(REGEXP_REPLACE(pcs.player_name, '[^a-zA-Z]', '', 'g'))
    WHERE o.year >= 2022
    GROUP BY o.year
    ORDER BY o.year
  `);
  console.log('\nDrafted vs PFF coverage by year:');
  for (const row of coverage as unknown as Array<{
    year: number;
    drafted: number;
    in_pff: number;
    pff_3plus: number;
  }>) {
    console.log(`  ${row.year}: drafted=${row.drafted}  in_pff=${row.in_pff}  with 3+ seasons=${row.pff_3plus}`);
  }
} finally {
  await client.end();
}
