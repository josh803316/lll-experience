import { Elysia, t } from "elysia";
import { authGuard } from "../guards/auth-guard.js";
import { getDB } from "../db/index.js";
import { draftPicks, apps, users, draftablePlayers, draftSettings, officialDraftResults, draftHistoricalWinners } from "../db/schema.js";
import { eq, and, sql, asc } from "drizzle-orm";
import { UsersModel } from "../models/users.model.js";
import {
  getFirstRoundTeams,
  getTeamNeeds,
  getStaticPlayersBySource,
  computeConsensusRanking,
  CURRENT_DRAFT_YEAR,
  type RankingSource,
} from "../config/draft-data.js";
import { isAdminUserId } from "../lib/clerk-email.js";
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
  return usersModel.findOrCreate(db, clerkId, {
    email: auth.sessionClaims?.email ?? `${clerkId}@clerk.local`,
    firstName: auth.sessionClaims?.firstName ?? null,
    lastName: auth.sessionClaims?.lastName ?? null,
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

async function getUserPicks(userId: number, appId: number, year: number): Promise<Pick[]> {
  const db = getDB();
  const rows = await db
    .select()
    .from(draftPicks)
    .where(and(eq(draftPicks.userId, userId), eq(draftPicks.appId, appId), eq(draftPicks.year, year)))
    .orderBy(draftPicks.pickNumber);
  return rows as Pick[];
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
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function buildLeaderboard(appId: number, year: number) {
  const db = getDB();
  const withCount = await db
    .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
    .from(draftPicks)
    .where(and(eq(draftPicks.appId, appId), eq(draftPicks.year, year)))
    .groupBy(draftPicks.userId);
  const completeUserIds = withCount.filter((r) => r.count === TOTAL_PICKS).map((r) => r.userId);

  const officialRows = await db
    .select()
    .from(officialDraftResults)
    .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year)));
  const officialResults = new Map(officialRows.map((r) => [r.pickNumber, r.playerName]));

  const leaderboard: Array<{ user: { id: number; firstName: string | null; lastName: string | null }; score: number; picks: Pick[] }> = [];
  for (const uid of completeUserIds) {
    const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!u) continue;
    const picks = await getUserPicks(uid, appId, year);
    const doubleSet = new Set(picks.filter((p) => p.doubleScorePick).map((p) => p.pickNumber));
    leaderboard.push({ user: { id: u.id, firstName: u.firstName, lastName: u.lastName }, score: computeScore(picks, officialResults, doubleSet), picks });
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

    ctx.set.headers["Content-Type"] = "text/html";
    return draftLayout(picks, draftable, draftStarted, year, availableYears, clerkKey, isAdmin);
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

    // When the draft is live, include official picks for the realtime column
    let officialPicksMap: Map<number, { playerName: string | null }> | undefined;
    if (draftLocked && app) {
      const db = getDB();
      const official = await db
        .select()
        .from(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year)));
      officialPicksMap = new Map(official.map((r) => [r.pickNumber, { playerName: r.playerName }]));
    }

    ctx.set.headers["Content-Type"] = "text/html";
    return picksTableFragment(picks, draftLocked, year, officialPicksMap);
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
        const doubleScorePick = Boolean(payload.doubleScorePick);
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

    // Current year pre-draft → list all users with pick status
    if (!draftStarted) {
      const allUserRows = await db.select().from(users).orderBy(asc(users.lastName));
      const pickCounts = await db
        .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
        .from(draftPicks)
        .where(and(eq(draftPicks.appId, app.id), eq(draftPicks.year, year)))
        .groupBy(draftPicks.userId);
      const pickCountMap = new Map(pickCounts.map((r) => [r.userId, r.count]));
      const allUsers: LeaderboardUser[] = allUserRows.map((u) => ({
        id: u.id, firstName: u.firstName, lastName: u.lastName,
        pickCount: pickCountMap.get(u.id) ?? 0,
      }));
      return leaderboardPage([], false, year, leaderboardYears, clerkKey, allUsers);
    }

    // Current year, draft live/done → scoring leaderboard
    const leaderboard = await buildLeaderboard(app.id, year);
    return leaderboardPage(leaderboard, draftStarted, year, leaderboardYears, clerkKey);
  })

  // GET /draft/:year/leaderboard/scores — HTMX polling fragment (live scoring only)
  .get("/:year/leaderboard/scores", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }
    const auth = ctx.auth();
    await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const draftStarted = await getDraftStarted(app.id, year);
    const leaderboard = await buildLeaderboard(app.id, year);
    ctx.set.headers["Content-Type"] = "text/html";
    return leaderboardScoresFragment(leaderboard, draftStarted, year);
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

    const leaderboard: Array<{ user: { firstName: string | null; lastName: string | null }; score: number }> = [];
    for (const uid of completeUserIds) {
      const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
      if (!u) continue;
      const picks = await getUserPicks(uid, app.id, year);
      const doubleSet = new Set(picks.filter((p) => p.doubleScorePick).map((p) => p.pickNumber));
      const score = computeScore(picks, officialResults, doubleSet);
      leaderboard.push({
        user: { firstName: u.firstName, lastName: u.lastName },
        score,
      });
    }
    leaderboard.sort((a, b) => b.score - a.score);

    const availableYears = await getAvailableYears(app.id);
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    ctx.set.headers["Content-Type"] = "text/html";
    return resultsPage(leaderboard, officialRows, draftStarted, year, availableYears, clerkKey);
  });
