import {Elysia, t} from 'elysia';
import {authGuard} from '../guards/auth-guard.js';
import {getDB} from '../db/index.js';
import {
  apps,
  users,
  chatGroups,
  chatGroupMembers,
  chatMessages,
  chatMessageReactions,
  officialDraftResults,
  draftSettings,
  draftMockState,
} from '../db/schema.js';
import {eq, and, gt, asc, desc, sql, inArray} from 'drizzle-orm';
import {UsersModel} from '../models/users.model.js';
import {getClerkProfile, isAdminUserId} from '../lib/clerk-email.js';
import {getFirstRoundTeams, CURRENT_DRAFT_YEAR, getPositionForPlayer} from '../config/draft-data.js';
import {
  chatPage,
  chatMessagesFragment,
  chatSingleMessageFragment,
  chatTickerFragment,
  messageReactionsFragment,
  type ChatMessageDisplay,
  type ChatGroupDisplay,
  type TickerPick,
  type ReactionGroup,
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
  if (param == null) {
    return null;
  }
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

async function loadReactionsForMessages(
  messageIds: number[],
  currentUserId: number,
): Promise<Map<number, ReactionGroup[]>> {
  const result = new Map<number, ReactionGroup[]>();
  if (messageIds.length === 0) {
    return result;
  }

  const db = getDB();
  const rows = await db
    .select({
      messageId: chatMessageReactions.messageId,
      emoji: chatMessageReactions.emoji,
      userId: chatMessageReactions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(chatMessageReactions)
    .innerJoin(users, eq(chatMessageReactions.userId, users.id))
    .where(inArray(chatMessageReactions.messageId, messageIds));

  // Group by messageId → emoji → users
  const byMsg = new Map<number, Map<string, Array<{userId: number; name: string}>>>();
  for (const r of rows) {
    if (!byMsg.has(r.messageId)) {
      byMsg.set(r.messageId, new Map());
    }
    const emojiMap = byMsg.get(r.messageId) as Map<string, Array<{userId: number; name: string}>>;
    if (!emojiMap.has(r.emoji)) {
      emojiMap.set(r.emoji, []);
    }
    const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Someone';
    (emojiMap.get(r.emoji) as Array<{userId: number; name: string}>).push({userId: r.userId, name});
  }

  for (const [msgId, emojiMap] of byMsg) {
    const groups: ReactionGroup[] = [];
    for (const [emoji, reactors] of emojiMap) {
      groups.push({
        emoji,
        count: reactors.length,
        names: reactors.map((r) => r.name),
        currentUserReacted: reactors.some((r) => r.userId === currentUserId),
      });
    }
    result.set(msgId, groups);
  }
  return result;
}

async function loadMessages(
  groupId: number,
  currentUserId: number,
  afterId?: number,
  limit = 50,
): Promise<ChatMessageDisplay[]> {
  const db = getDB();
  const conditions = [eq(chatMessages.groupId, groupId)];
  if (afterId) {
    conditions.push(gt(chatMessages.id, afterId));
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

  // Load reactions for all messages in batch
  const messageIds = rows.map((r) => r.id);
  const reactionsMap = await loadReactionsForMessages(messageIds, currentUserId);

  // Resolve names from Clerk for users missing firstName/lastName
  const result: ChatMessageDisplay[] = [];
  for (const r of rows) {
    let firstName = r.firstName;
    let lastName = r.lastName;
    if (!firstName && !lastName) {
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
      reactions: reactionsMap.get(r.id) ?? [],
    });
  }
  return result;
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

interface TickerState {
  picks: TickerPick[];
  draftLive: boolean;
  mockActive: boolean;
  currentRound: number;
}

/** Compute round and pick-in-round from overall pick number. NFL draft has 32 picks per round (roughly). */
function pickToRound(overall: number): {round: number; pickInRound: number} {
  // Standard: 32 picks per round for R1, may vary in later rounds due to compensatory
  // For simplicity, use the ESPN-provided round info when available; this is a fallback
  const round = Math.ceil(overall / 32);
  const pickInRound = overall - (round - 1) * 32;
  return {round, pickInRound};
}

/** Fetch live draft data directly from ESPN API for the ticker. */
async function fetchLiveTickerFromESPN(year: number): Promise<{picks: TickerPick[]; currentRound: number} | null> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${year}`;
    const res = await fetch(url, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) {return null;}

    const data = (await res.json()) as any;
    const allPicks: any[] = Array.isArray(data?.picks) ? data.picks : [];
    if (allPicks.length === 0) {return null;}

    // Build team lookup
    const teamLookup = new Map<string, string>();
    if (Array.isArray(data?.teams)) {
      for (const t of data.teams) {
        if (t?.id && t?.displayName) {teamLookup.set(String(t.id), t.displayName);}
      }
    }

    // Find the "on the clock" pick — first one without SELECTION_MADE status
    let currentRound = 1;
    const onClock = allPicks.find((p: any) => p?.status && p.status !== 'SELECTION_MADE' && p.status !== 'PICK_IS_IN');
    if (onClock) {
      currentRound = onClock.round ?? pickToRound(onClock.overall ?? 1).round;
    } else {
      // All picks made — show the last round that has picks
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
      const posId = p?.athlete?.position?.id;

      return {
        pickNumber: overall,
        round,
        pickInRound,
        teamName,
        playerName,
        position: playerName ? (getPositionForPlayer(playerName, year) ?? null) : null,
      };
    });

    return {picks, currentRound};
  } catch {
    return null;
  }
}

async function buildTickerData(appId: number, year: number): Promise<TickerState> {
  const draftLive = await isDraftLive(appId, year);
  const mockActive = await isMockActive(appId, year);

  // Try live ESPN data first (always fresh)
  const live = await fetchLiveTickerFromESPN(year);
  if (live && live.picks.length > 0) {
    return {picks: live.picks, draftLive, mockActive, currentRound: live.currentRound};
  }

  // Fallback: DB data (Round 1 only from officialDraftResults)
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
    });
  }
  return {picks, draftLive, mockActive, currentRound: 1};
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

    const afterId = Number(ctx.query?.afterId) || 0;

    const messages = await loadMessages(groupId, user.id, afterId || undefined);
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
        reactions: [],
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
    if (!app) {
      return '';
    }

    const ticker = await buildTickerData(app.id, year);
    const requestedRound = Number(ctx.query?.round) || ticker.currentRound;
    ctx.set.headers['Content-Type'] = 'text/html';
    return chatTickerFragment(ticker.picks, ticker.draftLive || ticker.mockActive, requestedRound);
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
  )

  // POST /draft/:year/chat/react — toggle a reaction on a message
  .post(
    '/:year/chat/react',
    async (ctx: any) => {
      const year = parseYear(ctx.params?.year);
      if (year == null) {
        ctx.set.status = 404;
        return '';
      }

      const auth = ctx.auth();
      const user = await getOrCreateUser(auth);
      const messageId = Number(ctx.body?.messageId);
      const emoji = (ctx.body?.emoji as string)?.trim();

      if (!messageId || !emoji) {
        ctx.set.status = 400;
        return '';
      }

      const db = getDB();

      // Verify message exists and user has access to its group
      const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
      if (!msg || !(await isGroupMember(msg.groupId, user.id))) {
        ctx.set.status = 403;
        return '';
      }

      // Toggle: if user already reacted with this emoji, remove it; otherwise add it
      const existing = await db
        .select()
        .from(chatMessageReactions)
        .where(
          and(
            eq(chatMessageReactions.messageId, messageId),
            eq(chatMessageReactions.userId, user.id),
            eq(chatMessageReactions.emoji, emoji),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db.delete(chatMessageReactions).where(eq(chatMessageReactions.id, existing[0].id));
      } else {
        await db.insert(chatMessageReactions).values({messageId, userId: user.id, emoji});
      }

      // Return updated reactions fragment for this message
      const reactionsMap = await loadReactionsForMessages([messageId], user.id);
      const reactions = reactionsMap.get(messageId) ?? [];
      ctx.set.headers['Content-Type'] = 'text/html';
      return messageReactionsFragment(messageId, reactions, year);
    },
    {
      body: t.Object({
        messageId: t.String(),
        emoji: t.String(),
      }),
    },
  );
