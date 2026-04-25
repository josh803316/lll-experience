/**
 * LLM-generated draft pick analysis, cached in the pick_writeups table.
 * Powered by the You.com Research API (same key as the AI recommend service).
 *
 * The prompt asks You.com to look at specific draft-grade trackers (CBS,
 * NFL.com, USA Today, etc.) and return an aggregated letter grade, a numeric
 * 4.0-scale equivalent, the per-source breakdown, and a short prose analysis.
 * The structured fields are parsed out of the response and stored alongside
 * the prose so the modal can render them as a "consensus grade" badge.
 */

import {getDB} from '../db/index.js';
import {pickWriteups} from '../db/schema.js';
import {and, eq} from 'drizzle-orm';

const YOU_API_URL = 'https://api.you.com/v1/research';
const FETCH_TIMEOUT_MS = 90_000;

export interface WriteupSource {
  url: string;
  title?: string;
}

export interface GradeBreakdown {
  source: string;
  grade: string | null; // letter grade or null when source had none
}

export interface ParsedGenerationResult {
  writeup: string;
  sources: WriteupSource[];
  gradeLetter: string | null;
  gradeNumeric: string | null;
  gradeSourceCount: number | null;
  gradeBreakdown: GradeBreakdown[];
}

export interface PickWriteupRecord {
  pickNumber: number;
  playerName: string | null;
  writeup: string;
  sources: WriteupSource[];
  gradeLetter: string | null;
  gradeNumeric: string | null;
  gradeSourceCount: number | null;
  gradeBreakdown: GradeBreakdown[];
  generatedAt: Date;
}

interface GenerateInput {
  appId: number;
  year: number;
  pickNumber: number;
  round: number;
  pickInRound: number;
  playerName: string;
  position: string | null;
  college: string | null;
  teamName: string;
}

/**
 * Specific draft-grade tracker URLs we want You.com to consult. Listed
 * inline in the prompt so research_effort=lite still pulls them in.
 */
const GRADE_SOURCES: Array<{name: string; url: string}> = [
  {
    name: 'CBS Sports — Live Grade Tracker',
    url: 'https://www.cbssports.com/nfl/draft/news/2026-nfl-draft-grades-tracker-live-round-5-analysis/',
  },
  {name: 'CBS Sports — Draft Tracker', url: 'https://www.cbssports.com/nfl/draft/draft-tracker/'},
  {
    name: 'NFL.com — Snap Grades by Team',
    url: 'https://www.nfl.com/news/2026-nfl-draft-snap-grades-for-every-team-after-day-1',
  },
  {
    name: 'USA Today — Draft Tracker Day 3',
    url: 'https://www.usatoday.com/story/sports/nfl/draft/2026/04/25/nfl-draft-tracker-2026-picks-day-3/89788186007/',
  },
  {name: 'ESPN — Mel Kiper / Field Yates draft analysis', url: 'https://www.espn.com/nfl/draft2026/'},
  {name: 'PFF — Pro Football Focus draft grades', url: 'https://www.pff.com/news/draft'},
];

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) {
    return `${n}th`;
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function buildPrompt(p: GenerateInput): string {
  const positionStr = p.position ? `, ${p.position}` : '';
  const collegeStr = p.college ? ` out of ${p.college}` : '';

  const sourceList = GRADE_SOURCES.map((s, i) => `  ${i + 1}. ${s.name} — ${s.url}`).join('\n');

  return `You are aggregating expert draft grades for a single NFL Draft pick.

Pick: ${p.playerName}${positionStr}${collegeStr} — selected by the ${p.teamName} with the ${ordinal(p.pickNumber)} overall pick (round ${p.round}, pick ${p.pickInRound}) of the ${p.year} NFL Draft.

Step 1 — Find letter grades from these sources for THIS specific pick or this team's pick on this slot. Many of them are running live trackers, so the grade may exist in the article body or in a per-pick card.
${sourceList}

Step 2 — Compute the average grade across only the sources that explicitly graded this pick. Use the 4.0 GPA scale (A+=4.3, A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, F=0). Round to one decimal place. Convert the average back to a letter (A+ for 3.85+, A for 3.85-3.5, A- for 3.5-3.15, B+ for 3.15-2.85, B for 2.85-2.5, B- for 2.5-2.15, C+ for 2.15-1.85, C for 1.85-1.5, etc.).

Step 3 — Output EXACTLY in this format. The first lines must be the structured fields. Do not omit any field. If a source did not grade this pick, put "N/A" for that source. If you cannot find any grades anywhere, put "N/A" for the aggregate.

GRADE_LETTER: <e.g. B+ or N/A>
GRADE_NUMERIC: <e.g. 3.3 or N/A>
GRADE_SOURCES: <integer count of sources with a grade>
GRADE_BREAKDOWN:
- CBS Sports: <letter or N/A>
- NFL.com: <letter or N/A>
- USA Today: <letter or N/A>
- ESPN: <letter or N/A>
- PFF: <letter or N/A>
- Other: <letter or N/A>

ANALYSIS:
<flowing prose, 100-150 words, no bullets, no headers. Cover the player's strengths and college profile, how they fit the ${p.teamName}'s scheme and needs, and the consensus take on the value at this slot. Be balanced — note concerns. Do not invent stats or quotes.>`;
}

/** Letter grade → 4.0-scale numeric. */
const LETTER_TO_GPA: Record<string, number> = {
  'A+': 4.3,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0,
};

function gpaToLetter(g: number): string {
  if (g >= 3.85) {
    return 'A+';
  }
  if (g >= 3.5) {
    return 'A';
  }
  if (g >= 3.15) {
    return 'A-';
  }
  if (g >= 2.85) {
    return 'B+';
  }
  if (g >= 2.5) {
    return 'B';
  }
  if (g >= 2.15) {
    return 'B-';
  }
  if (g >= 1.85) {
    return 'C+';
  }
  if (g >= 1.5) {
    return 'C';
  }
  if (g >= 1.15) {
    return 'C-';
  }
  if (g >= 0.85) {
    return 'D+';
  }
  if (g >= 0.5) {
    return 'D';
  }
  return 'F';
}

function normalizeLetter(input: string | null): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, '');
  if (trimmed === 'N/A' || trimmed === 'NA' || trimmed === '-' || trimmed === '') {
    return null;
  }
  const m = trimmed.match(/^[ABCDF][+-]?/);
  return m ? m[0] : null;
}

