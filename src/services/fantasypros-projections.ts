import {normPlayerName} from '../config/fantasy-managers.js';
import {scoreStats, type SourceProjRow} from './fantasy-projections.js';
import {loadPlayerIdMaps} from './player-id-map.js';

const POS_PAGES = ['qb', 'rb', 'wr', 'te', 'dst'] as const;

const COLS: Record<(typeof POS_PAGES)[number], string[]> = {
  qb: ['pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_int', 'rush_att', 'rush_yd', 'rush_td', 'fum_lost'],
  rb: ['rush_att', 'rush_yd', 'rush_td', 'rec', 'rec_yd', 'rec_td', 'fum_lost'],
  wr: ['rec', 'rec_yd', 'rec_td', 'rush_att', 'rush_yd', 'rush_td', 'fum_lost'],
  te: ['rec', 'rec_yd', 'rec_td', 'fum_lost'],
  dst: ['sack', 'int', 'fum_rec', 'ff', 'def_td', 'safe', 'pts_allow'],
};

function parseNum(s: string): number {
  const n = Number(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseFpRows(html: string, pos: (typeof POS_PAGES)[number]): {fpId: string; name: string; stats: Record<string, number>}[] {
  const keys = COLS[pos];
  const out: {fpId: string; name: string; stats: Record<string, number>}[] = [];
  const re = /fp-id-(\d+)[^>]*fp-player-name="([^"]+)"[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const fpId = m[1];
    const name = m[2];
    const row = m[0];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((t) => t[1].replace(/<[^>]+>/g, '').trim());
    // Player cell is outside this match; last numeric cell is FPTS — drop it.
    const nums = tds.map(parseNum).slice(0, -1);
    const stats: Record<string, number> = {};
    for (let i = 0; i < keys.length && i < nums.length; i++) {
      stats[keys[i]] = nums[i];
    }
    out.push({fpId, name, stats});
  }
  return out;
}

export async function fetchFantasyProsWeeklyProjections(
  season: number,
  scoring: Record<string, unknown> | null,
  sleeperIds: Set<string>,
): Promise<SourceProjRow[]> {
  const ids = await loadPlayerIdMaps();
  const rows: SourceProjRow[] = [];
  for (let week = 1; week <= 18; week++) {
    for (const pos of POS_PAGES) {
      const url = `https://www.fantasypros.com/nfl/projections/${pos}.php?week=${week}&scoring=PPR&year=${season}`;
      const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 lll-experience-ucsb-legacy/1.0'}});
      if (!res.ok) {
        console.log(`[fp-proj] ${pos} w${week} HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      for (const row of parseFpRows(html, pos)) {
        let sleeperId = ids.fpToSleeper.get(row.fpId);
        if (!sleeperId) {
          sleeperId = ids.nameToSleeper.get(normPlayerName(row.name));
        }
        if (!sleeperId && pos === 'dst') {
          const needle = normPlayerName(row.name);
          for (const sid of sleeperIds) {
            if (sid.length <= 3 && needle.includes(sid.toLowerCase())) {
              sleeperId = sid;
              break;
            }
          }
        }
        if (!sleeperId || !sleeperIds.has(sleeperId)) {
          continue;
        }
        if (Object.keys(row.stats).length === 0) {
          continue;
        }
        rows.push({
          season,
          week,
          playerId: sleeperId,
          source: 'fantasypros',
          opponent: null,
          stats: row.stats,
          pts: scoreStats(scoring, row.stats),
        });
      }
    }
  }
  return rows;
}
