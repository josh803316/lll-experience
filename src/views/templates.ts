import { getFirstRoundTeams, getTeamNeeds } from "../config/draft-data.js";
import { PLAYER_SCOUTING_2026 } from "../config/player-scouting.js";

export interface App {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface Pick {
  id: number;
  pickNumber: number;
  teamName: string | null;
  playerName: string | null;
  position: string | null;
  doubleScorePick?: boolean;
}

export interface DraftablePlayer {
  id: number;
  rank: number;
  playerName: string;
  school: string;
  position: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function baseLayout(content: string, title = "LLL Experience", clerkPublishableKey?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏈</text></svg>">
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
  ${clerkPublishableKey ? `<script
    async
    crossorigin="anonymous"
    data-clerk-publishable-key="${clerkPublishableKey}"
    src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
    type="text/javascript"
  ></script>` : ""}
  <style>
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline-block; }
    .htmx-request.htmx-indicator { display: inline-block; }
    .htmx-added { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    #player-info-tooltip { animation: fadeTip 0.1s ease; }
    @keyframes fadeTip { from { opacity:0; transform:translateY(2px); } to { opacity:1; transform:translateY(0); } }
    .draft-player-chip {
      background-color: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 6px;
      padding: 4px 8px;
      color: #15803d;
      font-size: 0.875rem;
      font-weight: 600;
      max-width: 100%;
    }
    .draft-slot-container { position: relative; }
    .draft-slot-droppable.drag-over-empty {
      background-color: #f0fdf4;
      box-shadow: inset 0 0 0 2px #4ade80;
      border-radius: 4px;
    }
    .draft-slot-droppable.drag-over-swap {
      background-color: #fff7ed;
      box-shadow: inset 0 0 0 2px #fb923c;
      border-radius: 4px;
    }
    .draft-slot-droppable.drag-over-swap::after {
      content: '⇄';
      position: absolute;
      top: 50%;
      right: 6px;
      transform: translateY(-50%);
      font-size: 0.95rem;
      color: #ea580c;
      pointer-events: none;
    }
  </style>
  ${clerkPublishableKey ? `<script>
    window.__clerkToken = null;

    window.addEventListener('load', async () => {
      await window.Clerk?.load();
      const clerk = window.Clerk;
      if (!clerk) return;

      async function _refreshClerkToken() {
        try {
          const t = await clerk.session?.getToken();
          if (t) window.__clerkToken = t;
        } catch (_) {}
      }

      if (clerk.user) {
        await _refreshClerkToken();
      }

      // Proactively refresh token every 55s (safe for both 60s dev and 1hr prod tokens)
      setInterval(_refreshClerkToken, 55_000);

      // Inject Bearer token into all protected HTMX requests (must be synchronous)
      document.body.addEventListener('htmx:configRequest', function(evt) {
        const path = new URL(evt.detail.path, window.location.origin).pathname;
        if (path.startsWith('/draft') || path.startsWith('/apps')) {
          if (window.__clerkToken) {
            evt.detail.headers['Authorization'] = 'Bearer ' + window.__clerkToken;
          }
        }
      });
    });
  </script>` : ""}
</head>
<body class="bg-gray-50 min-h-screen">
  ${content}
</body>
</html>`;
}

export function landingPage(clerkPublishableKey?: string): string {
  const content = `
  <div class="flex flex-col items-center justify-center min-h-screen px-4">
    <div class="text-center mb-8">
      <h1 class="text-5xl font-bold text-gray-900 mb-3">LLL Experience</h1>
      <p class="text-xl text-gray-600">Your friend group's home for predictions, picks, and competition.</p>
    </div>
    <div id="sign-in-root"></div>
  </div>
  <script>
    window.addEventListener('load', async () => {
      await window.Clerk?.load();
      const clerk = window.Clerk;
      if (!clerk) return;
      if (clerk.user) {
        window.location.href = '/apps';
      } else {
        clerk.mountSignIn(document.getElementById('sign-in-root'));
      }
    });
  </script>`;
  return baseLayout(content, "LLL Experience", clerkPublishableKey);
}

export function appsPage(appList: App[], clerkPublishableKey?: string): string {
  const cards = appList.map((app) => `
    <a href="/${escapeHtml(app.slug)}"
       class="block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 p-6 transition-shadow">
      <h2 class="text-xl font-semibold text-gray-900 mb-2">${escapeHtml(app.name)}</h2>
      ${app.description ? `<p class="text-gray-500">${escapeHtml(app.description)}</p>` : ""}
      <span class="mt-4 inline-block text-blue-600 font-medium">Play →</span>
    </a>`).join("");

  const content = `
  <div class="max-w-4xl mx-auto py-12 px-4">
    <h1 class="text-3xl font-bold text-gray-900 mb-8">Choose an App</h1>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
      ${cards || '<p class="text-gray-500">No apps available yet.</p>'}
    </div>
  </div>`;
  return baseLayout(content, "Apps — LLL Experience", clerkPublishableKey);
}

const TOTAL_PICKS = 32;

/** Normalize a player name for fuzzy matching */
function normPlayerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Row color logic (draft-live only):
 *  green  (bg-green-100)  = 3 pts — exact pick
 *  yellow (bg-yellow-100) = 2 pts — ±1 slot
 *  red    (bg-red-100)    = 1 pt  — ±2 slots
 *  gray   (bg-gray-100)   = 0 pts — official pick confirmed, player not close
 *  muted  (bg-gray-50)    = waiting — official picks not yet announced for this player
 */
function computeRowStyle(
  pick: Pick | null,
  officialByPlayer: Map<string, number>,
  draftLocked: boolean
): { rowBg: string; accentBorder: string; scorePts: number | null } {
  if (!draftLocked) return { rowBg: "", accentBorder: "", scorePts: null };
  if (!pick?.playerName) return { rowBg: "bg-gray-50", accentBorder: "", scorePts: null };

  const officialSlot = officialByPlayer.get(normPlayerName(pick.playerName));
  if (officialSlot == null) return { rowBg: "bg-gray-50", accentBorder: "", scorePts: null };

  const diff = Math.abs(pick.pickNumber - officialSlot);
  const base = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
  const pts = base * (pick.doubleScorePick ? 2 : 1);

  if (diff === 0) return { rowBg: "bg-green-100", accentBorder: "border-l-4 border-green-500", scorePts: pts };
  if (diff === 1) return { rowBg: "bg-yellow-100", accentBorder: "border-l-4 border-yellow-400", scorePts: pts };
  if (diff === 2) return { rowBg: "bg-red-100",    accentBorder: "border-l-4 border-red-400",   scorePts: pts };
  return { rowBg: "bg-gray-100", accentBorder: "", scorePts: 0 };
}

function pickTableRow(
  num: number,
  teamName: string,
  teamNeeds: string,
  pick: Pick | null,
  draftLocked: boolean,
  officialPlayer: string | null,
  style: { rowBg: string; accentBorder: string; scorePts: number | null }
): string {
  const hasPlayer = pick?.playerName;
  const slotContent = draftLocked
    ? (hasPlayer ? `<div class="draft-player-chip flex items-center gap-1 draft-chip-readonly" data-player-name="${escapeHtml(pick!.playerName!)}" data-position="${escapeHtml(pick!.position || "")}"><span class="chip-name">${escapeHtml(pick!.playerName!)}</span>${pick!.position ? ` <span class="text-xs opacity-70">${escapeHtml(pick!.position)}</span>` : ""}</div>` : "<span class=\"text-gray-400 italic\">—</span>")
    : (hasPlayer
      ? `<div class="draft-player-chip flex items-center gap-1" data-player-name="${escapeHtml(pick!.playerName!)}" data-position="${escapeHtml(pick!.position || "")}"><span class="chip-name">${escapeHtml(pick!.playerName!)}</span>${pick!.position ? ` <span class="chip-pos text-xs opacity-70">${escapeHtml(pick!.position)}</span>` : ""} <button type="button" class="draft-clear-slot ml-1 opacity-40 hover:opacity-100" title="Clear">×</button></div>`
      : `<span class="lg:hidden text-xs text-gray-300 italic pointer-events-none select-none">tap to assign</span>`);

  // Score badge: +N shown in number cell when we have a confirmed score
  const scoreBadge = (style.scorePts != null && style.scorePts > 0)
    ? ` <span class="block text-[10px] font-bold leading-none mt-0.5 ${
        style.scorePts >= 6 ? "text-green-700" :
        style.scorePts >= 3 ? "text-green-600" :
        style.scorePts >= 2 ? "text-yellow-600" : "text-red-500"
      }">+${style.scorePts}</span>`
    : "";

  // Mute text in confirmed-zero rows
  const teamTextClass = style.rowBg === "bg-gray-100" ? "text-gray-400" : "text-gray-900";
  const numTextClass  = style.rowBg === "bg-gray-100" ? "text-gray-400" : "text-gray-600";

