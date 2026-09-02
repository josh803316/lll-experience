/**
 * Freeze opening-day projected standings for end-of-season Cortanha grading.
 * Usage: bun run scripts/freeze-cortanha-baseline.ts [year]
 */
import { FantasyScout } from '../src/services/fantasy-scout.ts'

const year = Number(process.argv[2] ?? new Date().getFullYear())
if (!Number.isFinite(year) || year < 2020) {
  console.error('Usage: bun run scripts/freeze-cortanha-baseline.ts [year]')
  process.exit(1)
}

const result = await FantasyScout.freezeBaseline(
  year,
  `Opening-day projected standings freeze (${new Date().toISOString().slice(0, 10)})`
)
console.log(JSON.stringify(result, null, 2))
process.exit(0)