/**
 * Parse the structured GRADE block from the model output. Robust to small
 * formatting differences (extra whitespace, wrapping in markdown, etc.).
 */
function parseStructured(raw: string): {
  gradeLetter: string | null;
  gradeNumeric: string | null;
  gradeSourceCount: number | null;
  gradeBreakdown: GradeBreakdown[];
  analysis: string;
} {
  const lines = raw.split('\n');

  let gradeLetter: string | null = null;
  let gradeNumeric: string | null = null;
  let gradeSourceCount: number | null = null;
  const gradeBreakdown: GradeBreakdown[] = [];
  const analysisLines: string[] = [];

  let mode: 'preamble' | 'breakdown' | 'analysis' = 'preamble';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const letterMatch = trimmed.match(/^GRADE_LETTER:\s*(.+?)\s*$/i);
    if (letterMatch) {
      gradeLetter = normalizeLetter(letterMatch[1]);
      continue;
    }
    const numericMatch = trimmed.match(/^GRADE_NUMERIC:\s*(.+?)\s*$/i);
    if (numericMatch) {
      const v = numericMatch[1].replace(/[^\d.]/g, '');
      if (v && !Number.isNaN(Number(v))) {
        gradeNumeric = (Math.round(Number(v) * 10) / 10).toFixed(1);
      }
      continue;
    }
    const countMatch = trimmed.match(/^GRADE_SOURCES:\s*(\d+)/i);
    if (countMatch) {
      gradeSourceCount = Number(countMatch[1]);
      continue;
    }
    if (/^GRADE_BREAKDOWN:?$/i.test(trimmed)) {
      mode = 'breakdown';
      continue;
    }
    if (/^ANALYSIS:?$/i.test(trimmed)) {
      mode = 'analysis';
      continue;
    }

    if (mode === 'breakdown') {
      const m = trimmed.match(/^[-•*]?\s*([^:]+):\s*(.+?)$/);
      if (m) {
        const source = m[1].trim();
        const grade = normalizeLetter(m[2]);
        gradeBreakdown.push({source, grade});
        continue;
      }
      // Blank line between sections is allowed
      if (trimmed === '') {
        continue;
      }
      // Anything else falls through to analysis
      mode = 'analysis';
    }

    if (mode === 'analysis') {
      analysisLines.push(line);
    }
  }

  // If the model omitted GRADE_LETTER but we got a breakdown, derive it
  if (!gradeLetter && gradeBreakdown.length > 0) {
    const numericValues = gradeBreakdown
      .map((b) => (b.grade ? LETTER_TO_GPA[b.grade] : null))
      .filter((v): v is number => v != null);
    if (numericValues.length > 0) {
      const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      gradeLetter = gpaToLetter(avg);
      gradeNumeric = (Math.round(avg * 10) / 10).toFixed(1);
      gradeSourceCount = gradeSourceCount ?? numericValues.length;
    }
  }

  // If the parser found no analysis section, treat the whole text as prose
  const analysis = analysisLines.join('\n').trim() || raw.trim();

  return {gradeLetter, gradeNumeric, gradeSourceCount, gradeBreakdown, analysis};
}

