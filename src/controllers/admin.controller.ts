import { Elysia, t } from "elysia";
import { authGuard } from "../guards/auth-guard.js";
import { getDB } from "../db/index.js";
import {
  apps,
  users,
  draftPicks,
  draftSettings,
  draftablePlayers,
  officialDraftResults,
  draftHistoricalWinners,
} from "../db/schema.js";
import { eq, and, sql, asc } from "drizzle-orm";
import { UsersModel } from "../models/users.model.js";
import { getFirstRoundTeams, CURRENT_DRAFT_YEAR, CONSENSUS_PLAYERS_2026 } from "../config/draft-data.js";
import { getEmailForUserId, isAdminEmail, isAdminUserId } from "../lib/clerk-email.js";
import {
  adminDashboardPage,
  officialPicksEditorFragment,
  adminPickRow,
  simulatorPage,
  simulatorPicksFragment,
  historicalWinnersFragment,
  type OfficialPick,
  type SimPick,
  type HistoricalWinner,
} from "../views/admin-templates.js";
import { type Pick } from "../views/templates.js";

const usersModel = new UsersModel();

// ─── Admin auth ──────────────────────────────────────────────────────────────

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseYear(param: string | undefined): number | null {
  if (param == null) return null;
  const y = Number(param);
  return Number.isInteger(y) && y >= 2020 && y <= 2040 ? y : null;
}

async function getApp() {
  const db = getDB();
  const result = await db.select().from(apps).where(eq(apps.slug, "nfl-draft")).limit(1);
  return result[0] ?? null;
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

async function getOfficialPicks(appId: number, year: number): Promise<OfficialPick[]> {
  const db = getDB();
  const rows = await db
    .select()
    .from(officialDraftResults)
    .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year)))
    .orderBy(officialDraftResults.pickNumber);
  return rows as OfficialPick[];
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

async function getUserPicks(userId: number, appId: number, year: number): Promise<Pick[]> {
  const db = getDB();
  const rows = await db
    .select()
    .from(draftPicks)
    .where(and(eq(draftPicks.userId, userId), eq(draftPicks.appId, appId), eq(draftPicks.year, year)))
    .orderBy(draftPicks.pickNumber);
  return rows as Pick[];
}

// ─── Simulator in-memory state ───────────────────────────────────────────────
// Keyed by year. Reset on server restart.
const simulatorState = new Map<number, SimPick[]>();

function getSimPicks(year: number): SimPick[] {
  return simulatorState.get(year) ?? [];
}

async function pickNextSimPick(appId: number, year: number): Promise<SimPick | null> {
  const db = getDB();
  const current = getSimPicks(year);
  const nextPickNum = current.length + 1;
  if (nextPickNum > 32) return null;

  const usedNames = new Set(current.map((p) => p.playerName.toLowerCase().trim()));
  const allPlayers = await db
    .select()
    .from(draftablePlayers)
    .where(and(eq(draftablePlayers.appId, appId), eq(draftablePlayers.year, year)))
    .orderBy(draftablePlayers.rank);

  const available = allPlayers.filter((p) => !usedNames.has(p.playerName.toLowerCase().trim()));
  if (available.length === 0) return null;

  // Pick from top-40 available players randomly (simulate realistic picks)
  const pool = available.slice(0, Math.min(40, available.length));
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const teams = getFirstRoundTeams(year);

  const simPick: SimPick = {
    pickNumber: nextPickNum,
    playerName: chosen.playerName,
    teamName: teams[nextPickNum] ?? `Pick ${nextPickNum}`,
    position: chosen.position,
  };

  const updated = [...current, simPick];
  simulatorState.set(year, updated);
  return simPick;
}

function computeSimScore(userPicks: Pick[], simPicks: SimPick[]): number {
  const officialByPlayer = new Map<string, number>();
  simPicks.forEach((p) => {
    officialByPlayer.set(p.playerName.trim().toLowerCase().replace(/\s+/g, " "), p.pickNumber);
  });

  let score = 0;
  for (const p of userPicks) {
    if (!p.playerName) continue;
    const officialPickNum = officialByPlayer.get(p.playerName.trim().toLowerCase().replace(/\s+/g, " "));
    if (officialPickNum == null) continue;
    const diff = Math.abs(p.pickNumber - officialPickNum);
    const base = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
    const mult = p.doubleScorePick ? 2 : 1;
    score += base * mult;
  }
  return score;
}

