/**
 * Parse Tim's commissioner rankings workbook → JSON for the site.
 * Usage: bun run scripts/ingest-commissioner-rankings.ts [path-to-xlsx] [season]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { normPlayerName } from '../src/config/fantasy-managers.js'

const DEFAULT_PATH = '/Users/josh/Downloads/FF rankings 2026.xlsx'
const inputPath = resolve(process.argv[2] ?? DEFAULT_PATH)
const season = Number(process.argv[3] ?? 2026)

type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF'

interface CommissionerPlayerRow {
  name: string
  position: Pos
  team: string | null
  rank: number
  projectedPoints: number
  premium: number
  norm: string
}

function parseSkillPlayer(
  raw: string,
  _position: Pos
): { name: string; team: string | null } | null {
  const s = raw.trim()
  if (!s || s === 'COUNT' || s === 'Player') return null
  const m =
    s.match(/^(.+?)\s+(QB|RB|WR|TE|DEF|K)\s{1,2}([A-Z]{2,4})$/i) ??
    s.match(/^(.+?)\s+(QB|RB|WR|TE)\s+([A-Z]{2,4})$/i)
  if (m) return { name: m[1].trim(), team: m[3].toUpperCase() }
  return { name: s, team: null }
}

function parseWorkbook(path: string): CommissionerPlayerRow[] {
  const wb = XLSX.readFile(path)
  const rows: CommissionerPlayerRow[] = []

  for (const sheetName of ['QB', 'RB', 'WR', 'TE'] as const) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
    const headerIdx = grid.findIndex((r) => r[0] === 'Player')
    if (headerIdx < 0) continue
    let rank = 0
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i]
      const parsed = parseSkillPlayer(String(r[0] ?? ''), sheetName)
      if (!parsed || parsed.name === 'COUNT') break
      const projectedPoints = Number(r[16])
      const premium = Number(r[18])
      if (!Number.isFinite(projectedPoints)) continue
      rank++
      rows.push({
        name: parsed.name,
        position: sheetName,
        team: parsed.team,
        rank,
        projectedPoints,
        premium: Number.isFinite(premium) ? premium : 0,
        norm: normPlayerName(parsed.name),
      })
    }
  }

  const defSheet = wb.Sheets.Def
  if (defSheet) {
    const grid = XLSX.utils.sheet_to_json(defSheet, { header: 1, defval: '' }) as unknown[][]
    let rank = 0
    for (let i = 0; i < grid.length; i++) {
      const r = grid[i]
      const label = String(r[1] ?? '').trim()
      if (!label || label === 'Player') continue
      const projectedPoints = Number(r[5])
      if (!Number.isFinite(projectedPoints)) continue
      rank++
      rows.push({
        name: label,
        position: 'DEF',
        team: label,
        rank,
        projectedPoints,
        premium: Number.isFinite(Number(r[6])) ? Number(r[6]) : 0,
        norm: normPlayerName(label),
      })
    }
  }

  return rows
}

const players = parseWorkbook(inputPath)
if (players.length === 0) {
  console.error('No players parsed from', inputPath)
  process.exit(1)
}

const outPath = resolve(`src/data/commissioner/tim-${season}.json`)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      season,
      commissioner: 'tim',
      commissionerName: 'Tim',
      label: 'Commissioner rankings',
      sourceFile: inputPath.split('/').pop(),
      importedAt: new Date().toISOString(),
      players,
    },
    null,
    2
  )}\n`
)

const byPos = Object.fromEntries(
  (['QB', 'RB', 'WR', 'TE', 'DEF'] as const).map((p) => [
    p,
    players.filter((r) => r.position === p).length,
  ])
)
console.log(`Wrote ${players.length} players to ${outPath}`, byPos)