  const numCell = `<td class="px-3 py-2 border-b border-gray-200 font-medium w-10 align-top ${numTextClass} ${style.accentBorder}">${num}${scoreBadge}</td>`;
  const teamCell = `<td class="px-3 py-2 border-b border-gray-200 align-top ${teamTextClass}">
    <div>${escapeHtml(teamName)}</div>
    ${teamNeeds ? `<div class="hidden lg:block text-xs text-gray-500 mt-0.5" title="Team needs (source: Underdog Network)">${escapeHtml(teamNeeds)}</div>` : ""}
  </td>`;
  const pickCell = `<td class="px-3 py-2 border-b border-gray-200 align-top">
    <div class="draft-slot-container min-h-[2.5rem] ${!draftLocked ? "draft-slot-droppable" : ""}" data-pick-number="${num}" data-team-name="${escapeHtml(teamName)}">${slotContent}</div>
  </td>`;
  const officialCell = `<td class="px-3 py-2 border-b border-gray-200 align-top">
    ${officialPlayer
      ? `<span class="font-medium ${style.rowBg === "bg-gray-100" ? "text-gray-400" : "text-blue-800"}">${escapeHtml(officialPlayer)}</span>`
      : `<span class="text-gray-300 text-sm">–</span>`}
  </td>`;
  const doubleCell = draftLocked
    ? `<td class="px-3 py-2 border-b border-gray-200 text-center align-top">${pick?.doubleScorePick ? "✓" : ""}</td>`
    : num <= 10
      ? `<td class="px-3 py-2 border-b border-gray-200 text-center align-top"><span class="inline-block w-4 h-4 rounded border border-gray-200 bg-gray-100" title="Double score available from pick 11 onwards"></span></td>`
      : `<td class="px-3 py-2 border-b border-gray-200 text-center align-top"><input type="checkbox" class="draft-double-score rounded border-gray-300 cursor-pointer" data-pick-number="${num}" ${pick?.doubleScorePick ? "checked" : ""} title="Select as your double score pick" /></td>`;

  return `<tr class="draft-pick-row ${style.rowBg}" data-pick-number="${num}">${numCell}${teamCell}${pickCell}${officialCell}${doubleCell}</tr>`;
}

export function picksTableFragment(
  picks: Pick[],
  draftLocked = false,
  year = 2026,
  officialPicks?: Map<number, { playerName: string | null }>
): string {
  const teams = getFirstRoundTeams(year);
  const needs = getTeamNeeds(year);
  const pickMap = new Map(picks.map((p) => [p.pickNumber, p]));

  // Reverse map: normalized player name → official pick number (for score calc)
  const officialByPlayer = new Map<string, number>();
  if (officialPicks) {
    officialPicks.forEach(({ playerName }, pickNum) => {
      if (playerName) officialByPlayer.set(normPlayerName(playerName), pickNum);
    });
  }

  const rows = Array.from({ length: TOTAL_PICKS }, (_, i) => {
    const num = i + 1;
    const teamName = teams[num] ?? `Pick ${num}`;
    const teamNeeds = needs[num] ?? "";
    const userPick = pickMap.get(num) ?? null;
    const officialPlayer = officialPicks?.get(num)?.playerName ?? null;
    const style = computeRowStyle(userPick, officialByPlayer, draftLocked);
    return pickTableRow(num, teamName, teamNeeds, userPick, draftLocked, officialPlayer, style);
  }).join("");

  // Add HTMX polling when draft is live so official picks update in real-time
  const pollingAttrs = draftLocked
    ? `hx-get="/draft/${year}/picks" hx-trigger="every 20s" hx-swap="outerHTML"`
    : "";

  const legend = draftLocked
    ? `<div class="flex flex-wrap gap-3 text-xs text-gray-600 mb-2 px-1">
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-green-400"></span> Exact (+3 pts)</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-yellow-300"></span> ±1 slot (+2 pts)</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-red-300"></span> ±2 slots (+1 pt)</span>
        <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-gray-300"></span> No score / pending</span>
      </div>`
    : "";

  return `<div id="picks-table-wrapper" ${pollingAttrs}>
  ${legend}
  <table class="w-full border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
    <thead><tr class="bg-red-600 text-white">
      <th class="px-3 py-2 text-left font-semibold">#</th>
      <th class="px-3 py-2 text-left font-semibold">Team</th>
      <th class="px-3 py-2 text-left font-semibold">${draftLocked ? "YOUR PICK" : "PICK"}</th>
      <th class="px-3 py-2 text-left font-semibold">OFFICIAL PICK</th>
      <th class="px-3 py-2 text-center font-semibold w-12 lg:w-auto"><span class="hidden lg:inline">DOUBLE SCORE PICK</span><span class="lg:hidden">2×</span></th>
    </tr></thead>
    <tbody id="picks-table-body">${rows}</tbody>
  </table>
</div>`;
}

export function draftablePlayersFragment(
  players: DraftablePlayer[],
  positionFilter: string,
  source = "all"
): string {
  const filtered = positionFilter === "OVR" ? players : players.filter((p) => p.position === positionFilter);
  const items = filtered
    .map(
      (p) =>
        `<div class="draftable-player-chip border-b border-gray-100 px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing hover:bg-gray-50 bg-white" data-player-name="${escapeHtml(p.playerName)}" data-position="${escapeHtml(p.position)}" data-school="${escapeHtml(p.school)}" data-rank="${p.rank}">
  <span class="text-gray-500 font-medium w-6">${p.rank}</span>
  <span class="font-medium text-gray-900 flex-1 truncate">${escapeHtml(p.playerName)}</span>
  <span class="text-gray-600 text-sm truncate">${escapeHtml(p.school)}</span>
  <span class="text-gray-600 text-sm">${escapeHtml(p.position)}</span>
  <button type="button" class="player-info-btn lg:hidden shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 active:bg-blue-100 active:text-blue-600" title="Player info" aria-label="Player info"><svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01"/></svg></button>
</div>`
    )
    .join("");

  const sources = [
    { key: "all",  label: "All",  url: "https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026" },
    { key: "avg",  label: "Avg",  url: "https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026" },
    { key: "cbs",  label: "CBS",  url: "https://www.cbssports.com/nfl/draft/prospect-rankings/" },
    { key: "pff",  label: "PFF",  url: "https://www.pff.com/news/draft-2026-nfl-draft-big-board" },
    { key: "espn", label: "ESPN", url: "https://www.espn.com/nfl/draft/bestavailable" },
    { key: "nfl",  label: "NFL",  url: "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-1-0" },
    { key: "fox",  label: "Fox",  url: "https://www.foxsports.com/articles/nfl/2026-nfl-draft-big-board-top-prospects-rankings" },
  ];
  const activeSource = sources.find((s) => s.key === source) ?? sources[0];

  return `<div id="draftable-players-panel" class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden" data-source="${escapeHtml(source)}" data-position="${escapeHtml(positionFilter)}">
  <div class="flex items-center gap-2 px-2 pt-2 pb-1 border-b border-gray-200 bg-gray-50 flex-wrap">
    <span class="text-xs text-gray-500 shrink-0">Rankings:</span>
    ${sources.map((s) => `<button type="button" class="draft-source-filter px-2 py-0.5 rounded text-xs font-semibold ${s.key === source ? "bg-red-600 text-white" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-100"}" data-source="${s.key}">${s.label}</button>`).join("")}
    <div class="ml-auto flex items-center gap-1">
      <a href="${escapeHtml(activeSource.url)}" target="_blank" rel="noopener" title="Open ${escapeHtml(activeSource.label)} rankings in a new tab" class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-white text-blue-600 border border-gray-300 hover:bg-blue-50 hover:border-blue-300 transition-colors">
        Source
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>
      <button type="button" id="refresh-players-btn" title="Refresh player list" class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-white text-gray-500 border border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors">
        <svg id="refresh-icon" xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        Refresh
      </button>
    </div>
  </div>
  <div class="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
    <button type="button" class="draft-pos-filter px-2 py-1 rounded text-sm font-medium ${positionFilter === "OVR" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300"}" data-pos="OVR">OVR</button>
    ${["QB", "RB", "WR", "TE", "OT", "OG", "C", "IOL", "DT", "EDGE", "LB", "CB", "S"].map(
      (pos) => `<button type="button" class="draft-pos-filter px-2 py-1 rounded text-sm font-medium ${positionFilter === pos ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300"}" data-pos="${pos}">${pos}</button>`
    ).join("")}
  </div>
  <div class="overflow-auto max-h-[70vh]" id="draftable-players-list">${items}</div>
