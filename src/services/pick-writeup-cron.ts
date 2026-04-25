/**
 * Cron-driven processor that finds picks lacking a cached writeup and
 * generates one via the You.com Research API.
 *
 * Bounded so a single run can't time out: processes up to N picks per call.
 * Hits the ESPN draft endpoint once to resolve player metadata for picks
 * that are missing position/college in the local DB.
 */

import {getDB} from '../db/index.js';
import {apps, pickWriteups} from '../db/schema.js';
import {and, eq} from 'drizzle-orm';
import {getPositionForPlayer} from '../config/draft-data.js';
import {generatePickWriteup, saveWriteup} from './pick-writeup.js';

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 3;

interface CompletedEspnPick {
  pickNumber: number;
  round: number;
  pickInRound: number;
  playerName: string;
  teamName: string;
  position: string | null;
  college: string | null;
}

/**
 * Pull every completed pick from the ESPN draft endpoint. This is the source
 * of truth for the ticker as well — officialDraftResults only stores Round 1
 * because the leaderboard scoring only spans 32 picks, but writeups should
 * cover every pick the user can see in the ticker.
 */
async function fetchCompletedPicksFromEspn(year: number): Promise<CompletedEspnPick[]> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as any;
    const teamLookup = new Map<string, string>();
    if (Array.isArray(data?.teams)) {
      for (const t of data.teams) {
        if (t?.id && t?.displayName) {
          teamLookup.set(String(t.id), t.displayName);
        }
      }
    }
    const out: CompletedEspnPick[] = [];
    for (const p of (data?.picks as any[]) ?? []) {
      const isMade = p?.status === 'SELECTION_MADE' || p?.status === 'PICK_IS_IN';
      if (!isMade) {
        continue;
      }
      const overall = p?.overall ?? p?.pick;
      if (!overall) {
        continue;
      }
      const a = p?.athlete ?? {};
      const playerName = a?.displayName ?? p?.displayName;
      if (!playerName) {
        continue;
      }
      const teamId = String(p?.teamId ?? '');
      const teamName = teamLookup.get(teamId) ?? p?.team?.displayName ?? '';
      if (!teamName) {
        continue;
      }
      const round = p?.round ?? Math.ceil(overall / 32);
      const pickInRound = p?.pick ?? overall - (round - 1) * 32;
      const college =
        a?.team?.location && a?.team?.name ? `${a.team.location} ${a.team.name}` : (a?.college?.displayName ?? null);
      out.push({
        pickNumber: overall,
        round,
        pickInRound,
        playerName,
        teamName,
        position: getPositionForPlayer(playerName, year) ?? null,
        college,
      });
    }
    return out.sort((a, b) => a.pickNumber - b.pickNumber);
  } catch (_) {
    return [];
  }
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
 * Pass `force: true` to regenerate even cached picks (used for prompt-format
 * backfills). Always returns — never throws — so a single bad pick won't
 * kill the run.
 */
export async function generatePendingPickWriteups(
  year: number,
  batchSize = DEFAULT_BATCH_SIZE,
  options: {force?: boolean} = {},
): Promise<WriteupCronResult> {
  const result: WriteupCronResult = {attempted: 0, generated: 0, skipped: 0, errors: []};

  const appId = await getNflDraftAppId();
  if (appId == null) {
    return result;
  }

  const db = getDB();
  const completed = await fetchCompletedPicksFromEspn(year);
  if (completed.length === 0) {
    return result;
  }

  // Build the work queue:
  // - default mode: only picks that don't have a writeup yet (in pickNumber order)
  // - force mode: picks lacking grade_breakdown first (needs migration), then
  //   the ones with the oldest generatedAt — so a loop with force=1 walks the
  //   whole table without repeating the same picks every call.
  const existing = await db
    .select({
      pickNumber: pickWriteups.pickNumber,
      generatedAt: pickWriteups.generatedAt,
      gradeBreakdown: pickWriteups.gradeBreakdown,
    })
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year)));

  function buildQueue(): typeof completed {
    if (!options.force) {
      const have = new Set(existing.map((e) => e.pickNumber));
      return completed.filter((c) => !have.has(c.pickNumber));
    }
    const meta = new Map(existing.map((e) => [e.pickNumber, e]));
    return [...completed].sort((a, b) => {
      const ma = meta.get(a.pickNumber);
      const mb = meta.get(b.pickNumber);
      const aMissing = ma == null ? 0 : 1;
      const bMissing = mb == null ? 0 : 1;
      if (aMissing !== bMissing) {
        return aMissing - bMissing;
      }
      const aNeedsMigration = ma && (!Array.isArray(ma.gradeBreakdown) || ma.gradeBreakdown.length === 0) ? 0 : 1;
      const bNeedsMigration = mb && (!Array.isArray(mb.gradeBreakdown) || mb.gradeBreakdown.length === 0) ? 0 : 1;
      if (aNeedsMigration !== bNeedsMigration) {
        return aNeedsMigration - bNeedsMigration;
      }
      const aTime = ma?.generatedAt?.getTime() ?? 0;
      const bTime = mb?.generatedAt?.getTime() ?? 0;
      return aTime - bTime;
    });
  }

  const pending = buildQueue().slice(0, batchSize);
  if (pending.length === 0) {
    return result;
  }

  for (const pick of pending) {
    result.attempted++;
    try {
      const generation = await generatePickWriteup({
        appId,
        year,
        pickNumber: pick.pickNumber,
        round: pick.round,
        pickInRound: pick.pickInRound,
        playerName: pick.playerName,
        position: pick.position,
        college: pick.college,
        teamName: pick.teamName,
      });
      await saveWriteup(appId, year, pick.pickNumber, pick.playerName, generation);
      result.generated++;
      console.log(
        `[WRITEUP] generated pick ${pick.pickNumber} (${pick.playerName}) grade=${generation.gradeLetter ?? 'N/A'}`,
      );
    } catch (err: any) {
      const message = err?.message ?? String(err);
      result.errors.push({pickNumber: pick.pickNumber, message});
      console.error(`[WRITEUP] pick ${pick.pickNumber} failed:`, message);
    }
  }

  return result;
}
