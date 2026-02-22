import { baseLayout, escapeHtml, type Pick } from "./templates.js";
import { getFirstRoundTeams, CURRENT_DRAFT_YEAR } from "../config/draft-data.js";

export interface OfficialPick {
  pickNumber: number;
  playerName: string | null;
  teamName: string | null;
  position?: string | null;
}

// ─── Admin nav header ────────────────────────────────────────────────────────

function adminTopBar(year: number, active: "dashboard" | "simulator"): string {
  return `
  <header class="bg-gray-900 border-b border-gray-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <a href="/apps" class="text-sm text-gray-400 hover:text-white">← Apps</a>
        <span class="text-gray-600">|</span>
        <a href="/draft/${year}" class="text-sm text-gray-400 hover:text-white">Selection Room</a>
      </div>
      <h1 class="text-base font-bold text-orange-400 truncate">⚙ Admin — NFL Draft ${year}</h1>
      <nav class="flex gap-1">
        <a href="/admin/draft/${year}" class="px-3 py-1.5 rounded text-sm font-medium transition-colors ${active === "dashboard" ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-700 hover:text-white"}">Dashboard</a>
        <a href="/admin/draft/${year}/simulator" class="px-3 py-1.5 rounded text-sm font-medium transition-colors ${active === "simulator" ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-700 hover:text-white"}">Simulator</a>
      </nav>
    </div>
  </header>`;
}

// ─── Official picks editor row ───────────────────────────────────────────────

export function adminPickRow(
  pickNumber: number,
  teamName: string,
  official: OfficialPick | null,
  year: number
): string {
  const playerVal = escapeHtml(official?.playerName ?? "");
  const posVal = escapeHtml(official?.position ?? "");
  const inputId = `player-${pickNumber}`;
  const posId = `pos-${pickNumber}`;
  const teamId = `team-${pickNumber}`;
  const hasData = !!official?.playerName;

  return `<tr id="admin-pick-row-${pickNumber}" class="border-b border-gray-100 hover:bg-gray-50">
  <td class="px-3 py-2 text-gray-500 font-medium w-8">${pickNumber}</td>
  <td class="px-3 py-2 text-gray-700 text-sm w-40">${escapeHtml(teamName)}</td>
  <td class="px-3 py-2">
    <input id="${inputId}" name="playerName" value="${playerVal}"
      class="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      placeholder="Player name…">
    <input type="hidden" id="${teamId}" name="teamName" value="${escapeHtml(teamName)}">
  </td>
  <td class="px-3 py-2 w-20">
    <input id="${posId}" name="position" value="${posVal}"
      class="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      placeholder="Pos">
  </td>
  <td class="px-3 py-2 whitespace-nowrap">
    <button type="button"
      hx-post="/admin/draft/${year}/official-picks/${pickNumber}"
      hx-include="#${inputId}, #${posId}, #${teamId}"
      hx-target="#admin-pick-row-${pickNumber}"
      hx-swap="outerHTML"
      class="px-2 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded font-medium transition-colors">
      Save
    </button>
    ${hasData ? `<button type="button"
      hx-delete="/admin/draft/${year}/official-picks/${pickNumber}"
      hx-target="#admin-pick-row-${pickNumber}"
      hx-swap="outerHTML"
      hx-confirm="Clear pick ${pickNumber}?"
      class="ml-1 px-2 py-1 text-xs bg-gray-200 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded font-medium transition-colors">
      Clear
    </button>` : ""}
  </td>
  <td class="px-3 py-2 text-center">
    ${hasData ? `<span class="text-green-600 text-sm">✓</span>` : `<span class="text-gray-300 text-sm">–</span>`}
  </td>
</tr>`;
}

// ─── Official picks editor fragment ─────────────────────────────────────────

