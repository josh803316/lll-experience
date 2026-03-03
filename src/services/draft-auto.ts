/**
 * Draft auto-start and official picks sync.
 * - When draft start time passes: auto-start draft (lock picks), clear mock, use real mode.
 * - Periodically sync official first-round picks from multiple sources (ESPN primary + fallbacks).
 */

import {getDB} from '../db/index.js';
import {apps, draftSettings, officialDraftResults, draftMockState} from '../db/schema.js';
import {eq, and} from 'drizzle-orm';
import {CURRENT_DRAFT_YEAR, getDraftStartTimeMs} from '../config/draft-data.js';

const POLL_INTERVAL_MS = 60_000; // 1 minute
const FETCH_TIMEOUT_MS = 12_000;

export type OfficialPickEntry = {pickNumber: number; playerName: string | null; teamName: string | null};

async function getNflDraftAppId(): Promise<number | null> {
  const db = getDB();
  const row = await db.select().from(apps).where(eq(apps.slug, 'nfl-draft')).limit(1);
  return row[0]?.id ?? null;
}

async function getDraftStarted(appId: number, year: number): Promise<boolean> {
  const db = getDB();
  const row = await db
    .select()
    .from(draftSettings)
    .where(and(eq(draftSettings.appId, appId), eq(draftSettings.year, year)))
    .limit(1);
  return row[0]?.draftStartedAt != null;
}

/** Source 1: ESPN Core API v2 draft picks */
async function fetchFromESPNCore(year: number): Promise<OfficialPickEntry[]> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/draft/picks?limit=100`;
  const res = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const items: any[] = data?.items ?? [];
  const firstRound = items.filter((item: any) => item?.round === 1 || (!item?.round && (item?.pick ?? 0) <= 32));

  const out: OfficialPickEntry[] = [];
  for (const item of firstRound) {
    const pickNum = item?.pick;
    if (!pickNum || pickNum > 32) {
      continue;
    }
    const playerName = item?.athlete?.displayName ?? item?.athlete?.shortName ?? null;
    const teamName = item?.team?.displayName ?? null;
    out.push({pickNumber: pickNum, playerName: playerName ?? null, teamName: teamName ?? null});
  }
  return out;
}

/** Source 2: ESPN Site API draft summary (rounds[0].picks) */
async function fetchFromESPNSite(year: number): Promise<OfficialPickEntry[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const rounds = data?.rounds ?? [];
  const round1 = Array.isArray(rounds)
    ? (rounds.find((r: any) => r?.number === 1 || r?.round === 1) ?? rounds[0])
    : null;
  const picks: any[] = round1?.picks ?? [];
  const out: OfficialPickEntry[] = [];
  for (const p of picks) {
    const pickNum = p?.pick ?? p?.overall ?? p?.number;
    if (!pickNum || pickNum > 32) {
      continue;
    }
    const name = p?.athlete?.displayName ?? p?.displayName ?? p?.name ?? p?.athlete?.shortName ?? null;
    const team = p?.team?.displayName ?? p?.team?.name ?? p?.teamName ?? null;
    out.push({pickNumber: Number(pickNum), playerName: name ?? null, teamName: team ?? null});
  }
  return out;
}

/** Source 3: ESPN alternate (draft summary) — different path sometimes used by ESPN frontend */
async function fetchFromESPNAlternate(year: number): Promise<OfficialPickEntry[]> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/1/draft?limit=50`;
  const res = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const items: any[] = data?.items ?? [];
  const out: OfficialPickEntry[] = [];
  for (const item of items) {
    const pickNum = item?.pick ?? item?.overall;
    if (!pickNum || pickNum > 32) {
      continue;
    }
    const playerName = item?.athlete?.displayName ?? item?.athlete?.shortName ?? item?.displayName ?? null;
    const teamName = item?.team?.displayName ?? item?.teamName ?? null;
    out.push({pickNumber: Number(pickNum), playerName: playerName ?? null, teamName: teamName ?? null});
  }
  return out;
}

