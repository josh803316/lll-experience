/**
 * Verify that small-sample players like Cameron Latu no longer grade as
 * Elite Hits under the contract_aware lens. Spot-checks the SF 2023 class
 * that was reported as buggy.
 */
import {TeamScoutService} from '../src/services/team-scout.js';
import {MarketTierService} from '../src/services/market-tier.js';
import {LLLRatingEngine} from '../src/services/lll-rating-engine.js';

const all = await TeamScoutService.getAllScoredPicks({mode: 'career', statModel: 'contract_aware'});
const sf2023 = all.filter((p) => p.team.includes('49ers') && p.year === 2023);

console.log('=== SF 2023 class under contract_aware ===');
for (const p of sf2023) {
  console.log(
    `R${p.round} #${p.pickNumber} ${p.name.padEnd(22)} pos=${p.position ?? '?'}  rating=${p.rating}  expected=${p.expected}  delta=${p.delta}  → ${p.outcome}`,
  );
}

// Also: lookup a few notorious busts and stars
const map = await MarketTierService.getTalentScoreMap();
const tests = ['Cameron Latu', 'Brock Purdy', 'Christian McCaffrey', 'Nick Bosa', 'Trey Lance', 'Patrick Mahomes'];
console.log('\n=== Spot-check talent scores ===');
for (const name of tests) {
  const t = map.get(LLLRatingEngine.normalizeName(name));
  console.log(
    `${name.padEnd(22)} ${t ? JSON.stringify(t) : '(no entry — small sample, no qualifying contract → omitted)'}`,
  );
}

// Top 10 team grades under the new lens
console.log('\n=== Top 10 + bottom 5 team grades ===');
const teams = await TeamScoutService.getTeamSuccessLeaderboard({mode: 'career', statModel: 'contract_aware'});
for (let i = 0; i < Math.min(10, teams.length); i++) {
  const r = teams[i];
  console.log(
    `${String(i + 1).padStart(2)} ${r.team.padEnd(22)} ${r.grade.padEnd(3)} avgΔ=${r.avgDelta.toFixed(2)} hits=${r.hits} busts=${r.busts} picks=${r.totalPicks}`,
  );
}
console.log('---');
for (let i = Math.max(0, teams.length - 5); i < teams.length; i++) {
  const r = teams[i];
  console.log(
    `${String(i + 1).padStart(2)} ${r.team.padEnd(22)} ${r.grade.padEnd(3)} avgΔ=${r.avgDelta.toFixed(2)} hits=${r.hits} busts=${r.busts} picks=${r.totalPicks}`,
  );
}

process.exit(0);
