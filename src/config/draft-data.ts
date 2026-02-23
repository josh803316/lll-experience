import { ESPN_PLAYERS_2026_TOP50, NFL_PLAYERS_2026_TOP50, FOX_PLAYERS_2026_TOP50, PFF_PLAYERS_2026_TOP50 } from "./rankings.js";

/** 2026 first-round draft order (pick number → team). Source: ESPN & NFL Operations (includes traded picks). */
export const FIRST_ROUND_TEAMS_2026: Record<number, string> = {
  1: "Las Vegas Raiders",
  2: "New York Jets",
  3: "Arizona Cardinals",
  4: "Tennessee Titans",
  5: "New York Giants",
  6: "Cleveland Browns",
  7: "Washington Commanders",
  8: "New Orleans Saints",
  9: "Kansas City Chiefs",
  10: "Cincinnati Bengals",
  11: "Miami Dolphins",
  12: "Dallas Cowboys",
  13: "Los Angeles Rams",
  14: "Baltimore Ravens",
  15: "Tampa Bay Buccaneers",
  16: "New York Jets",
  17: "Detroit Lions",
  18: "Minnesota Vikings",
  19: "Carolina Panthers",
  20: "Dallas Cowboys",
  21: "Pittsburgh Steelers",
  22: "Los Angeles Chargers",
  23: "Philadelphia Eagles",
  24: "Cleveland Browns",
  25: "Chicago Bears",
  26: "Buffalo Bills",
  27: "San Francisco 49ers",
  28: "Houston Texans",
  29: "Los Angeles Rams",
  30: "Denver Broncos",
  31: "New England Patriots",
  32: "Seattle Seahawks",
};

/** 2026 team needs (pick number → concise needs). Remapped to match corrected draft order. */
export const TEAM_NEEDS_2026: Record<number, string> = {
  1: "QB, LG, LB, DT, C, RT, WR, EDGE",       // Las Vegas Raiders
  2: "QB, OG, DT, EDGE, CB",                    // New York Jets
  3: "QB, RT, RB, FS, LB, DT, RG",              // Arizona Cardinals
  4: "EDGE, WR, RG, CB",                        // Tennessee Titans
  5: "RT, RG, WR, CB, LB, DT",                 // New York Giants
  6: "QB, RT, RG, LG, C, Slot CB, WR, LB",     // Cleveland Browns
  7: "WR, EDGE, LB, Slot WR, LG",              // Washington Commanders
  8: "LG, DT, EDGE, WR, Slot CB, LB, RB",      // New Orleans Saints
  9: "CB, FS, RB, EDGE, X WR",                 // Kansas City Chiefs
  10: "DT, FS, RG, CB, LB, EDGE",              // Cincinnati Bengals
  11: "QB, EDGE, WR, CB, Slot CB, RG",          // Miami Dolphins
  12: "CB, WR, EDGE, RB, LB, FS",              // Dallas Cowboys
  13: "CB, FS, WR, RT, C",                      // Los Angeles Rams
  14: "DT, C, EDGE, FS, WR, TE, CB",           // Baltimore Ravens
  15: "EDGE, DT, TE, LB, X WR, CB",            // Tampa Bay Buccaneers
  16: "QB, OG, DT, EDGE, CB",                   // New York Jets (via Indianapolis Colts)
  17: "EDGE, DT, LB, Slot CB, LT, C/RG",       // Detroit Lions
  18: "QB, FS, CB, LB, Slot WR",               // Minnesota Vikings
  19: "C, LB, FS, EDGE, Slot CB, DT",          // Carolina Panthers
  20: "CB, WR, EDGE, RB, LB, FS",              // Dallas Cowboys (via Green Bay Packers)
  21: "QB, LG, CB, WR, DT",                    // Pittsburgh Steelers
  22: "EDGE, LG, C, RG, DT, FS",              // Los Angeles Chargers
  23: "RG, CB, TE, RT, LG, FS",               // Philadelphia Eagles
  24: "QB, RT, RG, LG, C, Slot CB, WR, LB",   // Cleveland Browns (via Jacksonville Jaguars)
  25: "CB, EDGE, DT, FS, SS, LB",             // Chicago Bears
  26: "EDGE, LG, C, WR, DT, Slot CB, LB",     // Buffalo Bills
  27: "WR, LG, DT, C, CB",                    // San Francisco 49ers
  28: "RG, DT, RB, SS, RT, C",               // Houston Texans
  29: "CB, FS, WR, RT, C",                    // Los Angeles Rams (2nd pick)
  30: "DT, LB, TE, RB, Slot WR",             // Denver Broncos
  31: "EDGE, FS, RT, C, TE, NT",             // New England Patriots
  32: "CB, EDGE, RB, FS, RG",               // Seattle Seahawks
};

