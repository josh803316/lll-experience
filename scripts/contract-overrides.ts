/**
 * Manually curated 2nd contracts for picks whose extensions weren't
 * captured by the nflverse (≤2022) or Spotrac (current rosters) ingests.
 *
 * Source: public reporting (ESPN/Spotrac/Pro Football Network) at signing.
 * Update this file when new extensions hit. APY % is computed against the
 * NFL salary cap for the start_year by the apply-contract-overrides script.
 */

export interface ContractOverride {
  startYear: number;
  apy: number;
  value: number;
  signingTeamAbbr: string;
  isSameTeam: boolean;
  /** Aliases under which the player appears in nflverse / our DB. */
  aliases?: string[];
  /** Optional note for posterity. */
  note?: string;
}

export const CONTRACT_OVERRIDES: Record<string, ContractOverride> = {
  'Darius Leonard': {
    aliases: ['Shaquille Leonard'],
    startYear: 2021,
    apy: 19_700_000,
    value: 99_250_000,
    signingTeamAbbr: 'IND',
    isSameTeam: true,
  },
  'Amon-Ra St. Brown': {
    startYear: 2024,
    apy: 30_005_454,
    value: 120_021_817,
    signingTeamAbbr: 'DET',
    isSameTeam: true,
  },
  'Shaq Mason': {
    startYear: 2022,
    apy: 9_250_000,
    value: 9_250_000,
    signingTeamAbbr: 'TB',
    isSameTeam: false,
  },
  'Deebo Samuel': {
    aliases: ['Deebo Samuel Sr.', 'Deebo Samuel Sr'],
    startYear: 2025,
    apy: 17_550_000,
    value: 17_550_000,
    signingTeamAbbr: 'WAS',
    isSameTeam: false,
  },
  'Josh Allen': {
    note: 'DE Josh Allen aka Josh Hines-Allen (Jaguars) — distinct from QB Josh Allen.',
    aliases: ['Josh Hines-Allen'],
    startYear: 2024,
    apy: 28_250_000,
    value: 141_250_000,
    signingTeamAbbr: 'JAX',
    isSameTeam: true,
  },
  'Andrew Van Ginkel': {
    startYear: 2024,
    apy: 10_000_000,
    value: 20_000_000,
    signingTeamAbbr: 'MIN',
    isSameTeam: false,
  },
  'Quinnen Williams': {
    startYear: 2023,
    apy: 24_000_000,
    value: 96_000_000,
    signingTeamAbbr: 'NYJ',
    isSameTeam: true,
  },
  'Jaylen Waddle': {
    startYear: 2024,
    apy: 28_250_000,
    value: 84_750_000,
    signingTeamAbbr: 'MIA',
    isSameTeam: true,
  },
  'DeVonta Smith': {
    aliases: ['Devonta Smith'],
    startYear: 2024,
    apy: 25_000_000,
    value: 75_000_000,
    signingTeamAbbr: 'PHI',
    isSameTeam: true,
  },
  'Christian Wilkins': {
    startYear: 2024,
    apy: 27_500_000,
    value: 110_000_000,
    signingTeamAbbr: 'LV',
    isSameTeam: false,
  },
  'Tee Higgins': {
    startYear: 2025,
    apy: 28_750_000,
    value: 115_000_000,
    signingTeamAbbr: 'CIN',
    isSameTeam: true,
  },
  'Justin Madubuike': {
    startYear: 2024,
    apy: 24_500_000,
    value: 98_000_000,
    signingTeamAbbr: 'BAL',
    isSameTeam: true,
  },
  "Ja'Marr Chase": {
    startYear: 2025,
    apy: 40_250_000,
    value: 161_000_000,
    signingTeamAbbr: 'CIN',
    isSameTeam: true,
  },
  'A.J. Brown': {
    aliases: ['AJ Brown', 'A. J. Brown'],
    startYear: 2024,
    apy: 32_000_000,
    value: 96_000_000,
    signingTeamAbbr: 'PHI',
    isSameTeam: false,
  },
  'DK Metcalf': {
    aliases: ['D.K. Metcalf'],
    startYear: 2025,
    apy: 33_000_000,
    value: 132_000_000,
    signingTeamAbbr: 'PIT',
    isSameTeam: false,
  },
  'Trent McDuffie': {
    startYear: 2025,
    apy: 22_500_000,
    value: 67_500_000,
    signingTeamAbbr: 'KC',
    isSameTeam: true,
  },
  'Sauce Gardner': {
    aliases: ['Ahmad Gardner'],
    startYear: 2025,
    apy: 30_100_000,
    value: 120_400_000,
    signingTeamAbbr: 'NYJ',
    isSameTeam: true,
  },
  'Garrett Wilson': {
    startYear: 2025,
    apy: 32_500_000,
    value: 130_000_000,
    signingTeamAbbr: 'NYJ',
    isSameTeam: true,
  },
  'Rashawn Slater': {
    startYear: 2025,
    apy: 28_000_000,
    value: 112_000_000,
    signingTeamAbbr: 'LAC',
    isSameTeam: true,
  },
  'Penei Sewell': {
    startYear: 2024,
    apy: 28_000_000,
    value: 112_000_000,
    signingTeamAbbr: 'DET',
    isSameTeam: true,
  },
  'Creed Humphrey': {
    startYear: 2024,
    apy: 18_000_000,
    value: 72_000_000,
    signingTeamAbbr: 'KC',
    isSameTeam: true,
  },
  'Trevon Diggs': {
    startYear: 2023,
    apy: 19_400_000,
    value: 97_000_000,
    signingTeamAbbr: 'DAL',
    isSameTeam: true,
  },
  'Trent Williams': {
    startYear: 2021,
    apy: 23_010_000,
    value: 138_060_000,
    signingTeamAbbr: 'SF',
    isSameTeam: false,
  },
  'George Kittle': {
    startYear: 2020,
    apy: 15_000_000,
    value: 75_000_000,
    signingTeamAbbr: 'SF',
    isSameTeam: true,
  },
  'T.J. Watt': {
    aliases: ['TJ Watt'],
    startYear: 2021,
    apy: 28_000_000,
    value: 112_000_000,
    signingTeamAbbr: 'PIT',
    isSameTeam: true,
  },
  'Roquan Smith': {
    startYear: 2023,
    apy: 20_000_000,
    value: 100_000_000,
    signingTeamAbbr: 'BAL',
    isSameTeam: false,
  },
  'Tristan Wirfs': {
    startYear: 2024,
    apy: 28_125_000,
    value: 140_625_000,
    signingTeamAbbr: 'TB',
    isSameTeam: true,
  },
  'Joe Burrow': {
    startYear: 2023,
    apy: 55_000_000,
    value: 275_000_000,
    signingTeamAbbr: 'CIN',
    isSameTeam: true,
  },
  'Jalen Hurts': {
    startYear: 2023,
    apy: 51_000_000,
    value: 255_000_000,
    signingTeamAbbr: 'PHI',
    isSameTeam: true,
  },
  'Lamar Jackson': {
    startYear: 2023,
    apy: 52_000_000,
    value: 260_000_000,
    signingTeamAbbr: 'BAL',
    isSameTeam: true,
  },
  'Justin Herbert': {
    startYear: 2023,
    apy: 52_500_000,
    value: 262_500_000,
    signingTeamAbbr: 'LAC',
    isSameTeam: true,
  },
  'Justin Jefferson': {
    startYear: 2024,
    apy: 35_000_000,
    value: 140_000_000,
    signingTeamAbbr: 'MIN',
    isSameTeam: true,
  },
  'CeeDee Lamb': {
    startYear: 2024,
    apy: 34_000_000,
    value: 136_000_000,
    signingTeamAbbr: 'DAL',
    isSameTeam: true,
  },
};
