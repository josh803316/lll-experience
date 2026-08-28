import {asc, eq, inArray} from 'drizzle-orm';
import {canonicalManager, managerForSleeperUser, normPlayerName} from '../config/fantasy-managers.js';
import {getDB} from '../db/index.js';
import {
  fantasyDraftPicks,
  fantasyDrafts,
  fantasyLeagues,
  fantasyManagers,
  fantasyMatchups,
  fantasyPlayerWeeks,
  fantasyPlayers,
  fantasyProjections,
  fantasyRosters,
  fantasyTransactions,
  pffPlayerStats,
} from '../db/schema.js';
import {
  allPlayFromMatchups,
  applyDraftLetters,
  dollarOneReplacement,
  finishRanks,
  scoreDraftPicks,
  winPct,
  wireStints,
  type ScoredPick,
  type TxEvent,
} from './fantasy-metrics.js';
import {
  blendWeeklyPts,
  positionalHeatmap,
  projectedWeeklyScores,
  starterSlots,
  type HeatCell,
} from './fantasy-projections.js';

export interface SeasonSummary {
  season: number;
  sleeperLeagueId: string;
  status: string;
  name: string;
  teamCount: number;
  draftStatus: string | null;
}

export interface GmSeasonRow {
  slug: string;
  displayName: string;
  sleeperUserId: string | null;
  teamName: string | null;
  season: number;
  sleeperLeagueId: string;
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  fpts: number;
  fptsAgainst: number;
  games: number;
  weeksPlayed: number;
  pfPerWeek: number;
  finish: number;
  waiverBudgetUsed: number;
  draftSurplus: number;
  draftGrade: string;
  draftProjected: boolean;
  wireFpts: number;
  lateFpts: number;
  projected: boolean;
}

export interface HeatmapTeam {
  slug: string;
  displayName: string;
  projected: boolean;
  ovr: HeatCell;
  qb: HeatCell;
  rb: HeatCell;
  wr: HeatCell;
  te: HeatCell;
  flex: HeatCell;
  def: HeatCell;
}

export interface GmAllTimeRow {
  slug: string;
  displayName: string;
  sleeperUserId: string | null;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  fpts: number;
  fptsAgainst: number;
  pfPerWeek: number;
  avgFinish: number;
  sparkline: number[]; // finish by season ascending, 0 = DNP
  draftSurplus: number;
  draftGrade: string;
  draftProjected: boolean;
  wireFpts: number;
  lateFpts: number;
  years: GmSeasonRow[];
}

export interface DraftPickRow extends ScoredPick {
  playerName: string;
  slug: string;
  displayName: string;
  pffGrade: number | null;
  isKeeper: boolean;
  pickNo: number;
}

export interface WireRow {
  slug: string;
  displayName: string;
  playerId: string;
  playerName: string;
  addWeek: number;
  dropWeek: number;
  type: string;
  waiverBid: number;
  fpts: number;
  value: number;
}

function pffCategory(position: string | null): string | null {
  const pos = (position || '').toUpperCase();
  if (pos === 'QB') {
    return 'passing';
  }
  if (pos === 'RB' || pos === 'FB') {
    return 'rushing';
  }
  if (pos === 'WR' || pos === 'TE') {
    return 'receiving';
  }
  return null;
}

async function loadContext() {
  const db = getDB();
  const [leagues, managers, rosters, drafts, picks, matchups, playerWeeks, txs, projections] = await Promise.all([
    db.select().from(fantasyLeagues).orderBy(asc(fantasyLeagues.season)),
    db.select().from(fantasyManagers),
    db.select().from(fantasyRosters),
    db.select().from(fantasyDrafts),
    db.select().from(fantasyDraftPicks),
    db.select().from(fantasyMatchups),
    db.select().from(fantasyPlayerWeeks),
    db.select().from(fantasyTransactions),
    db.select({
      season: fantasyProjections.season,
      week: fantasyProjections.week,
      playerId: fantasyProjections.playerId,
      pts: fantasyProjections.pts,
    }).from(fantasyProjections),
  ]);
  const ids = new Set<string>();
  for (const p of picks) {
    ids.add(p.playerId);
  }
  for (const w of playerWeeks) {
    ids.add(w.playerId);
  }
  for (const tx of txs) {
    for (const id of Object.keys(tx.adds ?? {})) {
      ids.add(id);
    }
    for (const id of Object.keys(tx.drops ?? {})) {
      ids.add(id);
    }
  }
  const idList = [...ids];
  const players =
    idList.length === 0
      ? []
      : await db.select().from(fantasyPlayers).where(inArray(fantasyPlayers.playerId, idList));
  const managerBySleeper = new Map(managers.map((m) => [m.sleeperUserId, m]));
  const playerById = new Map(players.map((p) => [p.playerId, p]));
  return {
    db,
    leagues,
    managers,
    rosters,
    drafts,
    picks,
    matchups,
    playerWeeks,
    txs,
    playerById,
    managerBySleeper,
    projections,
  };
}

