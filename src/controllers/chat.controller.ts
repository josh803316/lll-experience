import {Elysia, t} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {getDB} from '../db/index.js';
import {apps, users, chatGroups, chatGroupMembers, chatMessages, officialDraftResults} from '../db/schema.js';
import {eq, and, gt, asc, desc, sql} from 'drizzle-orm';
import {UsersModel} from '../models/users.model.js';
import {getClerkProfile, isAdminUserId} from '../lib/clerk-email.js';
import {getFirstRoundTeams, CURRENT_DRAFT_YEAR, getPositionForPlayer} from '../config/draft-data.js';
import {
  chatPage,
  chatMessagesFragment,
  chatSingleMessageFragment,
  chatTickerFragment,
  type ChatMessageDisplay,
  type ChatGroupDisplay,
  type TickerPick,
} from '../views/chat-templates.js';

const usersModel = new UsersModel();

// ─── Helpers (mirrored from draft.controller.ts for consistency) ─────────────

async function getOrCreateUser(auth: any) {
  const db = getDB();
  const clerkId = String(auth.userId);
  const profile = await getClerkProfile(clerkId);
  return await usersModel.findOrCreate(db, clerkId, {
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

function parseYear(param: string | undefined): number | null {
  if (param == null) {return null;}
  const y = Number(param);
  return Number.isInteger(y) && y >= 2020 && y <= 2040 ? y : null;
}

// ─── Chat-specific helpers ───────────────────────────────────────────────────

async function getOrCreateDefaultGroup(appId: number, year: number, userId: number) {
  const db = getDB();
  const existing = await db
    .select()
    .from(chatGroups)
    .where(and(eq(chatGroups.appId, appId), eq(chatGroups.year, year), eq(chatGroups.isDefault, true)))
    .limit(1);

  let group = existing[0];
  if (!group) {
    const [created] = await db
      .insert(chatGroups)
      .values({appId, year, name: 'Everyone', createdBy: userId, isDefault: true})
      .returning();
    group = created;
  }

  // Ensure user is a member
  await ensureGroupMembership(group.id, userId);
  return group;
}

async function ensureGroupMembership(groupId: number, userId: number): Promise<void> {
  const db = getDB();
  const existing = await db
    .select()
    .from(chatGroupMembers)
    .where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.userId, userId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(chatGroupMembers).values({groupId, userId});
  }
}

async function getUserGroups(userId: number, appId: number, year: number): Promise<ChatGroupDisplay[]> {
  const db = getDB();
  const rows = await db
    .select({
      id: chatGroups.id,
      name: chatGroups.name,
      isDefault: chatGroups.isDefault,
    })
    .from(chatGroupMembers)
    .innerJoin(chatGroups, eq(chatGroupMembers.groupId, chatGroups.id))
    .where(and(eq(chatGroupMembers.userId, userId), eq(chatGroups.appId, appId), eq(chatGroups.year, year)))
    .orderBy(desc(chatGroups.isDefault), asc(chatGroups.name));

  // Get member counts
  const groups: ChatGroupDisplay[] = [];
  for (const r of rows) {
    const [{count}] = await db
      .select({count: sql<number>`count(*)::int`})
      .from(chatGroupMembers)
      .where(eq(chatGroupMembers.groupId, r.id));
    groups.push({id: r.id, name: r.name, isDefault: r.isDefault, memberCount: count});
  }
  return groups;
}

async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const db = getDB();
  const row = await db
    .select()
    .from(chatGroupMembers)
    .where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.userId, userId)))
    .limit(1);
  return row.length > 0;
}

async function loadMessages(
  groupId: number,
  currentUserId: number,
  after?: Date,
  limit = 50,
): Promise<ChatMessageDisplay[]> {
  const db = getDB();
  const conditions = [eq(chatMessages.groupId, groupId)];
  if (after) {
    conditions.push(gt(chatMessages.createdAt, after));
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);

  // Resolve names from Clerk for users missing firstName/lastName
  const result: ChatMessageDisplay[] = [];
  for (const r of rows) {
    let firstName = r.firstName;
    let lastName = r.lastName;
    if (!firstName && !lastName) {
      // Look up from users table to get clerkId, then Clerk
      const [u] = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
      if (u) {
        const profile = await getClerkProfile(u.clerkId);
        firstName = profile.firstName;
        lastName = profile.lastName;
      }
    }
    result.push({
      id: r.id,
      userId: r.userId,
      firstName,
      lastName,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      isOwn: r.userId === currentUserId,
    });
  }
  return result;
}