/** Consensus 2026 draftable players (rank, name, school, position). Top 200 from CBS Sports 2026 prospect rankings. */
export const CONSENSUS_PLAYERS_2026: Array<{ rank: number; playerName: string; school: string; position: string }> = [
  { rank: 1, playerName: "Fernando Mendoza", school: "Indiana", position: "QB" },
  { rank: 2, playerName: "Rueben Bain Jr.", school: "Miami (FL)", position: "EDGE" },
  { rank: 3, playerName: "Arvell Reese", school: "Ohio State", position: "LB" },
  { rank: 4, playerName: "Kadyn Proctor", school: "Alabama", position: "OT" },
  { rank: 5, playerName: "Spencer Fano", school: "Utah", position: "OT" },
  { rank: 6, playerName: "Jordyn Tyson", school: "Arizona State", position: "WR" },
  { rank: 7, playerName: "Caleb Downs", school: "Ohio State", position: "S" },
  { rank: 8, playerName: "Carnell Tate", school: "Ohio State", position: "WR" },
  { rank: 9, playerName: "Jermod McCoy", school: "Tennessee", position: "CB" },
  { rank: 10, playerName: "Sonny Styles", school: "Ohio State", position: "LB" },
  { rank: 11, playerName: "Avieon Terrell", school: "Clemson", position: "CB" },
  { rank: 12, playerName: "Mansoor Delane", school: "LSU", position: "CB" },
  { rank: 13, playerName: "Peter Woods", school: "Clemson", position: "DT" },
  { rank: 14, playerName: "Caleb Lomu", school: "Utah", position: "OT" },
  { rank: 15, playerName: "Olaivavega Ioane", school: "Penn State", position: "IOL" },
  { rank: 16, playerName: "Jeremiyah Love", school: "Notre Dame", position: "RB" },
  { rank: 17, playerName: "Omar Cooper Jr.", school: "Indiana", position: "WR" },
  { rank: 18, playerName: "Makai Lemon", school: "USC", position: "WR" },
  { rank: 19, playerName: "David Bailey", school: "Texas Tech", position: "EDGE" },
  { rank: 20, playerName: "Francis Mauigoa", school: "Miami (FL)", position: "OT" },
  { rank: 21, playerName: "Lee Hunter", school: "Texas Tech", position: "DT" },
  { rank: 22, playerName: "Blake Miller", school: "Clemson", position: "OT" },
  { rank: 23, playerName: "Max Iheanachor", school: "Arizona State", position: "OT" },
  { rank: 24, playerName: "Cashius Howell", school: "Texas A&M", position: "EDGE" },
  { rank: 25, playerName: "Kayden McDonald", school: "Ohio State", position: "DT" },
  { rank: 26, playerName: "Akheem Mesidor", school: "Miami (FL)", position: "DT" },
  { rank: 27, playerName: "Keldric Faulk", school: "Auburn", position: "EDGE" },
  { rank: 28, playerName: "Emmanuel McNeil-Warren", school: "Toledo", position: "S" },
  { rank: 29, playerName: "Kenyon Sadiq", school: "Oregon", position: "TE" },
  { rank: 30, playerName: "Anthony Hill Jr.", school: "Texas", position: "LB" },
  { rank: 31, playerName: "KC Concepcion", school: "Texas A&M", position: "WR" },
  { rank: 32, playerName: "Jake Golday", school: "Cincinnati", position: "LB" },
  { rank: 33, playerName: "Ty Simpson", school: "Alabama", position: "QB" },
  { rank: 34, playerName: "Denzel Boston", school: "Washington", position: "WR" },
  { rank: 35, playerName: "Dillon Thieneman", school: "Oregon", position: "S" },
  { rank: 36, playerName: "Josiah Trotter", school: "Missouri", position: "LB" },
  { rank: 37, playerName: "Colton Hood", school: "Tennessee", position: "CB" },
  { rank: 38, playerName: "C.J. Allen", school: "Georgia", position: "LB" },
  { rank: 39, playerName: "Christen Miller", school: "Georgia", position: "DT" },
  { rank: 40, playerName: "Keith Abney II", school: "Arizona State", position: "CB" },
  { rank: 41, playerName: "R Mason Thomas", school: "Oklahoma", position: "DT" },
  { rank: 42, playerName: "Connor Lew", school: "Auburn", position: "IOL" },
  { rank: 43, playerName: "Chris Johnson", school: "San Diego State", position: "CB" },
  { rank: 44, playerName: "Germie Bernard", school: "Alabama", position: "WR" },
  { rank: 45, playerName: "Trey Zuhn III", school: "Texas A&M", position: "IOL" },
  { rank: 46, playerName: "Caleb Banks", school: "Florida", position: "DT" },
  { rank: 47, playerName: "D'Angelo Ponds", school: "Indiana", position: "CB" },
  { rank: 48, playerName: "Brenen Thompson", school: "Mississippi State", position: "WR" },
  { rank: 49, playerName: "T.J. Parker", school: "Clemson", position: "EDGE" },
  { rank: 50, playerName: "Chase Bisontis", school: "Texas A&M", position: "IOL" },
  { rank: 51, playerName: "Emmanuel Pregnon", school: "Oregon", position: "IOL" },
  { rank: 52, playerName: "Monroe Freeling", school: "Georgia", position: "OT" },
  { rank: 53, playerName: "Keionte Scott", school: "Miami (FL)", position: "S" },
  { rank: 54, playerName: "Anthony Lucas", school: "USC", position: "EDGE" },
  { rank: 55, playerName: "Kyle Louis", school: "Pittsburgh", position: "LB" },
  { rank: 56, playerName: "Genesis Smith", school: "Arizona", position: "S" },
  { rank: 57, playerName: "Jadarian Price", school: "Notre Dame", position: "RB" },
  { rank: 58, playerName: "Malachi Lawrence", school: "UCF", position: "LB" },
  { rank: 59, playerName: "Zachariah Branch", school: "Georgia", position: "WR" },
  { rank: 60, playerName: "Caleb Tiernan", school: "Northwestern", position: "OT" },
  { rank: 61, playerName: "Brandon Cisse", school: "South Carolina", position: "CB" },
  { rank: 62, playerName: "Chris Brazzell II", school: "Tennessee", position: "WR" },
  { rank: 63, playerName: "A.J. Haulcy", school: "LSU", position: "S" },
  { rank: 64, playerName: "Malachi Fields", school: "Notre Dame", position: "WR" },
  { rank: 65, playerName: "Jaishawn Barham", school: "Michigan", position: "LB" },
  { rank: 66, playerName: "Gabe Jacas", school: "Illinois", position: "EDGE" },
  { rank: 67, playerName: "Michael Trigg", school: "Baylor", position: "TE" },
  { rank: 68, playerName: "Eli Stowers", school: "Vanderbilt", position: "TE" },
  { rank: 69, playerName: "Eric McAlister", school: "TCU", position: "WR" },
  { rank: 70, playerName: "Kage Casey", school: "Boise State", position: "IOL" },
  { rank: 71, playerName: "Treydan Stukes", school: "Arizona", position: "CB" },
  { rank: 72, playerName: "Chris McClellan", school: "Missouri", position: "DT" },
  { rank: 73, playerName: "Joshua Josephs", school: "Tennessee", position: "EDGE" },
  { rank: 74, playerName: "Devin Moore", school: "Florida", position: "CB" },
  { rank: 75, playerName: "Carver Willis", school: "Washington", position: "IOL" },
  { rank: 76, playerName: "Zion Young", school: "Missouri", position: "EDGE" },
  { rank: 77, playerName: "Romello Height", school: "Texas Tech", position: "EDGE" },
  { rank: 78, playerName: "Gennings Dunker", school: "Iowa", position: "IOL" },
  { rank: 79, playerName: "Julian Neal", school: "Arkansas", position: "CB" },
  { rank: 80, playerName: "Rayshaun Benny", school: "Michigan", position: "DT" },
  { rank: 81, playerName: "Antonio Williams", school: "Clemson", position: "WR" },
  { rank: 82, playerName: "Elijah Sarratt", school: "Indiana", position: "WR" },
  { rank: 83, playerName: "Jacob Rodriguez", school: "Texas Tech", position: "LB" },
  { rank: 84, playerName: "Nate Boerkircher", school: "Texas A&M", position: "TE" },
  { rank: 85, playerName: "Billy Schrauth", school: "Notre Dame", position: "IOL" },
  { rank: 86, playerName: "Austin Barber", school: "Florida", position: "OT" },
  { rank: 87, playerName: "Domonique Orange", school: "Iowa State", position: "DT" },
  { rank: 88, playerName: "Max Klare", school: "Ohio State", position: "TE" },
  { rank: 89, playerName: "Keyron Crawford", school: "Auburn", position: "LB" },
  { rank: 90, playerName: "Alex Harkey", school: "Oregon", position: "IOL" },
  { rank: 91, playerName: "Dontay Corleone", school: "Cincinnati", position: "DT" },
  { rank: 92, playerName: "Ethan Burke", school: "Texas", position: "EDGE" },
  { rank: 93, playerName: "Cole Payton", school: "North Dakota State", position: "QB" },
  { rank: 94, playerName: "Nick Barrett", school: "South Carolina", position: "DT" },
  { rank: 95, playerName: "Zakee Wheatley", school: "Penn State", position: "S" },
  { rank: 96, playerName: "Kamari Ramsey", school: "USC", position: "S" },
  { rank: 97, playerName: "Parker Brailsford", school: "Alabama", position: "IOL" },
  { rank: 98, playerName: "Carter Smith", school: "Indiana", position: "IOL" },
  { rank: 99, playerName: "Derrick Moore", school: "Michigan", position: "LB" },
  { rank: 100, playerName: "Will Lee III", school: "Texas A&M", position: "CB" },
  { rank: 101, playerName: "Garrett Nussmeier", school: "LSU", position: "QB" },
  { rank: 102, playerName: "Keylan Rutledge", school: "Georgia Tech", position: "IOL" },
  { rank: 103, playerName: "Chris Bell", school: "Louisville", position: "WR" },
  { rank: 104, playerName: "Darrell Jackson Jr.", school: "Florida State", position: "DT" },
  { rank: 105, playerName: "Josh Cuevas", school: "Alabama", position: "TE" },
  { rank: 106, playerName: "Dani Dennis-Sutton", school: "Penn State", position: "EDGE" },
  { rank: 107, playerName: "Kevin Coleman Jr.", school: "Missouri", position: "WR" },
  { rank: 108, playerName: "Jack Endries", school: "Texas", position: "TE" },
  { rank: 109, playerName: "Fa'alili Fa'amoe", school: "Wake Forest", position: "IOL" },
  { rank: 110, playerName: "Keagen Trost", school: "Missouri", position: "IOL" },
  { rank: 111, playerName: "Malik Muhammad", school: "Texas", position: "CB" },
  { rank: 112, playerName: "LT Overton", school: "Alabama", position: "DT" },
  { rank: 113, playerName: "Nadame Tucker", school: "Western Michigan", position: "EDGE" },
  { rank: 114, playerName: "Kaleb Proctor", school: "SE Louisiana", position: "DT" },
  { rank: 115, playerName: "Lance Mason", school: "Wisconsin", position: "TE" },
  { rank: 116, playerName: "Jake Slaughter", school: "Florida", position: "IOL" },
  { rank: 117, playerName: "Clay Patterson", school: "Stanford", position: "DT" },
  { rank: 118, playerName: "Aamil Wagner", school: "Notre Dame", position: "IOL" },
  { rank: 119, playerName: "Eric Rivers", school: "Georgia Tech", position: "WR" },
  { rank: 120, playerName: "Brian Parker II", school: "Duke", position: "IOL" },
  { rank: 121, playerName: "Jordan van den Berg", school: "Georgia Tech", position: "DT" },
  { rank: 122, playerName: "Jager Burton", school: "Kentucky", position: "IOL" },
  { rank: 123, playerName: "Brent Austin", school: "California", position: "CB" },
  { rank: 124, playerName: "Kaytron Allen", school: "Penn State", position: "RB" },
  { rank: 125, playerName: "Eli Raridon", school: "Notre Dame", position: "TE" },
  { rank: 126, playerName: "Jonah Coleman", school: "Washington", position: "RB" },
  { rank: 127, playerName: "Tyreak Sapp", school: "Florida", position: "LB" },
  { rank: 128, playerName: "Will Kacmarek", school: "Ohio State", position: "TE" },
  { rank: 129, playerName: "Matt Gulbin", school: "Michigan State", position: "IOL" },
  { rank: 130, playerName: "Jude Bowry", school: "Boston College", position: "OT" },
  { rank: 131, playerName: "J.C. Davis", school: "Illinois", position: "OT" },
  { rank: 132, playerName: "Drew Shelton", school: "Penn State", position: "OT" },
  { rank: 133, playerName: "Cade Klubnik", school: "Clemson", position: "QB" },
  { rank: 134, playerName: "Davison Igbinosun", school: "Ohio State", position: "CB" },
  { rank: 135, playerName: "Chris Adams", school: "Memphis", position: "IOL" },
  { rank: 136, playerName: "Tim Keenan III", school: "Alabama", position: "DT" },
  { rank: 137, playerName: "Xavier Scott", school: "Illinois", position: "S" },
  { rank: 138, playerName: "Josh Cameron", school: "Baylor", position: "WR" },
  { rank: 139, playerName: "Logan Jones", school: "Iowa", position: "IOL" },
  { rank: 140, playerName: "Lander Barton", school: "Utah", position: "LB" },
  { rank: 141, playerName: "Oscar Delp", school: "Georgia", position: "TE" },
  { rank: 142, playerName: "Vinny Anthony II", school: "Wisconsin", position: "WR" },
  { rank: 143, playerName: "Joe Royer", school: "Cincinnati", position: "TE" },
  { rank: 144, playerName: "Demond Claiborne", school: "Wake Forest", position: "RB" },
  { rank: 145, playerName: "Harold Perkins Jr.", school: "LSU", position: "LB" },
  { rank: 146, playerName: "Daylen Everette", school: "Georgia", position: "CB" },
  { rank: 147, playerName: "Chandler Rivers", school: "Duke", position: "CB" },
  { rank: 148, playerName: "Wesley Williams", school: "Duke", position: "EDGE" },
  { rank: 149, playerName: "Ar'maj Reed-Adams", school: "Texas A&M", position: "IOL" },
  { rank: 150, playerName: "Robert Spears-Jennings", school: "Oklahoma", position: "S" },
  { rank: 151, playerName: "Markel Bell", school: "Miami (FL)", position: "IOL" },
  { rank: 152, playerName: "DeVonta Smith", school: "Notre Dame", position: "CB" },
  { rank: 153, playerName: "Arion Carter", school: "Tennessee", position: "LB" },
  { rank: 154, playerName: "Red Murdock", school: "Buffalo", position: "LB" },
  { rank: 155, playerName: "Devon Marshall", school: "NC State", position: "CB" },
  { rank: 156, playerName: "Zxavian Harris", school: "Ole Miss", position: "DT" },
  { rank: 157, playerName: "Skyler Bell", school: "UConn", position: "WR" },
  { rank: 158, playerName: "Ted Hurst", school: "Georgia State", position: "WR" },
  { rank: 159, playerName: "Jeff Caldwell", school: "Cincinnati", position: "WR" },
  { rank: 160, playerName: "Jalen Farmer", school: "Kentucky", position: "IOL" },
  { rank: 161, playerName: "Pat Coogan", school: "Indiana", position: "IOL" },
  { rank: 162, playerName: "Dallen Bentley", school: "Utah", position: "TE" },
  { rank: 163, playerName: "Cian Slone", school: "NC State", position: "LB" },
  { rank: 164, playerName: "Emmett Johnson", school: "Nebraska", position: "RB" },
  { rank: 165, playerName: "Caden Curry", school: "Ohio State", position: "EDGE" },
  { rank: 166, playerName: "Bryce Lance", school: "North Dakota State", position: "WR" },
  { rank: 167, playerName: "Bakyne Coly", school: "Purdue", position: "IOL" },
  { rank: 168, playerName: "Reggie Virgil", school: "Texas Tech", position: "WR" },
  { rank: 169, playerName: "Drew Allar", school: "Penn State", position: "QB" },
  { rank: 170, playerName: "Ja'Kobi Lane", school: "USC", position: "WR" },
  { rank: 171, playerName: "Skyler Gill-Howard", school: "Texas Tech", position: "DT" },
  { rank: 172, playerName: "Isaiah World", school: "Oregon", position: "OT" },
  { rank: 173, playerName: "Travis Burke", school: "Memphis", position: "OT" },
  { rank: 174, playerName: "Marlin Klein", school: "Michigan", position: "TE" },
  { rank: 175, playerName: "Deion Burks", school: "Oklahoma", position: "WR" },
  { rank: 176, playerName: "Gracen Halton", school: "Oklahoma", position: "DT" },
  { rank: 177, playerName: "Keyshaun Elliott", school: "Arizona State", position: "LB" },
  { rank: 178, playerName: "Justin Joly", school: "NC State", position: "TE" },
  { rank: 179, playerName: "DeMonte Capehart", school: "Clemson", position: "DT" },
  { rank: 180, playerName: "Deontae Lawson", school: "Alabama", position: "LB" },
  { rank: 181, playerName: "Bud Clark", school: "TCU", position: "S" },
  { rank: 182, playerName: "Beau Stephens", school: "Iowa", position: "IOL" },
  { rank: 183, playerName: "Bryce Boettcher", school: "Oregon", position: "LB" },
  { rank: 184, playerName: "Mike Washington Jr.", school: "Arkansas", position: "RB" },
  { rank: 185, playerName: "Barion Brown", school: "LSU", position: "WR" },
  { rank: 186, playerName: "Seth McGowan", school: "Kentucky", position: "RB" },
  { rank: 187, playerName: "Hezekiah Masses", school: "California", position: "CB" },
  { rank: 188, playerName: "Bishop Fitzgerald", school: "USC", position: "S" },
  { rank: 189, playerName: "Aaron Anderson", school: "LSU", position: "WR" },
  { rank: 190, playerName: "Sam Roush", school: "Stanford", position: "TE" },
  { rank: 191, playerName: "Robert Henry Jr.", school: "UTSA", position: "RB" },
  { rank: 192, playerName: "Albert Regis", school: "Texas A&M", position: "DT" },
  { rank: 193, playerName: "Dametrious Crownover", school: "Texas A&M", position: "IOL" },
  { rank: 194, playerName: "Dae'Quan Wright", school: "Ole Miss", position: "TE" },
  { rank: 195, playerName: "VJ Payne", school: "Kansas State", position: "S" },
  { rank: 196, playerName: "Tyren Montgomery", school: "John Carroll", position: "WR" },
  { rank: 197, playerName: "Taurean York", school: "Texas A&M", position: "LB" },
  { rank: 198, playerName: "Michael Taaffe", school: "Texas", position: "CB" },
  { rank: 199, playerName: "Zavion Thomas", school: "LSU", position: "WR" },
  { rank: 200, playerName: "Nicholas Singleton", school: "Penn State", position: "RB" },
];