export function officialPicksEditorFragment(
  officialPicks: OfficialPick[],
  year: number
): string {
  const teams = getFirstRoundTeams(year);
  const officialMap = new Map(officialPicks.map((p) => [p.pickNumber, p]));
  const filledCount = officialPicks.filter((p) => p.playerName).length;

  const rows = Array.from({ length: 32 }, (_, i) => {
    const num = i + 1;
    return adminPickRow(num, teams[num] ?? `Pick ${num}`, officialMap.get(num) ?? null, year);
  }).join("");

  return `<div id="official-picks-editor">
  <div class="flex items-center justify-between mb-3">
    <p class="text-sm text-gray-500">${filledCount}/32 picks entered</p>
    <div class="flex gap-2">
      <button type="button"
        hx-post="/admin/draft/${year}/sync"
        hx-target="#official-picks-editor"
        hx-swap="outerHTML"
        hx-indicator="#sync-spinner"
        class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors flex items-center gap-1.5">
        <span id="sync-spinner" class="htmx-indicator text-xs">⟳</span>
        Sync from ESPN Live
      </button>
      <button type="button"
        onclick="document.querySelectorAll('#official-picks-editor input[name=playerName]').forEach(i=>i.value=''); document.querySelectorAll('#official-picks-editor input[name=position]').forEach(i=>i.value='')"
        class="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium transition-colors">
        Clear All Inputs
      </button>
    </div>
  </div>
  <div class="overflow-auto max-h-[65vh] border border-gray-200 rounded-lg">
    <table class="w-full text-sm bg-white">
      <thead class="bg-gray-100 sticky top-0">
        <tr>
          <th class="px-3 py-2 text-left font-semibold text-gray-700">#</th>
          <th class="px-3 py-2 text-left font-semibold text-gray-700">Team</th>
          <th class="px-3 py-2 text-left font-semibold text-gray-700">Player Name</th>
          <th class="px-3 py-2 text-left font-semibold text-gray-700">Pos</th>
          <th class="px-3 py-2 text-left font-semibold text-gray-700">Actions</th>
          <th class="px-3 py-2 text-center font-semibold text-gray-700">Set</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

// ─── Admin dashboard page ────────────────────────────────────────────────────

export function adminDashboardPage(
  officialPicks: OfficialPick[],
  draftStarted: boolean,
  year: number,
  submissionCount: number,
  adminEmails: string[],
  clerkPublishableKey?: string
): string {
  const statusBadge = draftStarted
    ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">● Draft started — picks locked</span>`
    : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">◌ Draft not started — picks open</span>`;

  const startBtn = draftStarted
    ? `<button disabled class="px-4 py-2 bg-gray-200 text-gray-400 rounded font-medium text-sm cursor-not-allowed">Draft Already Started</button>`
    : `<button type="button"
        hx-post="/admin/draft/${year}/start"
        hx-confirm="Lock all picks and start the ${year} draft? This cannot be undone."
        hx-swap="none"
        onclick="setTimeout(()=>location.reload(),600)"
        class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm transition-colors">
        🔒 Start Draft &amp; Lock Picks
      </button>`;

  const content = `
  <div class="min-h-screen bg-gray-50">
    ${adminTopBar(year, "dashboard")}
    <div class="max-w-7xl mx-auto py-6 px-4 space-y-6">

      <!-- Status bar -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4 flex-wrap">
          ${statusBadge}
          <span class="text-sm text-gray-500">${submissionCount} full submission${submissionCount !== 1 ? "s" : ""}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${startBtn}
          <a href="/admin/draft/${year}/simulator"
            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium text-sm transition-colors">
            🎮 Open Simulator
          </a>
        </div>
      </div>

      <!-- Official picks editor -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 class="text-base font-bold text-gray-900 mb-1">Official Draft Picks</h2>
        <p class="text-xs text-gray-500 mb-3">Enter picks as they are announced. Use "Sync from ESPN Live" during the actual draft to auto-fill. You can manually correct any entry.</p>
        ${officialPicksEditorFragment(officialPicks, year)}
      </div>

      <!-- Admin config info -->
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 class="text-base font-bold text-gray-900 mb-2">Admin Users</h2>
        <p class="text-xs text-gray-500 mb-2">Set via <code class="bg-gray-100 px-1 rounded">ADMIN_EMAILS</code> environment variable (comma-separated).</p>
        <div class="flex flex-wrap gap-2">
          ${adminEmails.map((e) => `<span class="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-sm">${escapeHtml(e)}</span>`).join("") || '<span class="text-gray-400 text-sm">No admin emails configured</span>'}
        </div>
      </div>

    </div>
  </div>`;

  return baseLayout(content, `Admin — NFL Draft ${year}`, clerkPublishableKey);
}

// ─── Simulator ───────────────────────────────────────────────────────────────

export interface SimPick {
  pickNumber: number;
  playerName: string;
  teamName: string;
  position: string;
}

