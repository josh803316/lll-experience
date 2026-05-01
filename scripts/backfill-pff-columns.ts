/**
 * Backfill the top-level `grade`, `team_abbr`, and `position` columns of
 * pff_player_stats from the `stats` JSON blob. Necessary because:
 *   - Older runs of ingest-pff.ts read only `grades_offense` / `grades_overall`,
 *     so every defense row has NULL grade (across all seasons).
 *   - The 2024 + 2025 ingests left grade and team_abbr NULL for every category
 *     even though the values are present inside `stats`.
 *
 * Idempotent — safe to re-run. Only touches rows where the JSON has data and
 * the column is missing or stale.
 *
 * Run: bun run --env-file=.env.local scripts/backfill-pff-columns.ts
 */
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {pffPlayerStats} from '../src/db/schema.js';
import {sql} from 'drizzle-orm';

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!URL) {
  throw new Error('DIRECT_URL or DATABASE_URL required');
}
const client = postgres(URL, {prepare: false});
const db = drizzle(client);

async function run() {
  console.log('--- pff_player_stats column backfill ---');

  // 1. team_abbr — pull from stats.team || stats.team_name.
  const teamRes = await db.execute(sql`
    UPDATE pff_player_stats
    SET team_abbr = COALESCE(NULLIF(stats->>'team', ''), NULLIF(stats->>'team_name', ''))
    WHERE team_abbr IS NULL
      AND COALESCE(NULLIF(stats->>'team', ''), NULLIF(stats->>'team_name', '')) IS NOT NULL
  `);
  console.log(`team_abbr updated: ${teamRes.count}`);

  // 2. position — pull from stats.position.
  const posRes = await db.execute(sql`
    UPDATE pff_player_stats
    SET position = NULLIF(stats->>'position', '')
    WHERE position IS NULL
      AND NULLIF(stats->>'position', '') IS NOT NULL
  `);
  console.log(`position updated: ${posRes.count}`);

  // 3. grade — defense reads grades_defense; everyone else reads grades_offense
  //    (with grades_overall as a final fallback). NULLIF guards against the
  //    empty strings PFF emits for missing values.
  const gradeRes = await db.execute(sql`
    UPDATE pff_player_stats
    SET grade = (
      CASE
        WHEN category = 'defense'
          THEN COALESCE(
            NULLIF(stats->>'grades_defense', ''),
            NULLIF(stats->>'grades_overall', '')
          )::float
        ELSE COALESCE(
          NULLIF(stats->>'grades_offense', ''),
          NULLIF(stats->>'grades_overall', '')
        )::float
      END
    )
    WHERE grade IS NULL
      AND (
        CASE
          WHEN category = 'defense' THEN NULLIF(stats->>'grades_defense', '')
          ELSE NULLIF(stats->>'grades_offense', '')
        END
      ) IS NOT NULL
  `);
  console.log(`grade updated: ${gradeRes.count}`);

  // 4. Coverage report.
  const cov = await db.execute(sql`
    SELECT season, category,
           COUNT(*) AS rows,
           COUNT(*) FILTER (WHERE grade IS NULL) AS null_grade,
           COUNT(*) FILTER (WHERE team_abbr IS NULL) AS null_team
    FROM pff_player_stats
    GROUP BY season, category
    ORDER BY season DESC, category
  `);
  console.log('\nCoverage after backfill:');
  for (const row of cov as unknown as Array<{
    season: number;
    category: string;
    rows: bigint | number;
    null_grade: bigint | number;
    null_team: bigint | number;
  }>) {
    console.log(
      `  ${row.season} ${row.category.padEnd(10)}: ${String(row.rows).padStart(4)} rows · null grade=${String(row.null_grade).padStart(4)} · null team=${String(row.null_team).padStart(4)}`,
    );
  }

  console.log('\nBackfill complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
