/**
 * Live rankings refresh service.
 * Fetches ESPN's draft prospect big board from their public API and caches
 * it in memory. The cache is used by GET /draft/:year/players when source=espn.
 * A refresh is triggered by POST /draft/:year/players/refresh.
 */

import type { RankedPlayer } from "../config/rankings.js";

const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  players: RankedPlayer[];
  fetchedAt: number;
  source: string;
}

const cache = new Map<number, CacheEntry>();

/** ESPN prospect big board endpoint (public, no auth required). */
async function fetchESPNProspects(year: number): Promise<RankedPlayer[]> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/draft/prospects?limit=50&sort=rank:asc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];

  const data = (await res.json()) as any;
  const items: any[] = data?.items ?? [];
  if (!items.length) return [];

  const players: RankedPlayer[] = [];
  for (const item of items) {
    const rank = item?.rank ?? item?.overallRank;
    const name =
      item?.athlete?.displayName ??
      item?.athlete?.shortName ??
      item?.displayName ??
      null;
    const school =
      item?.athlete?.college?.displayName ??
      item?.college?.displayName ??
      item?.school ??
      "Unknown";
    const position =
      item?.athlete?.position?.abbreviation ??
      item?.position?.abbreviation ??
      item?.positionAbbreviation ??
      "?";
    if (!name || !rank) continue;
    players.push({ rank: Number(rank), playerName: name, school, position });
  }
  return players.sort((a, b) => a.rank - b.rank);
}

/** ESPN site API draft page — alternative endpoint that sometimes includes prospects. */
async function fetchESPNSiteProspects(year: number): Promise<RankedPlayer[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];

  const data = (await res.json()) as any;
  const prospects: any[] = data?.prospects ?? data?.players ?? [];
  if (!prospects.length) return [];

  return prospects
    .map((p: any, i: number) => ({
      rank: p?.rank ?? p?.overallRank ?? i + 1,
      playerName:
        p?.athlete?.displayName ?? p?.displayName ?? p?.name ?? "Unknown",
      school:
        p?.athlete?.college?.displayName ?? p?.college ?? "Unknown",
      position:
        p?.athlete?.position?.abbreviation ?? p?.position ?? "?",
    }))
    .filter((p) => p.playerName !== "Unknown")
    .sort((a, b) => a.rank - b.rank);
}

export interface RefreshResult {
  players: RankedPlayer[];
  source: string;
  fromCache: boolean;
  fetchedAt: Date;
}

/**
 * Fetch fresh ESPN prospect rankings for a draft year.
 * Returns cached data if within TTL. Pass force=true to bypass cache.
 */
export async function refreshESPNProspects(
  year: number,
  force = false
): Promise<RefreshResult> {
  const cached = cache.get(year);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      players: cached.players,
      source: cached.source,
      fromCache: true,
      fetchedAt: new Date(cached.fetchedAt),
    };
  }

  // Try primary ESPN Core endpoint first, then site API.
  let players = await fetchESPNProspects(year).catch(() => [] as RankedPlayer[]);
  let source = "ESPN Core API";

  if (!players.length) {
    players = await fetchESPNSiteProspects(year).catch(() => [] as RankedPlayer[]);
    source = "ESPN Site API";
  }

  if (players.length) {
    cache.set(year, { players, fetchedAt: Date.now(), source });
    return { players, source, fromCache: false, fetchedAt: new Date() };
  }

  // Both failed — return cached even if stale, or empty.
  if (cached) {
    return {
      players: cached.players,
      source: cached.source + " (stale cache)",
      fromCache: true,
      fetchedAt: new Date(cached.fetchedAt),
    };
  }

  return { players: [], source: "none", fromCache: false, fetchedAt: new Date() };
}

/** Return cached ESPN prospects without triggering a fetch. */
export function getCachedESPNProspects(year: number): RankedPlayer[] | null {
  return cache.get(year)?.players ?? null;
}