</div>`;
}

export function draftLayout(picks: Pick[], draftable: DraftablePlayer[], draftStarted: boolean, year: number, availableYears: number[], clerkPublishableKey?: string, isAdmin = false): string {
  const draftLocked = draftStarted;
  const saveSection = (id: string) =>
    draftLocked
      ? ""
      : `<button type="button" id="${id}" class="draft-save-picks w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors">Set Your Picks</button>`;

  const teamsJson = JSON.stringify(getFirstRoundTeams(year));
  const yearSelector =
    availableYears.length <= 1
      ? ""
      : `<div class="flex items-center gap-2 mb-4"><span class="text-slate-400 text-sm">Year:</span><div class="flex gap-1">${availableYears
          .map(
            (y) =>
              `<a href="/draft/${y}" class="px-3 py-1 rounded text-sm font-medium ${y === year ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}">${y}</a>`
          )
          .join("")}</div></div>`;

  // 2026 NFL Draft Round 1: Thursday April 23, 2026 8:00 PM ET (= 00:00 UTC April 24)
  const DRAFT_START_ISO: Record<number, string> = {
    2026: "2026-04-24T00:00:00Z",
  };
  const draftStartIso = DRAFT_START_ISO[year] ?? null;

  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100" data-draft-year="${year}">
    ${draftTopBar(year, "picks", isAdmin)}
    <div class="max-w-7xl mx-auto py-6 px-4">
      ${yearSelector}

      ${!draftLocked && draftStartIso ? `
      <!-- Countdown clock -->
      <div id="draft-countdown-banner" class="mb-4 bg-slate-700 border border-slate-600 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">2026 NFL Draft — Round 1 begins</p>
          <div id="draft-countdown" class="flex items-baseline gap-3 text-white">
            <span class="text-2xl font-bold tabular-nums" id="cd-days">--</span><span class="text-sm text-slate-400">days</span>
            <span class="text-2xl font-bold tabular-nums" id="cd-hours">--</span><span class="text-sm text-slate-400">hrs</span>
            <span class="text-2xl font-bold tabular-nums" id="cd-mins">--</span><span class="text-sm text-slate-400">min</span>
            <span class="text-2xl font-bold tabular-nums" id="cd-secs">--</span><span class="text-sm text-slate-400">sec</span>
          </div>
        </div>
        <div class="text-xs text-slate-400 sm:text-right">
          <div class="font-medium text-slate-300">Thu Apr 23 · 8 PM ET</div>
          <div>Pittsburgh, PA</div>
        </div>
      </div>` : ""}

      <!-- Desktop-only top save button -->
      ${saveSection("save-picks-top") ? `<div class="hidden lg:block mb-4">${saveSection("save-picks-top")}<p class="text-xs text-gray-500 mt-1">You can save anytime. Only entries with all 32 picks filled appear on the leaderboard.</p></div>` : ""}

      <!-- Mobile tab bar -->
      <div class="lg:hidden flex rounded-lg overflow-hidden border border-slate-600 mb-3" id="mobile-tab-bar">
        <button type="button" id="tab-btn-picks" class="flex-1 py-2.5 text-sm font-semibold bg-slate-600 text-white">📋 My Picks</button>
        <button type="button" id="tab-btn-players" class="flex-1 py-2.5 text-sm font-semibold bg-slate-700 text-slate-400">👥 Players</button>
      </div>

      <!-- Mobile save button -->
      ${saveSection("save-picks-mobile") ? `<div class="lg:hidden mb-3">${saveSection("save-picks-mobile")}<p class="text-xs text-gray-500 mt-1">Fill all 32 picks to appear on the leaderboard.</p></div>` : ""}

      <!-- Main grid: 3-col on desktop, tab-controlled on mobile -->
      <div class="lg:grid lg:grid-cols-3 lg:gap-6">

        <!-- Picks panel (shown by default on mobile) -->
        <div id="panel-picks" class="lg:col-span-2 mb-6 lg:mb-0">
          <!-- Selected player banner (mobile only, initially hidden) -->
          <div id="mobile-selected-banner" class="hidden mb-3 bg-blue-600 text-white px-3 py-2.5 rounded-lg items-center gap-2">
            <span class="flex-1 text-sm font-medium truncate min-w-0">Tap a slot for: <span id="mobile-selected-name" class="font-bold"></span></span>
            <button type="button" id="mobile-clear-selection" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-700 hover:bg-blue-500 text-white text-base">✕</button>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
            <h2 class="text-lg font-bold text-gray-900 px-4 py-3 border-b border-gray-200 bg-gray-50">First round — your picks</h2>
            <p class="text-xs text-gray-500 px-4 pb-1">Scoring: 3 pts exact, 2 pts ±1 spot, 1 pt ±2 spots. Double-score doubles that slot. Team needs from <a href="https://underdognetwork.com/football/news/2026-nfl-team-needs" target="_blank" rel="noopener" class="text-blue-600 hover:underline">Underdog Network</a>. Rankings: <a href="https://www.cbssports.com/nfl/draft/prospect-rankings/" target="_blank" rel="noopener" class="text-blue-600 hover:underline">CBS</a> · <a href="https://www.pff.com/news/draft-2026-nfl-draft-big-board" target="_blank" rel="noopener" class="text-blue-600 hover:underline">PFF</a> · <a href="https://www.espn.com/nfl/draft/bestavailable" target="_blank" rel="noopener" class="text-blue-600 hover:underline">ESPN</a> · <a href="https://www.nfl.com/draft/tracker/prospects" target="_blank" rel="noopener" class="text-blue-600 hover:underline">NFL.com</a></p>
            <div class="p-4 overflow-x-auto">
              <div
                hx-get="/draft/${year}/picks"
                hx-trigger="load"
                hx-swap="outerHTML"
              >
                <div class="text-gray-500 py-8 text-center">Loading picks…</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Players panel (hidden by default on mobile, sticky on desktop) -->
        <div id="panel-players" class="hidden lg:block lg:sticky lg:top-4 lg:self-start">
          <div class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
            <h2 class="text-lg font-bold text-gray-900 px-4 py-3 border-b border-gray-200 bg-gray-50">Available players</h2>
            <p class="text-xs text-gray-500 px-4 pb-1">Switch between CBS, PFF, ESPN, NFL.com, and Fox Sports rankings to compare. Hit Refresh to reload the latest data.</p>
            <div class="p-4">
              <div
                hx-get="/draft/${year}/players?source=all"
                hx-trigger="load"
                hx-swap="outerHTML"
              >
                <div class="text-gray-500 py-8 text-center">Loading players…</div>
              </div>
            </div>
          </div>
          <div class="mt-4 space-y-2">
            <a href="/draft/${year}/leaderboard" class="block w-full py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg text-center transition-colors">Submitted Mocks</a>
            <a href="/draft/${year}/submitted" class="block w-full py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg text-center transition-colors">Expert Picks</a>
            <a href="/draft/${year}/results" class="block w-full py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg text-center transition-colors">Results</a>
          </div>
        </div>

      </div>

      <!-- Desktop-only bottom save button -->
      ${saveSection("save-picks-bottom") ? `<div class="hidden lg:block mt-6">${saveSection("save-picks-bottom")}<p class="text-xs text-gray-500 mt-1">You can save anytime. Only entries with all 32 picks filled appear on the leaderboard.</p></div>` : ""}
    </div>
  </div>

  <!-- Player info tooltip (desktop hover) -->
  <div id="player-info-tooltip" role="tooltip"
    class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-72 text-sm overflow-hidden"
    style="display:none;position:fixed;z-index:9999;pointer-events:none;"></div>

  <!-- Player info modal (mobile ⓘ tap) -->
  <div id="player-info-modal"
    class="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/50 p-4"
    style="display:none;">
    <div id="player-info-modal-inner" class="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"></div>
  </div>

  <script>
// ---- COUNTDOWN CLOCK ----
(function() {
  const target = ${draftStartIso ? `new Date(${JSON.stringify(draftStartIso)})` : "null"};
  if (!target) return;
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      const banner = document.getElementById('draft-countdown-banner');
      if (banner) banner.remove();
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2, '0'); };
    set('cd-days', d); set('cd-hours', h); set('cd-mins', m); set('cd-secs', s);
  }
  tick();
  setInterval(tick, 1000);
})();

(function() {
  const TOTAL_PICKS = 32;
  const DRAFT_YEAR = ${year};
  const TEAMS = ${teamsJson};
  let draftState = ${JSON.stringify(
    Array.from({ length: TOTAL_PICKS }, (_, i) => {
      const num = i + 1;
      const p = picks.find((x: Pick) => x.pickNumber === num);
      const teamName = getFirstRoundTeams(year)[num] ?? null;
      return p ? { pickNumber: num, playerName: p.playerName, position: p.position || null, teamName: p.teamName || teamName, doubleScorePick: !!p.doubleScorePick } : { pickNumber: num, playerName: null, position: null, teamName, doubleScorePick: false };
    })
  )};

  // ---- UTILITY ----
  function isMobile() { return window.innerWidth < 1024; }

  function getState() {
    const body = document.getElementById('picks-table-body');
    if (!body) return draftState;
    const rows = body.querySelectorAll('.draft-pick-row');
    const state = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const num = parseInt(r.dataset.pickNumber, 10);
      const doubleEl = r.querySelector('.draft-double-score');
      const doubleScorePick = doubleEl ? doubleEl.checked : (draftState[num - 1] && draftState[num - 1].doubleScorePick);
      const slot = r.querySelector('.draft-slot-container');
      const chip = slot ? slot.querySelector('.draft-player-chip, .draftable-player-chip') : null;
      const playerName = chip ? (chip.getAttribute('data-player-name') || (chip.querySelector('.chip-name')?.textContent?.trim()) || null) : null;
      const position = chip ? (chip.getAttribute('data-position') || (chip.querySelector('.chip-pos')?.textContent?.trim()) || null) : null;
      state.push({
        pickNumber: num,
        playerName: playerName || null,
        position: position || null,
        teamName: TEAMS[num] || null,
        doubleScorePick: !!doubleScorePick
      });
    }
    return state.length ? state : draftState;
  }

  let slotSortables = [];

  function getUsedPlayerNames() {
    const names = new Set();
    document.querySelectorAll('#picks-table-body .draft-slot-container .draft-player-chip, #picks-table-body .draft-slot-container .draftable-player-chip').forEach(function(el) {
      const name = el.getAttribute('data-player-name');
      if (name) names.add(name);
    });
    return names;
  }

  function markUsedPlayers() {
    const used = getUsedPlayerNames();
    document.querySelectorAll('#draftable-players-list .draftable-player-chip').forEach(function(chip) {
      const name = chip.getAttribute('data-player-name');
      if (used.has(name)) {
        chip.classList.add('in-use', 'opacity-50', 'text-gray-400', 'cursor-not-allowed');
        chip.classList.remove('hover:bg-gray-50', 'cursor-grab', 'active:cursor-grabbing', 'active:bg-blue-50');
      } else {
        chip.classList.remove('in-use', 'opacity-50', 'text-gray-400', 'cursor-not-allowed');
        chip.classList.add('hover:bg-gray-50', 'cursor-grab', 'active:cursor-grabbing');
      }
    });
  }

  // ---- DESKTOP: SORTABLE DRAG-AND-DROP ----
  function clearDragHighlights() {
    document.querySelectorAll('.drag-over-swap, .drag-over-empty').forEach(function(el) {
      el.classList.remove('drag-over-swap', 'drag-over-empty');
    });
  }

  function initSlotsSortable() {
    slotSortables.forEach(function(s) { if (s && s.destroy) s.destroy(); });
    slotSortables = [];
    const slots = document.querySelectorAll('#picks-table-body .draft-slot-container.draft-slot-droppable');
    slots.forEach(function(slotEl) {
      const pickNum = slotEl.getAttribute('data-pick-number');

      // Drag-over swap/empty indicator
      slotEl.addEventListener('dragenter', function(e) {
        e.preventDefault();
        const hasChip = !!slotEl.querySelector('.draft-player-chip');
        slotEl.classList.toggle('drag-over-swap', hasChip);
        slotEl.classList.toggle('drag-over-empty', !hasChip);
      });
      slotEl.addEventListener('dragleave', function(e) {
        if (!slotEl.contains(e.relatedTarget)) {
          slotEl.classList.remove('drag-over-swap', 'drag-over-empty');
        }
      });
      slotEl.addEventListener('drop', function() {
        slotEl.classList.remove('drag-over-swap', 'drag-over-empty');
      });

      if (typeof Sortable !== 'undefined') {
        const sortable = Sortable.create(slotEl, {
          group: { name: 'draft', put: true, pull: true },
          sort: false,
          onAdd: function(evt) {
            slotEl.classList.remove('drag-over-swap', 'drag-over-empty');
            const item = evt.item;
            while (slotEl.children.length > 1) slotEl.removeChild(slotEl.firstChild);
            item.setAttribute('data-pick-number', pickNum || '');
            item.classList.add('draft-player-chip');
            item.classList.remove('cursor-grab', 'active:cursor-grabbing', 'hover:bg-gray-50', 'border-b', 'border-gray-100');
            if (!item.querySelector('.draft-clear-slot')) {
              const clearBtn = document.createElement('button');
              clearBtn.type = 'button';
              clearBtn.className = 'draft-clear-slot ml-1 opacity-40 hover:opacity-100';
              clearBtn.title = 'Clear';
              clearBtn.textContent = '×';
              item.appendChild(clearBtn);
            }
            markUsedPlayers();
          },
          onRemove: function() { markUsedPlayers(); }
        });
        slotSortables.push(sortable);
      }
    });
    markUsedPlayers();
  }

  // Clean up any stray highlights if drag is cancelled
  document.addEventListener('dragend', clearDragHighlights);

  function initPlayersSortable() {
    const list = document.getElementById('draftable-players-list');
    if (!list || list._sortable) return;
    if (typeof Sortable !== 'undefined') {
      list._sortable = Sortable.create(list, {
        group: { name: 'draft', pull: 'clone', put: false },
        sort: false,
        filter: '.in-use'
      });
    }
    markUsedPlayers();
  }

  // ---- MOBILE: TAP INTERACTION ----
  var mobileSelectedPlayer = null;

  function setMobileSelected(player) {
    mobileSelectedPlayer = player;
    var banner = document.getElementById('mobile-selected-banner');
    var nameEl = document.getElementById('mobile-selected-name');
    if (!banner) return;
    if (player) {
      if (nameEl) nameEl.textContent = player.playerName + (player.position ? ' (' + player.position + ')' : '');
      banner.classList.remove('hidden');
      banner.classList.add('flex');
    } else {
      banner.classList.add('hidden');
      banner.classList.remove('flex');
      if (nameEl) nameEl.textContent = '';
      // Clear selection highlight in player list
      document.querySelectorAll('#draftable-players-list .mobile-selected').forEach(function(el) {
        el.classList.remove('mobile-selected', 'bg-blue-50', 'border-l-2', 'border-blue-500');
      });
    }
  }

  function initMobileSlots() {
    // Ensure slot containers have minimum height as a visual target
    document.querySelectorAll('#picks-table-body .draft-slot-container.draft-slot-droppable').forEach(function(slotEl) {
      slotEl.style.minHeight = '3rem';
    });
    // Attach click to the entire row so any tap on the row registers
    document.querySelectorAll('#picks-table-body .draft-pick-row').forEach(function(rowEl) {
      rowEl.onclick = function(e) {
        if (e.target && (e.target.classList.contains('draft-clear-slot') || (e.target.closest && e.target.closest('.draft-clear-slot')))) return;
        if (e.target && (e.target.type === 'checkbox' || (e.target.closest && e.target.closest('input[type="checkbox"]')))) return;
        var slotEl = rowEl.querySelector('.draft-slot-container.draft-slot-droppable');
        if (!slotEl) return;
        if (!mobileSelectedPlayer) {
          if (!slotEl.querySelector('.draft-player-chip')) switchTab('players');
          return;
        }
        var pickNum = slotEl.getAttribute('data-pick-number');
        while (slotEl.firstChild) slotEl.removeChild(slotEl.firstChild);
        var chip = document.createElement('div');
        chip.className = 'draft-player-chip flex items-center gap-1';
        chip.setAttribute('data-player-name', mobileSelectedPlayer.playerName);
        chip.setAttribute('data-position', mobileSelectedPlayer.position || '');
        chip.setAttribute('data-pick-number', pickNum || '');
        var nameSpan = document.createElement('span');
        nameSpan.className = 'chip-name';
        nameSpan.textContent = mobileSelectedPlayer.playerName;
        chip.appendChild(nameSpan);
        if (mobileSelectedPlayer.position) {
          var posSpan = document.createElement('span');
          posSpan.className = 'chip-pos text-xs opacity-70';
          posSpan.textContent = mobileSelectedPlayer.position;
          chip.appendChild(posSpan);
        }
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'draft-clear-slot ml-1 opacity-40 hover:opacity-100 text-base leading-none';
        clearBtn.title = 'Clear';
        clearBtn.textContent = '×';
        chip.appendChild(clearBtn);
        slotEl.appendChild(chip);
        setMobileSelected(null);
        markUsedPlayers();
      };
    });
    markUsedPlayers();
  }

  function initMobilePlayerTaps() {
    document.querySelectorAll('#draftable-players-list .draftable-player-chip').forEach(function(chip) {
      chip.onclick = function(e) {
        if (e.target && e.target.closest && e.target.closest('.player-info-btn')) return;
        if (chip.classList.contains('in-use')) return;
        // Highlight selected chip
        document.querySelectorAll('#draftable-players-list .mobile-selected').forEach(function(el) {
          el.classList.remove('mobile-selected', 'bg-blue-50', 'border-l-2', 'border-blue-500');
        });
        chip.classList.add('mobile-selected', 'bg-blue-50', 'border-l-2', 'border-blue-500');
        setMobileSelected({
          playerName: chip.getAttribute('data-player-name') || '',
          position: chip.getAttribute('data-position') || '',
          school: chip.getAttribute('data-school') || ''
        });
        switchTab('picks');
      };
    });
    markUsedPlayers();
  }

  // ---- MOBILE: TAB SWITCHING ----
  function switchTab(tab) {
    var picksPanel = document.getElementById('panel-picks');
    var playersPanel = document.getElementById('panel-players');
    var tabPicks = document.getElementById('tab-btn-picks');
    var tabPlayers = document.getElementById('tab-btn-players');
    if (!picksPanel || !playersPanel) return;
    if (tab === 'picks') {
      picksPanel.classList.remove('hidden');
      playersPanel.classList.add('hidden');
      if (tabPicks)   { tabPicks.classList.add('bg-slate-600','text-white'); tabPicks.classList.remove('bg-slate-700','text-slate-400'); }
      if (tabPlayers) { tabPlayers.classList.remove('bg-slate-600','text-white'); tabPlayers.classList.add('bg-slate-700','text-slate-400'); }
    } else {
      picksPanel.classList.add('hidden');
      playersPanel.classList.remove('hidden');
      if (tabPlayers) { tabPlayers.classList.add('bg-slate-600','text-white'); tabPlayers.classList.remove('bg-slate-700','text-slate-400'); }
      if (tabPicks)   { tabPicks.classList.remove('bg-slate-600','text-white'); tabPicks.classList.add('bg-slate-700','text-slate-400'); }
    }
  }

  // ---- DOUBLE SCORE: one pick only, pick 11+ only ----
  function initDoubleScoreLogic() {
    var cbs = document.querySelectorAll('.draft-double-score');
    // Enforce: if any is already checked, disable all others
    var checkedCb = null;
    cbs.forEach(function(cb) { if (cb.checked) checkedCb = cb; });
    if (checkedCb) {
      cbs.forEach(function(cb) {
        if (cb !== checkedCb) cb.disabled = true;
      });
    }
    // Attach change handler for mutual exclusion
    cbs.forEach(function(cb) {
      cb.onchange = function() {
        var allCbs = document.querySelectorAll('.draft-double-score');
        if (cb.checked) {
          allCbs.forEach(function(other) {
            if (other !== cb) {
              other.checked = false;
              other.disabled = true;
            }
          });
        } else {
          allCbs.forEach(function(other) { other.disabled = false; });
        }
      };
    });
  }

  // ---- HTMX SWAP HANDLER ----
  document.addEventListener('htmx:afterSwap', function(evt) {
    const t = evt.detail?.target;
    const picksJustSwapped = t && (t.id === 'picks-table-wrapper' || (t.querySelector && t.querySelector('#picks-table-body')));
    const wrapperPresent = document.getElementById('picks-table-wrapper');
    if (picksJustSwapped || (wrapperPresent && slotSortables.length === 0)) {
      if (isMobile()) {
        initMobileSlots();
      } else {
        initSlotsSortable();
      }
      initDoubleScoreLogic();
      document.getElementById('picks-table-body')?.querySelectorAll('.draft-clear-slot').forEach(function(btn) {
        btn.onclick = function() {
          const slot = this.closest('.draft-slot-container');
          if (slot) { while (slot.firstChild) slot.removeChild(slot.firstChild); markUsedPlayers(); }
        };
      });
    }
    const playersPanel = document.getElementById('draftable-players-panel');
    if (playersPanel || (t && (t.id === 'draftable-players-panel' || t.querySelector?.('#draftable-players-list')))) {
      const list = document.getElementById('draftable-players-list');
      if (list && list._sortable) { list._sortable.destroy(); list._sortable = null; }
      if (isMobile()) {
        initMobilePlayerTaps();
      } else {
        initPlayersSortable();
      }

      function getCurrentSource() {
        return document.getElementById('draftable-players-panel')?.dataset?.source || 'all';
      }
      function getCurrentPos() {
        return document.getElementById('draftable-players-panel')?.dataset?.position || 'OVR';
      }
      function loadPlayers(pos, src) {
        htmx.ajax('GET', '/draft/' + DRAFT_YEAR + '/players?position=' + encodeURIComponent(pos) + '&source=' + encodeURIComponent(src), { target: '#draftable-players-panel', swap: 'outerHTML' });
      }

      document.querySelectorAll('.draft-pos-filter').forEach(function(btn) {
        btn.onclick = function() { loadPlayers(this.dataset.pos, getCurrentSource()); };
      });
      document.querySelectorAll('.draft-source-filter').forEach(function(btn) {
        btn.onclick = function() { loadPlayers(getCurrentPos(), this.dataset.source); };
      });

      var refreshBtn = document.getElementById('refresh-players-btn');
      if (refreshBtn) {
        refreshBtn.onclick = function() {
          var icon = document.getElementById('refresh-icon');
          if (icon) icon.style.animation = 'spin 0.8s linear infinite';
          loadPlayers(getCurrentPos(), getCurrentSource());
        };
      }
    }
  });

  // ---- SAVE HELPERS ----
  function _setSaveState(btn, state, msg) {
    if (!btn) return;
    const originalText = btn.dataset.originalText || btn.textContent;
    btn.dataset.originalText = originalText;
    if (state === 'loading') {
      btn.disabled = true;
      btn.textContent = '⟳ Saving…';
    } else if (state === 'success') {
      btn.disabled = false;
      btn.textContent = '✓ Saved!';
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    } else if (state === 'error') {
      btn.disabled = false;
      btn.textContent = originalText;
      // Show inline error next to the button
      const old = btn.parentElement?.querySelector('.save-error-msg');
      if (old) old.remove();
      const errEl = document.createElement('p');
      errEl.className = 'save-error-msg text-xs text-red-600 mt-1';
      errEl.textContent = msg || 'Save failed. Please try again.';
      btn.parentElement?.appendChild(errEl);
      setTimeout(() => errEl.remove(), 6000);
    } else {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // ---- GLOBAL CLICK DELEGATION ----
  document.addEventListener('click', async function(e) {
    const target = e.target;
    if (target && (target.classList?.contains('draft-save-picks') || target.id === 'save-picks-top' || target.id === 'save-picks-bottom' || target.id === 'save-picks-mobile')) {
      e.preventDefault();
      _setSaveState(target, 'loading');

      // Force-refresh token before each save
      if (window.Clerk?.session) {
        try {
          window.__clerkToken = await window.Clerk.session.getToken();
        } catch (_) {
          _setSaveState(target, 'error', 'Session error — please reload the page.');
          return;
        }
      }

      const state = getState();
      const body = 'picks=' + encodeURIComponent(JSON.stringify(state));
      const doFetch = (tok) => fetch('/draft/' + DRAFT_YEAR + '/picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(tok ? { 'Authorization': 'Bearer ' + tok } : {})
        },
        body
      });

      let resp = await doFetch(window.__clerkToken);

      // Auto-retry once on 401 with a fresh token
      if (resp.status === 401 && window.Clerk?.session) {
        try {
          window.__clerkToken = await window.Clerk.session.getToken({ skipCache: true });
          resp = await doFetch(window.__clerkToken);
        } catch (_) {
          _setSaveState(target, 'error', 'Session expired — please reload the page.');
          return;
        }
      }

      if (!resp.ok) {
        const msg = resp.status === 401
          ? 'Session expired — please reload the page.'
          : 'Error ' + resp.status + ' — please try again.';
        _setSaveState(target, 'error', msg);
        return;
      }

      const html = await resp.text();
      const wrapper = document.getElementById('picks-table-wrapper');
      if (wrapper) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const newEl = tmp.firstElementChild;
        if (newEl) {
          wrapper.replaceWith(newEl);
          initSlotsSortable();
          initMobileSlots();
          markUsedPlayers();
        }
      }
      _setSaveState(target, 'success');
    }
    if (target?.classList?.contains('draft-clear-slot')) {
      const slot = target.closest('.draft-slot-container');
      if (slot) { while (slot.firstChild) slot.removeChild(slot.firstChild); markUsedPlayers(); }
    }
  });

  // ---- MOBILE TAB & BANNER SETUP ----
  document.getElementById('tab-btn-picks')?.addEventListener('click', function() { switchTab('picks'); });
  document.getElementById('tab-btn-players')?.addEventListener('click', function() { switchTab('players'); });
  document.getElementById('mobile-clear-selection')?.addEventListener('click', function() { setMobileSelected(null); });
})();

// ---- PLAYER INFO TOOLTIP & MODAL ----
(function() {
  var PLAYER_DATA = ${JSON.stringify(
    draftable.reduce((acc: Record<string, {rank: number; school: string; position: string}>, p) => {
      acc[p.playerName.toLowerCase().trim()] = { rank: p.rank, school: p.school, position: p.position };
      return acc;
    }, {})
  )};
  var SCOUTING = ${JSON.stringify(PLAYER_SCOUTING_2026)};
  var TEAM_NEEDS_MAP = ${JSON.stringify(getTeamNeeds(year))};
  var TEAMS_MAP = ${teamsJson};

  // Expands a position abbreviation to aliases that may appear in team needs strings
  var POS_EXPAND = {
    'OT':  ['OT','LT','RT'],
    'OG':  ['OG','LG','RG','IOL'],
    'IOL': ['IOL','OG','LG','RG','C'],
    'C':   ['C','IOL'],
    'S':   ['S','FS','SS'],
    'CB':  ['CB','Slot CB'],
    'WR':  ['WR','X WR','Slot WR'],
  };

  // Position → badge colour (Tailwind bg class)
  var POS_COLOR = {
    QB:'bg-red-600', RB:'bg-orange-500', WR:'bg-yellow-500 text-gray-900', TE:'bg-purple-600',
    OT:'bg-blue-600', OG:'bg-blue-500', IOL:'bg-blue-500', C:'bg-blue-500',
    EDGE:'bg-green-700', DT:'bg-green-600', LB:'bg-teal-600',
    CB:'bg-indigo-600', S:'bg-violet-600',
  };

  function checkFit(pos, needsStr) {
    if (!pos || !needsStr) return null;
    var aliases = POS_EXPAND[pos] || [pos];
    var nl = needsStr.toLowerCase();
    return aliases.some(function(a) { return nl.indexOf(a.toLowerCase()) !== -1; });
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getPlayerData(chipEl) {
    var name = chipEl.getAttribute('data-player-name') || '';
    var pos  = chipEl.getAttribute('data-position') || '';
    var schoolAttr = chipEl.getAttribute('data-school') || '';
    var rankAttr   = chipEl.getAttribute('data-rank') || '';
    var key  = name.toLowerCase().trim();
    var pData = PLAYER_DATA[key] || {};
    return {
      name:     name,
      position: pos || pData.position || '',
      school:   schoolAttr || pData.school || '',
      rank:     rankAttr || (pData.rank ? String(pData.rank) : ''),
    };
  }

  function getTeamContext(chipEl) {
    var slot = chipEl.closest && chipEl.closest('.draft-slot-container');
    if (!slot) return null;
    var pickNum = parseInt(slot.getAttribute('data-pick-number') || '0', 10);
    if (!pickNum) return null;
    var teamName = slot.getAttribute('data-team-name') || TEAMS_MAP[pickNum] || '';
    var needs = TEAM_NEEDS_MAP[pickNum] || '';
    return { pickNum: pickNum, teamName: teamName, needs: needs };
  }

  function buildInfoHtml(chipEl) {
    var d = getPlayerData(chipEl);
    var ctx = getTeamContext(chipEl);
    var sc = SCOUTING[d.name.toLowerCase().trim()] || {};
    var posColor = (POS_COLOR[d.position] || 'bg-slate-600') + ' text-white';
    if (d.position === 'WR') posColor = 'bg-yellow-500 text-gray-900';

    var physLine = (sc.height && sc.weight) ? sc.height + ' · ' + sc.weight : '';

    var scoutHtml = '';
    if (sc.strengths || sc.weakness || sc.projection || sc.comp) {
      scoutHtml = '<div class="mt-2 pt-2 border-t border-slate-700 space-y-1.5 text-xs">';
      if (sc.strengths) {
        scoutHtml += '<div class="flex gap-1.5"><span class="text-emerald-400 font-bold shrink-0 mt-px">↑</span><span class="text-slate-300 leading-snug">' + esc(sc.strengths) + '</span></div>';
      }
      if (sc.weakness) {
        scoutHtml += '<div class="flex gap-1.5"><span class="text-red-400 font-bold shrink-0 mt-px">↓</span><span class="text-slate-400 leading-snug">' + esc(sc.weakness) + '</span></div>';
      }
      if (sc.projection || sc.comp) {
        scoutHtml += '<div class="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">';
        if (sc.projection) scoutHtml += '<span><span class="text-slate-500">Proj:</span> <span class="text-slate-300">' + esc(sc.projection) + '</span></span>';
        if (sc.comp)       scoutHtml += '<span><span class="text-slate-500">Comp:</span> <span class="text-blue-300">' + esc(sc.comp) + '</span></span>';
        scoutHtml += '</div>';
      }
      scoutHtml += '</div>';
    }

    var fitHtml = '';
    if (ctx && ctx.teamName) {
      var fit = checkFit(d.position, ctx.needs);
      var fitColor  = fit === true ? 'text-emerald-400' : fit === false ? 'text-red-400' : 'text-slate-400';
      var fitIcon   = fit === true ? '✓' : fit === false ? '✗' : '–';
      var fitLabel  = fit === true ? 'Good positional fit' : fit === false ? 'Not in top team needs' : '';
      fitHtml = '<div class="mt-2 pt-2 border-t border-slate-700 text-xs">'
        + '<div class="text-slate-300 font-semibold">' + esc(ctx.teamName) + '</div>'
        + '<div class="text-slate-400 mt-0.5 leading-snug">Needs: ' + esc(ctx.needs || '—') + '</div>'
        + (fitLabel ? '<div class="mt-1 font-bold ' + fitColor + '">' + fitIcon + ' ' + fitLabel + '</div>' : '')
        + '</div>';
    }

    return '<div class="p-3">'
      + '<div class="flex items-start gap-2">'
      + '<span class="mt-0.5 px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ' + posColor + '">' + esc(d.position || '?') + '</span>'
      + '<div class="min-w-0 flex-1">'
      + '<div class="font-semibold text-white leading-tight">' + esc(d.name) + '</div>'
      + '<div class="text-slate-400 text-xs mt-0.5">' + (d.school ? esc(d.school) : '') + (physLine ? (d.school ? ' · ' : '') + esc(physLine) : '') + '</div>'
      + '</div>'
      + (d.rank ? '<span class="ml-1 text-slate-400 text-xs shrink-0 pt-0.5">#' + esc(d.rank) + '</span>' : '')
      + '</div>'
      + scoutHtml
      + fitHtml
      + '</div>';
  }

  // ---- DESKTOP TOOLTIP ----
  var tip = document.getElementById('player-info-tooltip');
  var hideTimer = null;

  function showTip(chipEl) {
    if (!tip || window.innerWidth < 1024) return;
    if (chipEl.classList.contains('sortable-drag') || chipEl.classList.contains('sortable-ghost')) return;
    clearTimeout(hideTimer);
    tip.innerHTML = buildInfoHtml(chipEl);
    tip.style.display = 'block';
    var rect = chipEl.getBoundingClientRect();
    var TW = 288; // w-72
    var margin = 10;
    // Temporarily measure height off-screen
    tip.style.left = '-9999px'; tip.style.top = '-9999px';
    var TH = tip.offsetHeight || 120;
    var left = rect.right + margin;
    var top  = rect.top + (rect.height / 2) - (TH / 2);
    if (left + TW > window.innerWidth - margin) left = rect.left - TW - margin;
    top  = Math.max(margin, Math.min(window.innerHeight - TH - margin, top));
    left = Math.max(margin, left);
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }

  function hideTip() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function() { if (tip) tip.style.display = 'none'; }, 80);
  }

  document.addEventListener('mouseover', function(e) {
    if (window.innerWidth < 1024) return;
    var chip = e.target && e.target.closest && e.target.closest('.draftable-player-chip, .draft-player-chip');
    if (chip) showTip(chip);
  });
  document.addEventListener('mouseout', function(e) {
    if (window.innerWidth < 1024) return;
    var chip = e.target && e.target.closest && e.target.closest('.draftable-player-chip, .draft-player-chip');
    if (chip && !chip.contains(e.relatedTarget)) hideTip();
  });

  // ---- MOBILE MODAL ----
  var modal      = document.getElementById('player-info-modal');
  var modalInner = document.getElementById('player-info-modal-inner');

  function showModal(chipEl) {
    if (!modal || !modalInner) return;
    var d = getPlayerData(chipEl);
    var ctx = getTeamContext(chipEl);
    var sc = SCOUTING[d.name.toLowerCase().trim()] || {};
    var posColor = (POS_COLOR[d.position] || 'bg-slate-600') + ' text-white';
    if (d.position === 'WR') posColor = 'bg-yellow-500 text-gray-900';

    var physLine = (sc.height && sc.weight) ? sc.height + ' · ' + sc.weight : '';

    var scoutHtml = '';
    if (sc.strengths || sc.weakness || sc.projection || sc.comp) {
      scoutHtml = '<div class="mt-3 space-y-2">';
      if (sc.strengths) {
        scoutHtml += '<div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">'
          + '<div class="text-xs font-bold text-emerald-700 mb-0.5">Strengths</div>'
          + '<div class="text-sm text-gray-700 leading-snug">' + esc(sc.strengths) + '</div>'
          + '</div>';
      }
      if (sc.weakness) {
        scoutHtml += '<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2">'
          + '<div class="text-xs font-bold text-red-700 mb-0.5">Concerns</div>'
          + '<div class="text-sm text-gray-700 leading-snug">' + esc(sc.weakness) + '</div>'
          + '</div>';
      }
      if (sc.projection || sc.comp) {
        scoutHtml += '<div class="flex flex-wrap gap-3 text-sm">';
        if (sc.projection) scoutHtml += '<div><span class="text-gray-500 text-xs font-semibold uppercase tracking-wide">Projection</span><div class="font-medium text-gray-900">' + esc(sc.projection) + '</div></div>';
        if (sc.comp)       scoutHtml += '<div><span class="text-gray-500 text-xs font-semibold uppercase tracking-wide">NFL Comp</span><div class="font-medium text-blue-700">' + esc(sc.comp) + '</div></div>';
        scoutHtml += '</div>';
      }
      scoutHtml += '</div>';
    }

    var fitHtml = '';
    if (ctx && ctx.teamName) {
      var fit = checkFit(d.position, ctx.needs);
      var fitBg    = fit === true ? 'bg-emerald-50 border-emerald-200' : fit === false ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
      var fitColor = fit === true ? 'text-emerald-700' : fit === false ? 'text-red-700' : 'text-gray-500';
      var fitIcon  = fit === true ? '✓' : fit === false ? '✗' : '–';
      var fitLabel = fit === true ? 'Good positional fit' : fit === false ? 'Not in top team needs' : '';
      fitHtml = '<div class="mt-3 rounded-lg border p-3 ' + fitBg + '">'
        + '<div class="font-semibold text-gray-800 text-sm">' + esc(ctx.teamName) + '</div>'
        + '<div class="text-gray-500 text-xs mt-1 leading-snug">Needs: ' + esc(ctx.needs || '—') + '</div>'
        + (fitLabel ? '<div class="mt-1.5 text-sm font-bold ' + fitColor + '">' + fitIcon + ' ' + fitLabel + '</div>' : '')
        + '</div>';
    }

    modalInner.innerHTML = '<div>'
      + '<div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200">'
      + '<h3 class="font-bold text-gray-900 text-base">Player Info</h3>'
      + '<button type="button" id="player-info-modal-close" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-lg leading-none">✕</button>'
      + '</div>'
      + '<div class="px-4 py-4 overflow-y-auto max-h-[70vh]">'
      + '<div class="flex items-start gap-3">'
      + '<span class="mt-0.5 px-2 py-1 rounded text-sm font-bold shrink-0 ' + posColor + '">' + esc(d.position || '?') + '</span>'
      + '<div class="min-w-0 flex-1">'
      + '<div class="font-bold text-gray-900 text-lg leading-tight">' + esc(d.name) + '</div>'
      + '<div class="text-gray-500 text-sm mt-0.5">' + (d.school ? esc(d.school) : '') + (physLine ? (d.school ? ' · ' : '') + esc(physLine) : '') + '</div>'
      + '</div>'
      + (d.rank ? '<span class="text-gray-400 text-sm shrink-0 pt-1">Rank #' + esc(d.rank) + '</span>' : '')
      + '</div>'
      + scoutHtml
      + fitHtml
      + '</div>'
      + '</div>';

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function hideModal() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest && e.target.closest('.player-info-btn');
    if (btn) {
      e.stopPropagation();
      e.preventDefault();
      var chip = btn.closest('.draftable-player-chip, .draft-player-chip') || btn;
      showModal(chip);
      return;
    }
    if (modal && modal.style.display !== 'none') {
      if (e.target === modal || (e.target && e.target.closest && e.target.closest('#player-info-modal-close'))) {
        hideModal();
      }
    }
  });
})();
  </script>`;
  return baseLayout(content, "NFL Draft Predictor — LLL Experience", clerkPublishableKey);
}

