import { Elysia, t } from "elysia";
import { authGuard } from "../guards/auth-guard.js";
import { getDB } from "../db/index.js";
import { draftPicks, apps, users, draftablePlayers, draftSettings, officialDraftResults, draftHistoricalWinners, draftMockState } from "../db/schema.js";
import { eq, and, sql, asc } from "drizzle-orm";
import { UsersModel } from "../models/users.model.js";
import {
  getFirstRoundTeams,
  getTeamNeeds,
  getStaticPlayersBySource,
  computeConsensusRanking,
  computeAveragePositionRanking,
  getPositionForPlayer,
  CURRENT_DRAFT_YEAR,
  DANIEL_JEREMIAH_MOCK_2_0_2026,
  type RankingSource,
} from "../config/draft-data.js";
import { getClerkProfile, isAdminUserId } from "../lib/clerk-email.js";
import {
  draftLayout,
  picksTableFragment,
  draftablePlayersFragment,
  leaderboardPage,
  leaderboardScoresFragment,
  submittedMocksPage,
  resultsPage,
  type Pick,
  type DraftablePlayer,
  type LeaderboardUser,
  type HistoricalWinnerEntry,
} from "../views/templates.js";

const usersModel = new UsersModel();
const TOTAL_PICKS = 32;

function parseYear(param: string | undefined): number | null {
  if (param == null) return null;
  const y = Number(param);
  return Number.isInteger(y) && y >= 2020 && y <= 2040 ? y : null;
}

async function getOrCreateUser(auth: any) {
  const db = getDB();
  const clerkId = String(auth.userId);
  const profile = await getClerkProfile(clerkId);
  return usersModel.findOrCreate(db, clerkId, {
    email: profile.email || `${clerkId}@clerk.local`,
    firstName: profile.firstName,
    lastName: profile.lastName,
  });
}

async function getApp(slug: string) {
  const db = getDB();
  const result = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1);
  return result[0] ?? null;
}

