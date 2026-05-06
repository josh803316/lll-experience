/**
 * Sanity-check the contract signal ingest by reproducing Tim's "Team Sheet"
 * tab — average of Best Contract Once across each team's drafted players —
 * directly from our DB. Then exercise the contract_aware lens end-to-end.
 *
 * Usage:
 *   bun run scripts/validate-contract-signal.ts
 */
import * as XLSX from 'xlsx';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {sql} from 'drizzle-orm';
import {playerContractSignal, officialDraftResults} from '../src/db/schema.js';
import {LLLRatingEngine, canonicalTeam} from '../src/services/lll-rating-engine.js';
import {TeamScoutService} from '../src/services/team-scout.js';

const TIM_SHEET = '/Users/joshnisenson/Downloads/player_contracts_2018_2026-Fewer position categories.xlsx';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL is required');
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// 1. Read Tim's Team Sheet — expected averages per drafted-by team.
// Tim's keys (e.g. KAN, LVR, NWE) get canonicalized via canonicalTeam so OAK/STL/SDG
// fold into LVR/LAR/LAC and KAN/NWE/GNB/etc. resolve to the display abbr we use everywhere.
const wb = XLSX.readFile(TIM_SHEET);
const ws = wb.Sheets['Team Sheet'];
if (!ws) {
  throw new Error('Team Sheet tab not found');
}
const teamRows: any[][] = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});
const expected = new Map<string, number>();
for (let i = 1; i < teamRows.length; i++) {
  const r = teamRows[i];
  if (!r) {
    continue;
  }
  const teamRaw = r[0];
  const avg = Number(r[1]);
  if (typeof teamRaw !== 'string' || !Number.isFinite(avg)) {
    continue;
  }
  const canon = canonicalTeam(teamRaw);
  if (!canon) {
    continue;
  }
  expected.set(canon.abbr, avg);
}
console.log(`Loaded ${expected.size} expected team averages from Team Sheet tab`);

// 2. Reproduce from our DB: join contract_signal to official_draft_results by normalized name
const signals = await db
  .select({
    playerName: playerContractSignal.playerName,
    pct: playerContractSignal.bestContractPercentile,
  })
  .from(playerContractSignal);
const signalByKey = new Map<string, number>();
for (const s of signals) {
  signalByKey.set(LLLRatingEngine.normalizeName(s.playerName), s.pct);
}

const picks = await db
  .select({
    playerName: officialDraftResults.playerName,
    teamName: officialDraftResults.teamName,
  })
  .from(officialDraftResults);

interface Agg {
  sum: number;
  count: number;
}
const ours = new Map<string, Agg>();
for (const p of picks) {
  if (!p.playerName || !p.teamName) {
    continue;
  }
  const pct = signalByKey.get(LLLRatingEngine.normalizeName(p.playerName));
  if (pct === undefined) {
    continue;
  }
  const canon = canonicalTeam(p.teamName);
  if (!canon) {
    continue;
  }
  const agg = ours.get(canon.abbr) ?? {sum: 0, count: 0};
  agg.sum += pct;
  agg.count += 1;
  ours.set(canon.abbr, agg);
}

// 3. Compare
console.log('\nTeam Sheet vs our reconstruction (sorted by Tim avg asc):');
console.log('TEAM   | Tim avg | Our avg | Δ      | n');
console.log('-------+---------+---------+--------+----');
const sortedTeams = [...expected.entries()].sort((a, b) => a[1] - b[1]);
let totalAbsDiff = 0;
let comparedCount = 0;
for (const [team, expectedAvg] of sortedTeams) {
  const our = ours.get(team);
  if (!our || our.count === 0) {
    console.log(`${team.padEnd(6)} | ${(expectedAvg * 100).toFixed(2).padStart(6)}% | (no data)`);
    continue;
  }
  const ourAvg = our.sum / our.count;
  const diff = ourAvg - expectedAvg;
  totalAbsDiff += Math.abs(diff);
  comparedCount++;
  console.log(
    `${team.padEnd(6)} | ${(expectedAvg * 100).toFixed(2).padStart(6)}% | ${(ourAvg * 100).toFixed(2).padStart(6)}% | ${(diff * 100).toFixed(2).padStart(5)}pp | ${String(our.count).padStart(2)}`,
  );
}
const meanAbsDiff = comparedCount ? totalAbsDiff / comparedCount : 0;
console.log(`\nMean absolute team-avg difference: ${(meanAbsDiff * 100).toFixed(3)}pp across ${comparedCount} teams`);

// 4. Exercise the lens end-to-end
console.log('\n=== contract_aware lens — top 10 team grades ===');
const lensRows = await TeamScoutService.getTeamSuccessLeaderboard({
  mode: 'career',
  statModel: 'contract_aware',
});
console.log('rank | team               | grade | avgΔ  | hits/busts/picks');
for (let i = 0; i < Math.min(10, lensRows.length); i++) {
  const r = lensRows[i];
  console.log(
    `${String(i + 1).padStart(2)}   | ${r.team.padEnd(18)} | ${r.grade.padEnd(5)} | ${r.avgDelta.toFixed(2).padStart(5)} | ${r.hits}/${r.busts}/${r.totalPicks}`,
  );
}
console.log('\n=== contract_aware lens — bottom 5 team grades ===');
for (let i = Math.max(0, lensRows.length - 5); i < lensRows.length; i++) {
  const r = lensRows[i];
  console.log(
    `${String(i + 1).padStart(2)}   | ${r.team.padEnd(18)} | ${r.grade.padEnd(5)} | ${r.avgDelta.toFixed(2).padStart(5)} | ${r.hits}/${r.busts}/${r.totalPicks}`,
  );
}

// 5. Compare baseline vs contract_aware ranking shuffles
const baselineRows = await TeamScoutService.getTeamSuccessLeaderboard({mode: 'career', statModel: 'baseline'});
const baselineRankByTeam = new Map(baselineRows.map((r, i) => [r.teamKey, i + 1]));
const lensRankByTeam = new Map(lensRows.map((r, i) => [r.teamKey, i + 1]));
console.log('\n=== Top movers between baseline and contract_aware (|Δrank| ≥ 5) ===');
const shuffles: {team: string; baseline: number; lens: number; diff: number}[] = [];
for (const [teamKey, lensRank] of lensRankByTeam) {
  const baseRank = baselineRankByTeam.get(teamKey);
  if (baseRank === undefined) {
    continue;
  }
  const diff = baseRank - lensRank; // positive = improved with contract_aware
  if (Math.abs(diff) >= 5) {
    const team = canonicalTeam(teamKey);
    shuffles.push({team: team ? `${team.city} ${team.name}` : teamKey, baseline: baseRank, lens: lensRank, diff});
  }
}
shuffles.sort((a, b) => b.diff - a.diff);
for (const s of shuffles) {
  const arrow = s.diff > 0 ? '↑' : '↓';
  console.log(`${arrow} ${s.team.padEnd(20)} baseline #${s.baseline} → market #${s.lens} (Δ ${s.diff})`);
}

await client.end();
void sql;
