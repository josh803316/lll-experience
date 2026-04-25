/**
 * Shared draft-ticker service.
 * Fetches live picks from ESPN (with DB fallback) and exposes helpers used
 * by both the chat ticker and the global ticker that appears on every page.
 */

import {getDB} from '../db/index.js';
import {draftSettings, draftMockState, officialDraftResults} from '../db/schema.js';
import {and, eq} from 'drizzle-orm';
import {getFirstRoundTeams, getPositionForPlayer} from '../config/draft-data.js';
import type {TickerPick} from '../views/chat-templates.js';

const FETCH_TIMEOUT_MS = 10_000;

export interface TickerState {
  picks: TickerPick[];
  draftLive: boolean;
  mockActive: boolean;
  currentRound: number;
}

export interface NewsItem {
  headline: string;
  description: string;
  link: string;
  publishedAt?: string;
}

export interface PlayerDetail {
  athleteId: string | null;
  pickNumber: number;
  round: number;
  pickInRound: number;
  teamName: string;
  playerName: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  collegeAbbr: string | null;
  headshotUrl: string | null;
  draftGrade: string | null;
  positionRank: string | null;
  overallRank: string | null;
  espnLink: string | null;
  news: NewsItem[];
}

async function isDraftLive(appId: number, year: number): Promise<boolean> {
  const db = getDB();
  const [row] = await db
    .select()
    .from(draftSettings)
    .where(and(eq(draftSettings.appId, appId), eq(draftSettings.year, year)))
    .limit(1);
  return row?.draftStartedAt != null;
}

async function isMockActive(appId: number, year: number): Promise<boolean> {
  const db = getDB();
  const [row] = await db
    .select()
    .from(draftMockState)
    .where(and(eq(draftMockState.appId, appId), eq(draftMockState.year, year)))
    .limit(1);
  return !!row;
}

function pickToRound(overall: number): {round: number; pickInRound: number} {
  const round = Math.ceil(overall / 32);
  const pickInRound = overall - (round - 1) * 32;
  return {round, pickInRound};
}

/** Fetch live draft picks from ESPN. Returns null on failure. */
async function fetchLiveTickerFromESPN(year: number): Promise<{picks: TickerPick[]; currentRound: number} | null> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
    const res = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as any;
    const allPicks: any[] = Array.isArray(data?.picks) ? data.picks : [];
    if (allPicks.length === 0) {
      return null;
    }

    const teamLookup = new Map<string, string>();
    if (Array.isArray(data?.teams)) {
      for (const t of data.teams) {
        if (t?.id && t?.displayName) {
          teamLookup.set(String(t.id), t.displayName);
        }
      }
    }

    let currentRound = 1;
    const onClock = allPicks.find((p: any) => p?.status && p.status !== 'SELECTION_MADE' && p.status !== 'PICK_IS_IN');
    if (onClock) {
      currentRound = onClock.round ?? pickToRound(onClock.overall ?? 1).round;
    } else {
      const lastMade = allPicks.filter((p: any) => p?.status === 'SELECTION_MADE' || p?.status === 'PICK_IS_IN');
      if (lastMade.length > 0) {
        currentRound = lastMade[lastMade.length - 1].round ?? 1;
      }
    }

    const picks: TickerPick[] = allPicks.map((p: any) => {
      const overall = p?.overall ?? p?.pick ?? 0;
      const round = p?.round ?? pickToRound(overall).round;
      const pickInRound = p?.pick ?? pickToRound(overall).pickInRound;
      const teamId = String(p?.teamId ?? '');
      const teamName = teamLookup.get(teamId) ?? p?.team?.displayName ?? `Pick ${overall}`;
      const isMade = p?.status === 'SELECTION_MADE' || p?.status === 'PICK_IS_IN';
      const playerName = isMade ? (p?.athlete?.displayName ?? p?.displayName ?? null) : null;
      const athleteId = p?.athlete?.id != null ? String(p.athlete.id) : null;

      return {
        pickNumber: overall,
        round,
        pickInRound,
        teamName,
        playerName,
        position: playerName ? (getPositionForPlayer(playerName, year) ?? null) : null,
        athleteId,
      };
    });

    return {picks, currentRound};
  } catch (err: any) {
    console.error('[TICKER] ESPN fetch failed:', err?.message ?? err);
    return null;
  }
}

/** Build the full ticker state. ESPN-first, DB fallback. */
export async function buildTickerData(appId: number, year: number): Promise<TickerState> {
  const draftLive = await isDraftLive(appId, year);
  const mockActive = await isMockActive(appId, year);

  const live = await fetchLiveTickerFromESPN(year);
  if (live && live.picks.length > 0) {
    return {picks: live.picks, draftLive, mockActive, currentRound: live.currentRound};
  }

  const db = getDB();
  const teams = getFirstRoundTeams(year);
  const official = await db
    .select()
    .from(officialDraftResults)
    .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year)))
    .orderBy(officialDraftResults.pickNumber);

  const picks: TickerPick[] = [];
  for (let num = 1; num <= 32; num++) {
    const result = official.find((r) => r.pickNumber === num);
    picks.push({
      pickNumber: num,
      round: 1,
      pickInRound: num,
      teamName: result?.teamName || teams[num] || `Pick ${num}`,
      playerName: result?.playerName ?? null,
      position: result?.playerName ? (getPositionForPlayer(result.playerName, year) ?? null) : null,
      athleteId: null,
    });
  }
  return {picks, draftLive, mockActive, currentRound: 1};
}

