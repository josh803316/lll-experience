/**
 * AI draft recommendation service powered by You.com Research API.
 * Builds a research prompt with team order + available players, sends it
 * to You.com, then parses the response into a structured pick list.
 */

import {getFirstRoundTeams, getTeamNeeds, getConsensusPlayers} from '../config/draft-data.js';

const YOU_API_URL = 'https://api.you.com/v1/research';
const TOTAL_PICKS = 32;

export interface AiPick {
  pickNumber: number;
  teamName: string;
  playerName: string;
  position: string;
  reasoning?: string;
}

export interface AiRecommendResult {
  picks: AiPick[];
  summary: string;
  sources: Array<{url: string; title?: string}>;
}

function buildPrompt(year: number): string {
  const teams = getFirstRoundTeams(year);
  const needs = getTeamNeeds(year);
  const players = getConsensusPlayers(year).slice(0, 64);

  const teamLines = Array.from({length: TOTAL_PICKS}, (_, i) => {
    const num = i + 1;
    return `${num}. ${teams[num] ?? 'TBD'} — needs: ${needs[num] ?? 'N/A'}`;
  }).join('\n');

  const playerPool = players.map((p) => `${p.playerName} (${p.position}, ${p.school})`).join(', ');

  return `You are an NFL draft analyst. Your ONLY purpose is to answer questions about NFL football, the ${year} NFL Draft, draft prospect evaluations, and team draft strategy. Do NOT answer questions about any other topic. If asked about anything outside of NFL football and the draft, respond only with: "I can only help with NFL Draft research."

Based on the latest ${year} NFL mock drafts, expert big boards, combine results, team needs analysis, and recent trades, provide your recommended first-round mock draft (picks 1-32).

Here is the current ${year} first-round draft order with team needs:
${teamLines}

Here are the top prospects (but feel free to use any prospects from ${year} draft class based on your research):
${playerPool}

IMPORTANT INSTRUCTIONS:
1. Research the latest mock drafts from ESPN, NFL.com, CBS, PFF, and other analysts.
2. Consider team needs, best player available, and recent trades.
3. Each player should only be picked ONCE.
4. For EACH pick, output EXACTLY one line in this format:
   PICK|<number>|<team name>|<player name>|<position>|<one-sentence reason>
5. After all 32 picks, provide a brief 2-3 sentence summary of your mock draft themes.

Example line:
PICK|1|Las Vegas Raiders|Fernando Mendoza|QB|Raiders desperately need a franchise quarterback and Mendoza is the consensus top pick.

Output all 32 PICK lines followed by SUMMARY|<your summary text>.`;
}

function parsePicks(content: string, year: number): {picks: AiPick[]; summary: string} {
  const teams = getFirstRoundTeams(year);
  const lines = content.split('\n');
  const picks: AiPick[] = [];
  let summary = '';

  for (const line of lines) {
    const trimmed = line.replace(/^\s*[-*>]*\s*/, '').trim();

    if (trimmed.startsWith('SUMMARY|')) {
      summary = trimmed.slice('SUMMARY|'.length).trim();
      continue;
    }

    if (trimmed.startsWith('PICK|')) {
      const parts = trimmed.split('|');
      if (parts.length >= 5) {
        const pickNumber = parseInt(parts[1], 10);
        if (pickNumber >= 1 && pickNumber <= TOTAL_PICKS) {
          picks.push({
            pickNumber,
            teamName: parts[2].trim() || teams[pickNumber] || '',
            playerName: parts[3].trim(),
            position: parts[4].trim(),
            reasoning: parts[5]?.trim() || undefined,
          });
        }
      }
    }
  }

  // If structured parsing got <20 picks, try a fallback regex for numbered lines
  if (picks.length < 20) {
    const numberedPattern = /(\d{1,2})\.\s*(.+?)\s*[-–:]\s*(.+?)\s*[,(]\s*([A-Z]{1,4})/g;
    let match: RegExpExecArray | null;
    while ((match = numberedPattern.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= TOTAL_PICKS && !picks.some((p) => p.pickNumber === num)) {
        picks.push({
          pickNumber: num,
          teamName: teams[num] || match[2].trim(),
          playerName: match[3].trim(),
          position: match[4].trim(),
        });
      }
    }
  }

  return {picks: picks.sort((a, b) => a.pickNumber - b.pickNumber), summary};
}

export async function getAiRecommendation(year: number): Promise<AiRecommendResult> {
  const apiKey = process.env.YOU_API_KEY;
  if (!apiKey) {
    throw new Error('YOU_API_KEY environment variable is not set');
  }

  const prompt = buildPrompt(year);

  const res = await fetch(YOU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      input: prompt,
      research_effort: 'standard',
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`You.com API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    output?: {
      content?: string;
      sources?: Array<{url: string; title?: string; snippets?: string[]}>;
    };
  };

  const content = data.output?.content ?? '';
  const sources = (data.output?.sources ?? []).map((s) => ({url: s.url, title: s.title}));
  const {picks, summary} = parsePicks(content, year);

  return {picks, summary, sources};
}
