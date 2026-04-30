/**
 * Awards ingestion. Scrapes Wikipedia for per-year All-Pro selections
 * and the major individual awards (MVP, OPOY, DPOY, OROY, DROY), stores
 * them as flags on the per-season rating's metadata, and applies rating
 * floors so a 2x All-Pro / DPOY-caliber player can never grade BUST.
 *
 * Floors (applied in services/lll-rating-engine.ts at season-rating time):
 *   Pro Bowl that season           → rating ≥ 5.5  (above MET)
 *   2nd-team All-Pro that season   → rating ≥ 6.5
 *   1st-team All-Pro that season   → rating ≥ 8.0
 *   MVP / DPOY / OPOY that season  → rating ≥ 9.0
 *   ROY (off or def) that season   → rating ≥ 7.5
 *
 * Run: bun run scripts/ingest-awards.ts
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {playerPerformanceRatings} from '../src/db/schema.js';
import {and, eq} from 'drizzle-orm';
import {LLLRatingEngine} from '../src/services/lll-rating-engine.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

const START_YEAR = 2015;
const END_YEAR = 2025; // 2025 finalized Feb 2026

// ── Wikipedia helpers ─────────────────────────────────────────────────────

async function fetchWiki(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {'User-Agent': 'Mozilla/5.0 (compatible; LLL-Analyzer/1.0)', Accept: 'text/html'},
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/** Pull "Player Name" from `<a ... title="Player Name">…</a>` tags, but only
 *  when the URL doesn't look like a season/team page. */
function extractPlayerLinks(snippet: string): string[] {
  const out: string[] = [];
  const re = /<a href="\/wiki\/([^"]+)" title="([^"]+)"/g;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    const slug = m[1];
    const title = m[2];
    // Skip team-season URLs ("2023_San_Francisco_49ers_season") and ambiguity pages.
    if (/_season$/.test(slug)) {
      continue;
    }
    if (/^[0-9]/.test(title)) {
      continue;
    } // dates, season pages
    if (/_team$/i.test(slug)) {
      continue;
    }
    if (/Award$/i.test(title)) {
      continue;
    }
    if (/All-Pro|Pro_Bowl|Most_Valuable/i.test(slug)) {
      continue;
    }
    if (/redirect|disambiguation/i.test(slug)) {
      continue;
    }
    if (slug.split('_').length < 2) {
      continue;
    } // typically "First_Last"
    out.push(title);
  }
  return out;
}

// ── Scrape: per-year Pro Bowl page ────────────────────────────────────────
//
//  Pro Bowl game played AT THE END of season N is named "{N+1}_Pro_Bowl"
//  through 2022, then renamed "{N+1}_Pro_Bowl_Games" from 2023 on. We
//  fetch the URL for the game year, then attribute selections back to the
//  preceding season (so 2024_Pro_Bowl_Games → 2023 NFL season honors).

type ProBowlSelection = {name: string; season: number};

async function scrapeProBowlSeason(season: number): Promise<ProBowlSelection[]> {
  const gameYear = season + 1;
  const urls = [
    `https://en.wikipedia.org/wiki/${gameYear}_Pro_Bowl_Games`,
    `https://en.wikipedia.org/wiki/${gameYear}_Pro_Bowl`,
  ];
  let html: string | null = null;
  for (const u of urls) {
    try {
      html = await fetchWiki(u);
      break;
    } catch (_) {
      // try next
    }
  }
  if (!html) {
    return [];
  }

  // Pro Bowl pages have rosters across one or two top-level sections:
  //   New format (2023+): single "Rosters" section with AFC/NFC subsections
  //   Older format:       separate "AFC_rosters" + "NFC_rosters" sections
  //
  // Concatenate the relevant slices and walk every wikitable inside.
  const fullHtml: string = html;
  const sliceFromAnchor = (anchor: string): string => {
    const start = fullHtml.indexOf(`id="${anchor}"`);
    if (start < 0) {
      return '';
    }
    const tail = fullHtml.slice(start);
    // Cut off at the next major H2 (Game stats, Box score, Aftermath, etc).
    const stops = [
      'id="Game_format"',
      'id="Game_summary"',
      'id="Summary"',
      'id="Box_score"',
      'id="Number_of_selections',
      'id="Results"',
      'id="Aftermath"',
      'id="Broadcasting"',
      'id="References"',
    ];
    const stopIdx = Math.min(
      ...stops.map((s) => {
        const i = tail.indexOf(s);
        return i < 0 ? Infinity : i;
      }),
    );
    return stopIdx === Infinity ? tail : tail.slice(0, stopIdx);
  };
  const slice = sliceFromAnchor('Rosters') + sliceFromAnchor('AFC_rosters') + sliceFromAnchor('NFC_rosters');
  if (!slice) {
    return [];
  }

  const tableRe = /<table[^>]*class="wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  const seen = new Set<string>();
  const out: ProBowlSelection[] = [];
  let tm;
  while ((tm = tableRe.exec(slice)) !== null) {
    const names = extractPlayerLinks(tm[1]);
    for (const n of names) {
      const key = LLLRatingEngine.normalizeName(n);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({name: n, season});
    }
  }
  return out;
}

