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

export interface PlayerDetail {
  athleteId: string | null;
  pickNumber: number;
  round: number;
  pickInRound: number;
  teamName: string;
  playerName: string | null;
  position: string | null;
  jersey: string | null;
  height: string | null;
  weight: string | null;
  displayDOB: string | null;
  age: number | null;
  college: string | null;
  hometown: string | null;
  headshotUrl: string | null;
  bio: string | null;
  analysis: string | null;
  espnLink: string | null;
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

/**
 * Fetch detail for a specific pick from the live ESPN draft endpoint.
 * Returns the basic info the UI already has, then enriches it with the athlete
 * detail and overview endpoints when available.
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

  const overall = pickEntry?.overall ?? pickEntry?.pick ?? pickNumber;
  const round = pickEntry?.round ?? pickToRound(overall).round;
  const pickInRound = pickEntry?.pick ?? pickToRound(overall).pickInRound;
  const teamId = String(pickEntry?.teamId ?? '');
  const teamName = teamLookup.get(teamId) ?? pickEntry?.team?.displayName ?? `Pick ${overall}`;
  const isMade = pickEntry?.status === 'SELECTION_MADE' || pickEntry?.status === 'PICK_IS_IN';
  const playerName = isMade ? (pickEntry?.athlete?.displayName ?? pickEntry?.displayName ?? null) : null;
  const athleteId = pickEntry?.athlete?.id != null ? String(pickEntry.athlete.id) : null;

  const detail: PlayerDetail = {
    athleteId,
    pickNumber: overall,
    round,
    pickInRound,
    teamName,
    playerName,
    position:
      pickEntry?.athlete?.position?.abbreviation ??
      (playerName ? (getPositionForPlayer(playerName, year) ?? null) : null),
    jersey: null,
    height: null,
    weight: null,
    displayDOB: null,
    age: null,
    college: pickEntry?.athlete?.college?.displayName ?? null,
    hometown: null,
    headshotUrl: pickEntry?.athlete?.headshot?.href ?? null,
    bio: null,
    analysis: null,
    espnLink: athleteId ? `https://www.espn.com/nfl/player/_/id/${athleteId}` : null,
  };

  // Best-effort enrichment: ESPN's athlete endpoint
  if (athleteId) {
    try {
      const aRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${athleteId}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (aRes.ok) {
        const aData = (await aRes.json()) as any;
        const a = aData?.athlete ?? aData;
        detail.height = (a?.displayHeight ?? a?.height) ? String(a.displayHeight ?? a.height) : detail.height;
        detail.weight = (a?.displayWeight ?? a?.weight) ? String(a.displayWeight ?? a.weight) : detail.weight;
        detail.jersey = a?.jersey ? String(a.jersey) : detail.jersey;
        detail.displayDOB = a?.displayDOB ?? a?.dateOfBirth ?? detail.displayDOB;
        detail.age = typeof a?.age === 'number' ? a.age : detail.age;
        detail.college = a?.college?.displayName ?? a?.educationalInstitution?.displayName ?? detail.college;
        const birthPlace =
          a?.birthPlace?.displayText ?? [a?.birthPlace?.city, a?.birthPlace?.state].filter(Boolean).join(', ');
        detail.hometown = birthPlace || detail.hometown;
        detail.headshotUrl = a?.headshot?.href ?? detail.headshotUrl;
        detail.position = a?.position?.abbreviation ?? detail.position;
      }
    } catch (_) {
      // ignore — we still have basic info
    }

    // Overview endpoint occasionally has narrative content (news/draft analysis).
    try {
      const oRes = await fetch(
        `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${athleteId}/overview`,
        {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)},
      );
      if (oRes.ok) {
        const oData = (await oRes.json()) as any;
        const news: any[] = Array.isArray(oData?.news) ? oData.news : [];
        const lead = news.find((n) => n?.description) ?? news[0];
        if (lead?.description) {
          detail.analysis = String(lead.description);
        }
        const bio = oData?.bio ?? oData?.athlete?.bio;
        if (bio && typeof bio === 'string') {
          detail.bio = bio;
        }
      }
    } catch (_) {
      // ignore
    }
  }

  return detail;
}