/** Default/current draft year. Override with CURRENT_DRAFT_YEAR env. */
export const CURRENT_DRAFT_YEAR = Number(process.env.CURRENT_DRAFT_YEAR) || 2026;

/** Year-aware getters for multi-year support. Add new years here as needed. */
export function getFirstRoundTeams(year: number): Record<number, string> {
  if (year === 2026) return FIRST_ROUND_TEAMS_2026;
  return {};
}

export function getTeamNeeds(year: number): Record<number, string> {
  if (year === 2026) return TEAM_NEEDS_2026;
  return {};
}

export function getConsensusPlayers(year: number): Array<{ rank: number; playerName: string; school: string; position: string }> {
  if (year === 2026) return CONSENSUS_PLAYERS_2026;
  return [];
}

export type RankingSource = "cbs" | "espn" | "nfl" | "fox" | "pff" | "all" | "avg";

// ---------------------------------------------------------------------------
// Name normalization helpers
// ---------------------------------------------------------------------------

const NAME_SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"]);

/** Extracts the last name portion, ignoring generation suffixes like Jr./II/III. */
function extractLastName(fullName: string): string {
  const parts = fullName.toLowerCase().split(" ").filter((p) => !NAME_SUFFIXES.has(p));
  return parts[parts.length - 1] ?? fullName.toLowerCase();
}