/** Fetch news / scouting articles for a college athlete (uses ESPN alternativeId). */
async function fetchAthleteNews(alternativeId: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${alternativeId}/overview`,
      {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)},
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as any;
    const news: any[] = Array.isArray(data?.news) ? data.news : [];
    return news
      .map(
        (n: any): NewsItem => ({
          headline: String(n?.headline ?? n?.linkText ?? ''),
          description: String(n?.description ?? ''),
          link: String(n?.links?.web?.href ?? ''),
          publishedAt: n?.lastModified ?? n?.published ?? undefined,
        }),
      )
      .filter((n) => n.headline && n.link)
      .slice(0, 4);
  } catch (_) {
    return [];
  }
}

/** Pull a named attribute (e.g. "grade", "rank", "overall") from ESPN athlete attributes. */
function readAttr(attrs: any[] | undefined, name: string): string | null {
  if (!Array.isArray(attrs)) {
    return null;
  }
  const match = attrs.find((a: any) => a?.name === name);
  const value = match?.displayValue ?? match?.value;
  return value != null ? String(value) : null;
}

/**
 * Fetch detail for a specific pick. The ESPN draft endpoint already returns
 * a rich athlete object inline (height, weight, college team, headshot,
 * draft grade, profile link), so we use that directly and only hit the
 * external news endpoint for "what experts are saying" content.
 */
export async function getPickDetail(year: number, pickNumber: number): Promise<PlayerDetail | null> {
  let pickEntry: any = null;
  const teamLookup = new Map<string, string>();
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
    const res = await fetch(url, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    if (res.ok) {
      const data = (await res.json()) as any;
      const allPicks: any[] = Array.isArray(data?.picks) ? data.picks : [];
      pickEntry = allPicks.find((p: any) => (p?.overall ?? p?.pick) === pickNumber) ?? null;
      if (Array.isArray(data?.teams)) {
        for (const t of data.teams) {
          if (t?.id && t?.displayName) {
            teamLookup.set(String(t.id), t.displayName);
          }
        }
      }
    }
  } catch (_) {
    // fall through
  }

  if (!pickEntry) {
    return null;
  }

  const a = pickEntry?.athlete ?? {};
  const overall = pickEntry?.overall ?? pickEntry?.pick ?? pickNumber;
  const round = pickEntry?.round ?? pickToRound(overall).round;
  const pickInRound = pickEntry?.pick ?? pickToRound(overall).pickInRound;
  const teamId = String(pickEntry?.teamId ?? '');
  const teamName = teamLookup.get(teamId) ?? pickEntry?.team?.displayName ?? `Pick ${overall}`;
  const isMade = pickEntry?.status === 'SELECTION_MADE' || pickEntry?.status === 'PICK_IS_IN';
  const playerName = isMade ? (a?.displayName ?? pickEntry?.displayName ?? null) : null;

  // alternativeId is ESPN's player profile id (used in URLs); id is the prospect id.
  const profileId = a?.alternativeId != null ? String(a.alternativeId) : null;
  const athleteId = a?.id != null ? String(a.id) : null;

  const collegeFull =
    a?.team?.location && a?.team?.name
      ? `${a.team.location} ${a.team.name}`
      : (a?.team?.shortDisplayName ?? a?.college?.displayName ?? null);
  const collegeAbbr = a?.team?.abbreviation ?? null;

  const detail: PlayerDetail = {
    athleteId,
    pickNumber: overall,
    round,
    pickInRound,
    teamName,
    playerName,
    position: playerName ? (getPositionForPlayer(playerName, year) ?? null) : null,
    height: a?.displayHeight ? String(a.displayHeight) : null,
    weight: a?.displayWeight ? String(a.displayWeight) : null,
    college: collegeFull,
    collegeAbbr,
    headshotUrl: a?.headshot?.href ?? null,
    draftGrade: readAttr(a?.attributes, 'grade'),
    positionRank: readAttr(a?.attributes, 'rank'),
    overallRank: readAttr(a?.attributes, 'overall'),
    espnLink: a?.link ?? (profileId ? `https://www.espn.com/nfl/player/_/id/${profileId}` : null),
    news: [],
  };

  // Fetch news in the background (using alternativeId — this is the right id for the URL)
  if (profileId) {
    detail.news = await fetchAthleteNews(profileId);
  }

  return detail;
}
