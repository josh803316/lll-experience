import postgres from 'postgres';
import {join} from 'path';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL env var is required');
}

const sql = postgres(DIRECT_URL, {prepare: false});

const rows = await sql<
  {
    player_name: string;
    pff_id: number | null;
    season: number;
    position: string | null;
    team_abbr: string | null;
    category: string;
    stats: Record<string, string>;
  }[]
>`
  SELECT player_name, pff_id, season, position, team_abbr, category, stats
  FROM pff_player_stats
  ORDER BY season, category, player_name
`;

const HEADERS = [
  'year',
  'category',
  'player',
  'player_id',
  'position',
  'team_name',
  'player_game_count',
  'grades_offense',
  'grades_defense',
  'grades_pass_block',
  'grades_run_block',
];

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) {
    return '';
  }
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const lines: string[] = [HEADERS.join(',')];

for (const r of rows) {
  const s = r.stats || {};
  lines.push(
    [
      r.season,
      r.category,
      r.player_name,
      r.pff_id ?? s.player_id ?? '',
      r.position ?? '',
      r.team_abbr ?? s.team_name ?? '',
      s.player_game_count ?? '',
      s.grades_offense ?? '',
      s.grades_defense ?? '',
      s.grades_pass_block ?? '',
      s.grades_run_block ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );
}

const outPath = join(process.cwd(), 'pff_downloads', 'pff_summary_2016_2025.csv');
await Bun.write(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows to ${outPath}`);

await sql.end();