type PlayerLike = { playerName: string; school: string; position: string };

/**
 * Builds a lookup from (lastNameLower|position|schoolLower) → canonical full name,
 * using the provided list as the authority. CBS is always passed as the authority.
 */
function buildCanonicalNameMap(canonicalList: PlayerLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of canonicalList) {
    const key = `${extractLastName(p.playerName)}|${p.position}|${p.school.toLowerCase()}`;
    if (!map.has(key)) map.set(key, p.playerName);
  }
  return map;
}

/**
 * Remaps any player whose full name differs from the canonical list but whose
 * (last name, position, school) triple matches. This de-duplicates entries like
 * "Kevin Concepcion" (source A) vs "KC Concepcion" (CBS) for the same prospect.
 */
function normalizeNames<T extends PlayerLike>(players: T[], canonicalMap: Map<string, string>): T[] {
  return players.map((p) => {
    const key = `${extractLastName(p.playerName)}|${p.position}|${p.school.toLowerCase()}`;
    const canonical = canonicalMap.get(key);
    return canonical && canonical !== p.playerName ? { ...p, playerName: canonical } : p;
  });
}

/**
 * Returns static rankings for ESPN / NFL.com / Fox Sports sources.
 * Top-50 are source-specific; ranks 51–200 fall back to the CBS list.
 * "cbs" is not handled here — the caller should use DB data (seeded from CONSENSUS_PLAYERS_2026).
 */