async function buildTickerData(appId: number, year: number): Promise<{last2: TickerPick[]; next3: TickerPick[]}> {
  const db = getDB();
  const official = await db
    .select()
    .from(officialDraftResults)
    .where(and(eq(officialDraftResults.appId, appId), eq(officialDraftResults.year, year)))
    .orderBy(officialDraftResults.pickNumber);

  const teams = getFirstRoundTeams(year);
  const completedPicks = official.filter((r) => r.playerName);

  const last2: TickerPick[] = completedPicks
    .sort((a, b) => b.pickNumber - a.pickNumber)
    .slice(0, 2)
    .reverse()
    .map((r) => ({
      pickNumber: r.pickNumber,
      teamName: r.teamName || teams[r.pickNumber] || `Pick ${r.pickNumber}`,
      playerName: r.playerName,
      position: getPositionForPlayer(r.playerName ?? '', year) ?? null,
    }));

  const highestPick = completedPicks.length > 0 ? Math.max(...completedPicks.map((r) => r.pickNumber)) : 0;
  const next3: TickerPick[] = [];
  for (let i = 1; i <= 3; i++) {
    const num = highestPick + i;
    if (num <= 32) {
      next3.push({
        pickNumber: num,
        teamName: teams[num] ?? `Pick ${num}`,
        playerName: null,
        position: null,
      });
    }
  }

  return {last2, next3};
}

// ─── Controller ──────────────────────────────────────────────────────────────