const SOURCES: Array<{name: string; fetch: (year: number) => Promise<OfficialPickEntry[]>}> = [
  {name: 'ESPN Core', fetch: fetchFromESPNCore},
  {name: 'ESPN Site', fetch: fetchFromESPNSite},
  {name: 'ESPN Alternate', fetch: fetchFromESPNAlternate},
];

/** Try sources in order; merge first successful result (by pick number). */
export async function syncOfficialPicksFromMultipleSources(
  appId: number,
  year: number,
): Promise<{synced: number; source: string}> {
  for (const source of SOURCES) {
    try {
      const picks = await source.fetch(year);
      if (picks.length === 0) {
        continue;
      }

      const byNum = new Map<number, OfficialPickEntry>();
      for (const p of picks) {
        if (p.pickNumber >= 1 && p.pickNumber <= 32) {
          byNum.set(p.pickNumber, p);
        }
      }

      const db = getDB();
      let synced = 0;
      for (let num = 1; num <= 32; num++) {
        const entry = byNum.get(num);
        if (!entry) {
          continue;
        }

        const existing = await db
          .select()
          .from(officialDraftResults)
          .where(
            and(
              eq(officialDraftResults.appId, appId),
              eq(officialDraftResults.year, year),
              eq(officialDraftResults.pickNumber, num),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(officialDraftResults)
            .set({playerName: entry.playerName, teamName: entry.teamName})
            .where(
              and(
                eq(officialDraftResults.appId, appId),
                eq(officialDraftResults.year, year),
                eq(officialDraftResults.pickNumber, num),
              ),
            );
        } else {
          await db.insert(officialDraftResults).values({
            appId,
            year,
            pickNumber: num,
            playerName: entry.playerName,
            teamName: entry.teamName,
          });
        }
        synced++;
      }
      if (synced > 0) {
        return {synced, source: source.name};
      }
    } catch (_) {
      // fall through to next source
    }
  }
  return {synced: 0, source: 'none'};
}

/** Clear mock state for year so we use real official results. */
async function clearMockState(appId: number, year: number): Promise<void> {
  const db = getDB();
  await db.delete(draftMockState).where(and(eq(draftMockState.appId, appId), eq(draftMockState.year, year)));
}

/** Single tick: auto-start draft when time has passed, then sync official picks if draft started. */
export async function runDraftAutoTick(year: number): Promise<void> {
  const appId = await getNflDraftAppId();
  if (appId == null) {
    return;
  }

  const startMs = getDraftStartTimeMs(year);
  const now = Date.now();
  const draftStarted = await getDraftStarted(appId, year);

  // Auto-start: countdown finished and draft not yet started
  if (startMs != null && now >= startMs && !draftStarted) {
    const db = getDB();
    const existing = await db
      .select()
      .from(draftSettings)
      .where(and(eq(draftSettings.appId, appId), eq(draftSettings.year, year)))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(draftSettings)
        .set({draftStartedAt: new Date()})
        .where(and(eq(draftSettings.appId, appId), eq(draftSettings.year, year)));
    } else {
      await db.insert(draftSettings).values({appId, year, draftStartedAt: new Date()});
    }
    await clearMockState(appId, year);
    console.log('[DRAFT-AUTO] Draft auto-started and mock cleared for year', year);
  }

  // Sync official picks when draft has started (real mode only — no mock)
  if (draftStarted) {
    const {synced, source} = await syncOfficialPicksFromMultipleSources(appId, year);
    if (synced > 0) {
      console.log('[DRAFT-AUTO] Synced', synced, 'official picks from', source, 'for year', year);
    }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startDraftAutoPolling(): void {
  if (pollTimer != null) {
    return;
  }
  pollTimer = setInterval(async () => {
    try {
      await runDraftAutoTick(CURRENT_DRAFT_YEAR);
    } catch (err: any) {
      console.error('[DRAFT-AUTO] Tick error:', err?.message ?? err);
    }
  }, POLL_INTERVAL_MS);
  console.log('[DRAFT-AUTO] Polling started every', POLL_INTERVAL_MS / 1000, 's for year', CURRENT_DRAFT_YEAR);
}

export function stopDraftAutoPolling(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[DRAFT-AUTO] Polling stopped');
  }
}