type DraftRoom = "picks" | "leaderboard";

function draftTopBar(year: number, active: DraftRoom, isAdmin = false): string {
  const base = "/draft/" + year;
  return `
  <header class="bg-slate-900 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3">
      <div class="flex items-center justify-between gap-4">
        <a href="/apps" class="text-sm text-slate-400 hover:text-white shrink-0">← Apps</a>
        <h1 class="text-lg font-bold text-white truncate">NFL Draft Predictor — ${year}</h1>
        <nav class="flex items-center gap-1 shrink-0" aria-label="Draft rooms">
          <a href="${base}" class="px-3 py-1.5 rounded text-sm font-medium transition-colors ${active === "picks" ? "bg-slate-600 text-white" : "text-slate-400 hover:bg-slate-700 hover:text-white"}">Picks</a>
          <a href="${base}/leaderboard" class="px-3 py-1.5 rounded text-sm font-medium transition-colors ${active === "leaderboard" ? "bg-slate-600 text-white" : "text-slate-400 hover:bg-slate-700 hover:text-white"}">Leaderboard</a>
          ${isAdmin ? `<a href="/admin/draft/${year}" class="px-3 py-1.5 rounded text-sm font-medium text-orange-400 hover:bg-slate-700 hover:text-orange-300 transition-colors">⚙ Admin</a>` : ""}
        </nav>
      </div>
    </div>
  </header>`;
}

