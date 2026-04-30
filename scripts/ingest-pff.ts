import {chromium} from 'playwright';
import {join} from 'path';
import {existsSync, mkdirSync} from 'fs';
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {pffPlayerStats} from '../src/db/schema.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL env var is required');
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

const CATEGORIES = [
  {name: 'passing', urlPart: 'passing', positions: ['QB']},
  {name: 'rushing', urlPart: 'rushing', positions: ['RB', 'FB']},
  {name: 'receiving', urlPart: 'receiving', positions: ['WR', 'TE']},
  {name: 'defense', urlPart: 'defense', positions: ['ED', 'DI', 'LB', 'CB', 'S']},
  {name: 'blocking', urlPart: 'blocking', positions: ['T', 'G', 'C']},
];

const SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

async function ingestCsv(csvPath: string, category: string, season: number) {
  // Simple CSV parser for PFF format
  const content = await Bun.file(csvPath).text();
  const lines = content.split('\n');
  if (lines.length < 2) {
    return;
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
    if (row.length < headers.length) {
      continue;
    }

    const stats: Record<string, string> = {};
    headers.forEach((h, idx) => {
      stats[h] = row[idx];
    });

    const playerName = stats.player || stats.name;
    if (!playerName) {
      continue;
    }

    const pffId = stats.player_id ? parseInt(stats.player_id, 10) : null;
    const position = stats.position;
    const teamAbbr = stats.team || stats.team_name;
    const gradeValue = stats.grades_offense
      ? parseFloat(stats.grades_offense)
      : stats.grades_overall
        ? parseFloat(stats.grades_overall)
        : null;

    await db
      .insert(pffPlayerStats)
      .values({
        playerName,
        pffId,
        season,
        position,
        teamAbbr,
        category,
        grade: gradeValue,
        stats,
      })
      .onConflictDoNothing();
  }
}

async function run() {
  const userDataDir = join(process.cwd(), '.pff_user_data');
  const downloadsDir = join(process.cwd(), 'pff_downloads');
  if (!existsSync(downloadsDir)) {
    mkdirSync(downloadsDir);
  }

  if (!existsSync(userDataDir)) {
    console.error('Session data not found. Please run scripts/setup-pff-session.ts first.');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  for (const season of SEASONS) {
    for (const cat of CATEGORIES) {
      const url = `https://premium.pff.com/nfl/positions/${season}/REG/${cat.urlPart}`;
      console.log(`Processing ${season} ${cat.name}...`);

      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        attempt++;
        try {
          await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
          await page.waitForLoadState('networkidle', {timeout: 60000}).catch(() => {});

          const exportButton = page.locator('button:has-text("Export"), button:has-text("CSV")').first();
          await exportButton.waitFor({state: 'visible', timeout: 30000});
          const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);

          const path = join(downloadsDir, `${season}_${cat.name}.csv`);
          await download.saveAs(path);
          console.log(`Downloaded ${path}`);

          await ingestCsv(path, cat.name, season);
          console.log(`Ingested ${season} ${cat.name}`);
          break;
        } catch (e) {
          console.error(
            `Error processing ${url} (attempt ${attempt}/${maxAttempts}):`,
            e instanceof Error ? e.message : e,
          );
          if (attempt >= maxAttempts) {
            await page.screenshot({path: `error_${season}_${cat.name}.png`}).catch(() => {});
          } else {
            await page.waitForTimeout(5000);
          }
        }
      }

      // Rate limiting
      await page.waitForTimeout(2000);
    }
  }

  await context.close();
  await client.end();
}

run().catch(console.error);
