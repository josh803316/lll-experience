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
const TARGET_PLAYER_COUNT = 200;

interface ParsedPlayer {
  rank: number;
  playerName: string;
  school: string;
  position: string;
}

function buildRankingsPrompt(year: number): string {
  return `You are an NFL Draft data analyst. Research the latest ${year} NFL Draft consensus prospect big board rankings as of today.

Compile a ranked list of the top ${TARGET_PLAYER_COUNT} prospects by synthesizing rankings from ESPN, CBS Sports, NFL.com (Daniel Jeremiah), PFF, and Fox Sports.

For EACH player, output EXACTLY one line in this format:
PLAYER|<rank>|<full name>|<school>|<position>

Use standard position abbreviations: QB, RB, WR, TE, OT, IOL, DT, EDGE, LB, CB, S

Example:
PLAYER|1|Fernando Mendoza|Indiana|QB
PLAYER|2|Jeremiyah Love|Notre Dame|RB

Output all ${TARGET_PLAYER_COUNT} PLAYER lines, ranked from best (#1) to #${TARGET_PLAYER_COUNT}. Do not include any other text before or after the list.`;
}

function parseRankingsResponse(content: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  const seen = new Set<string>();

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
      const position = parts[4].trim().toUpperCase();

      if (rank >= 1 && rank <= TARGET_PLAYER_COUNT && playerName && school && position) {
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

  // Call You.com Research API
  const res = await fetch(YOU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      input: buildRankingsPrompt(year),
      research_effort: 'deep',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {updated: 0, skipped: `You.com API error ${res.status}: ${body.slice(0, 200)}`};
  }

  const data = (await res.json()) as {output?: {content?: string}};
  const content = data.output?.content ?? '';
  const players = parseRankingsResponse(content);

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
