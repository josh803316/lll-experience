/**
 * Contract ingestion v3: Spotrac scrape.
 *
 * The nflverse contracts feed caps at year_signed=2022, missing every
 * 2023+ extension (Bosa, Aiyuk, McKivitz, etc). Spotrac's per-team
 * contract pages list every player currently rostered including their
 * most recent contract — exactly what we need.
 *
 * Run: bun run scripts/ingest-contracts-spotrac.ts
 *
 * Approach:
 *   1. Fetch /nfl/{team-slug}/contracts/ for all 32 teams
 *   2. Parse each row: name, position, start_year, end_year, value, APY,
 *      guarantees
 *   3. Compute APY-as-cap-% using the NFL cap for the start year
 *   4. For each pick in our DB, pick the most recent contract that's at
 *      least 3 years post-draft (= 2nd contract) and classify the outcome
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, playerContracts} from '../src/db/schema.js';
import {eq, sql} from 'drizzle-orm';
import {LLLRatingEngine, canonicalTeam} from '../src/services/lll-rating-engine.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// Spotrac team slug → our canonical abbreviation.
const TEAM_SLUG_TO_ABBR: Record<string, string> = {
  'arizona-cardinals': 'ARI',
  'atlanta-falcons': 'ATL',
  'baltimore-ravens': 'BAL',
  'buffalo-bills': 'BUF',
  'carolina-panthers': 'CAR',
  'chicago-bears': 'CHI',
  'cincinnati-bengals': 'CIN',
  'cleveland-browns': 'CLE',
  'dallas-cowboys': 'DAL',
  'denver-broncos': 'DEN',
  'detroit-lions': 'DET',
  'green-bay-packers': 'GB',
  'houston-texans': 'HOU',
  'indianapolis-colts': 'IND',
  'jacksonville-jaguars': 'JAX',
  'kansas-city-chiefs': 'KC',
  'las-vegas-raiders': 'LV',
  'los-angeles-chargers': 'LAC',
  'los-angeles-rams': 'LAR',
  'miami-dolphins': 'MIA',
  'minnesota-vikings': 'MIN',
  'new-england-patriots': 'NE',
  'new-orleans-saints': 'NO',
  'new-york-giants': 'NYG',
  'new-york-jets': 'NYJ',
  'philadelphia-eagles': 'PHI',
  'pittsburgh-steelers': 'PIT',
  'san-francisco-49ers': 'SF',
  'seattle-seahawks': 'SEA',
  'tampa-bay-buccaneers': 'TB',
  'tennessee-titans': 'TEN',
  'washington-commanders': 'WAS',
};

// NFL salary cap by year (in millions). Used to derive apy_cap_pct.
const NFL_CAP_BY_YEAR: Record<number, number> = {
  2015: 143.28,
  2016: 155.27,
  2017: 167.0,
  2018: 177.2,
  2019: 188.2,
  2020: 198.2,
  2021: 182.5, // COVID dip
  2022: 208.2,
  2023: 224.8,
  2024: 255.4,
  2025: 279.2,
  2026: 305.5, // projected
};

interface SpotracContract {
  player: string;
  position: string;
  signingTeamAbbr: string;
  startYear: number;
  endYear: number;
  years: number;
  value: number; // total dollars
  apy: number; // average dollars per year
  initialGuarantee: number;
  practicalGuarantee: number;
}

function parseDollars(s: string): number {
  const m = s.match(/\$?([\d,]+)/);
  if (!m) {
    return 0;
  }
  return parseInt(m[1].replace(/,/g, ''), 10);
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Parse the contracts table from a Spotrac team page. We use a non-greedy
 * row regex and a per-cell text extractor; structure is consistent enough
 * across teams that this is more reliable than a full HTML parser for this
 * use case.
 */
