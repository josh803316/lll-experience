const SLEEPER_BASE = 'https://api.sleeper.app/v1';

export class SleeperHttpError extends Error {
  readonly url: string;
  readonly status: number;
  constructor(url: string, status: number, message: string) {
    super(message);
    this.name = 'SleeperHttpError';
    this.url = url;
    this.status = status;
  }
}

async function sleeperGet<T>(path: string): Promise<T> {
  const url = `${SLEEPER_BASE}${path}`;
  const res = await fetch(url, {
    headers: {'User-Agent': 'lll-experience-ucsb-legacy/1.0'},
  });
  if (!res.ok) {
    throw new SleeperHttpError(url, res.status, `Sleeper ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

async function sleeperGetArray<T>(path: string): Promise<T[]> {
  const data = await sleeperGet<T[] | null>(path);
  return Array.isArray(data) ? data : [];
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  status: string;
  season: string;
  previous_league_id: string | null;
  draft_id: string | null;
  total_rosters: number;
  settings: Record<string, unknown>;
  scoring_settings: Record<string, unknown>;
  roster_positions: string[];
}

export interface SleeperUser {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar?: string;
  is_owner?: boolean;
  metadata?: {team_name?: string} | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  league_id: string;
  players?: string[] | null;
  starters?: string[] | null;
  settings: {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    waiver_budget_used?: number;
    waiver_position?: number;
    total_moves?: number;
  };
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  type: string;
  status: string;
  season: string;
  settings: Record<string, unknown> & {budget?: number; rounds?: number};
  metadata?: Record<string, unknown>;
}

export interface SleeperDraftPick {
  draft_id: string;
  pick_no: number;
  round: number;
  roster_id: number | string;
  picked_by: string;
  player_id: string;
  is_keeper?: boolean | null;
  metadata?: {
    amount?: string;
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  custom_points?: number | null;
  starters?: string[] | null;
  players?: string[] | null;
  players_points?: Record<string, number> | null;
  starters_points?: number[] | null;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  settings?: {waiver_bid?: number; seq?: number} | null;
  created?: number;
  leg?: number;
}

export interface SleeperNflPlayer {
  player_id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  team?: string;
  fantasy_positions?: string[] | null;
}

export function combineFpts(whole?: number, decimal?: number): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

export interface SleeperWeeklyProjection {
  player_id: string;
  week: number;
  season?: string;
  opponent?: string | null;
  company?: string | null;
  category?: string | null;
  stats?: Record<string, number> | null;
}

async function sleeperGetUrl<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {'User-Agent': 'lll-experience-ucsb-legacy/1.0'},
  });
  if (!res.ok) {
    throw new SleeperHttpError(url, res.status, `Sleeper ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export const sleeperClient = {
  getLeague: (leagueId: string) => sleeperGet<SleeperLeague | null>(`/league/${leagueId}`),
  getUsers: (leagueId: string) => sleeperGetArray<SleeperUser>(`/league/${leagueId}/users`),
  getRosters: (leagueId: string) => sleeperGetArray<SleeperRoster>(`/league/${leagueId}/rosters`),
  getDrafts: (leagueId: string) => sleeperGetArray<SleeperDraft>(`/league/${leagueId}/drafts`),
  getDraftPicks: (draftId: string) => sleeperGetArray<SleeperDraftPick>(`/draft/${draftId}/picks`),
  getMatchups: (leagueId: string, week: number) =>
    sleeperGetArray<SleeperMatchup>(`/league/${leagueId}/matchups/${week}`),
  getTransactions: (leagueId: string, week: number) =>
    sleeperGetArray<SleeperTransaction>(`/league/${leagueId}/transactions/${week}`),
  getPlayers: async () => {
    const data = await sleeperGet<Record<string, SleeperNflPlayer> | null>('/players/nfl');
    return data && typeof data === 'object' ? data : {};
  },
  /**
   * Undocumented weekly projections (RotoWire). One call returns weeks 1–18 for a player.
   * Not under /v1.
   */
  getPlayerWeeklyProjections: async (playerId: string, season: number): Promise<SleeperWeeklyProjection[]> => {
    const url = `https://api.sleeper.app/projections/nfl/player/${encodeURIComponent(playerId)}?season=${season}&season_type=regular&grouping=week`;
    const data = await sleeperGetUrl<Record<string, SleeperWeeklyProjection> | SleeperWeeklyProjection[] | null>(url);
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data.filter((row) => row && row.player_id);
    }
    return Object.values(data).filter((row) => row && row.player_id);
  },
};