type Ctx = Awaited<ReturnType<typeof loadContext>>;

function ident(ctx: Ctx, sleeperUserId: string | null, fallback?: string | null) {
  const known = canonicalManager(sleeperUserId);
  if (known) {
    return {slug: known.slug, displayName: known.displayName};
  }
  if (sleeperUserId) {
    const row = ctx.managerBySleeper.get(sleeperUserId);
    if (row) {
      return {slug: row.slug, displayName: row.displayName};
    }
  }
  return managerForSleeperUser(sleeperUserId, fallback);
}

function playerName(ctx: Ctx, playerId: string): string {
  return ctx.playerById.get(playerId)?.fullName || playerId;
}

function seasonPtsMap(ctx: Ctx, leagueId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of ctx.playerWeeks) {
    if (w.sleeperLeagueId !== leagueId) {
      continue;
    }
    map.set(w.playerId, (map.get(w.playerId) ?? 0) + w.points);
  }
  return map;
}

function maxWeek(ctx: Ctx, leagueId: string): number {
  let max = 1;
  for (const m of ctx.matchups) {
    if (m.sleeperLeagueId === leagueId && m.week > max) {
      max = m.week;
    }
  }
  return max;
}

function projectedPtsMap(ctx: Ctx, season: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of blendWeeklyPts(ctx.projections, season)) {
    map.set(w.playerId, (map.get(w.playerId) ?? 0) + w.pts);
  }
  return map;
}

function scoredPicksForLeague(ctx: Ctx, leagueId: string, ptsOverride?: Map<string, number>): ScoredPick[] {
  const draft = ctx.drafts.find((d) => d.sleeperLeagueId === leagueId);
  if (!draft) {
    return [];
  }
  const picks = ctx.picks.filter((p) => p.draftId === draft.draftId);
  let pts = ptsOverride ?? seasonPtsMap(ctx, leagueId);
  if (!ptsOverride) {
    const actual = [...pts.values()].reduce((s, v) => s + v, 0);
    const league = ctx.leagues.find((l) => l.sleeperLeagueId === leagueId);
    if (actual === 0 && league) {
      const proj = projectedPtsMap(ctx, league.season);
      if (proj.size > 0) {
        pts = proj;
      }
    }
  }
  return scoreDraftPicks(
    picks.map((p) => ({
      playerId: p.playerId,
      rosterId: p.rosterId,
      sleeperUserId: p.sleeperUserId,
      amount: p.amount,
      round: p.round,
      position: p.position,
    })),
    [...pts.entries()].map(([playerId, fpts]) => ({playerId, fpts})),
    draft.rounds ?? 13,
  );
}

