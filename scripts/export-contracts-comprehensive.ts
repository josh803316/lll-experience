/**
 * Comprehensive CSV of contract data for 2018-2026 for Tim/Jeff.
 * Joins draft pick info from official_draft_results so each row has draft_year/round/team context.
 *
 * Output: pff_downloads/player_contracts_2018_2026.csv
 */
import postgres from 'postgres';
import {join} from 'path';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL is required');
}
const sql = postgres(DIRECT_URL, {prepare: false});

interface Row {
  player_name: string;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick_number: number | null;
  draft_team: string | null;
  draft_position: string | null;
  contract_team: string | null;
  contract_year_signed: number;
  years_length: number | null;
  value_total: number | null;
  average_salary: number | null;
  apy: number | null;
  guaranteed: number | null;
  apy_cap_pct: number | null;
  is_second_contract: boolean;
  contract_outcome_bucket: string | null;
  source: string;
}

const rows = await sql<Row[]>`
  SELECT
    pc.player_name,
    COALESCE(o.year, pc.draft_year) AS draft_year,
    o.round AS draft_round,
    COALESCE(o.pick_number, pc.draft_overall) AS draft_pick_number,
    o.team_name AS draft_team,
    COALESCE(o.position, pc.position) AS draft_position,
    pc.team_abbr AS contract_team,
    pc.year_signed AS contract_year_signed,
    pc.years_length,
    pc.value_total,
    pc.apy AS average_salary,
    pc.apy,
    pc.guaranteed,
    pc.apy_cap_pct,
    pc.is_second_contract,
    o.contract_outcome AS contract_outcome_bucket,
    pc.source
  FROM player_contracts pc
  LEFT JOIN official_draft_results o
    ON LOWER(REGEXP_REPLACE(pc.player_name, '[^A-Za-z]', '', 'g')) =
       LOWER(REGEXP_REPLACE(o.player_name, '[^A-Za-z]', '', 'g'))
  WHERE pc.year_signed BETWEEN 2018 AND 2026
    AND pc.apy IS NOT NULL
    AND pc.apy > 0
  ORDER BY pc.year_signed DESC, pc.apy DESC NULLS LAST
`;

const HEADERS = [
  'player_name',
  'draft_year',
  'draft_round',
  'draft_pick_number',
  'draft_team',
  'draft_position',
  'contract_team',
  'contract_year_signed',
  'years_length',
  'value_total',
  'average_salary',
  'apy',
  'guaranteed',
  'apy_cap_pct',
  'is_second_contract',
  'contract_outcome_bucket',
  'source',
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

const lines = [HEADERS.join(',')];
for (const r of rows) {
  lines.push(
    [
      r.player_name,
      r.draft_year,
      r.draft_round,
      r.draft_pick_number,
      r.draft_team,
      r.draft_position,
      r.contract_team,
      r.contract_year_signed,
      r.years_length,
      r.value_total,
      r.average_salary,
      r.apy,
      r.guaranteed,
      r.apy_cap_pct !== null ? Number(r.apy_cap_pct).toFixed(4) : '',
      r.is_second_contract ? 'TRUE' : 'FALSE',
      r.contract_outcome_bucket,
      r.source,
    ]
      .map(csvEscape)
      .join(','),
  );
}

const outPath = join(process.cwd(), 'pff_downloads', 'player_contracts_2018_2026.csv');
await Bun.write(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows → ${outPath}`);

await sql.end();