function normSim(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function simPickRow(
  pickNumber: number,
  teamName: string,
  userPick: Pick | null,
  simPick: SimPick | null,
  officialByPlayer: Map<string, number>
): string {
  const userPlayer = userPick?.playerName ?? null;
  const officialPlayer = simPick?.playerName ?? null;

  // Compute score + row color matching the main picks table scheme
  let rowBg = "bg-gray-50";
  let accentBorder = "";
  let scorePts: number | null = null;

  if (!simPick) {
    // No official pick yet for this slot — muted pending
    rowBg = "bg-gray-50";
  } else if (userPlayer) {
    const officialPickNum = officialByPlayer.get(normSim(userPlayer));
    if (officialPickNum != null) {
      const diff = Math.abs(pickNumber - officialPickNum);
      const base = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
      scorePts = base * (userPick?.doubleScorePick ? 2 : 1);
      if (diff === 0) { rowBg = "bg-green-100";  accentBorder = "border-l-4 border-green-500"; }
      else if (diff === 1) { rowBg = "bg-yellow-100"; accentBorder = "border-l-4 border-yellow-400"; }
      else if (diff === 2) { rowBg = "bg-red-100";    accentBorder = "border-l-4 border-red-400"; }
      else { rowBg = "bg-gray-100"; scorePts = 0; }
    } else {
      // User's player not yet officially picked
      rowBg = "bg-gray-50";
    }
  } else {
    // No user pick in this slot
    rowBg = "bg-gray-100";
  }

  const scoreBadge = (scorePts != null && scorePts > 0)
    ? ` <span class="ml-1 text-[10px] font-bold ${scorePts >= 4 ? "text-green-700" : scorePts >= 2 ? "text-yellow-600" : "text-red-500"}">+${scorePts}</span>`
    : "";

  const numTextClass  = rowBg === "bg-gray-100" ? "text-gray-400" : "text-gray-500";
  const teamTextClass = rowBg === "bg-gray-100" ? "text-gray-400" : "text-gray-700";

  return `<tr class="border-b border-gray-100 ${rowBg}">
  <td class="px-3 py-2 font-medium w-8 ${numTextClass} ${accentBorder}">${pickNumber}</td>
  <td class="px-3 py-2 text-sm ${teamTextClass}">${escapeHtml(teamName)}</td>
  <td class="px-3 py-2 text-sm">
    ${userPlayer
      ? `<span class="font-medium ${rowBg === "bg-gray-100" ? "text-gray-400" : "text-gray-900"}">${escapeHtml(userPlayer)}</span>${userPick?.position ? ` <span class="text-gray-400 text-xs">${escapeHtml(userPick.position)}</span>` : ""}${scoreBadge}`
      : `<span class="text-gray-400 italic">—</span>`}
  </td>
  <td class="px-3 py-2 text-sm">
    ${officialPlayer
      ? `<span class="font-semibold ${rowBg === "bg-gray-100" ? "text-gray-400" : "text-blue-800"}">${escapeHtml(officialPlayer)}</span>${simPick?.position ? ` <span class="text-gray-400 text-xs">${escapeHtml(simPick.position)}</span>` : ""}`
      : `<span class="text-gray-300">–</span>`}
  </td>
</tr>`;
}

export function simulatorPicksFragment(
  userPicks: Pick[],
  simPicks: SimPick[],
  year: number,
  score: number
): string {
  const teams = getFirstRoundTeams(year);
  const userMap = new Map(userPicks.map((p) => [p.pickNumber, p]));
  const simMap = new Map(simPicks.map((p) => [p.pickNumber, p]));

  // Build officialByPlayer map from sim picks
  const officialByPlayer = new Map<string, number>();
  simPicks.forEach((p) => {
    if (p.playerName) officialByPlayer.set(p.playerName.trim().toLowerCase().replace(/\s+/g, " "), p.pickNumber);
  });

  const rows = Array.from({ length: 32 }, (_, i) => {
    const num = i + 1;
    return simPickRow(num, teams[num] ?? `Pick ${num}`, userMap.get(num) ?? null, simMap.get(num) ?? null, officialByPlayer);
  }).join("");

  const nextPickNum = simPicks.length + 1;
  const isDone = simPicks.length >= 32;

  return `<div id="simulator-picks-fragment">
  <div class="flex flex-wrap gap-3 text-xs text-gray-400 mb-2 px-0.5">
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-green-400"></span> Exact (+3 pts)</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-yellow-300"></span> ±1 slot (+2 pts)</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-red-300"></span> ±2 slots (+1 pt)</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-sm bg-gray-400"></span> No score / pending</span>
  </div>
  <div class="flex items-center justify-between mb-3">
    <div class="text-lg font-bold text-white">
      Score: <span class="text-yellow-400">${score}</span>
      <span class="text-gray-400 text-sm font-normal ml-2">${simPicks.length}/32 picks revealed</span>
    </div>
    <div class="flex gap-2">
      ${!isDone ? `<button type="button"
        hx-post="/admin/draft/${year}/simulator/next"
        hx-target="#simulator-picks-fragment"
        hx-swap="outerHTML"
        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium text-sm transition-colors">
        ▶ Pick #${nextPickNum}
      </button>` : `<span class="px-4 py-2 bg-gray-600 text-gray-300 rounded text-sm">All 32 picks done</span>`}
      <button type="button"
        hx-delete="/admin/draft/${year}/simulator"
        hx-target="#simulator-picks-fragment"
        hx-swap="outerHTML"
        hx-confirm="Reset simulation?"
        class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-medium text-sm transition-colors">
        ↺ Reset
      </button>
    </div>
  </div>
  <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-red-600 text-white sticky top-0">
        <tr>
          <th class="px-3 py-2 text-left font-semibold">#</th>
          <th class="px-3 py-2 text-left font-semibold">Team</th>
          <th class="px-3 py-2 text-left font-semibold">Your Pick</th>
          <th class="px-3 py-2 text-left font-semibold">Official Pick</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

export function simulatorPage(
  userPicks: Pick[],
  simPicks: SimPick[],
  year: number,
  score: number,
  clerkPublishableKey?: string
): string {
  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100">
    ${adminTopBar(year, "simulator")}
    <div class="max-w-4xl mx-auto py-6 px-4">
      <p class="text-slate-400 text-sm mb-4">
        Simulate the draft by revealing one pick at a time. Your saved picks are shown in "Your Pick". Random players are assigned as official picks. Score updates live. Only visible to admins.
      </p>
      ${simulatorPicksFragment(userPicks, simPicks, year, score)}
    </div>
  </div>`;
  return baseLayout(content, `Simulator — NFL Draft ${year}`, clerkPublishableKey);
}
