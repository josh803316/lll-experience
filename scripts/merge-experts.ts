/**
 * Merge duplicate expert entries and fix typos.
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, expertRankings, expertTeamGrades, expertAccuracyScores} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function merge(oldId: number, newId: number) {
  console.log(`Merging expert ID ${oldId} into ${newId}...`);

  // Update rankings
  await db.update(expertRankings).set({expertId: newId}).where(eq(expertRankings.expertId, oldId));
  // Update team grades
  await db.update(expertTeamGrades).set({expertId: newId}).where(eq(expertTeamGrades.expertId, oldId));
  // Update accuracy scores
  await db.update(expertAccuracyScores).set({expertId: newId}).where(eq(expertAccuracyScores.expertId, oldId));

  // Delete old expert
  await db.delete(experts).where(eq(experts.id, oldId));
}

async function run() {
  // Schrager: 12 -> 24
  await merge(12, 24);
  // Zierlein: 11 -> 25
  await merge(11, 25);

  console.log('Merge complete.');
}

run()
  .catch(console.error)
  .finally(() => client.end());
