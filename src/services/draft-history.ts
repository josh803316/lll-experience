import {getDB} from '../db/index.js';
import {officialDraftResults, apps} from '../db/schema.js';
import {eq, and} from 'drizzle-orm';

export interface HistoricalPick {
  year: number;
  pickNumber: number;
  teamName: string;
  playerName: string;
  position: string;
  college: string;
}

export class DraftHistoryService {
  /**
   * Ingests historical draft picks into the officialDraftResults table.
   * This forms the baseline for "what happened" so we can then apply 0-10 ratings.
   */
  static async ingestPicks(picks: HistoricalPick[]) {
    const db = getDB();

    // Ensure we associate these with the 'analyzer' app
    const app = (await db.select().from(apps).where(eq(apps.slug, 'analyzer')).limit(1))[0];
    if (!app) {throw new Error('Analyzer app not found. Run seed-analyzer.ts first.');}

    console.log(`Ingesting ${picks.length} historical picks for app ${app.id}...`);

    for (const pick of picks) {
      // Check if already exists
      const existing = await db
        .select()
        .from(officialDraftResults)
        .where(
          and(
            eq(officialDraftResults.appId, app.id),
            eq(officialDraftResults.year, pick.year),
            eq(officialDraftResults.pickNumber, pick.pickNumber),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(officialDraftResults).values({
          appId: app.id,
          year: pick.year,
          pickNumber: pick.pickNumber,
          playerName: pick.playerName,
          teamName: pick.teamName,
          // Note: schema officialDraftResults currently only has pickNum, player, team.
          // We might need to extend it or store position/college in playerPerformanceRatings.
        });
      }
    }
  }

  /**
   * Defines the canonical list of NFL Teams for the analyzer.
   */
  static getTeams() {
    return [
      'Arizona Cardinals',
      'Atlanta Falcons',
      'Baltimore Ravens',
      'Buffalo Bills',
      'Carolina Panthers',
      'Chicago Bears',
      'Cincinnati Bengals',
      'Cleveland Browns',
      'Dallas Cowboys',
      'Denver Broncos',
      'Detroit Lions',
      'Green Bay Packers',
      'Houston Texans',
      'Indianapolis Colts',
      'Jacksonville Jaguars',
      'Kansas City Chiefs',
      'Las Vegas Raiders',
      'Los Angeles Chargers',
      'Los Angeles Rams',
      'Miami Dolphins',
      'Minnesota Vikings',
      'New England Patriots',
      'New Orleans Saints',
      'New York Giants',
      'New York Jets',
      'Philadelphia Eagles',
      'Pittsburgh Steelers',
      'San Francisco 49ers',
      'Seattle Seahawks',
      'Tampa Bay Buccaneers',
      'Tennessee Titans',
      'Washington Commanders',
    ];
  }
}