async function getAvailableYears(appId: number): Promise<number[]> {
  const db = getDB();
  const fromPicks = await db.selectDistinct({ year: draftPicks.year }).from(draftPicks).where(eq(draftPicks.appId, appId));
  const fromSettings = await db.selectDistinct({ year: draftSettings.year }).from(draftSettings).where(eq(draftSettings.appId, appId));
  const set = new Set<number>([CURRENT_DRAFT_YEAR]);
  fromPicks.forEach((r) => set.add(r.year));
  fromSettings.forEach((r) => set.add(r.year));
  return Array.from(set).sort((a, b) => b - a);
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

/** Enforce double-score rules: no double for picks 1–10; at most one double in 11–32 (keep lowest pick number). */
function normalizeDoubleScorePicks<T extends { pickNumber: number; doubleScorePick?: boolean }>(picks: T[]): T[] {
  const withDouble = picks.filter((p) => p.pickNumber > 10 && p.doubleScorePick);
  const singleDoubleNum = withDouble.length > 0 ? Math.min(...withDouble.map((p) => p.pickNumber)) : null;
  return picks.map((p) => ({
    ...p,
    doubleScorePick: p.pickNumber <= 10 ? false : (singleDoubleNum != null && p.pickNumber === singleDoubleNum),
  }));
}

async function getUserPicks(userId: number, appId: number, year: number): Promise<Pick[]> {
  const db = getDB();
  const rows = await db
    .select()
    .from(draftPicks)
    .where(and(eq(draftPicks.userId, userId), eq(draftPicks.appId, appId), eq(draftPicks.year, year)))
    .orderBy(draftPicks.pickNumber);
  return normalizeDoubleScorePicks(rows as Pick[]);
}

async function getDraftablePlayers(appId: number, year: number): Promise<DraftablePlayer[]> {
  const db = getDB();
  return db
    .select()
    .from(draftablePlayers)
    .where(and(eq(draftablePlayers.appId, appId), eq(draftablePlayers.year, year)))
    .orderBy(draftablePlayers.rank) as Promise<DraftablePlayer[]>;
}

/** Scoring: 3 = exact slot, 2 = 1 spot away, 1 = 2 spots away. Double-score pick multiplies points for that slot. */
function computeScore(
  picks: Pick[],
  officialByPick: Map<number, string | null>,
  doubleScorePickSet: Set<number>
): number {
  const officialByPlayer = new Map<string, number>();
  officialByPick.forEach((name, pickNum) => {
    if (name) officialByPlayer.set(normalizeName(name), pickNum);
  });

  let score = 0;
  for (const p of picks) {
    if (!p.playerName) continue;
    const officialPickNum = officialByPlayer.get(normalizeName(p.playerName));
    if (officialPickNum == null) continue;
    const diff = Math.abs(p.pickNumber - officialPickNum);
    const base = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
    const mult = doubleScorePickSet.has(p.pickNumber) ? 2 : 1;
    score += base * mult;
  }
  return score;
}

function normalizeName(name: string): string {
  let s = name.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
  s = s.replace(/\s+(jr|sr|ii|iii|iv)\s*$/i, "").trim();
  s = s.replace(/\breuben\b/g, "rueben");
  return s;
}

// ─── Mock simulation state (Daniel Jeremiah 2.0 order, reveal one pick per 30s) ───
type MockPick = { pickNumber: number; playerName: string; teamName: string; position: string | null };
type MockState = {
  active: boolean;
  revealedCount: number;
  nextRevealAt: number;
  picks: MockPick[];
};
const mockStateByYear = new Map<number, MockState>();

const MOCK_REVEAL_INTERVAL_MS = 30_000;

function getMockState(year: number): MockState | undefined {
  return mockStateByYear.get(year);
}

function advanceMockIfDue(year: number): void {
  const state = mockStateByYear.get(year);
  if (!state?.active || state.revealedCount >= 32) return;
  const now = Date.now();
  while (state.nextRevealAt <= now && state.revealedCount < 32) {
    state.revealedCount += 1;
    state.nextRevealAt += MOCK_REVEAL_INTERVAL_MS;
  }
}

function getMockOfficialPicks(year: number): Map<number, { playerName: string | null; position?: string | null }> | null {
  const state = mockStateByYear.get(year);
  if (!state?.active) return null;
  const map = new Map<number, { playerName: string | null; position?: string | null }>();
  for (let i = 0; i < state.revealedCount && i < state.picks.length; i++) {
    const p = state.picks[i];
    map.set(p.pickNumber, { playerName: p.playerName, position: p.position ?? null });
  }
  return map;
}

function startMock(year: number): boolean {
  if (year !== 2026) return false;
  const teams = getFirstRoundTeams(year);
  const picks: MockPick[] = DANIEL_JEREMIAH_MOCK_2_0_2026.map((playerName, i) => ({
    pickNumber: i + 1,
    playerName,
    teamName: teams[i + 1] ?? `Pick ${i + 1}`,
    position: getPositionForPlayer(playerName, year),
  }));
  mockStateByYear.set(year, {
    active: true,
    revealedCount: 0,
    nextRevealAt: Date.now() + MOCK_REVEAL_INTERVAL_MS,
    picks,
  });
  return true;
}

function resetMock(year: number): void {
  mockStateByYear.delete(year);
}

async function loadMockStateFromDb(appId: number, year: number): Promise<void> {
  const db = getDB();
  const rows = await db
    .select()
    .from(draftMockState)
    .where(and(eq(draftMockState.appId, appId), eq(draftMockState.year, year)))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  const state: MockState = {
    active: true,
    revealedCount: row.revealedCount,
    nextRevealAt: Number(row.nextRevealAtMs),
    picks: row.picksJson as MockPick[],
  };
  mockStateByYear.set(year, state);
  advanceMockIfDue(year);
  await saveMockStateToDb(state, appId, year);
}

async function saveMockStateToDb(state: MockState, appId: number, year: number): Promise<void> {
  const db = getDB();
  const existing = await db
    .select()
    .from(draftMockState)
    .where(and(eq(draftMockState.appId, appId), eq(draftMockState.year, year)))
    .limit(1);
  const payload = {
    appId,
    year,
    revealedCount: state.revealedCount,
    nextRevealAtMs: state.nextRevealAt,
    picksJson: state.picks,
  };
  if (existing[0]) {
    await db.update(draftMockState).set(payload).where(eq(draftMockState.id, existing[0].id));
  } else {
    await db.insert(draftMockState).values(payload);
  }
}

async function deleteMockStateFromDb(appId: number, year: number): Promise<void> {
  await getDB()
    .delete(draftMockState)
    .where(and(eq(draftMockState.appId, appId), eq(draftMockState.year, year)));
}

async function buildLeaderboard(
  appId: number,
  year: number,
  officialOverride?: Map<number, string | null>
) {
  const db = getDB();
  const withCount = await db
    .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
    .from(draftPicks)
    .where(and(eq(draftPicks.appId, appId), eq(draftPicks.year, year)))
    .groupBy(draftPicks.userId);
  const completeUserIds = withCount.filter((r) => r.count === TOTAL_PICKS).map((r) => r.userId);

  let officialResults: Map<number, string | null>;
  if (officialOverride) {
    officialResults = officialOverride;
  } else {
    const officialRows = await db
      .select()
      .from(officialDraftResults)
      .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year)));
    officialResults = new Map(officialRows.map((r) => [r.pickNumber, r.playerName]));
  }

  const leaderboard: Array<{ user: { id: number; firstName: string | null; lastName: string | null; email: string }; score: number; picks: Pick[] }> = [];
  for (const uid of completeUserIds) {
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u) continue;
    const needsClerk =
      !u.firstName && !u.lastName || !u.email || u.email.endsWith("@clerk.local");
    const profile = needsClerk ? await getClerkProfile(u.clerkId) : null;
    const firstName = profile ? profile.firstName : u.firstName;
    const lastName = profile ? profile.lastName : u.lastName;
    const email = profile ? profile.email : u.email;
    const picks = await getUserPicks(uid, appId, year);
    const doubleSet = new Set(picks.filter((p) => p.doubleScorePick).map((p) => p.pickNumber));
    leaderboard.push({
      user: { id: u.id, firstName, lastName, email: email || "" },
      score: computeScore(picks, officialResults, doubleSet),
      picks,
    });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  return leaderboard;
}

