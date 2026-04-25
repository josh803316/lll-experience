/**
 * Cron-driven processor that finds picks lacking a cached writeup and
 * generates one via the You.com Research API.
 *
 * Bounded so a single run can't time out: processes up to N picks per call.
 * Hits the ESPN draft endpoint once to resolve player metadata for picks
 * that are missing position/college in the local DB.
 */

import {getDB} from '../db/index.js';
import {apps, officialDraftResults, pickWriteups} from '../db/schema.js';
import {and, asc, eq, isNotNull} from 'drizzle-orm';
import {getPositionForPlayer} from '../config/draft-data.js';
import {generatePickWriteup, saveWriteup} from './pick-writeup.js';

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 3;

interface ESPNPickMeta {
  pickNumber: number;
  round: number;
  pickInRound: number;
  position: string | null;
  college: string | null;
}

/** Build a lookup of pickNumber → ESPN metadata (round, position, college). */
async function fetchEspnPickMetadata(year: number): Promise<Map<number, ESPNPickMeta>> {
  const map = new Map<number, ESPNPickMeta>();
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return map;
    }
    const data = (await res.json()) as any;
    const picks: any[] = Array.isArray(data?.picks) ? data.picks : [];
    for (const p of picks) {
      const overall = p?.overall ?? p?.pick;
      if (!overall) {
        continue;
      }
      const round = p?.round ?? Math.ceil(overall / 32);
      const pickInRound = p?.pick ?? overall - (round - 1) * 32;
      const a = p?.athlete ?? {};
      const college =
        a?.team?.location && a?.team?.name ? `${a.team.location} ${a.team.name}` : (a?.college?.displayName ?? null);
      map.set(overall, {
        pickNumber: overall,
        round,
        pickInRound,
        position: null, // we get this from getPositionForPlayer locally
        college,
      });
    }
  } catch (_) {
    // best-effort
  }
  return map;
}

async function getNflDraftAppId(): Promise<number | null> {
  const db = getDB();
  const [row] = await db.select().from(apps).where(eq(apps.slug, 'nfl-draft')).limit(1);
  return row?.id ?? null;
}

export interface WriteupCronResult {
  attempted: number;
  generated: number;
  skipped: number;
  errors: Array<{pickNumber: number; message: string}>;
}

/**
 * Process up to `batchSize` picks that have a player but no cached writeup.
 * Always returns — never throws — so a single bad pick won't kill the run.
 */
export async function generatePendingPickWriteups(
  year: number,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<WriteupCronResult> {
  const result: WriteupCronResult = {attempted: 0, generated: 0, skipped: 0, errors: []};

  const appId = await getNflDraftAppId();
  if (appId == null) {
    return result;
  }

  const db = getDB();

  // Picks that have a player + team and no writeup yet
  const completed = await db
    .select()
    .from(officialDraftResults)
    .where(
      and(
        eq(officialDraftResults.appId, appId),
        eq(officialDraftResults.year, year),
        isNotNull(officialDraftResults.playerName),
        isNotNull(officialDraftResults.teamName),
      ),
    )
    .orderBy(asc(officialDraftResults.pickNumber));

  if (completed.length === 0) {
    return result;
  }

  const existing = await db
    .select({pickNumber: pickWriteups.pickNumber})
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year)));
  const have = new Set(existing.map((e) => e.pickNumber));

  const pending = completed.filter((c) => !have.has(c.pickNumber)).slice(0, batchSize);
  if (pending.length === 0) {
    return result;
  }

  const espnMeta = await fetchEspnPickMetadata(year);

  for (const pick of pending) {
    result.attempted++;
    if (!pick.playerName || !pick.teamName) {
      result.skipped++;
      continue;
    }

    const meta = espnMeta.get(pick.pickNumber);
    const round = meta?.round ?? Math.ceil(pick.pickNumber / 32);
    const pickInRound = meta?.pickInRound ?? pick.pickNumber - (round - 1) * 32;
    const position = getPositionForPlayer(pick.playerName, year) ?? null;
    const college = meta?.college ?? null;

    try {
      const {writeup, sources} = await generatePickWriteup({
        appId,
        year,
        pickNumber: pick.pickNumber,
        round,
        pickInRound,
        playerName: pick.playerName,
        position,
        college,
        teamName: pick.teamName,
      });
      await saveWriteup(appId, year, pick.pickNumber, pick.playerName, writeup, sources);
      result.generated++;
      console.log(`[WRITEUP] generated pick ${pick.pickNumber} (${pick.playerName})`);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      result.errors.push({pickNumber: pick.pickNumber, message});
      console.error(`[WRITEUP] pick ${pick.pickNumber} failed:`, message);
    }
  }

  return result;
}
