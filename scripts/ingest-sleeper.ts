import {UCSB_LEGACY_LEAGUE_ID} from '../src/config/fantasy-managers.js';
import {ingestSleeperLeague} from '../src/services/fantasy-ingest.js';

const leagueId = process.env.SLEEPER_LEAGUE_ID || UCSB_LEGACY_LEAGUE_ID;
const skipPlayers = process.argv.includes('--skip-players');
const skipProjections = process.argv.includes('--skip-projections');

console.log(`Ingesting Sleeper league chain from ${leagueId}`);
const result = await ingestSleeperLeague(leagueId, {
  refreshPlayers: !skipPlayers,
  refreshProjections: !skipProjections,
});
console.log(JSON.stringify(result, null, 2));
process.exit(0);
