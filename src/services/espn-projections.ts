import {scoreStats, type SourceProjRow} from './fantasy-projections.js';
import {loadPlayerIdMaps} from './player-id-map.js';

const ESPN_STAT: Record<string, string> = {
  '0': 'pass_att',
  '1': 'pass_cmp',
  '3': 'pass_yd',
  '4': 'pass_td',
  '19': 'pass_int',
  '20': 'pass_int',
  '23': 'rush_att',
  '24': 'rush_yd',
  '25': 'rush_td',
  '42': 'rec_yd',
  '43': 'rec_td',
  '53': 'rec',
  '72': 'fum_lost',
};

type EspnStat = {
  statSourceId?: number;
  statSplitTypeId?: number;
  scoringPeriodId?: number;
  seasonId?: number;
  stats?: Record<string, number>;
};

type EspnPlayer = {
  player?: {
    id?: number;
    fullName?: string;
    stats?: EspnStat[];
    defaultPositionId?: number;
    proTeamId?: number;
  };
};

function espnStatsToSleeper(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) {
    return out;
  }
  for (const [k, v] of Object.entries(raw)) {
    const name = ESPN_STAT[k];
    if (name && typeof v === 'number') {
      out[name] = v;
    }
  }
  return out;
}

export async function fetchEspnWeeklyProjections(
  season: number,
  scoring: Record<string, unknown> | null,
  sleeperIds: Set<string>,
): Promise<SourceProjRow[]> {
  const ids = await loadPlayerIdMaps();
  const filter = JSON.stringify({
    players: {
      limit: 2000,
      sortPercOwned: {sortPriority: 1, sortAsc: false},
      filterStatsForSourceIds: {value: [1]},
    },
  });
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'lll-experience-ucsb-legacy/1.0',
      'X-Fantasy-Filter': filter,
      'X-Fantasy-Source': 'kona',
    },
  });
  if (!res.ok) {
    console.log(`[espn-proj] HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as {players?: EspnPlayer[]};
  const rows: SourceProjRow[] = [];
  for (const entry of body.players ?? []) {
    const espnId = String(entry.player?.id ?? '');
    const sleeperId = ids.espnToSleeper.get(espnId);
    if (!sleeperId || !sleeperIds.has(sleeperId)) {
      continue;
    }
    const weekly = (entry.player?.stats ?? []).filter(
      (s) =>
        s.statSourceId === 1 &&
        s.statSplitTypeId === 1 &&
        (s.seasonId === season || s.seasonId == null) &&
        typeof s.scoringPeriodId === 'number' &&
        s.scoringPeriodId >= 1 &&
        s.scoringPeriodId <= 18,
    );
    const byWeek = new Map<number, EspnStat>();
    for (const s of weekly) {
      const week = s.scoringPeriodId!;
      const prev = byWeek.get(week);
      if (!prev || s.seasonId === season) {
        byWeek.set(week, s);
      }
    }
    for (const [week, s] of byWeek) {
      const stats = espnStatsToSleeper(s.stats);
      if (Object.keys(stats).length === 0) {
        continue;
      }
      rows.push({
        season,
        week,
        playerId: sleeperId,
        source: 'espn',
        opponent: null,
        stats,
        pts: scoreStats(scoring, stats),
      });
    }
  }
  return rows;
}
