/**
 * AI draft chat service powered by You.com Research API.
 * Supports conversational Q&A about the NFL Draft, prospects, teams, and strategy.
 * When the AI suggests specific picks, they are parsed into structured data
 * so the UI can offer "Apply to picks" actions.
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  content: string;
  picks: AiPick[];
  sources: Array<{url: string; title?: string}>;
}

function buildDraftContext(year: number): string {
  const teams = getFirstRoundTeams(year);
  const needs = getTeamNeeds(year);
  const players = getConsensusPlayers(year).slice(0, 50);

  const teamLines = Array.from({length: TOTAL_PICKS}, (_, i) => {
    const num = i + 1;
    return `${num}. ${teams[num] ?? 'TBD'} — needs: ${needs[num] ?? 'N/A'}`;
  }).join('\n');

  const playerPool = players.map((p) => `${p.rank}. ${p.playerName} (${p.position}, ${p.school})`).join('\n');

  return `${year} NFL Draft first-round order with team needs:
${teamLines}

Top 50 prospects:
${playerPool}`;
}

export interface CurrentPick {
  pickNumber: number;
  playerName: string;
  position?: string;
  teamName?: string;
}

function buildChatPrompt(
  userMessage: string,
  history: ChatMessage[],
  year: number,
  currentPicks: CurrentPick[],
): string {
  const context = buildDraftContext(year);

  // Include recent conversation history (last 6 messages to stay within limits)
  const recentHistory = history.slice(-6);
  const historyBlock =
    recentHistory.length > 0
      ? '\n\nConversation so far:\n' +
        recentHistory.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`).join('\n') +
        '\n'
      : '';

  // Show the user's current board state
  let boardBlock: string;
  if (currentPicks.length > 0) {
    const lines = currentPicks
      .sort((a, b) => a.pickNumber - b.pickNumber)
      .map((p) => `  #${p.pickNumber} ${p.teamName ?? ''}: ${p.playerName} (${p.position ?? '?'})`)
      .join('\n');
    const filledCount = currentPicks.length;
    const emptyCount = TOTAL_PICKS - filledCount;
    boardBlock = `\n\nThe user's CURRENT mock draft board (${filledCount} of 32 picks filled, ${emptyCount} empty):
${lines}
Players already on the board should NOT be suggested again for other slots.`;
  } else {
    boardBlock = '\n\nThe user has not made any picks yet — their board is empty.';
  }

  return `You are an expert NFL Draft analyst chatbot embedded in a ${year} NFL Draft prediction game. Your ONLY purpose is to help users with NFL football topics: the ${year} NFL Draft, prospect evaluations, team needs, draft strategy, trade analysis, and mock drafts.

If the user asks about anything unrelated to NFL football or the draft, respond ONLY with: "I can only help with NFL Draft and football questions. Try asking about a prospect, team, or draft strategy!"

Here is the current draft data for reference:
${context}
${boardBlock}
${historyBlock}
The user's question: ${userMessage}

INSTRUCTIONS:
- Give a helpful, conversational answer based on the latest ${year} draft research.
- Be aware of the user's current board state. Reference their existing picks when relevant. Do NOT suggest players they have already placed on the board.
- When recommending specific picks, format each one on its own line as:
  PICK|<pick number>|<team name>|<player name>|<position>|<reasoning>
  This allows the user to apply your suggestions directly to their mock draft board.
- You don't have to suggest picks for every question — only when it's relevant.
- Keep answers concise but informative. Cite specific analysts or mock drafts when possible.`;
}

export function parsePicks(content: string, year: number): AiPick[] {
  const teams = getFirstRoundTeams(year);
  const picks: AiPick[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.replace(/^\s*[-*>]*\s*/, '').trim();
    if (!trimmed.startsWith('PICK|')) {
      continue;
    }

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

  return picks.sort((a, b) => a.pickNumber - b.pickNumber);
}

/** Strip PICK| lines from the display text so the user sees clean prose. */
export function cleanContentForDisplay(content: string): string {
  return content
    .split('\n')
    .filter(
      (line) =>
        !line
          .replace(/^\s*[-*>]*\s*/, '')
          .trim()
          .startsWith('PICK|'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function chatWithAi(
  userMessage: string,
  history: ChatMessage[],
  year: number,
  currentPicks: CurrentPick[] = [],
): Promise<AiChatResult> {
  const apiKey = process.env.YOU_API_KEY;
  if (!apiKey) {
    throw new Error('YOU_API_KEY environment variable is not set');
  }

  const prompt = buildChatPrompt(userMessage, history, year, currentPicks);

  const res = await fetch(YOU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      input: prompt,
      research_effort: 'fast',
    }),
    signal: AbortSignal.timeout(90_000),
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

  const rawContent = data.output?.content ?? '';
  const sources = (data.output?.sources ?? []).map((s) => ({url: s.url, title: s.title}));
  const picks = parsePicks(rawContent, year);
  const content = cleanContentForDisplay(rawContent);

  return {content, picks, sources};
}
