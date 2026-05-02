/**
 * Curated sample CSV of 2nd-contract data for Tim/Jeff to review.
 *
 * Stratified across position + APY tier so the sample shows the shape
 * of the data without being 1,500 rows long. Joins draft pick info from
 * official_draft_results so each row has draft_year/round/team context.
 *
 * Output: pff_downloads/player_contracts_sample.csv
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
  draft_team: string | null;
  draft_position: string | null;
  contract_team: string | null;
  contract_year_signed: number;
  years_length: number | null;
  value_total: number | null;
  apy: number | null;
  guaranteed: number | null;
  apy_cap_pct: number | null;
  contract_outcome_bucket: string | null;
  source: string;
}

const rows = await sql<Row[]>`
  WITH ranked AS (
    SELECT
      pc.player_name,
      o.year AS draft_year,
      o.round AS draft_round,
      o.team_name AS draft_team,
      o.position AS draft_position,
      pc.team_abbr AS contract_team,
      pc.year_signed AS contract_year_signed,
      pc.years_length,
      pc.value_total,
      pc.apy,
      pc.guaranteed,
      pc.apy_cap_pct,
      o.contract_outcome AS contract_outcome_bucket,
      pc.source,
      -- One row per (player) — prefer Spotrac (fresher) when both sources exist.
      ROW_NUMBER() OVER (
        PARTITION BY pc.player_name
        ORDER BY (pc.source = 'spotrac') DESC, pc.year_signed DESC
      ) AS rn,
      -- Position bucket for stratification
      CASE
        WHEN o.position IN ('QB') THEN 'QB'
        WHEN o.position IN ('RB','FB') THEN 'RB'
        WHEN o.position IN ('WR') THEN 'WR'
        WHEN o.position IN ('TE') THEN 'TE'
        WHEN o.position IN ('T','OT') THEN 'OT'
        WHEN o.position IN ('G','OG','C','OC','OL','IOL') THEN 'IOL'
        WHEN o.position IN ('EDGE','DE','OLB','ED') THEN 'EDGE'
        WHEN o.position IN ('DT','DI','NT') THEN 'DT'
        WHEN o.position IN ('LB','ILB','MLB') THEN 'LB'
        WHEN o.position IN ('CB','DB') THEN 'CB'
        WHEN o.position IN ('S','FS','SS') THEN 'S'
        ELSE 'OTHER'
      END AS pos_bucket,
      -- APY tier
      CASE
        WHEN pc.apy_cap_pct >= 0.10 THEN 'top'
        WHEN pc.apy_cap_pct >= 0.05 THEN 'mid'
        WHEN pc.apy_cap_pct >= 0.02 THEN 'modest'
        ELSE 'small'
      END AS apy_tier
    FROM player_contracts pc
    JOIN official_draft_results o
      ON LOWER(REGEXP_REPLACE(pc.player_name, '[^A-Za-z]', '', 'g')) =
         LOWER(REGEXP_REPLACE(o.player_name, '[^A-Za-z]', '', 'g'))
    WHERE pc.is_second_contract = true
      AND pc.apy IS NOT NULL
      AND pc.apy > 0
  ),
  sampled AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY pos_bucket, apy_tier ORDER BY apy DESC) AS pos_rn
    FROM ranked
    WHERE rn = 1
  )
  SELECT
    player_name, draft_year, draft_round, draft_team, draft_position,
    contract_team, contract_year_signed, years_length,
    value_total, apy, guaranteed, apy_cap_pct,
    contract_outcome_bucket, source
  FROM sampled
  WHERE pos_rn <= 4
  ORDER BY draft_position, apy DESC NULLS LAST
`;

const HEADERS = [
  'player_name',
  'draft_year',
  'draft_round',
  'draft_team',
  'draft_position',
  'contract_team',
  'contract_year_signed',
  'years_length',
  'value_total',
  'apy',
  'guaranteed',
  'apy_cap_pct',
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
      r.draft_team,
      r.draft_position,
      r.contract_team,
      r.contract_year_signed,
      r.years_length,
      r.value_total,
      r.apy,
      r.guaranteed,
      r.apy_cap_pct !== null ? Number(r.apy_cap_pct).toFixed(4) : '',
      r.contract_outcome_bucket,
      r.source,
    ]
      .map(csvEscape)
      .join(','),
  );
}

const outPath = join(process.cwd(), 'pff_downloads', 'player_contracts_sample.csv');
await Bun.write(outPath, lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows → ${outPath}`);
console.log('\nBreakdown by position:');
const byPos = new Map<string, number>();
for (const r of rows) {
  const p = r.draft_position ?? 'UNK';
  byPos.set(p, (byPos.get(p) ?? 0) + 1);
}
for (const [p, n] of [...byPos.entries()].sort()) {
  console.log(`  ${p.padEnd(6)} ${n}`);
}

await sql.end();