function wireForLeague(ctx: Ctx, leagueId: string): {rows: WireRow[]; missed: WireRow[]} {
  const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === leagueId);
  const rosterOwner = new Map(leagueRosters.map((r) => [r.rosterId, r.sleeperUserId]));
  const stints = wireStints(
    txEventsForLeague(ctx, leagueId),
    ctx.playerWeeks
      .filter((w) => w.sleeperLeagueId === leagueId)
      .map((w) => ({week: w.week, rosterId: w.rosterId, playerId: w.playerId, points: w.points})),
    maxWeek(ctx, leagueId),
  );
  const toRow = (s: (typeof stints)[0]): WireRow => {
    const id = ident(ctx, rosterOwner.get(s.rosterId) ?? null);
    return {
      slug: id.slug,
      displayName: id.displayName,
      playerId: s.playerId,
      playerName: playerName(ctx, s.playerId),
      addWeek: s.addWeek,
      dropWeek: s.dropWeek,
      type: s.type,
      waiverBid: s.waiverBid,
      fpts: s.fpts,
      value: s.fpts / Math.max(s.waiverBid, 1),
    };
  };
  const rows = stints.map(toRow).sort((a, b) => b.fpts - a.fpts);
  const missed: WireRow[] = [];
  for (const tx of ctx.txs) {
    if (tx.sleeperLeagueId !== leagueId || tx.status === 'complete') {
      continue;
    }
    if (tx.type !== 'waiver' && tx.type !== 'free_agent') {
      continue;
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.adds ?? {})) {
      const rosterId = Number(rawRosterId);
      const id = ident(ctx, rosterOwner.get(rosterId) ?? null);
      missed.push({
        slug: id.slug,
        displayName: id.displayName,
        playerId,
        playerName: playerName(ctx, playerId),
        addWeek: tx.week,
        dropWeek: tx.week,
        type: tx.type,
        waiverBid: tx.waiverBid ?? 0,
        fpts: 0,
        value: 0,
      });
    }
  }
  return {rows, missed};
}

function txEventsForLeague(ctx: Ctx, leagueId: string): TxEvent[] {
  const events: TxEvent[] = [];
  for (const tx of ctx.txs) {
    if (tx.sleeperLeagueId !== leagueId) {
      continue;
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.adds ?? {})) {
      events.push({
        week: tx.week,
        type: tx.type,
        status: tx.status,
        rosterId: Number(rawRosterId),
        playerId,
        kind: 'add',
        waiverBid: tx.waiverBid,
      });
    }
    for (const [playerId, rawRosterId] of Object.entries(tx.drops ?? {})) {
      events.push({
        week: tx.week,
        type: tx.type,
        status: tx.status,
        rosterId: Number(rawRosterId),
        playerId,
        kind: 'drop',
        waiverBid: tx.waiverBid,
      });
    }
  }
  return events;
}

function buildSeasonRows(ctx: Ctx): GmSeasonRow[] {
  const rows: GmSeasonRow[] = [];
  for (const league of ctx.leagues) {
    const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId);
    let allPlay = allPlayFromMatchups(
      ctx.matchups
        .filter((m) => m.sleeperLeagueId === league.sleeperLeagueId)
        .map((m) => ({week: m.week, rosterId: m.rosterId, matchupId: m.matchupId, points: m.points})),
    );
    const hasActual = [...allPlay.values()].some((r) => r.weeksPlayed > 0 && r.fpts > 0);
    const projPts = projectedPtsMap(ctx, league.season);
    const useProjected = !hasActual && projPts.size > 0;
    if (useProjected) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId);
      const drafted = ctx.picks
        .filter((p) => draft && p.draftId === draft.draftId)
        .map((p) => ({rosterId: p.rosterId, playerId: p.playerId, position: p.position}));
      const weekly = blendWeeklyPts(ctx.projections, league.season);
      allPlay = allPlayFromMatchups(
        projectedWeeklyScores(drafted, weekly, starterSlots(league.rosterPositions)),
      );
    }
    const ranked = finishRanks(
      leagueRosters.map((r) => {
        const rec = allPlay.get(r.rosterId);
        return {
          ...r,
          wins: rec?.wins ?? 0,
          losses: rec?.losses ?? 0,
          ties: rec?.ties ?? 0,
          fpts: rec?.fpts ?? r.fpts,
          weeksPlayed: rec?.weeksPlayed ?? 0,
        };
      }),
    );
    const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId, useProjected ? projPts : undefined);
    const stints = wireStints(
      txEventsForLeague(ctx, league.sleeperLeagueId),
      ctx.playerWeeks
        .filter((w) => w.sleeperLeagueId === league.sleeperLeagueId)
        .map((w) => ({week: w.week, rosterId: w.rosterId, playerId: w.playerId, points: w.points})),
      maxWeek(ctx, league.sleeperLeagueId),
    );
    const seasonRows: GmSeasonRow[] = [];
    for (const r of ranked) {
      const id = ident(ctx, r.sleeperUserId, r.teamName);
      const games = r.wins + r.losses + r.ties;
      const gmPicks = scored.filter((p) => p.rosterId === r.rosterId);
      const totalSurplus = gmPicks.reduce((s, p) => s + p.surplus, 0);
      const wireFpts = stints.filter((s) => s.rosterId === r.rosterId).reduce((s, x) => s + x.fpts, 0);
      const lateFpts = gmPicks.filter((p) => p.late).reduce((s, p) => s + p.fpts, 0);
      seasonRows.push({
        slug: id.slug,
        displayName: id.displayName,
        sleeperUserId: r.sleeperUserId,
        teamName: r.teamName,
        season: league.season,
        sleeperLeagueId: league.sleeperLeagueId,
        rosterId: r.rosterId,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        winPct: winPct(r.wins, r.losses, r.ties),
        fpts: r.fpts,
        fptsAgainst: r.fptsAgainst,
        games,
        weeksPlayed: r.weeksPlayed,
        pfPerWeek: r.weeksPlayed ? r.fpts / r.weeksPlayed : 0,
        finish: r.finish,
        waiverBudgetUsed: r.waiverBudgetUsed,
        draftSurplus: totalSurplus,
        draftGrade: gmPicks.length ? '' : '—',
        draftProjected: useProjected,
        wireFpts,
        lateFpts,
        projected: useProjected,
      });
    }
    rows.push(...applyDraftLetters(seasonRows));
  }
  return rows;
}