export const chatController = new Elysia({prefix: '/draft'})
  .onBeforeHandle((ctx) => authGuard(ctx))

  // GET /draft/:year/chat — full chat page
  .get('/:year/chat', async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return 'Not found';
    }

    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const app = await getApp('nfl-draft');
    if (!app) {
      ctx.set.status = 404;
      return 'App not found';
    }

    const isAdmin = await isAdminUserId(String(auth.userId));

    // Ensure default group + membership
    const defaultGroup = await getOrCreateDefaultGroup(app.id, year, user.id);
    const groups = await getUserGroups(user.id, app.id, year);

    // Determine active group from query param
    const requestedGroupId = Number(ctx.query?.groupId) || 0;
    const activeGroup = groups.find((g) => g.id === requestedGroupId) ??
      groups[0] ?? {
        id: defaultGroup.id,
        name: defaultGroup.name,
        isDefault: defaultGroup.isDefault,
        memberCount: 1,
      };

    // Load messages for active group
    const messages = await loadMessages(activeGroup.id, user.id);
    const ticker = await buildTickerData(app.id, year);
    const clerkKey = process.env.CLERK_PUBLISHABLE_KEY;

    ctx.set.headers['Content-Type'] = 'text/html';
    return chatPage(
      messages,
      groups,
      activeGroup.id,
      {id: activeGroup.id, name: activeGroup.name, isDefault: activeGroup.isDefault},
      ticker,
      year,
      user.id,
      clerkKey,
      isAdmin,
    );
  })

  // GET /draft/:year/chat/messages — polling endpoint for new messages
  .get('/:year/chat/messages', async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return '';
    }

    const auth = ctx.auth();
    const user = await getOrCreateUser(auth);
    const groupId = Number(ctx.query?.groupId);
    if (!groupId || !(await isGroupMember(groupId, user.id))) {
      return '';
    }

    const afterStr = ctx.query?.after as string;
    const after = afterStr ? new Date(decodeURIComponent(afterStr)) : undefined;
    if (after && isNaN(after.getTime())) {
      return '';
    }

    const messages = await loadMessages(groupId, user.id, after);
    ctx.set.headers['Content-Type'] = 'text/html';
    return chatMessagesFragment(messages);
  })

  // POST /draft/:year/chat/send — send a message
  .post(
    '/:year/chat/send',
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      if (year == null) {
        ctx.set.status = 404;
        return '';
      }

      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const groupId = Number(ctx.body?.groupId);
      const content = (ctx.body?.content as string)?.trim();

      if (!groupId || !content) {
        ctx.set.status = 400;
        return '';
      }

      if (content.length > 1000) {
        ctx.set.status = 400;
        return '';
      }

      if (!(await isGroupMember(groupId, user.id))) {
        ctx.set.status = 403;
        return '';
      }

      const db = getDB();
      const [msg] = await db.insert(chatMessages).values({groupId, userId: user.id, content}).returning();

      // Get user name for display
      const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      let firstName = u?.firstName ?? null;
      let lastName = u?.lastName ?? null;
      if (!firstName && !lastName && u) {
        const profile = await getClerkProfile(u.clerkId);
        firstName = profile.firstName;
        lastName = profile.lastName;
      }

      ctx.set.headers['Content-Type'] = 'text/html';
      return chatSingleMessageFragment({
        id: msg.id,
        userId: user.id,
        firstName,
        lastName,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        isOwn: true,
      });
    },
    {
      body: t.Object({
        groupId: t.String(),
        content: t.String(),
      }),
    },
  )

  // GET /draft/:year/chat/ticker — draft ticker fragment
  .get('/:year/chat/ticker', async (ctx: any) => {
    const year = parseYear(ctx.params?.year);
    if (year == null) {
      ctx.set.status = 404;
      return '';
    }

    const app = await getApp('nfl-draft');
    if (!app) {return '';}

    const ticker = await buildTickerData(app.id, year);
    ctx.set.headers['Content-Type'] = 'text/html';
    return chatTickerFragment(ticker.last2, ticker.next3);
  })

  // POST /draft/:year/chat/groups — create a new group
  .post(
    '/:year/chat/groups',
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      if (year == null) {
        ctx.set.status = 404;
        return 'Not found';
      }

      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const app = await getApp('nfl-draft');
      if (!app) {
        ctx.set.status = 404;
        return 'App not found';
      }

      const name = (ctx.body?.name as string)?.trim();
      if (!name || name.length > 50) {
        ctx.set.status = 400;
        return 'Group name is required (max 50 characters)';
      }

      const db = getDB();
      const [group] = await db
        .insert(chatGroups)
        .values({appId: app.id, year, name, createdBy: user.id, isDefault: false})
        .returning();

      // Add creator as member
      await db.insert(chatGroupMembers).values({groupId: group.id, userId: user.id});

      // Redirect to the new group
      ctx.set.headers['HX-Redirect'] = `/draft/${year}/chat?groupId=${group.id}`;
      return '';
    },
    {
      body: t.Object({name: t.String()}),
    },
  )

  // POST /draft/:year/chat/groups/:id/invite — invite a user by email
  .post(
    '/:year/chat/groups/:id/invite',
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      const groupId = Number(ctx.params?.id);
      if (year == null || !Number.isInteger(groupId)) {
        ctx.set.status = 404;
        return '<span class="text-red-400">Not found</span>';
      }

      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);

      // Verify requester is a member
      if (!(await isGroupMember(groupId, user.id))) {
        ctx.set.status = 403;
        return '<span class="text-red-400">You are not a member of this group</span>';
      }

      const email = (ctx.body?.email as string)?.trim().toLowerCase();
      if (!email) {
        ctx.set.status = 400;
        return '<span class="text-red-400">Email is required</span>';
      }

      // Find user by email
      const db = getDB();
      const [targetUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (!targetUser) {
        ctx.set.headers['Content-Type'] = 'text/html';
        return '<span class="text-amber-400">No account found for that email. They need to sign in first.</span>';
      }

      // Check if already a member
      const alreadyMember = await isGroupMember(groupId, targetUser.id);
      if (alreadyMember) {
        ctx.set.headers['Content-Type'] = 'text/html';
        return `<span class="text-slate-400">${targetUser.firstName || 'User'} is already in this group</span>`;
      }

      await db.insert(chatGroupMembers).values({groupId, userId: targetUser.id});
      ctx.set.headers['Content-Type'] = 'text/html';
      return `<span class="text-green-400">Invited ${targetUser.firstName || targetUser.email}!</span>`;
    },
    {
      params: t.Object({year: t.String(), id: t.String()}),
      body: t.Object({email: t.String()}),
    },
  );