// ── Scrape: per-year All-Pro page ─────────────────────────────────────────

type AllProSelection = {name: string; team: 1 | 2; year: number};

async function scrapeAllProYear(year: number): Promise<AllProSelection[]> {
  const url = `https://en.wikipedia.org/wiki/${year}_All-Pro_Team`;
  const html = await fetchWiki(url);
  // The page has multiple wikitables (Offense, Defense, Special teams, kick
  // returners, etc). Walk all of them.
  const tableRe = /<table[^>]*class="wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  const out: AllProSelection[] = [];
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const body = tm[1];
    const rows = body.split(/<tr[^>]*>/).slice(1);
    for (const row of rows) {
      const closing = row.indexOf('</tr>');
      const inside = closing >= 0 ? row.slice(0, closing) : row;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cm;
      while ((cm = cellRe.exec(inside)) !== null) {
        cells.push(cm[1]);
      }
      if (cells.length < 3) {
        continue;
      }
      for (const name of extractPlayerLinks(cells[1])) {
        out.push({name, team: 1, year});
      }
      for (const name of extractPlayerLinks(cells[2])) {
        out.push({name, team: 2, year});
      }
    }
  }
  return out;
}

// ── Scrape: major awards (MVP/OPOY/DPOY/OROY/DROY) ────────────────────────
//
//  These pages have a single "winners" table with year + recipient.

type AwardWin = {year: number; name: string; award: 'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY'};