function yearSelector(year: number, availableYears: number[], pathSegment: string): string {
  if (availableYears.length <= 1) return "";
  return `<div class="flex items-center gap-2 mb-4"><span class="text-slate-400 text-sm">Year:</span><div class="flex gap-1">${availableYears
    .map(
      (y) =>
        `<a href="/draft/${y}/${pathSegment}" class="px-3 py-1 rounded text-sm font-medium ${y === year ? "bg-slate-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}">${y}</a>`
    )
    .join("")}</div></div>`;
}

export interface LeaderboardUser {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  pickCount: number;
}

export interface HistoricalWinnerEntry {
  id: number;
  rank: number;
  name: string;
  email: string | null;
  score: number | null;
}

function rankMedal(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
}

function displayName(u: { firstName: string | null; lastName: string | null; email?: string }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (u.email) return u.email;
  return "Player";
}

export function leaderboardScoresFragment(
  leaderboard: Array<{ user: { id: number; firstName: string | null; lastName: string | null; email: string }; score: number }>,
  draftStarted: boolean,
  year: number
): string {
  const rows = leaderboard
    .map(
      (e, i) =>
        `<tr class="border-b border-gray-200">
          <td class="px-4 py-2.5 font-bold text-gray-500 w-8">${i + 1}</td>
          <td class="px-4 py-2.5">
            <div class="font-medium text-gray-900">${escapeHtml(displayName(e.user))}</div>
            ${e.user.email ? `<div class="text-xs text-gray-500">${escapeHtml(e.user.email)}</div>` : ""}
          </td>
          <td class="px-4 py-2.5 font-bold ${e.score > 0 ? "text-green-700" : "text-gray-400"}">${e.score} pts</td>
        </tr>`
    )
    .join("");
  const pollingAttrs = draftStarted
    ? `hx-get="/draft/${year}/leaderboard/scores" hx-trigger="every 30s" hx-swap="outerHTML"`
    : "";
  return `<div id="leaderboard-scores" ${pollingAttrs}>
  <table class="w-full">
    <thead><tr class="bg-gray-50 text-left border-b border-gray-200">
      <th class="px-4 py-2 font-semibold text-gray-600 w-8">#</th>
      <th class="px-4 py-2 font-semibold text-gray-600">Name</th>
      <th class="px-4 py-2 font-semibold text-gray-600">Score</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400">No submissions yet. Scores appear once picks are saved and the draft begins.</td></tr>`}</tbody>
  </table>