function rollupAllTime(seasonRows: GmSeasonRow[], seasons: number[]): GmAllTimeRow[] {
  const bySlug = new Map<string, GmSeasonRow[]>();
  for (const row of seasonRows) {
    const list = bySlug.get(row.slug) ?? [];
    list.push(row);
    bySlug.set(row.slug, list);
  }
  const out: GmAllTimeRow[] = [];
  for (const [slug, years] of bySlug) {
    years.sort((a, b) => a.season - b.season);
    const live = years.filter((y) => !y.projected);
    const wins = live.reduce((s, y) => s + y.wins, 0);
    const losses = live.reduce((s, y) => s + y.losses, 0);
    const ties = live.reduce((s, y) => s + y.ties, 0);
    const fpts = live.reduce((s, y) => s + y.fpts, 0);
    const fptsAgainst = live.reduce((s, y) => s + y.fptsAgainst, 0);
    const weeksPlayed = live.reduce((s, y) => s + y.weeksPlayed, 0);
    const gradedYears = years.filter((y) => y.draftGrade !== '—');
    const draftSurplus = gradedYears.length
      ? gradedYears.reduce((s, y) => s + y.draftSurplus, 0) / gradedYears.length
      : 0;
    const sparkline = seasons.map((season) => {
      const y = years.find((row) => row.season === season);
      if (!y || y.projected) {
        return 0;
      }
      return y.finish;
    });
    out.push({
      slug,
      displayName: years[years.length - 1].displayName,
      sleeperUserId: years[years.length - 1].sleeperUserId,
      seasons: years.length,
      wins,
      losses,
      ties,
      winPct: winPct(wins, losses, ties),
      fpts,
      fptsAgainst,
      pfPerWeek: weeksPlayed ? fpts / weeksPlayed : 0,
      avgFinish: live.length ? live.reduce((s, y) => s + y.finish, 0) / live.length : 0,
      sparkline,
      draftSurplus,
      draftGrade: gradedYears.length ? '' : '—',
      draftProjected: gradedYears.some((y) => y.draftProjected),
      wireFpts: years.reduce((s, y) => s + y.wireFpts, 0),
      lateFpts: years.reduce((s, y) => s + y.lateFpts, 0),
      years,
    });
  }
  const graded = applyDraftLetters(out);
  graded.sort((a, b) => b.winPct - a.winPct || b.fpts - a.fpts);
  return graded;
}

let pffCache: Map<string, number> | null = null;

async function pffMap(db: Ctx['db'], seasons: number[]): Promise<Map<string, number>> {
  if (pffCache) {
    return pffCache;
  }
  const rows =
    seasons.length === 0
      ? []
      : await db
          .select({
            playerName: pffPlayerStats.playerName,
            season: pffPlayerStats.season,
            category: pffPlayerStats.category,
            grade: pffPlayerStats.grade,
          })
          .from(pffPlayerStats)
          .where(inArray(pffPlayerStats.season, seasons));
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.grade == null) {
      continue;
    }
    map.set(`${normPlayerName(r.playerName)}|${r.season}|${r.category}`, r.grade);
  }
  pffCache = map;
  return map;
}

