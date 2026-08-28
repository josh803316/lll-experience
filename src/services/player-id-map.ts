import {normPlayerName} from '../config/fantasy-managers.js';

const IDS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

export interface PlayerIdMaps {
  espnToSleeper: Map<string, string>;
  fpToSleeper: Map<string, string>;
  nameToSleeper: Map<string, string>;
}

let cache: PlayerIdMaps | null = null;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

export async function loadPlayerIdMaps(): Promise<PlayerIdMaps> {
  if (cache) {
    return cache;
  }
  const text = await fetch(IDS_URL, {headers: {'User-Agent': 'lll-experience-ucsb-legacy/1.0'}}).then((r) => r.text());
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const iSleeper = idx('sleeper_id');
  const iEspn = idx('espn_id');
  const iFp = idx('fantasypros_id');
  const iName = idx('merge_name') >= 0 ? idx('merge_name') : idx('name');
  const espnToSleeper = new Map<string, string>();
  const fpToSleeper = new Map<string, string>();
  const nameToSleeper = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const sleeper = cols[iSleeper]?.trim();
    if (!sleeper || sleeper === 'NA') {
      continue;
    }
    const espn = cols[iEspn]?.trim();
    if (espn && espn !== 'NA') {
      espnToSleeper.set(espn, sleeper);
    }
    const fp = cols[iFp]?.trim();
    if (fp && fp !== 'NA') {
      fpToSleeper.set(fp, sleeper);
    }
    const name = cols[iName]?.trim();
    if (name) {
      nameToSleeper.set(normPlayerName(name), sleeper);
    }
  }
  cache = {espnToSleeper, fpToSleeper, nameToSleeper};
  return cache;
}
