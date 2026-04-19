/**
 * Daily rankings refresh via You.com Research API.
 * Called by Vercel Cron — updates the draftablePlayers table with fresh
 * consensus rankings. Automatically stops after draft day.
 */

import {getDB} from '../db/index.js';
import {apps, draftablePlayers} from '../db/schema.js';
import {eq, and} from 'drizzle-orm';
import {CURRENT_DRAFT_YEAR, DRAFT_START_ISO_BY_YEAR} from '../config/draft-data.js';

const YOU_API_URL = 'https://api.you.com/v1/research';
const BATCH_SIZE = 50;
const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'OT',
  'IOL',
  'OG',
  'C',
  'DT',
  'EDGE',
  'DE',
  'LB',
  'OLB',
  'ILB',
  'CB',
  'S',
  'DB',
  'DL',
  'OL',
  'K',
  'P',
]);

interface ParsedPlayer {
  rank: number;
  playerName: string;
  school: string;
  position: string;
}

/** Normalize positions to the standard set used in our app. */
function normPosition(pos: string): string {
  const p = pos.toUpperCase().trim();
  const map: Record<string, string> = {
    DE: 'EDGE',
    OLB: 'LB',
    ILB: 'LB',
    DL: 'DT',
    OL: 'OT',
    OG: 'IOL',
    G: 'IOL',
    T: 'OT',
    DB: 'CB',
    HB: 'RB',
    ED: 'EDGE',
    NG: 'DT',
    DI: 'DT',
  };
  return map[p] ?? p;
}

function buildRankingsPrompt(year: number, startRank: number, endRank: number): string {
  return `What are the top prospects ranked #${startRank} through #${endRank} in the ${year} NFL Draft? Use the latest consensus from mock draft experts.

Output one line per player in this EXACT format (no other text):
PLAYER|<rank>|<full name>|<school>|<position>

Positions: QB, RB, WR, TE, OT, IOL, DT, EDGE, LB, CB, S

Example:
PLAYER|${startRank}|Fernando Mendoza|Indiana|QB
PLAYER|${startRank + 1}|Jeremiyah Love|Notre Dame|RB`;
}

function parseRankingsResponse(content: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  const seen = new Set<string>();

  // Primary: PLAYER| format
  for (const line of content.split('\n')) {
    const trimmed = line.replace(/^\s*[-*>]*\s*/, '').trim();
    if (!trimmed.startsWith('PLAYER|')) {
      continue;
    }
    const parts = trimmed.split('|');
    if (parts.length >= 5) {
      const rank = parseInt(parts[1], 10);
      const playerName = parts[2].trim();
      const school = parts[3].trim();
      const position = normPosition(parts[4]);
      if (rank >= 1 && rank <= BATCH_SIZE * 4 && playerName && school && position) {
        const key = playerName.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          players.push({rank, playerName, school, position});
        }
      }
    }
  }

  // Fallback: numbered list like "1. Fernando Mendoza, Indiana, QB"
  if (players.length < 30) {
    const pattern =
      /(\d{1,3})\.\s*([A-Z][A-Za-z'.–-]+(?:\s+[A-Za-z'.–-]+){1,4})\s*[,|–-]\s*([A-Za-z][A-Za-z .'()]+?)\s*[,|–-]\s*([A-Z]{1,4})/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const rank = parseInt(match[1], 10);
      const playerName = match[2].trim();
      const school = match[3].trim();
      const position = normPosition(match[4]);
      if (rank >= 1 && rank <= BATCH_SIZE * 4 && playerName && school && VALID_POSITIONS.has(position)) {
        const key = playerName.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          players.push({rank, playerName, school, position});
        }
      }
    }
  }

  return players.sort((a, b) => a.rank - b.rank);
}

export async function refreshRankingsFromAi(year: number): Promise<{updated: number; skipped: string | null}> {
  // Stop after draft day
  const draftIso = DRAFT_START_ISO_BY_YEAR[year];
  if (draftIso) {
    const draftDate = new Date(draftIso);
    if (Date.now() > draftDate.getTime()) {
      return {updated: 0, skipped: 'Draft has already started — skipping refresh.'};
    }
  }

  const apiKey = process.env.YOU_API_KEY;
  if (!apiKey) {
    return {updated: 0, skipped: 'YOU_API_KEY not configured.'};
  }

  // Fetch in batches of BATCH_SIZE to keep prompts simple
  const allPlayers: ParsedPlayer[] = [];
  const batches = [
    [1, BATCH_SIZE],
    [BATCH_SIZE + 1, BATCH_SIZE * 2],
    [BATCH_SIZE * 2 + 1, BATCH_SIZE * 3],
    [BATCH_SIZE * 3 + 1, BATCH_SIZE * 4],
  ];

  for (const [start, end] of batches) {
    try {
      const res = await fetch(YOU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          input: buildRankingsPrompt(year, start, end),
          research_effort: 'lite',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        console.log(`[RANKINGS-CRON] Batch ${start}-${end} failed: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as {output?: {content?: string}};
      const content = data.output?.content ?? '';
      const batch = parseRankingsResponse(content);
      console.log(`[RANKINGS-CRON] Batch ${start}-${end}: parsed ${batch.length} players`);
      allPlayers.push(...batch);
    } catch (err: any) {
      console.log(`[RANKINGS-CRON] Batch ${start}-${end} error: ${err?.message ?? err}`);
    }
  }

  // Re-rank sequentially
  const players = allPlayers.sort((a, b) => a.rank - b.rank).map((p, i) => ({...p, rank: i + 1}));
  console.log(`[RANKINGS-CRON] Total: ${players.length} players`);

  if (players.length < 30) {
    return {updated: 0, skipped: `Only parsed ${players.length} players — too few, skipping update.`};
  }

  // Update database
  const db = getDB();
  const [app] = await db.select().from(apps).where(eq(apps.slug, 'nfl-draft')).limit(1);
  if (!app) {
    return {updated: 0, skipped: 'nfl-draft app not found in database.'};
  }

  // Delete existing and re-insert
  await db.delete(draftablePlayers).where(and(eq(draftablePlayers.appId, app.id), eq(draftablePlayers.year, year)));

  await db.insert(draftablePlayers).values(
    players.map((p) => ({
      appId: app.id,
      year,
      rank: p.rank,
      playerName: p.playerName,
      school: p.school,
      position: p.position,
    })),
  );

  console.log(`[RANKINGS-CRON] Updated ${players.length} players for ${year}`);
  return {updated: players.length, skipped: null};
}