async function scrapeAwardPage(url: string, award: AwardWin['award']): Promise<AwardWin[]> {
  const html = await fetchWiki(url);
  // Walk every wikitable; the first match is usually a Legend on these pages.
  const tableRe = /<table[^>]*class="wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  const out: AwardWin[] = [];
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const body = tm[1];
    const rows = body.split(/<tr[^>]*>/).slice(1);
    for (const row of rows) {
      const closing = row.indexOf('</tr>');
      const inside = closing >= 0 ? row.slice(0, closing) : row;
      // Year can appear inside a season-link `<a href="/wiki/2018_NFL_season"
      // title="2018 NFL season">2018</a>` or as a plain number — both shapes
      // are matched here.
      const yearMatch = inside.match(/title="(\d{4}) NFL season"/) ?? inside.match(/<t[hd][^>]*>[\s\S]{0,80}?(\d{4})/);
      if (!yearMatch) {
        continue;
      }
      const year = parseInt(yearMatch[1], 10);
      if (year < START_YEAR || year > END_YEAR) {
        continue;
      }
      const names = extractPlayerLinks(inside);
      if (names.length === 0) {
        continue;
      }
      out.push({year, name: names[0], award});
    }
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('--- Awards ingestion (Wikipedia) ---');

  // 1. All-Pro per year
  const allProSelections: AllProSelection[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    try {
      const sel = await scrapeAllProYear(y);
      console.log(`  ${y} All-Pro: ${sel.length} selections (${sel.filter((s) => s.team === 1).length} 1st-team)`);
      allProSelections.push(...sel);
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn(`  ${y}: ${(e as Error).message}`);
    }
  }

  // 1b. Pro Bowl per season
  const proBowlSelections: ProBowlSelection[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    try {
      const sel = await scrapeProBowlSeason(y);
      console.log(`  ${y} Pro Bowl: ${sel.length} selections`);
      proBowlSelections.push(...sel);
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn(`  ${y} Pro Bowl: ${(e as Error).message}`);
    }
  }

  // 2. Individual awards
  const awardUrls: Record<AwardWin['award'], string> = {
    MVP: 'https://en.wikipedia.org/wiki/Associated_Press_NFL_Most_Valuable_Player_Award',
    OPOY: 'https://en.wikipedia.org/wiki/Associated_Press_NFL_Offensive_Player_of_the_Year_Award',
    DPOY: 'https://en.wikipedia.org/wiki/Associated_Press_NFL_Defensive_Player_of_the_Year_Award',
    OROY: 'https://en.wikipedia.org/wiki/Associated_Press_NFL_Offensive_Rookie_of_the_Year_Award',
    DROY: 'https://en.wikipedia.org/wiki/Associated_Press_NFL_Defensive_Rookie_of_the_Year_Award',
  };
  const awardWins: AwardWin[] = [];
  for (const [award, url] of Object.entries(awardUrls) as [AwardWin['award'], string][]) {
    try {
      const wins = await scrapeAwardPage(url, award);
      console.log(`  ${award}: ${wins.length} winners (${START_YEAR}-${END_YEAR})`);
      awardWins.push(...wins);
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn(`  ${award}: ${(e as Error).message}`);
    }
  }

  // 3. Build per-(player,year) award flags.
  type AwardFlags = {
    proBowl?: boolean;
    allPro1?: boolean;
    allPro2?: boolean;
    mvp?: boolean;
    opoy?: boolean;
    dpoy?: boolean;
    oroy?: boolean;
    droy?: boolean;
  };
  const flagsByKey = new Map<string, AwardFlags>();
  const setFlag = (name: string, year: number, key: keyof AwardFlags) => {
    const k = `${LLLRatingEngine.normalizeName(name)}::${year}`;
    const cur = flagsByKey.get(k) ?? {};
    cur[key] = true;
    flagsByKey.set(k, cur);
  };
  for (const s of proBowlSelections) {
    setFlag(s.name, s.season, 'proBowl');
  }
  for (const s of allProSelections) {
    setFlag(s.name, s.year, s.team === 1 ? 'allPro1' : 'allPro2');
  }
  for (const w of awardWins) {
    const map: Record<typeof w.award, keyof AwardFlags> = {
      MVP: 'mvp',
      OPOY: 'opoy',
      DPOY: 'dpoy',
      OROY: 'oroy',
      DROY: 'droy',
    };
    setFlag(w.name, w.year, map[w.award]);
  }
  console.log(`\nTotal (player, year) entries with at least one award: ${flagsByKey.size}`);

  // 4. For each existing per-season rating row, attach award flags via metadata.
  const seasonRows = await db
    .select({
      id: playerPerformanceRatings.id,
      playerName: playerPerformanceRatings.playerName,
      evaluationYear: playerPerformanceRatings.evaluationYear,
      metadata: playerPerformanceRatings.metadata,
    })
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false));
  console.log(`Existing per-season rows: ${seasonRows.length}`);

  let updated = 0;
  for (const row of seasonRows) {
    const k = `${LLLRatingEngine.normalizeName(row.playerName)}::${row.evaluationYear}`;
    const flags = flagsByKey.get(k);
    if (!flags) {
      continue;
    }
    const existingMeta = (row.metadata as Record<string, unknown> | null) ?? {};
    const newMeta = {...existingMeta, awards: flags};
    await db.update(playerPerformanceRatings).set({metadata: newMeta}).where(eq(playerPerformanceRatings.id, row.id));
    updated++;
  }
  console.log(`Updated ${updated} per-season rows with award flags.`);

  // 5. Sanity: surface a few notable hits.
  const checks = [
    ['Nick Bosa', 2022], // DPOY
    ['Aaron Donald', 2017], // DPOY
    ['Patrick Mahomes', 2018], // MVP
    ['Lamar Jackson', 2019], // MVP
    ['Brandon Aiyuk', 2023], // 2nd-team All-Pro
    ['Justin Jefferson', 2022], // 1st-team All-Pro
  ] as const;
  console.log('\nSpot-check:');
  for (const [name, year] of checks) {
    const k = `${LLLRatingEngine.normalizeName(name)}::${year}`;
    const flags = flagsByKey.get(k);
    console.log(`  ${name.padEnd(20)} ${year}: ${flags ? JSON.stringify(flags) : '(no awards found)'}`);
  }

  console.log('\nAwards ingestion complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