export function getStaticPlayersBySource(
  year: number,
  source: RankingSource
): Array<{ rank: number; playerName: string; school: string; position: string }> {
  if (year !== 2026) return [];
  if (source === "cbs") return CONSENSUS_PLAYERS_2026;

  const rawTop50 =
    source === "espn"
      ? ESPN_PLAYERS_2026_TOP50
      : source === "nfl"
      ? NFL_PLAYERS_2026_TOP50
      : source === "pff"
      ? PFF_PLAYERS_2026_TOP50
      : FOX_PLAYERS_2026_TOP50;

  // Normalize names in the source-specific top-50 against CBS so that
  // differently-spelled names for the same prospect (same last name + school +
  // position) resolve to the CBS canonical spelling.
  const canonicalMap = buildCanonicalNameMap(CONSENSUS_PLAYERS_2026);
  const top50 = normalizeNames(rawTop50, canonicalMap);

  const top50Names = new Set(top50.map((p) => p.playerName));
  const cbsRest = CONSENSUS_PLAYERS_2026.filter((p) => !top50Names.has(p.playerName)).map(
    (p, i) => ({ ...p, rank: 51 + i })
  );
  return [...top50, ...cbsRest];
}

/**
 * Compute a consensus ranking across all 5 sources using Reciprocal Rank Fusion (RRF).
 *
 * Score for each player = Σ 1 / (K + rank_in_source), summed over every source where
 * the player appears. K=60 is the standard RRF constant; it limits the outsized influence
 * of a single very-high ranking and ensures graceful handling of source disagreement.
 *
 * cbsPlayers is passed in separately so callers can supply the live DB list rather than
 * the static fallback, keeping the consensus current after admin re-seeds.
 */