function lookupPff(
  map: Map<string, number>,
  name: string,
  season: number,
  position: string | null,
): number | null {
  const cat = pffCategory(position);
  if (!cat) {
    return null;
  }
  return map.get(`${normPlayerName(name)}|${season}|${cat}`) ?? null;
}

function buildHeatmap(ctx: Ctx, year: number): HeatmapTeam[] {
  const league = ctx.leagues.find((l) => l.season === year);
  if (!league) {
    return [];
  }
  const actual = seasonPtsMap(ctx, league.sleeperLeagueId);
  const actualSum = [...actual.values()].reduce((s, v) => s + v, 0);
  const pts = actualSum > 0 ? actual : projectedPtsMap(ctx, year);
  const projected = actualSum === 0 && pts.size > 0;
  if (pts.size === 0) {
    return [];
  }
  const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId);
  const leagueRosters = ctx.rosters.filter((r) => r.sleeperLeagueId === league.sleeperLeagueId);
  const byRoster = new Map<number, {playerId: string; position: string; pts: number}[]>();
  for (const p of ctx.picks.filter((x) => draft && x.draftId === draft.draftId)) {
    const list = byRoster.get(p.rosterId) ?? [];
    list.push({playerId: p.playerId, position: p.position ?? 'UNK', pts: pts.get(p.playerId) ?? 0});
    byRoster.set(p.rosterId, list);
  }
  const heat = positionalHeatmap(
    leagueRosters.map((r) => ({rosterId: r.rosterId, players: byRoster.get(r.rosterId) ?? []})),
    starterSlots(league.rosterPositions),
  );
  const out: HeatmapTeam[] = heat.map((h) => {
    const roster = leagueRosters.find((r) => r.rosterId === h.rosterId);
    const id = ident(ctx, roster?.sleeperUserId ?? null, roster?.teamName);
    return {
      slug: id.slug,
      displayName: id.displayName,
      projected,
      ovr: h.ovr,
      qb: h.qb,
      rb: h.rb,
      wr: h.wr,
      te: h.te,
      flex: h.flex,
      def: h.def,
    };
  });
  out.sort((a, b) => a.ovr.rank - b.ovr.rank || b.ovr.pts - a.ovr.pts);
  return out;
}

