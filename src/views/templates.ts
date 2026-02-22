import { getFirstRoundTeams, getTeamNeeds } from "../config/draft-data.js";

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
  </style>
  ${clerkPublishableKey ? `<script>
    window.__clerkToken = null;

    window.addEventListener('load', async () => {
      await window.Clerk?.load();
      const clerk = window.Clerk;
      if (!clerk) return;

      if (clerk.user) {
        const token = await clerk.session?.getToken();
        window.__clerkToken = token;
      }

      // Inject Bearer token into all protected HTMX requests
      document.body.addEventListener('htmx:configRequest', async (evt) => {
        const path = new URL(evt.detail.path, window.location.origin).pathname;
        if (path.startsWith('/draft') || path.startsWith('/apps')) {
          if (!window.__clerkToken && clerk.session) {
            window.__clerkToken = await clerk.session.getToken();
          }
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
    ? (hasPlayer ? `<div class="draft-player-chip draft-chip-readonly" data-player-name="${escapeHtml(pick!.playerName!)}" data-position="${escapeHtml(pick!.position || "")}"><span class="chip-name">${escapeHtml(pick!.playerName!)}</span>${pick!.position ? ` <span class="text-xs text-gray-500">${escapeHtml(pick!.position)}</span>` : ""}</div>` : "<span class=\"text-gray-400 italic\">—</span>")
    : (hasPlayer
      ? `<div class="draft-player-chip" data-player-name="${escapeHtml(pick!.playerName!)}" data-position="${escapeHtml(pick!.position || "")}"><span class="chip-name">${escapeHtml(pick!.playerName!)}</span>${pick!.position ? ` <span class="chip-pos text-xs text-gray-500">${escapeHtml(pick!.position)}</span>` : ""} <button type="button" class="draft-clear-slot ml-1 text-gray-400 hover:text-red-500" title="Clear">×</button></div>`
      : "");

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
    ${teamNeeds ? `<div class="text-xs text-gray-500 mt-0.5" title="Team needs (source: Underdog Network)">${escapeHtml(teamNeeds)}</div>` : ""}
  </td>`;
  const pickCell = `<td class="px-3 py-2 border-b border-gray-200 align-top">
    <div class="draft-slot-container min-h-[2.5rem] ${!draftLocked ? "draft-slot-droppable" : ""}" data-pick-number="${num}" data-team-name="${escapeHtml(teamName)}">${slotContent}</div>
  </td>`;
  const officialCell = draftLocked
    ? `<td class="px-3 py-2 border-b border-gray-200 align-top">
    ${officialPlayer
      ? `<span class="font-medium ${style.rowBg === "bg-gray-100" ? "text-gray-400" : "text-blue-800"}">${escapeHtml(officialPlayer)}</span>`
      : `<span class="text-gray-300 text-sm">–</span>`}
  </td>`
    : "";
  const doubleCell = draftLocked
    ? `<td class="px-3 py-2 border-b border-gray-200 text-center align-top">${pick?.doubleScorePick ? "✓" : ""}</td>`
    : `<td class="px-3 py-2 border-b border-gray-200 text-center align-top"><input type="checkbox" class="draft-double-score rounded border-gray-300" data-pick-number="${num}" ${pick?.doubleScorePick ? "checked" : ""} title="Double score" /></td>`;

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
      ${draftLocked ? `<th class="px-3 py-2 text-left font-semibold">OFFICIAL PICK</th>` : ""}
      <th class="px-3 py-2 text-center font-semibold">DOUBLE SCORE PICK</th>
    </tr></thead>
    <tbody id="picks-table-body">${rows}</tbody>
  </table>
</div>`;
}

export function draftablePlayersFragment(
  players: DraftablePlayer[],
  positionFilter: string,
  source = "cbs"
): string {
  const filtered = positionFilter === "OVR" ? players : players.filter((p) => p.position === positionFilter);
  const items = filtered
    .map(
      (p) =>
        `<div class="draftable-player-chip border-b border-gray-100 px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing hover:bg-gray-50 bg-white" data-player-name="${escapeHtml(p.playerName)}" data-position="${escapeHtml(p.position)}" data-school="${escapeHtml(p.school)}">
  <span class="text-gray-500 font-medium w-6">${p.rank}</span>
  <span class="font-medium text-gray-900 flex-1 truncate">${escapeHtml(p.playerName)}</span>
  <span class="text-gray-600 text-sm truncate">${escapeHtml(p.school)}</span>
  <span class="text-gray-600 text-sm">${escapeHtml(p.position)}</span>
</div>`
    )
    .join("");

  const sources = [
    { key: "cbs", label: "CBS" },
    { key: "espn", label: "ESPN" },
    { key: "nfl", label: "NFL" },
    { key: "fox", label: "Fox" },
  ];

  return `<div id="draftable-players-panel" class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden" data-source="${escapeHtml(source)}" data-position="${escapeHtml(positionFilter)}">
  <div class="flex items-center gap-2 px-2 pt-2 pb-1 border-b border-gray-200 bg-gray-50">
    <span class="text-xs text-gray-500 shrink-0">Rankings:</span>
    ${sources.map((s) => `<button type="button" class="draft-source-filter px-2 py-0.5 rounded text-xs font-semibold ${s.key === source ? "bg-red-600 text-white" : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-100"}" data-source="${s.key}">${s.label}</button>`).join("")}
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

  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100" data-draft-year="${year}">
    ${draftTopBar(year, "picks", isAdmin)}
    <div class="max-w-7xl mx-auto py-6 px-4">
      ${yearSelector}
      ${saveSection("save-picks-top") ? `<div class="mb-4">${saveSection("save-picks-top")}<p class="text-xs text-gray-500 mt-1">You can save anytime. Only entries with all 32 picks filled appear on the leaderboard.</p></div>` : ""}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
          <div class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
            <h2 class="text-lg font-bold text-gray-900 px-4 py-3 border-b border-gray-200 bg-gray-50">First round — your picks</h2>
            <p class="text-xs text-gray-500 px-4 pb-1">Scoring: 3 pts exact, 2 pts ±1 spot, 1 pt ±2 spots. Double-score doubles that slot. Team needs from <a href="https://underdognetwork.com/football/news/2026-nfl-team-needs" target="_blank" rel="noopener" class="text-blue-600 hover:underline">Underdog Network</a>. Look up rankings: <a href="https://www.cbssports.com/nfl/draft/prospect-rankings/" target="_blank" rel="noopener" class="text-blue-600 hover:underline">CBS Sports</a>.</p>
            <div class="p-4">
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
        <div>
          <div class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
            <h2 class="text-lg font-bold text-gray-900 px-4 py-3 border-b border-gray-200 bg-gray-50">Available players</h2>
            <p class="text-xs text-gray-500 px-4 pb-1">Switch between CBS, ESPN, NFL.com, and Fox Sports rankings to compare.</p>
            <div class="p-4">
              <div
                hx-get="/draft/${year}/players"
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
      ${saveSection("save-picks-bottom") ? `<div class="mt-6">${saveSection("save-picks-bottom")}<p class="text-xs text-gray-500 mt-1">You can save anytime. Only entries with all 32 picks filled appear on the leaderboard.</p></div>` : ""}
    </div>
  </div>

  <script>
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
        chip.classList.remove('hover:bg-gray-50', 'cursor-grab', 'active:cursor-grabbing');
      } else {
        chip.classList.remove('in-use', 'opacity-50', 'text-gray-400', 'cursor-not-allowed');
        chip.classList.add('hover:bg-gray-50', 'cursor-grab', 'active:cursor-grabbing');
      }
    });
  }

  function initSlotsSortable() {
    slotSortables.forEach(function(s) { if (s && s.destroy) s.destroy(); });
    slotSortables = [];
    const slots = document.querySelectorAll('#picks-table-body .draft-slot-container.draft-slot-droppable');
    slots.forEach(function(slotEl) {
      const pickNum = slotEl.getAttribute('data-pick-number');
      if (typeof Sortable !== 'undefined') {
        const sortable = Sortable.create(slotEl, {
          group: { name: 'draft', put: true, pull: true },
          sort: false,
          onAdd: function(evt) {
            const item = evt.item;
            while (slotEl.children.length > 1) slotEl.removeChild(slotEl.firstChild);
            item.setAttribute('data-pick-number', pickNum || '');
            item.classList.add('draft-player-chip');
            if (!item.querySelector('.draft-clear-slot')) {
              const clearBtn = document.createElement('button');
              clearBtn.type = 'button';
              clearBtn.className = 'draft-clear-slot ml-1 text-gray-400 hover:text-red-500';
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

  document.addEventListener('htmx:afterSwap', function(evt) {
    const t = evt.detail?.target;
    const picksJustSwapped = t && (t.id === 'picks-table-wrapper' || (t.querySelector && t.querySelector('#picks-table-body')));
    const wrapperPresent = document.getElementById('picks-table-wrapper');
    if (picksJustSwapped || (wrapperPresent && slotSortables.length === 0)) {
      initSlotsSortable();
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
      initPlayersSortable();

      function getCurrentSource() {
        return document.getElementById('draftable-players-panel')?.dataset?.source || 'cbs';
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
    }
  });

  document.addEventListener('click', function(e) {
    const target = e.target;
    if (target && (target.classList?.contains('draft-save-picks') || target.id === 'save-picks-top' || target.id === 'save-picks-bottom')) {
      e.preventDefault();
      const state = getState();
      htmx.ajax('POST', '/draft/' + DRAFT_YEAR + '/picks', {
        values: { picks: JSON.stringify(state) },
        target: '#picks-table-wrapper',
        swap: 'outerHTML',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    }
    if (target?.classList?.contains('draft-clear-slot')) {
      const slot = target.closest('.draft-slot-container');
      if (slot) { while (slot.firstChild) slot.removeChild(slot.firstChild); markUsedPlayers(); }
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

export function leaderboardPage(
  leaderboard: Array<{ user: { id: number; firstName: string | null; lastName: string | null }; score: number; picks: Pick[] }>,
  draftStarted: boolean,
  year: number,
  availableYears: number[],
  clerkPublishableKey?: string
): string {
  const displayName = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "Player";
  const rows = leaderboard
    .map(
      (e, i) =>
        `<tr class="border-b border-gray-200"><td class="px-4 py-2 font-medium">${i + 1}</td><td class="px-4 py-2">${escapeHtml(displayName(e.user))}</td><td class="px-4 py-2 font-semibold">${e.score}</td></tr>`
    )
    .join("");
  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    ${draftTopBar(year, "leaderboard")}
    <div class="max-w-2xl mx-auto py-8 px-4">
      ${yearSelector(year, availableYears, "leaderboard")}
      <p class="text-slate-300 text-sm mt-1">Anyone who saved a full 32-pick entry appears here. ${draftStarted ? "Scores update from official results." : "Scores will update once the draft starts and official results are in."}</p>
      <div class="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full">
          <thead><tr class="bg-gray-100 text-left"><th class="px-4 py-2 font-semibold text-gray-700">#</th><th class="px-4 py-2 font-semibold text-gray-700">Player</th><th class="px-4 py-2 font-semibold text-gray-700">Score</th></tr></thead>
          <tbody>${rows || "<tr><td colspan=\"3\" class=\"px-4 py-6 text-center text-gray-500\">No submissions yet.</td></tr>"}</tbody>
        </table>
      </div>
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
  leaderboard: Array<{ user: { firstName: string | null; lastName: string | null }; score: number }>,
  officialRows: Array<{ pickNumber: number; playerName: string | null; teamName: string | null }>,
  draftStarted: boolean,
  year: number,
  availableYears: number[],
  clerkPublishableKey?: string
): string {
  const displayName = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || "Player";
  const scoreRows = leaderboard
    .map(
      (e, i) =>
        `<tr class="border-b border-gray-200"><td class="px-4 py-2 font-medium">${i + 1}</td><td class="px-4 py-2">${escapeHtml(displayName(e.user))}</td><td class="px-4 py-2 font-semibold">${e.score}</td></tr>`
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