// ─── ESPN live draft sync ─────────────────────────────────────────────────────

async function syncFromESPN(appId: number, year: number): Promise<{ synced: number; error?: string }> {
  try {
    const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/draft/picks?limit=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { synced: 0, error: `ESPN API responded with ${res.status}` };

    const data = await res.json() as any;
    const items: any[] = data?.items ?? [];

    // ESPN returns $ref links for nested data — resolve picks from items
    type EspnPick = { round?: number; pick?: number; athlete?: { displayName?: string; shortName?: string }; team?: { displayName?: string; abbreviation?: string } };
    const firstRoundItems: EspnPick[] = items.filter((item: any) => item?.round === 1 || !item?.round);

    if (firstRoundItems.length === 0) {
      // Try alternate ESPN endpoint format
      const alt = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
      const altRes = await fetch(alt, { signal: AbortSignal.timeout(10_000) });
      if (!altRes.ok) return { synced: 0, error: "ESPN API returned no first-round picks yet" };
      // Parse alternate format if needed
      return { synced: 0, error: "No first-round picks available from ESPN yet. Check back during the live draft." };
    }

    const db = getDB();
    let synced = 0;
    for (const item of firstRoundItems) {
      const pickNum = item?.pick;
      const playerName = item?.athlete?.displayName ?? item?.athlete?.shortName ?? null;
      const teamName = item?.team?.displayName ?? null;
      if (!pickNum || pickNum > 32) continue;

      const existing = await db
        .select()
        .from(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNum)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(officialDraftResults)
          .set({ playerName, teamName })
          .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNum)));
      } else {
        await db.insert(officialDraftResults).values({ appId, year, pickNumber: pickNum, playerName, teamName });
      }
      synced++;
    }
    return { synced };
  } catch (err: any) {
    return { synced: 0, error: err?.message ?? "Unknown error during sync" };
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const adminController = new Elysia({ prefix: "/admin" })
  .onBeforeHandle(async (ctx: any) => {
    const authResult = authGuard(ctx);
    if (authResult) return authResult;

    const auth = ctx.auth();
    const userId = String(auth?.userId ?? "");
    console.log("[ADMIN] Checking admin access", { userId, sessionClaims: auth?.sessionClaims ?? null });
    if (!await isAdminUserId(userId)) {
      ctx.set.status = 403;
      ctx.set.headers["Content-Type"] = "text/html";
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:80px auto;padding:20px;text-align:center">
        <h1 style="font-size:22px;font-weight:bold;color:#111">Access Denied</h1>
        <p style="color:#666;margin-top:8px">You don't have admin access. Your email must be in ADMIN_EMAILS.</p>
        <a href="/apps" style="color:#2563eb;margin-top:16px;display:inline-block">← Back to apps</a>
      </body></html>`;
    }
  })

  // GET /admin/draft — redirect to current year
  .get("/draft", ({ redirect }) => redirect(`/admin/draft/${CURRENT_DRAFT_YEAR}`))

  // GET /admin/draft/:year — admin dashboard
  .get("/draft/:year", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const [draftStarted, officialPicks, submissionsResult] = await Promise.all([
      getDraftStarted(app.id, year),
      getOfficialPicks(app.id, year),
      getDB()
        .select({ userId: draftPicks.userId, count: sql<number>`count(*)::int` })
        .from(draftPicks)
        .where(and(eq(draftPicks.appId, app.id), eq(draftPicks.year, year)))
        .groupBy(draftPicks.userId),
    ]);

    const submissionCount = submissionsResult.filter((r) => r.count === 32).length;
    const adminEmails = getAdminEmails();
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;
    const pastYears = [CURRENT_DRAFT_YEAR - 1, CURRENT_DRAFT_YEAR - 2, CURRENT_DRAFT_YEAR - 3];

    ctx.set.headers["Content-Type"] = "text/html";
    return adminDashboardPage(officialPicks, draftStarted, year, submissionCount, adminEmails, clerkKey, pastYears);
  })

  // POST /admin/draft/:year/start — lock picks and mark draft started
  .post("/draft/:year/start", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

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
    return { ok: true, year };
  })

  // POST /admin/draft/:year/sync — pull live picks from ESPN
  .post("/draft/:year/sync", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const { synced, error } = await syncFromESPN(app.id, year);
    const officialPicks = await getOfficialPicks(app.id, year);

    ctx.set.headers["Content-Type"] = "text/html";
    const fragment = officialPicksEditorFragment(officialPicks, year);

    // Prepend a status banner
    const banner = error
      ? `<div class="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">⚠ Sync error: ${escapeHtmlInline(error)}</div>`
      : `<div class="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">✓ Synced ${synced} pick${synced !== 1 ? "s" : ""} from ESPN</div>`;

    return banner + fragment;
  })

  // GET /admin/draft/:year/official-picks — refresh editor fragment
  .get("/draft/:year/official-picks", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const officialPicks = await getOfficialPicks(app.id, year);
    ctx.set.headers["Content-Type"] = "text/html";
    return officialPicksEditorFragment(officialPicks, year);
  })

  // POST /admin/draft/:year/official-picks/:pickNumber — upsert one pick
  .post(
    "/draft/:year/official-picks/:pickNumber",
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      const pickNumber = Number(ctx.params?.pickNumber);
      if (year == null || !pickNumber || pickNumber < 1 || pickNumber > 32) {
        ctx.set.status = 400; return "Bad request";
      }

      const app = await getApp();
      if (!app) { ctx.set.status = 404; return "App not found"; }

      const playerName = (ctx.body?.playerName as string)?.trim() || null;
      const position = (ctx.body?.position as string)?.trim() || null;
      const teamName = (ctx.body?.teamName as string)?.trim() || (getFirstRoundTeams(year)[pickNumber] ?? null);

      const db = getDB();
      const existing = await db
        .select()
        .from(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNumber)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(officialDraftResults)
          .set({ playerName, teamName })
          .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNumber)));
      } else if (playerName) {
        await db.insert(officialDraftResults).values({ appId: app.id, year, pickNumber, playerName, teamName });
      }

      const updated = await db
        .select()
        .from(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNumber)))
        .limit(1);

      const pick: OfficialPick | null = updated[0]
        ? { pickNumber, playerName: updated[0].playerName, teamName: updated[0].teamName, position }
        : null;

      ctx.set.headers["Content-Type"] = "text/html";
      return adminPickRow(pickNumber, teamName ?? `Pick ${pickNumber}`, pick, year);
    },
    { body: t.Object({ playerName: t.Optional(t.String()), position: t.Optional(t.String()), teamName: t.Optional(t.String()) }) }
  )

  // DELETE /admin/draft/:year/official-picks/:pickNumber — clear one pick
  .delete(
    "/draft/:year/official-picks/:pickNumber",
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      const pickNumber = Number(ctx.params?.pickNumber);
      if (year == null || !pickNumber) { ctx.set.status = 400; return "Bad request"; }

      const app = await getApp();
      if (!app) { ctx.set.status = 404; return "App not found"; }

      const db = getDB();
      await db
        .delete(officialDraftResults)
        .where(and(eq(officialDraftResults.appId, app.id), eq(officialDraftResults.year, year), eq(officialDraftResults.pickNumber, pickNumber)));

      const teams = getFirstRoundTeams(year);
      ctx.set.headers["Content-Type"] = "text/html";
      return adminPickRow(pickNumber, teams[pickNumber] ?? `Pick ${pickNumber}`, null, year);
    },
    { params: t.Object({ year: t.String(), pickNumber: t.String() }) }
  )

  // GET /admin/draft/:year/simulator — simulator page
  .get("/draft/:year/simulator", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const [userPicks, simPicks] = await Promise.all([
      getUserPicks(user.id, app.id, year),
      Promise.resolve(getSimPicks(year)),
    ]);
    const score = computeSimScore(userPicks, simPicks);
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;

    ctx.set.headers["Content-Type"] = "text/html";
    return simulatorPage(userPicks, simPicks, year, score, clerkKey);
  })

  // POST /admin/draft/:year/simulator/next — reveal next random pick
  .post("/draft/:year/simulator/next", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    await pickNextSimPick(app.id, year);

    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const [userPicks, simPicks] = await Promise.all([
      getUserPicks(user.id, app.id, year),
      Promise.resolve(getSimPicks(year)),
    ]);
    const score = computeSimScore(userPicks, simPicks);

    ctx.set.headers["Content-Type"] = "text/html";
    return simulatorPicksFragment(userPicks, simPicks, year, score);
  })

  // POST /admin/draft/:year/refresh-players — upsert CBS consensus list from static data into DB
  .post("/draft/:year/refresh-players", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const players = year === 2026 ? CONSENSUS_PLAYERS_2026 : [];
    if (players.length === 0) {
      ctx.set.status = 400;
      return { ok: false, error: `No static player data available for year ${year}` };
    }

    const db = getDB();
    await db.delete(draftablePlayers).where(and(eq(draftablePlayers.appId, app.id), eq(draftablePlayers.year, year)));
    await db.insert(draftablePlayers).values(
      players.map((p) => ({
        appId: app!.id,
        year,
        rank: p.rank,
        playerName: p.playerName,
        school: p.school,
        position: p.position,
      }))
    );

    return { ok: true, year, count: players.length, message: `Refreshed ${players.length} CBS players for ${year}` };
  })

  // GET /admin/draft/:year/historical-winners — fragment for HTMX tab content
  .get("/draft/:year/historical-winners", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null || year >= CURRENT_DRAFT_YEAR || year < CURRENT_DRAFT_YEAR - 3) {
      ctx.set.status = 400; return "Invalid year for historical winners";
    }
    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }
    const db = getDB();
    const winners: HistoricalWinner[] = await db
      .select()
      .from(draftHistoricalWinners)
      .where(and(eq(draftHistoricalWinners.appId, app.id), eq(draftHistoricalWinners.year, year)))
      .orderBy(asc(draftHistoricalWinners.rank));
    ctx.set.headers["Content-Type"] = "text/html";
    return historicalWinnersFragment(winners, year);
  })

  // POST /admin/draft/:year/historical-winners — add a winner
  .post("/draft/:year/historical-winners", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null || year >= CURRENT_DRAFT_YEAR || year < CURRENT_DRAFT_YEAR - 3) {
      ctx.set.status = 400; return "Invalid year";
    }
    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }
    const body = ctx.body as Record<string, string>;
    const rank = parseInt(body.rank ?? "1");
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim() || null;
    const score = body.score ? parseInt(body.score) : null;
    if (!name || isNaN(rank) || rank < 1 || rank > 3) {
      ctx.set.status = 400; return "Name and valid rank (1–3) required";
    }
    const db = getDB();
    await db.insert(draftHistoricalWinners).values({ appId: app.id, year, rank, name, email, score });
    const winners: HistoricalWinner[] = await db
      .select()
      .from(draftHistoricalWinners)
      .where(and(eq(draftHistoricalWinners.appId, app.id), eq(draftHistoricalWinners.year, year)))
      .orderBy(asc(draftHistoricalWinners.rank));
    ctx.set.headers["Content-Type"] = "text/html";
    return historicalWinnersFragment(winners, year);
  })

  // DELETE /admin/draft/:year/historical-winners/:id — remove a winner
  .delete("/draft/:year/historical-winners/:id", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    const id = parseInt(ctx.params?.id ?? "");
    if (year == null || isNaN(id)) { ctx.set.status = 400; return "Invalid params"; }
    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }
    const db = getDB();
    await db
      .delete(draftHistoricalWinners)
      .where(and(eq(draftHistoricalWinners.id, id), eq(draftHistoricalWinners.appId, app.id)));
    const winners: HistoricalWinner[] = await db
      .select()
      .from(draftHistoricalWinners)
      .where(and(eq(draftHistoricalWinners.appId, app.id), eq(draftHistoricalWinners.year, year)))
      .orderBy(asc(draftHistoricalWinners.rank));
    ctx.set.headers["Content-Type"] = "text/html";
    return historicalWinnersFragment(winners, year);
  })

  // DELETE /admin/draft/:year/simulator — reset simulation
  .delete("/draft/:year/simulator", async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) { ctx.set.status = 404; return "Not found"; }

    simulatorState.delete(year);

    const app = await getApp();
    if (!app) { ctx.set.status = 404; return "App not found"; }

    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const userPicks = await getUserPicks(user.id, app.id, year);

    ctx.set.headers["Content-Type"] = "text/html";
    return simulatorPicksFragment(userPicks, [], year, 0);
  });

function escapeHtmlInline(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
