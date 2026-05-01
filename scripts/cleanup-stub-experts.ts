/**
 * Removes expert stubs that have no published Big Board / Mock Draft, plus
 * placeholder rows that were never populated. Also renames Walter Football
 * to credit Charlie Campbell (the actual author at walterfootball.com).
 *
 * Verified-no-board (per 2026-05 research):
 *   - chad-reuter:     NFL.com, only mocks/Twitter — no article-form board
 *   - the-athletic:    No Athletic-staff consensus exists; Athletic = Brugler
 *   - yahoo-consensus: Yahoo doesn't publish a draft consensus
 *   - silva:           Fantasy rankings only
 *   - boone:           theScore's draft board is Dan Wilkins, not Boone
 *
 * Unresearched placeholders (no rankings, no clear public archive):
 *   - mcginn, donahue, draft-ace, board-guru, jason-boris, huddle-report
 *
 * Run: bun run --env-file=.env.local scripts/cleanup-stub-experts.ts
 */
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, expertRankings} from '../src/db/schema.js';
import {eq, inArray, count} from 'drizzle-orm';

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!URL) {
  throw new Error('DIRECT_URL or DATABASE_URL required');
}
const client = postgres(URL, {prepare: false});
const db = drizzle(client);

const SLUGS_TO_DELETE = [
  // Verified-no-board
  'chad-reuter',
  'the-athletic',
  'yahoo-consensus',
  'silva',
  'boone',
  // Unresearched placeholders (no rankings, no clear data source)
  'mcginn',
  'donahue',
  'draft-ace',
  'board-guru',
  'jason-boris',
  'huddle-report',
];

async function run() {
  console.log('--- Expert stub cleanup ---');

  // Show what's being deleted
  const targets = await db.select().from(experts).where(inArray(experts.slug, SLUGS_TO_DELETE));
  console.log(`Targets (${targets.length}/${SLUGS_TO_DELETE.length}):`);
  for (const t of targets) {
    const rankCount =
      (await db.select({n: count()}).from(expertRankings).where(eq(expertRankings.expertId, t.id)))[0]?.n ?? 0;
    console.log(`  - ${t.slug.padEnd(18)} "${t.name}" (${rankCount} rankings will cascade-delete)`);
  }

  // CASCADE delete handled by FK constraint on expert_rankings.expert_id.
  const deleted = await db
    .delete(experts)
    .where(inArray(experts.slug, SLUGS_TO_DELETE))
    .returning({slug: experts.slug});
  console.log(`\nDeleted ${deleted.length} experts.`);

  // Rename Walter Football to credit Charlie Campbell.
  const renamed = await db
    .update(experts)
    .set({name: 'Walter Football (Charlie Campbell)'})
    .where(eq(experts.slug, 'walter-football'))
    .returning({slug: experts.slug, name: experts.name});
  if (renamed.length > 0) {
    console.log(`Renamed: ${renamed[0].slug} → "${renamed[0].name}"`);
  }

  // Show remaining experts.
  const remaining = await db.select().from(experts).orderBy(experts.name);
  console.log(`\n=== Remaining experts (${remaining.length}) ===`);
  for (const e of remaining) {
    console.log(`  ${e.slug.padEnd(18)} ${e.name}`);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