</div>`;
}

export function leaderboardPage(
  leaderboard: Array<{ user: { id: number; firstName: string | null; lastName: string | null; email: string }; score: number; picks: Pick[] }>,
  draftStarted: boolean,
  year: number,
  availableYears: number[],
  clerkPublishableKey?: string,
  allUsers?: LeaderboardUser[],
  historicalWinners?: HistoricalWinnerEntry[]
): string {

  // ── Historical past-year view ──────────────────────────────────────────────
  const pastYearContent = historicalWinners && historicalWinners.length > 0
    ? `<h2 class="text-xl font-bold text-white mb-1">${year} Draft — Final Standings</h2>
       <p class="text-slate-400 text-sm mb-4">Results as entered by admin.</p>
       <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
         <div class="divide-y divide-gray-100">
           ${historicalWinners.sort((a, b) => a.rank - b.rank).map((w) => `
           <div class="flex items-center gap-4 px-5 py-3.5">
             <span class="text-2xl w-8 shrink-0">${rankMedal(w.rank)}</span>
             <div class="flex-1 min-w-0">
               <div class="font-semibold text-gray-900">${escapeHtml(w.name)}</div>
               ${w.email ? `<div class="text-xs text-gray-400">${escapeHtml(w.email)}</div>` : ""}
             </div>
             ${w.score != null ? `<div class="text-sm font-bold text-gray-700 shrink-0">${w.score} pts</div>` : ""}
           </div>`).join("")}
         </div>
       </div>`
    : historicalWinners
      ? `<p class="text-slate-400 mt-4">No results on record for ${year}.</p>`
      : "";

  // ── Pre-draft: who's playing ───────────────────────────────────────────────
  const preDraftContent = !draftStarted && allUsers && allUsers.length > 0
    ? `<h2 class="text-xl font-bold text-white mb-1">${year} Draft — Who's In</h2>
       <p class="text-slate-300 text-sm mb-4">
         Picks are hidden until the draft starts. Make yours at
         <a href="/draft/${year}" class="text-blue-400 hover:underline">the draft room →</a>
       </p>
       <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
         <table class="w-full">
           <thead><tr class="bg-gray-50 text-left border-b border-gray-200">
             <th class="px-4 py-2 font-semibold text-gray-600">Name</th>
             <th class="px-4 py-2 font-semibold text-gray-600 text-right">Picks</th>
           </tr></thead>
           <tbody>
             ${allUsers.sort((a, b) => b.pickCount - a.pickCount || (displayName(a) < displayName(b) ? -1 : 1)).map((u) => {
               const name = displayName(u);
               const complete = u.pickCount >= 32;
               const none = u.pickCount === 0;
               const status = complete
                 ? `<span class="text-green-600 font-semibold">✓ Submitted</span>`
                 : none
                 ? `<span class="text-gray-400">— Not started</span>`
                 : `<span class="text-yellow-600">${u.pickCount}/32</span>`;
               return `<tr class="border-b border-gray-100 last:border-0">
                 <td class="px-4 py-2.5">
                   <div class="font-medium text-gray-900">${escapeHtml(name)}</div>
                   ${u.email ? `<div class="text-xs text-gray-500">${escapeHtml(u.email)}</div>` : ""}
                 </td>
                 <td class="px-4 py-2.5 text-right text-sm">${status}</td>
               </tr>`;
             }).join("")}
           </tbody>
         </table>
       </div>`
    : "";

  // ── Live / post-draft scoring ──────────────────────────────────────────────
  const scoringContent = (draftStarted || (!allUsers && !historicalWinners))
    ? `<p class="text-slate-300 text-sm mb-4">
         ${draftStarted
           ? "Scores update live as official picks come in — refreshes every 30 seconds."
           : "Scores will update once the draft starts and official results are in."}
       </p>
       <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
         ${leaderboardScoresFragment(leaderboard, draftStarted, year)}
       </div>`
    : "";

  const mainContent = historicalWinners !== undefined
    ? pastYearContent
    : !draftStarted && allUsers
    ? preDraftContent
    : scoringContent;

  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    ${draftTopBar(year, "leaderboard")}
    <div class="max-w-2xl mx-auto py-8 px-4">
      ${yearSelector(year, availableYears, "leaderboard")}
      ${mainContent}
    </div>
  </div>`;
  return baseLayout(content, `${year} Leaderboard — NFL Draft`, clerkPublishableKey);
}

