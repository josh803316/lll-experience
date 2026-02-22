import { Elysia, t } from "elysia";
import { authGuard } from "../guards/auth-guard.ts";
import { getDB } from "../db/index.ts";
import { draftPicks, apps, users } from "../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { UsersModel } from "../models/users.model.ts";
import {
  draftLayout,
  picksListFragment,
  emptyPickSlot,
  type Pick,
} from "../views/templates.ts";

const usersModel = new UsersModel();

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

async function getUserPicks(userId: number, appId: number): Promise<Pick[]> {
  const db = getDB();
  return db
    .select()
    .from(draftPicks)
    .where(and(eq(draftPicks.userId, userId), eq(draftPicks.appId, appId)))
    .orderBy(draftPicks.pickNumber) as Promise<Pick[]>;
}

export const draftController = new Elysia({ prefix: "/draft" })
  .onBeforeHandle(authGuard)

  // GET /draft — main page
  .get("/", async (ctx: any) => {
    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    const picks = app ? await getUserPicks(user.id, app.id) : [];
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;

    ctx.set.headers["Content-Type"] = "text/html";
    return draftLayout(picks, clerkKey);
  })

  // GET /draft/picks — picks fragment (HTMX)
  .get("/picks", async (ctx: any) => {
    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const app = await getApp("nfl-draft");
    const picks = app ? await getUserPicks(user.id, app.id) : [];

    ctx.set.headers["Content-Type"] = "text/html";
    return picksListFragment(picks);
  })

  // POST /draft/picks — upsert reordered picks
  .post(
    "/picks",
    async (ctx: any) => {
      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const app = await getApp("nfl-draft");
      if (!app) {
        ctx.set.status = 404;
        return "App not found";
      }

      const db = getDB();
      let parsed: Array<{ pickNumber: number; id: string }> = [];
      try {
        parsed = JSON.parse(ctx.body.picks as string);
      } catch {
        ctx.set.status = 400;
        return "Invalid picks payload";
      }

      // Upsert each pick's new order
      for (const { pickNumber, id } of parsed) {
        await db
          .update(draftPicks)
          .set({ pickNumber, updatedAt: new Date() })
          .where(and(eq(draftPicks.id, Number(id)), eq(draftPicks.userId, user.id)));
      }

      const picks = await getUserPicks(user.id, app.id);
      ctx.set.headers["Content-Type"] = "text/html";
      return picksListFragment(picks);
    },
    {
      body: t.Object({ picks: t.String() }),
    }
  )

  // DELETE /draft/picks/:pickNumber — remove a single pick
  .delete(
    "/picks/:pickNumber",
    async (ctx: any) => {
      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const db = getDB();
      const pickNumber = Number(ctx.params.pickNumber);

      await db
        .delete(draftPicks)
        .where(and(eq(draftPicks.userId, user.id), eq(draftPicks.pickNumber, pickNumber)));

      ctx.set.headers["Content-Type"] = "text/html";
      return emptyPickSlot(pickNumber);
    },
    {
      params: t.Object({ pickNumber: t.String() }),
    }
  );