export const draftController = new Elysia({ prefix: "/draft" })
  .onBeforeHandle((ctx) => {
    const path = new URL(ctx.request.url).pathname;
    if (path.startsWith("/draft/admin/")) return;
    return authGuard(ctx);
  })

  // GET /draft — redirect to current year
  .get("/", ({ redirect }) => redirect(`/draft/${CURRENT_DRAFT_YEAR}`))

  // GET /draft/:year — main page
  .get("/:year", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    const picks = app ? await getUserPicks(user.id, app.id, year) : [];
    const draftable = app ? await getDraftablePlayers(app.id, year) : [];
    const draftStarted = app ? await getDraftStarted(app.id, year) : false;
    const availableYears = app ? await getAvailableYears(app.id) : [];
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;

    // Check admin status for nav link (logging for admin debug)
    console.log("[DRAFT] Clerk auth payload", {
      userId: auth.userId,
      sessionClaims: auth.sessionClaims ?? null,
    });
    const isAdmin = await isAdminUserId(String(auth.userId));
    if (app) await loadMockStateFromDb(app.id, year);
    const mock = getMockState(year);
    const mockInfo = mock
      ? { active: true, revealedCount: mock.revealedCount, complete: mock.revealedCount >= 32 }
      : { active: false, revealedCount: 0, complete: false };

    ctx.set.headers["Content-Type"] = "text/html";
    return draftLayout(picks, draftable, draftStarted, year, availableYears, clerkKey, isAdmin, mockInfo);
  })

  // GET /draft/:year/picks
  .get("/:year/picks", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    const picks = app ? await getUserPicks(user.id, app.id, year) : [];
    const draftLocked = app ? await getDraftStarted(app.id, year) : false;

    // When mock is active, advance time and use mock picks for "Official" column; otherwise use DB.
    if (app) await loadMockStateFromDb(app.id, year);
    if (app) advanceMockIfDue(year);
    const mockState = getMockState(year);
    if (mockState && app) await saveMockStateToDb(mockState, app.id, year);
    let officialPicksMap: Map<number, { playerName: string | null; position?: string | null }> | undefined;
    if (app) {
      const mockPicks = getMockOfficialPicks(year);
      if (mockPicks) {
        officialPicksMap = mockPicks;
      } else {
        const db = getDB();
        const official = await db
          .select()
          .from(officialDraftResults)
          .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year)));
        officialPicksMap = new Map(
          official.map((r) => [r.pickNumber, { playerName: r.playerName, position: getPositionForPlayer(r.playerName ?? "", year) }])
        );
      }
    }

    const mock = getMockState(year);
    const mockActive = !!mock?.active;
    const mockStatus = mockActive ? { revealedCount: mock.revealedCount, complete: mock.revealedCount >= 32 } : undefined;
    ctx.set.headers["Content-Type"] = "text/html";
    return picksTableFragment(picks, draftLocked, year, officialPicksMap, mockActive, mockStatus);
  })

  // POST /draft/:year/mock/start — admin only; start Daniel Jeremiah 2.0 mock
  .post("/:year/mock/start", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    const isAdmin = await isAdminUserId(String(auth?.userId ?? ""));
    if (!isAdmin) {
      ctx.set.status = 403;
      return "Admin only";
    }
    const app = await getApp("nfl-draft");
    if (!app) {
      ctx.set.status = 500;
      return "App not found";
    }
    if (!startMock(year)) {
      ctx.set.status = 400;
      return "Mock only supported for 2026";
    }
    const state = getMockState(year);
    if (state) await saveMockStateToDb(state, app.id, year);
    ctx.set.headers["HX-Redirect"] = `/draft/${year}`;
    return "";
  })

  // POST /draft/:year/mock/reset — admin only; clear mock state
  .post("/:year/mock/reset", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    const isAdmin = await isAdminUserId(String(auth?.userId ?? ""));
    if (!isAdmin) {
      ctx.set.status = 403;
      return "Admin only";
    }
    const app = await getApp("nfl-draft");
    if (app) await deleteMockStateFromDb(app.id, year);
    resetMock(year);
    ctx.set.headers["HX-Redirect"] = `/draft/${year}`;
    return "";
  })

  // GET /draft/:year/mock-status — JSON for polling (optional)
  .get("/:year/mock-status", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return { active: false, revealedCount: 0, complete: false };
    }
    const app = await getApp("nfl-draft");
    if (app) await loadMockStateFromDb(app.id, year);
    const state = getMockState(year);
    if (!state) {
      return { active: false, revealedCount: 0, complete: false };
    }
    return {
      active: state.active,
      revealedCount: state.revealedCount,
      complete: state.revealedCount >= 32,
    };
  })

  // GET /draft/:year/players
  .get("/:year/players", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const positionFilter = (ctx.query?.position as string) || "OVR";
    const source = ((ctx.query?.source as string) || "cbs") as RankingSource;

    let draftable: DraftablePlayer[];
    if (source === "cbs") {
      const app = await getApp("nfl-draft");
      draftable = app ? await getDraftablePlayers(app.id, year) : [];
    } else if (source === "all") {
      const app = await getApp("nfl-draft");
      const cbsPlayers = app ? await getDraftablePlayers(app.id, year) : [];
      draftable = computeConsensusRanking(cbsPlayers, year) as DraftablePlayer[];
    } else if (source === "avg") {
      const app = await getApp("nfl-draft");
      const cbsPlayers = app ? await getDraftablePlayers(app.id, year) : [];
      draftable = computeAveragePositionRanking(cbsPlayers, year) as DraftablePlayer[];
    } else {
      draftable = getStaticPlayersBySource(year, source) as DraftablePlayer[];
    }

    ctx.set.headers["Content-Type"] = "text/html";
    return draftablePlayersFragment(draftable, positionFilter, source);
  })

  // POST /draft/:year/picks
  .post(
    "/:year/picks",
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      if (year == null) {
        ctx.set.status = 404;
        return "Not found";
      }
      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const app = await getApp("nfl-draft");
      if (!app) {
        ctx.set.status = 404;
        return "App not found";
      }

      const db = getDB();
      type PickPayload = { pickNumber: number; playerName?: string; position?: string; teamName?: string; doubleScorePick?: boolean };
      let parsed: PickPayload[] = [];
      try {
        parsed = JSON.parse(ctx.body.picks as string) as PickPayload[];
      } catch {
        ctx.set.status = 400;
        return "Invalid picks payload";
      }

      // Enforce: no double-score for picks 1–10; at most one double-score in 11–32 (keep lowest pick number)
      const doubleScorePickNumbers = parsed.filter((p) => p.pickNumber > 10 && p.doubleScorePick).map((p) => p.pickNumber);
      const singleDoublePickNum = doubleScorePickNumbers.length > 0 ? Math.min(...doubleScorePickNumbers) : null;
      for (const p of parsed) {
        if (p.pickNumber <= 10) p.doubleScorePick = false;
        else if (singleDoublePickNum != null && p.pickNumber !== singleDoublePickNum) p.doubleScorePick = false;
      }

      // Enforce: no duplicate players (same normalized name); keep first occurrence by slot, clear later ones
      const seenNormalized = new Set<string>();
      for (let num = 1; num <= TOTAL_PICKS; num++) {
        const p = parsed.find((x) => x.pickNumber === num);
        const name = p?.playerName?.trim();
        if (!name) continue;
        const norm = normalizeName(name);
        if (seenNormalized.has(norm)) {
          if (p) p.playerName = undefined;
          if (p) p.position = undefined;
        } else {
          seenNormalized.add(norm);
        }
      }

      const draftStarted = await getDraftStarted(app.id, year);
      if (draftStarted) {
        ctx.set.status = 403;
        return "Draft has started; picks are locked.";
      }

      const teams = getFirstRoundTeams(year);
      const pickMap = new Map((await getUserPicks(user.id, app.id, year)).map((p) => [p.pickNumber, p]));

      for (let num = 1; num <= TOTAL_PICKS; num++) {
        const payload: PickPayload = parsed.find((p) => p.pickNumber === num) ?? { pickNumber: num };
        const teamName = teams[num] ?? null;
        const playerName = payload.playerName?.trim() || null;
        const position = payload.position?.trim() || null;
        const doubleScorePick = num <= 10 ? false : Boolean(payload.doubleScorePick);
        const existing = pickMap.get(num);

        if (existing) {
          if (playerName) {
            await db
              .update(draftPicks)
              .set({
                playerName,
                position,
                teamName,
                doubleScorePick,
                updatedAt: new Date(),
              })
              .where(and(eq(draftPicks.id, existing.id), eq(draftPicks.userId, user.id)));
          } else {
            await db
              .delete(draftPicks)
              .where(and(eq(draftPicks.userId, user.id), eq(draftPicks.appId, app.id), eq(draftPicks.year, year), eq(draftPicks.pickNumber, num)));
          }
        } else if (playerName) {
          await db.insert(draftPicks).values({
            userId: user.id,
            appId: app.id,
            year,
            pickNumber: num,
            teamName,
            playerName,
            position,
            doubleScorePick,
          });
        }
      }

      const picks = await getUserPicks(user.id, app.id, year);
      ctx.set.headers["Content-Type"] = "text/html";
      return picksTableFragment(picks, false, year);
    },
    {
      body: t.Object({ picks: t.String() }),
    }
  )

  // DELETE /draft/:year/picks/:pickNumber
  .delete(
    "/:year/picks/:pickNumber",
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      if (year == null) {
        ctx.set.status = 404;
        return "Not found";
      }
      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const app = await getApp("nfl-draft");
      if (!app) {
        ctx.set.status = 404;
        return "App not found";
      }
      const draftStarted = await getDraftStarted(app.id, year);
      if (draftStarted) {
        ctx.set.status = 403;
        return "Draft has started; picks are locked.";
      }
      const db = getDB();
      const pickNumber = Number(ctx.params.pickNumber);
      await db
        .delete(draftPicks)
        .where(and(eq(draftPicks.userId, user.id), eq(draftPicks.appId, app.id), eq(draftPicks.year, year), eq(draftPicks.pickNumber, pickNumber)));

      const picks = await getUserPicks(user.id, app.id, year);
      ctx.set.headers["Content-Type"] = "text/html";
      return picksTableFragment(picks, false, year);
    },
    {
      params: t.Object({ year: t.String(), pickNumber: t.String() }),
    }
  )

  // GET /draft/:year/leaderboard
  .get("/:year/leaderboard", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }
    const auth = ctx.auth();
    await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const db = getDB();
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    // Always show current year + past 3 years as tabs
    const leaderboardYears = [CURRENT_DRAFT_YEAR, CURRENT_DRAFT_YEAR - 1, CURRENT_DRAFT_YEAR - 2, CURRENT_DRAFT_YEAR - 3];

    ctx.set.headers["Content-Type"] = "text/html";

    // Past year → show historical winners (or scoring data if admin didn't enter winners)
    if (year < CURRENT_DRAFT_YEAR) {
      const historicalWinners: HistoricalWinnerEntry[] = await db
        .select()
        .from(draftHistoricalWinners)
        .where(and(eq(draftHistoricalWinners.appId, app.id), eq(draftHistoricalWinners.year, year)))
        .orderBy(asc(draftHistoricalWinners.rank));
      if (historicalWinners.length > 0) {
        return leaderboardPage([], false, year, leaderboardYears, clerkKey, undefined, historicalWinners);
      }
      // Fall back to picks-based scoring if data exists
      const leaderboard = await buildLeaderboard(app.id, year);
      return leaderboardPage(leaderboard, true, year, leaderboardYears, clerkKey, undefined, []);
    }

    const draftStarted = await getDraftStarted(app.id, year);

    // Load mock state so we can show standings when simulation is running or complete (even if draft not "started")
    await loadMockStateFromDb(app.id, year);
    const mock = getMockState(year);
    const mockActive = !!mock?.active;
    const mockComplete = !!(mock?.active && mock.revealedCount >= 32);
    const showStandings = draftStarted || mockActive || mockComplete;

    // Current year pre-draft and no mock → list who's in (names + pick counts only; no scores, no other users' picks)
    if (!showStandings) {
      const allUserRows = await db.select().from(users).orderBy(asc(users.lastName));
      const pickCounts = await db
        .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
        .from(draftPicks)
        .where(and(eq(draftPicks.appId, app.id), eq(draftPicks.year, year)))
        .groupBy(draftPicks.userId);
      const pickCountMap = new Map(pickCounts.map((r) => [r.userId, r.count]));
      const allUsers: LeaderboardUser[] = [];
      for (const u of allUserRows) {
        const needsClerk = !u.firstName && !u.lastName || !u.email || u.email.endsWith("@clerk.local");
        const profile = needsClerk ? await getClerkProfile(u.clerkId) : null;
        allUsers.push({
          id: u.id,
          firstName: profile ? profile.firstName : u.firstName,
          lastName: profile ? profile.lastName : u.lastName,
          email: (profile ? profile.email : u.email) || "",
          pickCount: pickCountMap.get(u.id) ?? 0,
        });
      }
      return leaderboardPage([], false, year, leaderboardYears, clerkKey, allUsers);
    }

    // Standings: score against mock simulation (when active/complete) or official results; only users with 32 picks, no picks exposed
    const isAdmin = await isAdminUserId(String(ctx.auth()?.userId ?? ""));
    let leaderboard: Awaited<ReturnType<typeof buildLeaderboard>>;
    if (mockActive && mock) {
      const officialOverride = new Map<number, string | null>();
      for (let i = 0; i < mock.revealedCount && i < mock.picks.length; i++) {
        const p = mock.picks[i];
        officialOverride.set(p.pickNumber, p.playerName);
      }
      leaderboard = await buildLeaderboard(app.id, year, officialOverride);
    } else {
      leaderboard = await buildLeaderboard(app.id, year);
    }
    return leaderboardPage(leaderboard, draftStarted, year, leaderboardYears, clerkKey, undefined, undefined, mockComplete, isAdmin, mockActive);
  })

  // GET /draft/:year/leaderboard/scores — HTMX polling fragment (live scoring only)
  .get("/:year/leaderboard/scores", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }
    const auth = ctx.auth();
    await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    if (!app) { ctx.set.status = 404; return "App not found"; }

    await loadMockStateFromDb(app.id, year);
    const mock = getMockState(year);
    const mockActive = !!mock?.active;
    let leaderboard: Awaited<ReturnType<typeof buildLeaderboard>>;
    if (mockActive && mock) {
      const officialOverride = new Map<number, string | null>();
      for (let i = 0; i < mock.revealedCount && i < mock.picks.length; i++) {
        const p = mock.picks[i];
        officialOverride.set(p.pickNumber, p.playerName);
      }
      leaderboard = await buildLeaderboard(app.id, year, officialOverride);
    } else {
      leaderboard = await buildLeaderboard(app.id, year);
    }
    const draftStarted = await getDraftStarted(app.id, year);
    ctx.set.headers["Content-Type"] = "text/html";
    return leaderboardScoresFragment(leaderboard, draftStarted || mockActive, year);
  })

  // GET /draft/:year/submitted
  .get("/:year/submitted", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    if (!app) {
      ctx.set.status = 404;
      return "App not found";
    }
    const draftStarted = await getDraftStarted(app.id, year);

    const db = getDB();
    const withCount = await db
      .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
      .from(draftPicks)
      .where(and(eq(draftPicks.appId, app.id), eq(draftPicks.year, year)))
      .groupBy(draftPicks.userId);
    const completeUserIds = withCount.filter((r) => r.count === TOTAL_PICKS).map((r) => r.userId);

    const entries: Array<{ user: { firstName: string | null; lastName: string | null }; picks: Pick[] }> = [];
    for (const uid of completeUserIds) {
      const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
      if (!u) continue;
      const picks = await getUserPicks(uid, app.id, year);
      entries.push({
        user: { firstName: u.firstName, lastName: u.lastName },
        picks,
      });
    }

    const availableYears = await getAvailableYears(app.id);
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    ctx.set.headers["Content-Type"] = "text/html";
    return submittedMocksPage(entries, draftStarted, year, availableYears, clerkKey);
  })

  // POST /draft/admin/start — body: { year? } default CURRENT_DRAFT_YEAR
  .post(
    "/admin/start",
    async (ctx: any) => {
      const secret = process.env.DRAFT_ADMIN_SECRET;
      if (secret && ctx.request.headers.get("X-Admin-Secret") !== secret) {
        ctx.set.status = 403;
        return "Forbidden";
      }
      const app = await getApp("nfl-draft");
      if (!app) {
        ctx.set.status = 404;
        return "App not found";
      }
      const year = Number((ctx.body as any)?.year) || CURRENT_DRAFT_YEAR;
      const db = getDB();
      const existing = await db
        .select()
        .from(draftSettings)
        .where(and(eq(draftSettings.appId, app.id), eq(draftSettings.year, year)))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(draftSettings)
          .set({ draftStartedAt: new Date() })
          .where(and(eq(draftSettings.appId, app.id), eq(draftSettings.year, year)));
      } else {
        await db.insert(draftSettings).values({ appId: app.id, year, draftStartedAt: new Date() });
      }
      return { ok: true, year, message: "Draft started; picks are now locked and visible." };
    },
    { body: t.Object({ year: t.Optional(t.Number()) }) }
  )

  // POST /draft/admin/official-results — body: { year?, results }
  .post(
    "/admin/official-results",
    async (ctx: any) => {
      const secret = process.env.DRAFT_ADMIN_SECRET;
      if (secret && ctx.request.headers.get("X-Admin-Secret") !== secret) {
        ctx.set.status = 403;
        return "Forbidden";
      }
      const app = await getApp("nfl-draft");
      if (!app) {
        ctx.set.status = 404;
        return "App not found";
      }
      const year = Number((ctx.body as any)?.year) || CURRENT_DRAFT_YEAR;
      const results = (ctx.body as any)?.results ?? [];
      const db = getDB();
      await db
        .delete(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year)));
      if (results.length > 0) {
        await db.insert(officialDraftResults).values(
          results.map((r: { pickNumber: number; playerName?: string; teamName?: string }) => ({
            appId: app!.id,
            year,
            pickNumber: r.pickNumber,
            playerName: r.playerName ?? null,
            teamName: r.teamName ?? null,
          }))
        );
      }
      return { ok: true, year, count: results.length };
    },
    {
      body: t.Object({
        year: t.Optional(t.Number()),
        results: t.Array(t.Object({ pickNumber: t.Number(), playerName: t.Optional(t.String()), teamName: t.Optional(t.String()) })),
      }),
    }
  )

  // GET /draft/:year/results
  .get("/:year/results", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return "Not found";
    }
    const auth = ctx.auth();
    await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    if (!app) {
      ctx.set.status = 404;
      return "App not found";
    }

    const db = getDB();
    const draftStarted = await getDraftStarted(app.id, year);
    const officialRows = await db
      .select()
      .from(officialDraftResults)
      .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year)))
      .orderBy(officialDraftResults.pickNumber);

    const withCount = await db
      .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
      .from(draftPicks)
      .where(and(eq(draftPicks.appId, app.id), eq(draftPicks.year, year)))
      .groupBy(draftPicks.userId);
    const completeUserIds = withCount.filter((r) => r.count === TOTAL_PICKS).map((r) => r.userId);
    const officialResults = new Map(officialRows.map((r) => [r.pickNumber, r.playerName]));

    const leaderboard: Array<{ user: { firstName: string | null; lastName: string | null; email: string }; score: number }> = [];
    for (const uid of completeUserIds) {
      const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
      if (!u) continue;
      const needsClerk = !u.firstName && !u.lastName || !u.email || u.email.endsWith("@clerk.local");
      const profile = needsClerk ? await getClerkProfile(u.clerkId) : null;
      const picks = await getUserPicks(uid, app.id, year);
      const doubleSet = new Set(picks.filter((p) => p.doubleScorePick).map((p) => p.pickNumber));
      const score = computeScore(picks, officialResults, doubleSet);
      leaderboard.push({
        user: {
          firstName: profile ? profile.firstName : u.firstName,
          lastName: profile ? profile.lastName : u.lastName,
          email: (profile ? profile.email : u.email) || "",
        },
        score,
      });
    }
    leaderboard.sort((a, b) => b.score - a.score);

    const availableYears = await getAvailableYears(app.id);
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    ctx.set.headers["Content-Type"] = "text/html";
    return resultsPage(leaderboard, officialRows, draftStarted, year, availableYears, clerkKey);
  });
