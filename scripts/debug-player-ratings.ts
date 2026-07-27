import {MarketTierService} from '../src/services/market-tier.js';
import {PlayerPerformanceRegistry, LLLRatingEngine} from '../src/services/lll-rating-engine.js';

const names = Bun.argv.slice(2);
if (names.length === 0) {
  console.error(
    'Pass one or more quoted player names, e.g. bun run scripts/debug-player-ratings.ts "Noah Gray" "Leo Chenal"',
  );
  process.exit(1);
}

const [talentMap, careerMap] = await Promise.all([
  MarketTierService.getTalentScoreMap(),
  PlayerPerformanceRegistry.getCareerRatingMap(),
]);

for (const name of names) {
  const key = LLLRatingEngine.normalizeName(name);
  const talent = talentMap.get(key);
  const career = careerMap.get(key);
  console.log(`\n=== ${name} ===`);
  if (!talent && career === undefined) {
    console.log('  No rating data found');
    continue;
  }
  console.log(
    `  Talent score: ${talent?.talentScore} (pffTier: ${talent?.pffTier}, contractTier: ${talent?.contractTier}, qualifies: ${talent?.qualifiesNonRookie})`,
  );
  console.log(`  PFF grade: ${talent?.pffGrade}`);
  console.log(`  Contract percentile: ${talent?.contractPercentile}`);
  console.log(`  LLL Career rating: ${career}`);
  console.log(`  Is elite (talent >= 9.0): ${talent ? talent.talentScore >= 9.0 : false}`);
  console.log(`  Is elite (career >= 9.0): ${career !== undefined ? career >= 9.0 : false}`);
}

process.exit(0);
