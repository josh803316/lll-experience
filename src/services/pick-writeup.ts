/**
 * LLM-generated draft pick analysis, cached in the pick_writeups table.
 * Powered by the You.com Research API (same key as the AI recommend service).
 *
 * Flow:
 *   1. After a pick syncs into officialDraftResults with a player name, the
 *      generation cron (or sync hook) calls generatePickWriteup() to ask
 *      You.com for a 150–200 word expert analysis.
 *   2. Result is upserted into pick_writeups so subsequent modal opens are
 *      instant — no live API call on the user-facing path.
 */

import {getDB} from '../db/index.js';
import {pickWriteups} from '../db/schema.js';
import {and, eq} from 'drizzle-orm';

const YOU_API_URL = 'https://api.you.com/v1/research';
const FETCH_TIMEOUT_MS = 90_000;

export interface WriteupSource {
  url: string;
  title?: string;
}

export interface PickWriteupRecord {
  pickNumber: number;
  playerName: string | null;
  writeup: string;
  sources: WriteupSource[];
  generatedAt: Date;
}

interface GenerateInput {
  appId: number;
  year: number;
  pickNumber: number;
  round: number;
  pickInRound: number;
  playerName: string;
  position: string | null;
  college: string | null;
  teamName: string;
}

function buildPrompt(p: GenerateInput): string {
  const ordinal = (n: number) =>
    n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const positionStr = p.position ? `, ${p.position}` : '';
  const collegeStr = p.college ? ` out of ${p.college}` : '';

  return [
    `The ${p.teamName} just selected ${p.playerName}${positionStr}${collegeStr} with the ${ordinal(p.pickNumber)} overall pick (round ${p.round}, pick ${p.pickInRound}) of the ${p.year} NFL Draft.`,
    '',
    'Research and write a concise expert analysis of this pick (150–200 words, flowing prose, no bullet lists, no headers). Cover:',
    `• ${p.playerName}'s strengths and on-field profile (scheme fit, athleticism, college production).`,
    `• How they fit the ${p.teamName}' immediate needs and offensive/defensive scheme.`,
    '• The consensus take on the pick — value at this slot, expert grades, any concerns or red flags.',
    '',
    'Cite credible NFL draft sources where the analysis comes from (PFF, ESPN — Mel Kiper / Field Yates / Matt Miller, NFL.com, CBS Sports — Pete Prisco, The Athletic — Dane Brugler, Bleacher Report, The Ringer). Be balanced — note both upside and concerns. Do not invent quotes or stats; if a source contradicts another, say so.',
  ].join('\n');
}

/**
 * Call You.com Research API for a single pick. Returns the writeup text and
 * the cited sources. Throws on API errors so the caller can decide whether
 * to retry.
 */
export async function generatePickWriteup(p: GenerateInput): Promise<{writeup: string; sources: WriteupSource[]}> {
  const apiKey = process.env.YOU_API_KEY;
  if (!apiKey) {
    throw new Error('YOU_API_KEY not set');
  }

  const res = await fetch(YOU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      input: buildPrompt(p),
      research_effort: 'standard',
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`You.com API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    output?: {
      content?: string;
      sources?: Array<{url: string; title?: string}>;
    };
  };

  const writeup = (data.output?.content ?? '').trim();
  const sources: WriteupSource[] = (data.output?.sources ?? [])
    .filter((s) => s?.url)
    .map((s) => ({url: s.url, title: s.title}));

  if (!writeup) {
    throw new Error('You.com returned empty content');
  }

  return {writeup, sources};
}

/** Upsert a generated writeup into the cache. */
export async function saveWriteup(
  appId: number,
  year: number,
  pickNumber: number,
  playerName: string,
  writeup: string,
  sources: WriteupSource[],
): Promise<void> {
  const db = getDB();
  const existing = await db
    .select()
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year), eq(pickWriteups.pickNumber, pickNumber)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pickWriteups)
      .set({playerName, writeup, sources, generatedAt: new Date()})
      .where(eq(pickWriteups.id, existing[0].id));
  } else {
    await db.insert(pickWriteups).values({appId, year, pickNumber, playerName, writeup, sources});
  }
}

/** Read a cached writeup. Returns null if none exists yet. */
export async function getCachedWriteup(
  appId: number,
  year: number,
  pickNumber: number,
): Promise<PickWriteupRecord | null> {
  const db = getDB();
  const [row] = await db
    .select()
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year), eq(pickWriteups.pickNumber, pickNumber)))
    .limit(1);
  if (!row || !row.writeup) {
    return null;
  }
  return {
    pickNumber: row.pickNumber,
    playerName: row.playerName,
    writeup: row.writeup,
    sources: Array.isArray(row.sources) ? (row.sources as WriteupSource[]) : [],
    generatedAt: row.generatedAt,
  };
}
