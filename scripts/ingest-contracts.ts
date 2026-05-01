/**
 * Contract ingestion (v2). Pulls nflverse's gzipped historical_contracts.csv,
 * matches each pick to their second contract (≥ 3 years post-draft), and
 * classifies the outcome with proper team-name normalization.
 *
 * The previous version compared "SFO" against "San Francisco 49ers" as
 * strings, so every retention got mislabeled OTHER_TEAM_PAID.
 *
 * Run: bun run scripts/ingest-contracts.ts
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {gunzipSync} from 'zlib';
import {officialDraftResults, playerContracts} from '../src/db/schema.js';
import {eq, sql} from 'drizzle-orm';
import {canonicalTeam, LLLRatingEngine, TEAM_CANONICAL} from '../src/services/lll-rating-engine.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const URL = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.csv.gz';

const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// nflverse contracts use team NICKNAMES ("Packers", "Bills"). Build a
// nickname → canonical-abbr index so we can compare like-with-like.
const NICKNAME_TO_ABBR: Record<string, string> = {};
for (const v of Object.values(TEAM_CANONICAL)) {
  NICKNAME_TO_ABBR[v.name.toLowerCase()] = v.abbr;
}
// Manual aliases for franchises whose names changed during our window.
NICKNAME_TO_ABBR['raiders'] = 'LV';
NICKNAME_TO_ABBR['chargers'] = 'LAC';
NICKNAME_TO_ABBR['rams'] = 'LAR';
NICKNAME_TO_ABBR['redskins'] = 'WAS';
NICKNAME_TO_ABBR['football team'] = 'WAS';
NICKNAME_TO_ABBR['commanders'] = 'WAS';
NICKNAME_TO_ABBR['49ers'] = 'SF';

function teamAbbrFromContract(contractTeam: string | undefined): string | null {
  if (!contractTeam) {
    return null;
  }
  const lower = contractTeam.toLowerCase().replace(/"/g, '').trim();
  return NICKNAME_TO_ABBR[lower] ?? null;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

interface ContractRow {
  player: string;
  position: string;
  team: string;
  yearSigned: number;
  yearsLength: number | null;
  value: number | null;
  apy: number | null;
  guaranteed: number | null;
  apyCapPct: number;
  draftYear: number | null;
  draftOverall: number | null;
  draftTeam: string;
}

async function run() {
  console.log('--- Contract ingestion v2 (nflverse direct) ---');

  console.log('Downloading historical_contracts.csv.gz…');
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const csvText = gunzipSync(buf).toString('utf-8');
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  const idx = (k: string) => headers.indexOf(k);
  const i = {
    player: idx('player'),
    position: idx('position'),
    team: idx('team'),
    yearSigned: idx('year_signed'),
    yearsLength: idx('years'),
    value: idx('value'),
    apy: idx('apy'),
    guaranteed: idx('guaranteed'),
    apyCapPct: idx('apy_cap_pct'),
    draftYear: idx('draft_year'),
    draftOverall: idx('draft_overall'),
    draftTeam: idx('draft_team'),
  };
  console.log(`Decompressed ${lines.length - 1} contract rows`);

  // Group contracts by normalized player name.
  const byName = new Map<string, ContractRow[]>();
  for (let r = 1; r < lines.length; r++) {
    const row = splitCsv(lines[r]);
    if (row.length < headers.length / 2) {
      continue;
    }
    const player = row[i.player]?.replace(/"/g, '').trim();
    if (!player) {
      continue;
    }
    const yearSigned = parseInt(row[i.yearSigned]);
    if (!Number.isFinite(yearSigned)) {
      continue;
    }
    const numOrNull = (s: string | undefined): number | null => {
      if (!s) {
        return null;
      }
      const n = parseFloat(s);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const c: ContractRow = {
      player,
      position: row[i.position]?.replace(/"/g, '').trim() ?? '',
      team: row[i.team]?.replace(/"/g, '').trim() ?? '',
      yearSigned,
      yearsLength: parseInt(row[i.yearsLength]) || null,
      value: numOrNull(row[i.value]),
      apy: numOrNull(row[i.apy]),
      guaranteed: numOrNull(row[i.guaranteed]),
      apyCapPct: parseFloat(row[i.apyCapPct]) || 0,
      draftYear: parseInt(row[i.draftYear]) || null,
      draftOverall: parseInt(row[i.draftOverall]) || null,
      draftTeam: row[i.draftTeam]?.replace(/"/g, '').trim() ?? '',
    };
    const key = LLLRatingEngine.normalizeName(player);
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }
  console.log(`Indexed ${byName.size} players`);

  // For each pick in our DB, find the most-relevant 2nd contract.
  const allDrafted = await db.select().from(officialDraftResults);

  const counts: Record<string, number> = {};
  let touched = 0;
  let cleared = 0;

  for (const pick of allDrafted) {
    if (!pick.playerName) {
      continue;
    }
    const key = LLLRatingEngine.normalizeName(pick.playerName);
    const contracts = byName.get(key);
    if (!contracts) {
      // Clear any stale flag from prior runs.
      if (pick.contractOutcome) {
        await db.update(officialDraftResults).set({contractOutcome: null}).where(eq(officialDraftResults.id, pick.id));
        cleared++;
      }
      continue;
    }

    contracts.sort((a, b) => a.yearSigned - b.yearSigned);
    // 2nd contract = first contract signed at least 3 years after the player's draft.
    const second = contracts.find((c) => c.yearSigned > pick.year + 2);
    if (!second) {
      // Player drafted but no real 2nd contract on file (still on rookie deal,
      // already cut, or contract not yet ingested). Clear stale flag.
      if (pick.contractOutcome) {
        await db.update(officialDraftResults).set({contractOutcome: null}).where(eq(officialDraftResults.id, pick.id));
        cleared++;
      }
      continue;
    }

    // sameTeam = comparing canonical abbreviation of pick's draft team
    // against the contract's signing team (mapped from nickname).
    const draftTeamAbbr = canonicalTeam(pick.teamName)?.abbr ?? null;
    const contractTeamAbbr = teamAbbrFromContract(second.team);
    const sameTeam = !!draftTeamAbbr && !!contractTeamAbbr && draftTeamAbbr === contractTeamAbbr;

    let outcome: string;
    if (second.apyCapPct >= 0.1) {
      outcome = sameTeam ? 'TOP_OF_MARKET' : 'OTHER_TEAM_PAID';
    } else if (second.apyCapPct >= 0.05) {
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else if (second.apyCapPct >= 0.02) {
      // Modest re-sign. Still a real contract, but not top-tier.
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else {
      // Tiny minimum-style deal. Doesn't meaningfully signal "the league paid up".
      outcome = 'WALKED_FOR_CHEAP';
    }

    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (pick.contractOutcome !== outcome) {
      await db.update(officialDraftResults).set({contractOutcome: outcome}).where(eq(officialDraftResults.id, pick.id));
      touched++;
    }
  }

  console.log(`Updated ${touched} contractOutcome rows; cleared ${cleared} stale flags.`);
  console.log('Outcome distribution:', counts);

  // Additive: write per-contract dollar rows to player_contracts. We write
  // every contract on file (not just the 2nd), tagged with whether each
  // matches the "first contract ≥3 years post-draft" rule. This gives us
  // the raw signal to weight by $/cap% later without committing to a
  // particular outcome bucketing.
  console.log('\nWriting player_contracts rows from nflverse…');
  const draftYearByName = new Map<string, number>();
  for (const p of allDrafted) {
    if (p.playerName) {
      draftYearByName.set(LLLRatingEngine.normalizeName(p.playerName), p.year);
    }
  }

  // Replace nflverse-sourced rows so re-runs converge.
  await db.delete(playerContracts).where(eq(playerContracts.source, 'nflverse'));

  let writtenContracts = 0;
  const toWrite: (typeof playerContracts.$inferInsert)[] = [];
  for (const [key, list] of byName) {
    const draftedYear = draftYearByName.get(key);
    list.sort((a, b) => a.yearSigned - b.yearSigned);
    const second = draftedYear !== undefined ? list.find((c) => c.yearSigned > draftedYear + 2) : undefined;
    for (const c of list) {
      const teamAbbr = teamAbbrFromContract(c.team);
      toWrite.push({
        playerName: c.player,
        teamAbbr,
        position: c.position || null,
        yearSigned: c.yearSigned,
        yearsLength: c.yearsLength,
        valueTotal: c.value,
        apy: c.apy,
        guaranteed: c.guaranteed,
        apyCapPct: c.apyCapPct,
        isSecondContract: second === c,
        draftYear: c.draftYear,
        draftOverall: c.draftOverall,
        source: 'nflverse',
      });
    }
  }

  const CHUNK = 500;
  for (let s = 0; s < toWrite.length; s += CHUNK) {
    const slice = toWrite.slice(s, s + CHUNK);
    await db.insert(playerContracts).values(slice).onConflictDoNothing();
    writtenContracts += slice.length;
  }
  console.log(`Wrote ${writtenContracts} contract rows (source='nflverse').`);

  const summary = await db.execute(sql`
    SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_second_contract)::int AS second_n
    FROM player_contracts WHERE source='nflverse'
  `);
  console.log(`Final nflverse rows in player_contracts:`, summary[0]);

  // Sanity-check Jeff's flagged players.
  const checks = [
    'Nick Bosa',
    'Brandon Aiyuk',
    'Deebo Samuel',
    'Fred Warner',
    'Aaron Banks',
    'Spencer Burford',
    'Colton McKivitz',
  ];
  for (const name of checks) {
    const r = await db.select().from(officialDraftResults).where(eq(officialDraftResults.playerName, name)).limit(1);
    console.log(`  ${name.padEnd(20)} → ${r[0]?.contractOutcome ?? '(none)'}`);
  }

  console.log('Contract ingestion complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