function parseTeamPage(html: string, teamAbbr: string): SpotracContract[] {
  // Limit to <tbody>..</tbody>
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!bodyMatch) {
    return [];
  }
  const body = bodyMatch[1];

  const rows = body.split(/<tr[^>]*>/).slice(1);
  const out: SpotracContract[] = [];
  for (const row of rows) {
    const closing = row.indexOf('</tr>');
    const inside = closing >= 0 ? row.slice(0, closing) : row;
    // Pull all <td>…</td> cells.
    const cells: string[] = [];
    let m;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    while ((m = cellRe.exec(inside)) !== null) {
      const text = m[1]
        .replace(/<[^>]+>/g, ' ') // strip nested tags
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(decodeHtml(text));
    }
    if (cells.length < 10) {
      continue;
    }

    // Cell layout (per-team page):
    //  0 player (last + first)
    //  1 position
    //  2 currently-with year/team
    //  3 contract type (Extension / Rookie / FA / Veteran etc)
    //  4 age at signing
    //  5 start year
    //  6 end year
    //  7 years
    //  8 value
    //  9 average (APY)
    // 10 initial guarantee
    // 11 practical guarantee
    const player = cells[0]
      .replace(/^[A-Za-z'\-.]+\s+/, '') // strip the duplicate last-name prefix
      .trim();
    const position = cells[1];
    const startYear = parseInt(cells[5], 10);
    const endYear = parseInt(cells[6], 10);
    const years = parseInt(cells[7], 10);
    const value = parseDollars(cells[8]);
    const apy = parseDollars(cells[9]);
    const initialGuarantee = parseDollars(cells[10] ?? '');
    const practicalGuarantee = parseDollars(cells[11] ?? '');
    if (!player || !Number.isFinite(startYear)) {
      continue;
    }

    out.push({
      player,
      position,
      signingTeamAbbr: teamAbbr,
      startYear,
      endYear,
      years,
      value,
      apy,
      initialGuarantee,
      practicalGuarantee,
    });
  }
  return out;
}

async function fetchTeam(slug: string): Promise<string> {
  const url = `https://www.spotrac.com/nfl/${slug}/contracts/`;
  const res = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (compatible; LLL-Analyzer/1.0)'}});
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function run() {
  console.log('--- Contract ingestion v3 (Spotrac) ---');
  const allContracts: SpotracContract[] = [];

  for (const [slug, abbr] of Object.entries(TEAM_SLUG_TO_ABBR)) {
    try {
      const html = await fetchTeam(slug);
      const rows = parseTeamPage(html, abbr);
      console.log(`  ${abbr.padEnd(4)} ${slug.padEnd(28)} → ${rows.length} contracts`);
      allContracts.push(...rows);
      // Be polite — small delay between requests.
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.warn(`  ${abbr} ${slug} skipped: ${(e as Error).message}`);
    }
  }
  console.log(`Total contracts scraped: ${allContracts.length}`);

  // Index by normalized player name.
  const byName = new Map<string, SpotracContract[]>();
  for (const c of allContracts) {
    const key = LLLRatingEngine.normalizeName(c.player);
    const list = byName.get(key) ?? [];
    list.push(c);
    byName.set(key, list);
  }
  console.log(`Distinct players: ${byName.size}`);

  // For each pick: find the most relevant 2nd contract, classify outcome.
  const allDrafted = await db.select().from(officialDraftResults);
  const counts: Record<string, number> = {};
  let updated = 0;
  let cleared = 0;
  let unmatched = 0;

  for (const pick of allDrafted) {
    if (!pick.playerName) {
      continue;
    }
    const key = LLLRatingEngine.normalizeName(pick.playerName);
    const candidates = byName.get(key);
    if (!candidates) {
      unmatched++;
      continue;
    }
    // Sort by startYear desc — most recent first.
    candidates.sort((a, b) => b.startYear - a.startYear);
    // 2nd contract = first contract with startYear > pick.year + 2 (rookie
    // deal is 4 yrs; we accept anything ≥ 3 yrs post-draft as a 2nd contract).
    const second = candidates.find((c) => c.startYear > pick.year + 2);
    if (!second) {
      // Player on file but only their rookie deal; clear any stale flag.
      if (pick.contractOutcome) {
        await db.update(officialDraftResults).set({contractOutcome: null}).where(eq(officialDraftResults.id, pick.id));
        cleared++;
      }
      continue;
    }

    const cap = NFL_CAP_BY_YEAR[second.startYear] ?? 250;
    const apyCapPct = second.apy > 0 ? second.apy / 1_000_000 / cap : 0;

    const draftTeamAbbr = canonicalTeam(pick.teamName)?.abbr ?? null;
    // sameTeam: contract was signed with the same franchise that drafted them.
    // We rely on the team-page slug → abbr mapping; this is fine for retentions.
    // Players who got traded then signed with the new team would NOT count as sameTeam.
    const sameTeam = !!draftTeamAbbr && draftTeamAbbr === second.signingTeamAbbr;

    let outcome: string;
    if (apyCapPct >= 0.1) {
      outcome = sameTeam ? 'TOP_OF_MARKET' : 'OTHER_TEAM_PAID';
    } else if (apyCapPct >= 0.05) {
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else if (apyCapPct >= 0.02) {
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else {
      outcome = 'WALKED_FOR_CHEAP';
    }

    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (pick.contractOutcome !== outcome) {
      await db.update(officialDraftResults).set({contractOutcome: outcome}).where(eq(officialDraftResults.id, pick.id));
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} rows, cleared ${cleared} stale flags, ${unmatched} picks unmatched on Spotrac.`);
  console.log('Outcome distribution:', counts);

  // Additive: write per-contract dollar rows to player_contracts. This
  // captures 2023+ extensions that nflverse misses. Replace spotrac-sourced
  // rows so re-runs converge cleanly.
  console.log('\nWriting player_contracts rows from Spotrac…');
  await db.delete(playerContracts).where(eq(playerContracts.source, 'spotrac'));

  const draftYearByName = new Map<string, number>();
  for (const p of allDrafted) {
    if (p.playerName) {
      draftYearByName.set(LLLRatingEngine.normalizeName(p.playerName), p.year);
    }
  }

  const toWrite: (typeof playerContracts.$inferInsert)[] = [];
  for (const [key, list] of byName) {
    const draftedYear = draftYearByName.get(key);
    list.sort((a, b) => a.startYear - b.startYear);
    const second = draftedYear !== undefined ? list.find((c) => c.startYear > draftedYear + 2) : undefined;
    for (const c of list) {
      const cap = NFL_CAP_BY_YEAR[c.startYear] ?? 250;
      const apyCapPct = c.apy > 0 ? c.apy / 1_000_000 / cap : 0;
      // Spotrac listings include rookie/extension/FA all on one page; skip
      // contracts with zero value (free agent placeholders).
      if (c.value <= 0 || c.apy <= 0) {
        continue;
      }
      toWrite.push({
        playerName: c.player,
        teamAbbr: c.signingTeamAbbr,
        position: c.position || null,
        yearSigned: c.startYear,
        yearsLength: c.years || null,
        valueTotal: c.value,
        apy: c.apy,
        guaranteed: c.practicalGuarantee || c.initialGuarantee || null,
        apyCapPct,
        isSecondContract: second === c,
        draftYear: null,
        draftOverall: null,
        source: 'spotrac',
      });
    }
  }

  let writtenContracts = 0;
  const CHUNK = 500;
  for (let s = 0; s < toWrite.length; s += CHUNK) {
    const slice = toWrite.slice(s, s + CHUNK);
    await db.insert(playerContracts).values(slice).onConflictDoNothing();
    writtenContracts += slice.length;
  }
  console.log(`Wrote ${writtenContracts} contract rows (source='spotrac').`);

  const summary = await db.execute(sql`
    SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_second_contract)::int AS second_n
    FROM player_contracts WHERE source='spotrac'
  `);
  console.log(`Final spotrac rows in player_contracts:`, summary[0]);

  // Sanity-check Jeff's flagged players.
  const checks = [
    'Nick Bosa',
    'Brandon Aiyuk',
    'Deebo Samuel',
    'Fred Warner',
    'Aaron Banks',
    'Spencer Burford',
    'Colton McKivitz',
    'Brock Purdy',
  ];
  for (const name of checks) {
    const r = await db.select().from(officialDraftResults).where(eq(officialDraftResults.playerName, name)).limit(1);
    console.log(`  ${name.padEnd(20)} → ${r[0]?.contractOutcome ?? '(none)'}`);
  }

  console.log('Spotrac contract ingestion complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
