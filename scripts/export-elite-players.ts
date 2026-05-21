/**
 * Export all players Claude deems "elite" using the contract_aware lens
 * (PFF 3-good-years grade blended 50/50 with best-contract market tier),
 * grouped by the NFL team that drafted them.
 *
 * Replicates exactly what the app shows on team profiles with:
 *   - Stat model: contract_aware (default weights: pff=0.5, contract=0.5)
 *   - Window: 6 years (2018–2023, the LATEST_FAIR_DRAFT_YEAR cutoff)
 *   - Elite threshold: talentScore >= 8.0
 *
 * Output: scripts/elite-players-by-team.csv
 */

import {join} from 'path';
import {writeFileSync} from 'fs';
import {getDB} from '../src/db/index.js';
import {officialDraftResults} from '../src/db/schema.js';
import {and, gte, lte} from 'drizzle-orm';
import {MarketTierService} from '../src/services/market-tier.js';
import {LLLRatingEngine, canonicalTeam} from '../src/services/lll-rating-engine.js';

const START_YEAR = 2014;
const END_YEAR = 2023;

async function main() {
  const db = getDB();

  const [talentMap, picks] = await Promise.all([
    MarketTierService.getTalentScoreMap(), // default 0.5/0.5 weights
    db
      .select()
      .from(officialDraftResults)
      .where(and(gte(officialDraftResults.year, START_YEAR), lte(officialDraftResults.year, END_YEAR))),
  ]);

  interface EliteRow {
    team: string;
    teamFull: string;
    player: string;
    position: string;
    draftYear: number;
    round: number;
    pickNumber: number;
    talentScore: number;
    pffGrade: number | null;
    contractPercentile: number | null;
  }

  const eliteRows: EliteRow[] = [];

  for (const p of picks) {
    if (!p.round || !p.playerName || !p.teamName) {
      continue;
    }
    const team = canonicalTeam(p.teamName);
    if (!team) {
      continue;
    }

    const key = LLLRatingEngine.normalizeName(p.playerName);
    const score = talentMap.get(key);
    if (!score || score.talentScore < 9.0) {
      continue;
    }

    eliteRows.push({
      team: team.abbr,
      teamFull: `${team.city} ${team.name}`,
      player: p.playerName,
      position: p.position ?? '',
      draftYear: p.year,
      round: p.round,
      pickNumber: p.pickNumber ?? 0,
      talentScore: score.talentScore,
      pffGrade: score.pffGrade,
      contractPercentile: score.contractPercentile,
    });
  }

  eliteRows.sort((a, b) => a.team.localeCompare(b.team) || b.talentScore - a.talentScore);

  const header =
    'Team Abbr,Team,Player,Position,Draft Year,Round,Pick #,Talent Score,PFF 3-Good-Years,Contract Percentile (lower=better)';
  const lines = eliteRows.map((r) =>
    [
      `"${r.team}"`,
      `"${r.teamFull}"`,
      `"${r.player}"`,
      `"${r.position}"`,
      r.draftYear,
      r.round,
      r.pickNumber,
      r.talentScore.toFixed(2),
      r.pffGrade !== null ? r.pffGrade.toFixed(1) : '',
      r.contractPercentile !== null ? (r.contractPercentile * 100).toFixed(1) + '%' : '',
    ].join(','),
  );

  const csv = [header, ...lines].join('\n');
  const outPath = join(import.meta.dir, 'elite-players-by-team.csv');
  writeFileSync(outPath, csv);

  // Summary
  const byTeam = new Map<string, {full: string; count: number}>();
  for (const r of eliteRows) {
    const cur = byTeam.get(r.team) ?? {full: r.teamFull, count: 0};
    cur.count++;
    byTeam.set(r.team, cur);
  }
  const sorted = [...byTeam.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log(`\nElite players (contract_aware talent score ≥ 9.0) — draft years ${START_YEAR}–${END_YEAR}\n`);
  console.log(`Total: ${eliteRows.length} players across ${byTeam.size} teams\n`);
  console.log('Teams by elite player count:');
  sorted.forEach(([abbr, {full, count}]) => console.log(`  ${abbr} (${full}): ${count}`));
  console.log(`\nCSV written to: ${outPath}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