export const FantasyScout = {
  async listSeasons(): Promise<SeasonSummary[]> {
    const ctx = await loadContext();
    return ctx.leagues.map((l) => {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId);
      return {
        season: l.season,
        sleeperLeagueId: l.sleeperLeagueId,
        status: l.status,
        name: l.name,
        teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
        draftStatus: draft?.status ?? null,
      };
    });
  },

  async allTime(): Promise<{seasons: SeasonSummary[]; gms: GmAllTimeRow[]}> {
    const ctx = await loadContext();
    const seasons = await this.listSeasons();
    const rows = buildSeasonRows(ctx);
    return {seasons, gms: rollupAllTime(rows, seasons.map((s) => s.season))};
  },

  async season(year: number): Promise<{
    summary: SeasonSummary | null;
    standings: GmSeasonRow[];
    heatmap: HeatmapTeam[];
  }> {
    const ctx = await loadContext();
    const seasons = (await this.listSeasons()).filter((s) => s.season === year);
    const standings = buildSeasonRows(ctx)
      .filter((r) => r.season === year)
      .sort((a, b) => a.finish - b.finish);
    return {summary: seasons[0] ?? null, standings, heatmap: buildHeatmap(ctx, year)};
  },

  async draft(year: number): Promise<{
    summary: SeasonSummary | null;
    picks: DraftPickRow[];
    replacement: number;
  }> {
    const ctx = await loadContext();
    const league = ctx.leagues.find((l) => l.season === year);
    const seasons = await this.listSeasons();
    if (!league) {
      return {summary: null, picks: [], replacement: 0};
    }
    const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId);
    const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId);
    const pff = await pffMap(ctx.db, [year]);
    const pickMeta = new Map(
      ctx.picks.filter((p) => draft && p.draftId === draft.draftId).map((p) => [`${p.playerId}|${p.rosterId}`, p]),
    );
    const picks: DraftPickRow[] = scored.map((p) => {
      const id = ident(ctx, p.sleeperUserId);
      const name = playerName(ctx, p.playerId);
      const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`);
      return {
        ...p,
        playerName: name,
        slug: id.slug,
        displayName: id.displayName,
        pffGrade: lookupPff(pff, name, year, p.position),
        isKeeper: Boolean(meta?.isKeeper),
        pickNo: meta?.pickNo ?? 0,
      };
    });
    picks.sort((a, b) => a.pickNo - b.pickNo);
    return {
      summary: seasons.find((s) => s.season === year) ?? null,
      picks,
      replacement: dollarOneReplacement(scored),
    };
  },

  async wire(year: number): Promise<{summary: SeasonSummary | null; rows: WireRow[]; missed: WireRow[]}> {
    const ctx = await loadContext();
    const league = ctx.leagues.find((l) => l.season === year);
    if (!league) {
      return {summary: null, rows: [], missed: []};
    }
    const {rows, missed} = wireForLeague(ctx, league.sleeperLeagueId);
    const seasons = ctx.leagues.map((l) => ({
      season: l.season,
      sleeperLeagueId: l.sleeperLeagueId,
      status: l.status,
      name: l.name,
      teamCount: ctx.rosters.filter((r) => r.sleeperLeagueId === l.sleeperLeagueId).length,
      draftStatus: ctx.drafts.find((d) => d.sleeperLeagueId === l.sleeperLeagueId)?.status ?? null,
    }));
    return {summary: seasons.find((s) => s.season === year) ?? null, rows, missed};
  },

  async bargains(): Promise<{
    seasons: SeasonSummary[];
    rows: (DraftPickRow & {season: number})[];
    byGm: {slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number}[];
  }> {
    const ctx = await loadContext();
    const seasons = await this.listSeasons();
    const pff = await pffMap(
      ctx.db,
      seasons.map((s) => s.season),
    );
    const rows: (DraftPickRow & {season: number})[] = [];
    for (const league of ctx.leagues) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId);
      const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId).filter((p) => p.late);
      const replacement = dollarOneReplacement(scoredPicksForLeague(ctx, league.sleeperLeagueId));
      const pickMeta = new Map(
        ctx.picks.filter((p) => draft && p.draftId === draft.draftId).map((p) => [`${p.playerId}|${p.rosterId}`, p]),
      );
      for (const p of scored) {
        const id = ident(ctx, p.sleeperUserId);
        const name = playerName(ctx, p.playerId);
        const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`);
        rows.push({
          ...p,
          playerName: name,
          slug: id.slug,
          displayName: id.displayName,
          pffGrade: lookupPff(pff, name, league.season, p.position),
          isKeeper: Boolean(meta?.isKeeper),
          pickNo: meta?.pickNo ?? 0,
          season: league.season,
          surplus: p.fpts - replacement,
        });
      }
    }
    rows.sort((a, b) => b.fpts - a.fpts);
    const bySlug = new Map<string, {slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number}>();
    for (const r of rows) {
      const cur = bySlug.get(r.slug) ?? {
        slug: r.slug,
        displayName: r.displayName,
        lateFpts: 0,
        latePicks: 0,
        hits: 0,
      };
      cur.lateFpts += r.fpts;
      cur.latePicks += 1;
      if (r.surplus > 0) {
        cur.hits += 1;
      }
      bySlug.set(r.slug, cur);
    }
    const byGm = [...bySlug.values()].sort((a, b) => b.lateFpts - a.lateFpts);
    return {seasons, rows, byGm};
  },

  async rankings(): Promise<{seasons: number[]; gms: GmAllTimeRow[]}> {
    const {seasons, gms} = await this.allTime();
    return {seasons: seasons.map((s) => s.season), gms};
  },

  async manager(slug: string): Promise<{
    gm: GmAllTimeRow | null;
    draftPicks: (DraftPickRow & {season: number})[];
    wire: (WireRow & {season: number})[];
    missed: (WireRow & {season: number})[];
  }> {
    const ctx = await loadContext();
    const seasonNums = ctx.leagues.map((l) => l.season);
    const gm = rollupAllTime(buildSeasonRows(ctx), seasonNums).find((g) => g.slug === slug) ?? null;
    if (!gm) {
      return {gm: null, draftPicks: [], wire: [], missed: []};
    }
    const pff = await pffMap(ctx.db, seasonNums);
    const draftPicks: (DraftPickRow & {season: number})[] = [];
    const wire: (WireRow & {season: number})[] = [];
    const missed: (WireRow & {season: number})[] = [];
    for (const league of ctx.leagues) {
      const draft = ctx.drafts.find((d) => d.sleeperLeagueId === league.sleeperLeagueId);
      const scored = scoredPicksForLeague(ctx, league.sleeperLeagueId);
      const pickMeta = new Map(
        ctx.picks.filter((p) => draft && p.draftId === draft.draftId).map((p) => [`${p.playerId}|${p.rosterId}`, p]),
      );
      for (const p of scored) {
        const id = ident(ctx, p.sleeperUserId);
        if (id.slug !== slug) {
          continue;
        }
        const name = playerName(ctx, p.playerId);
        const meta = pickMeta.get(`${p.playerId}|${p.rosterId}`);
        draftPicks.push({
          ...p,
          playerName: name,
          slug: id.slug,
          displayName: id.displayName,
          pffGrade: lookupPff(pff, name, league.season, p.position),
          isKeeper: Boolean(meta?.isKeeper),
          pickNo: meta?.pickNo ?? 0,
          season: league.season,
        });
      }
      const w = wireForLeague(ctx, league.sleeperLeagueId);
      wire.push(...w.rows.filter((r) => r.slug === slug).map((r) => ({...r, season: league.season})));
      missed.push(...w.missed.filter((r) => r.slug === slug).map((r) => ({...r, season: league.season})));
    }
    return {gm, draftPicks, wire, missed};
  },

  async player(playerId: string): Promise<{
    playerId: string;
    name: string;
    position: string | null;
    team: string | null;
    drafts: (DraftPickRow & {season: number})[];
    weeks: {season: number; week: number; points: number; slug: string; displayName: string}[];
    pff: {season: number; category: string; grade: number}[];
  } | null> {
    const ctx = await loadContext();
    const p = ctx.playerById.get(playerId);
    if (!p && !ctx.picks.some((x) => x.playerId === playerId)) {
      return null;
    }
    const seasons = await this.listSeasons();
    const drafts: (DraftPickRow & {season: number})[] = [];
    for (const s of seasons) {
      const d = await this.draft(s.season);
      drafts.push(...d.picks.filter((row) => row.playerId === playerId).map((row) => ({...row, season: s.season})));
    }
    const rosterOwner = new Map<string, string | null>();
    for (const r of ctx.rosters) {
      rosterOwner.set(`${r.sleeperLeagueId}|${r.rosterId}`, r.sleeperUserId);
    }
    const leagueSeason = new Map(ctx.leagues.map((l) => [l.sleeperLeagueId, l.season]));
    const weeks = ctx.playerWeeks
      .filter((w) => w.playerId === playerId)
      .map((w) => {
        const id = ident(ctx, rosterOwner.get(`${w.sleeperLeagueId}|${w.rosterId}`) ?? null);
        return {
          season: leagueSeason.get(w.sleeperLeagueId) ?? 0,
          week: w.week,
          points: w.points,
          slug: id.slug,
          displayName: id.displayName,
        };
      })
      .sort((a, b) => a.season - b.season || a.week - b.week);
    const name = p?.fullName || drafts[0]?.playerName || playerId;
    const pffRows = await ctx.db
      .select({
        season: pffPlayerStats.season,
        category: pffPlayerStats.category,
        grade: pffPlayerStats.grade,
      })
      .from(pffPlayerStats)
      .where(eq(pffPlayerStats.playerName, name));
    const pff = pffRows
      .filter((r) => r.grade != null)
      .map((r) => ({season: r.season, category: r.category, grade: r.grade as number}));
    return {
      playerId,
      name,
      position: p?.position ?? drafts[0]?.position ?? null,
      team: p?.team ?? null,
      drafts,
      weeks,
      pff,
    };
  },
};