/**
 * Call You.com Research API for a single pick. Returns the analysis prose
 * plus the parsed aggregate grade fields.
 */
export async function generatePickWriteup(p: GenerateInput): Promise<ParsedGenerationResult> {
  const apiKey = process.env.YOU_API_KEY;
  if (!apiKey) {
    throw new Error('YOU_API_KEY not set');
  }

  const res = await fetch(YOU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      input: buildPrompt(p),
      research_effort: 'standard',
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`You.com API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    output?: {
      content?: string;
      sources?: Array<{url: string; title?: string}>;
    };
  };

  const raw = (data.output?.content ?? '').trim();
  if (!raw) {
    throw new Error('You.com returned empty content');
  }
  const sources: WriteupSource[] = (data.output?.sources ?? [])
    .filter((s) => s?.url)
    .map((s) => ({url: s.url, title: s.title}));

  const parsed = parseStructured(raw);
  return {
    writeup: parsed.analysis,
    sources,
    gradeLetter: parsed.gradeLetter,
    gradeNumeric: parsed.gradeNumeric,
    gradeSourceCount: parsed.gradeSourceCount,
    gradeBreakdown: parsed.gradeBreakdown,
  };
}

/** Upsert a generated writeup into the cache. */
export async function saveWriteup(
  appId: number,
  year: number,
  pickNumber: number,
  playerName: string,
  result: ParsedGenerationResult,
): Promise<void> {
  const db = getDB();
  const existing = await db
    .select()
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year), eq(pickWriteups.pickNumber, pickNumber)))
    .limit(1);

  const values = {
    playerName,
    writeup: result.writeup,
    sources: result.sources,
    gradeLetter: result.gradeLetter,
    gradeNumeric: result.gradeNumeric,
    gradeSourceCount: result.gradeSourceCount,
    gradeBreakdown: result.gradeBreakdown,
    generatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(pickWriteups).set(values).where(eq(pickWriteups.id, existing[0].id));
  } else {
    await db.insert(pickWriteups).values({appId, year, pickNumber, ...values});
  }
}

/** Read a cached writeup. Returns null if none exists yet. */
export async function getCachedWriteup(
  appId: number,
  year: number,
  pickNumber: number,
): Promise<PickWriteupRecord | null> {
  const db = getDB();
  const [row] = await db
    .select()
    .from(pickWriteups)
    .where(and(eq(pickWriteups.appId, appId), eq(pickWriteups.year, year), eq(pickWriteups.pickNumber, pickNumber)))
    .limit(1);
  if (!row || !row.writeup) {
    return null;
  }
  return {
    pickNumber: row.pickNumber,
    playerName: row.playerName,
    writeup: row.writeup,
    sources: Array.isArray(row.sources) ? (row.sources as WriteupSource[]) : [],
    gradeLetter: row.gradeLetter,
    gradeNumeric: row.gradeNumeric,
    gradeSourceCount: row.gradeSourceCount,
    gradeBreakdown: Array.isArray(row.gradeBreakdown) ? (row.gradeBreakdown as GradeBreakdown[]) : [],
    generatedAt: row.generatedAt,
  };
}