export function submittedMocksPage(
  entries: Array<{ user: { firstName: string | null; lastName: string | null }; picks: Pick[] }>,
  draftStarted: boolean,
  year: number,
  availableYears: number[],
  clerkPublishableKey?: string
): string {
  const displayName = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "Player";
  if (!draftStarted) {
    const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    <div class="max-w-2xl mx-auto py-8 px-4">
      <a href="/draft/${year}" class="text-sm text-slate-300 hover:text-white">← Back to draft</a>
      <h1 class="text-2xl font-bold mt-2">${year} — Submitted mocks</h1>
      <p class="text-slate-300 mt-4">Picks are hidden until the draft starts. Check back after the draft begins to see everyone's predictions.</p>
    </div>
  </div>`;
    return baseLayout(content, `${year} Submitted mocks — NFL Draft`, clerkPublishableKey);
  }
  const blocks = entries
    .map(
      (e) => `
    <div class="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <h2 class="px-4 py-2 bg-gray-100 font-semibold text-gray-900">${escapeHtml(displayName(e.user))}</h2>
      <div class="p-4 overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-600"><th class="pr-2">#</th><th class="pr-2">Team</th><th>Pick</th><th>2x</th></tr></thead>
          <tbody>${e.picks
            .sort((a, b) => a.pickNumber - b.pickNumber)
            .map(
              (p) =>
                `<tr><td class="pr-2">${p.pickNumber}</td><td class="pr-2">${escapeHtml(p.teamName || "")}</td><td>${escapeHtml(p.playerName || "—")} ${p.position ? `(${escapeHtml(p.position)})` : ""}</td><td>${p.doubleScorePick ? "✓" : ""}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>`
    )
    .join("");
  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    <div class="max-w-4xl mx-auto py-8 px-4">
      <a href="/draft/${year}" class="text-sm text-slate-300 hover:text-white">← Back to draft</a>
      <h1 class="text-2xl font-bold mt-2">${year} — Submitted mocks</h1>
      ${yearSelector(year, availableYears, "submitted")}
      <p class="text-slate-300 text-sm mt-1">Read-only. Picks are visible after the draft starts.</p>
      ${blocks || "<p class=\"text-slate-300 mt-4\">No submitted mocks yet.</p>"}
    </div>
  </div>`;
  return baseLayout(content, `${year} Submitted mocks — NFL Draft`, clerkPublishableKey);
}

export function resultsPage(
  leaderboard: Array<{ user: { firstName: string | null; lastName: string | null; email: string }; score: number }>,
  officialRows: Array<{ pickNumber: number; playerName: string | null; teamName: string | null }>,
  draftStarted: boolean,
  year: number,
  availableYears: number[],
  clerkPublishableKey?: string
): string {
  const scoreRows = leaderboard
    .map(
      (e, i) =>
        `<tr class="border-b border-gray-200">
          <td class="px-4 py-2 font-medium">${i + 1}</td>
          <td class="px-4 py-2">
            <div>${escapeHtml(displayName(e.user))}</div>
            ${e.user.email ? `<div class="text-xs text-gray-500">${escapeHtml(e.user.email)}</div>` : ""}
          </td>
          <td class="px-4 py-2 font-semibold">${e.score}</td>
        </tr>`
    )
    .join("");
  const officialRowsHtml =
    officialRows.length > 0
      ? officialRows
          .map(
            (r) =>
              `<tr class="border-b border-gray-200"><td class="px-4 py-2">${r.pickNumber}</td><td class="px-4 py-2">${escapeHtml(r.teamName || "")}</td><td class="px-4 py-2">${escapeHtml(r.playerName || "—")}</td></tr>`
          )
          .join("")
      : "<tr><td colspan=\"3\" class=\"px-4 py-6 text-center text-gray-500\">No official results yet. Results will update when the draft runs and data is entered (or synced from the NFL).</td></tr>";
  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    <div class="max-w-4xl mx-auto py-8 px-4">
      <a href="/draft/${year}" class="text-sm text-slate-300 hover:text-white">← Back to draft</a>
      <h1 class="text-2xl font-bold mt-2">${year} — Results</h1>
      ${yearSelector(year, availableYears, "results")}
      <p class="text-slate-300 text-sm mt-1">Scoring: 3 pts exact slot, 2 pts one spot away, 1 pt two spots away. Double-score pick doubles points for that slot. Results can be updated from official NFL draft data when available.</p>
      <div class="mt-6 grid gap-6 md:grid-cols-2">
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <h2 class="px-4 py-2 bg-gray-100 font-semibold text-gray-900">Scoreboard</h2>
          <table class="w-full"><thead><tr class="text-left text-gray-600 text-sm"><th class="px-4 py-2">#</th><th class="px-4 py-2">Player</th><th class="px-4 py-2">Score</th></tr></thead><tbody>${scoreRows || "<tr><td colspan=\"3\" class=\"px-4 py-4 text-center text-gray-500\">No entries.</td></tr>"}</tbody></table>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <h2 class="px-4 py-2 bg-gray-100 font-semibold text-gray-900">Official draft results</h2>
          <table class="w-full text-sm"><thead><tr class="text-left text-gray-600"><th class="px-4 py-2">Pick</th><th class="px-4 py-2">Team</th><th class="px-4 py-2">Player</th></tr></thead><tbody>${officialRowsHtml}</tbody></table>
        </div>
      </div>
    </div>
  </div>`;
  return baseLayout(content, `${year} Results — NFL Draft`, clerkPublishableKey);
}