export function computeConsensusRanking(
  cbsPlayers: Array<{ rank: number; playerName: string; school: string; position: string }>,
  year: number
): Array<{ rank: number; playerName: string; school: string; position: string }> {
  const K = 60;

  // Build the five source lists. CBS comes from the DB-supplied array; the rest are static
  // but share the same player universe (top-50 source-specific, 51-200 CBS fallback).
  // Normalize all non-CBS lists against CBS so that alternate name spellings for
  // the same prospect (same last name + school + position) are collapsed to the
  // CBS canonical name before scores are aggregated.
  const canonicalMap = buildCanonicalNameMap(cbsPlayers);
  const sourceLists = [
    cbsPlayers,
    normalizeNames(getStaticPlayersBySource(year, "pff"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "espn"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "nfl"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "fox"), canonicalMap),
  ];

  const scores = new Map<string, { score: number; school: string; position: string }>();

  for (const list of sourceLists) {
    for (const p of list) {
      if (!scores.has(p.playerName)) {
        scores.set(p.playerName, { score: 0, school: p.school, position: p.position });
      }
      scores.get(p.playerName)!.score += 1 / (K + p.rank);
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .map(([playerName, { school, position }], i) => ({
      rank: i + 1,
      playerName,
      school,
      position,
    }));
}

/**
 * Compute an average overall ranking across all 5 sources.
 *
 * For each player, sum their overall rank number on each source (CBS, PFF,
 * ESPN, NFL.com, Fox) then divide by the number of sources where they appear.
 * Because every source list extends to 200 via the CBS fallback, every player
 * effectively appears in all 5 lists. The final output is sorted ascending by
 * that average (lower = better), giving an intuitive "average draft slot".
 *
 * Unlike "All" (RRF which inflates early picks exponentially), this is a
 * straight arithmetic mean — a player ranked 10th on every board beats one
 * ranked 1st on two boards but 50th on the others.
 */
export function computeAveragePositionRanking(
  cbsPlayers: Array<{ rank: number; playerName: string; school: string; position: string }>,
  year: number
): Array<{ rank: number; playerName: string; school: string; position: string }> {
  const canonicalMap = buildCanonicalNameMap(cbsPlayers);
  const sourceLists = [
    cbsPlayers,
    normalizeNames(getStaticPlayersBySource(year, "pff"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "espn"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "nfl"), canonicalMap),
    normalizeNames(getStaticPlayersBySource(year, "fox"), canonicalMap),
  ];

  // rankSum[playerName] = { sum of overall ranks, count, school, position }
  const rankSum = new Map<string, { sum: number; count: number; school: string; position: string }>();

  for (const list of sourceLists) {
    for (const p of list) {
      if (!rankSum.has(p.playerName)) {
        rankSum.set(p.playerName, { sum: 0, count: 0, school: p.school, position: p.position });
      }
      const entry = rankSum.get(p.playerName)!;
      entry.sum += p.rank;
      entry.count += 1;
    }
  }

  return Array.from(rankSum.entries())
    .map(([playerName, { sum, count, school, position }]) => ({
      playerName,
      school,
      position,
      avgRank: sum / count,
    }))
    .sort((a, b) => a.avgRank - b.avgRank)
    .map(({ playerName, school, position }, i) => ({
      rank: i + 1,
      playerName,
      school,
      position,
    }));
}
