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
    <div class="text-center max-w-2xl">
      <h1 class="text-5xl font-bold text-gray-900 mb-4">LLL Experience</h1>
      <p class="text-xl text-gray-600 mb-10">Your friend group's home for predictions, picks, and competition.</p>
      <div id="clerk-auth">
        <button
          onclick="window.Clerk?.openSignIn()"
          class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
        >
          Sign In to Get Started
        </button>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', async () => {
      await window.Clerk?.load();
      if (window.Clerk?.user) {
        window.location.href = '/apps';
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

export function pickCard(pick: Pick): string {
  return `
  <div
    id="pick-${pick.id}"
    data-pick-id="${pick.id}"
    data-pick-number="${pick.pickNumber}"
    class="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-grab active:cursor-grabbing htmx-added"
  >
    <span class="text-sm font-bold text-gray-400 w-6 shrink-0">${pick.pickNumber}</span>
    <div class="flex-1 min-w-0">
      <p class="font-semibold text-gray-900 truncate">${pick.playerName ? escapeHtml(pick.playerName) : '<span class="text-gray-400 italic">TBD</span>'}</p>
      <p class="text-sm text-gray-500">${pick.teamName ? escapeHtml(pick.teamName) : ""} ${pick.position ? `· ${escapeHtml(pick.position)}` : ""}</p>
    </div>
    <button
      hx-delete="/draft/picks/${pick.pickNumber}"
      hx-target="#pick-${pick.id}"
      hx-swap="outerHTML"
      hx-confirm="Remove this pick?"
      class="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
      title="Remove pick"
    >✕</button>
  </div>`;
}

export function emptyPickSlot(pickNumber: number): string {
  return `
  <div
    data-pick-number="${pickNumber}"
    class="flex items-center gap-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg px-4 py-3 text-gray-400"
  >
    <span class="text-sm font-bold w-6 shrink-0">${pickNumber}</span>
    <span class="italic text-sm">Empty slot</span>
  </div>`;
}

export function picksListFragment(picks: Pick[]): string {
  const TOTAL_PICKS = 32;
  const pickMap = new Map(picks.map((p) => [p.pickNumber, p]));

  const slots = Array.from({ length: TOTAL_PICKS }, (_, i) => {
    const num = i + 1;
    const pick = pickMap.get(num);
    return pick ? pickCard(pick) : emptyPickSlot(num);
  }).join("");

  return `<div id="picks-list" class="space-y-2">${slots}</div>`;
}

export function publicMockDraftPanel(): string {
  return `
  <div class="bg-white rounded-xl border border-gray-200 p-6">
    <h2 class="text-xl font-bold text-gray-900 mb-4">Public Mock Drafts</h2>
    <div class="flex gap-2 mb-6">
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">ESPN</button>
      <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">CBS</button>
      <button class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">PFF</button>
    </div>
    <div class="space-y-3">
      <p class="text-gray-400 italic text-sm">Public mock draft aggregator coming soon.</p>
    </div>
  </div>`;
}

export function draftLayout(picks: Pick[], clerkPublishableKey?: string): string {
  const content = `
  <div class="max-w-6xl mx-auto py-8 px-4">
    <div class="flex items-center justify-between mb-8">
      <div>
        <a href="/apps" class="text-sm text-blue-600 hover:underline">← Apps</a>
        <h1 class="text-3xl font-bold text-gray-900 mt-1">NFL Draft Predictor</h1>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left: User's mock draft -->
      <div>
        <h2 class="text-xl font-bold text-gray-900 mb-4">Your Mock Draft</h2>
        <p class="text-sm text-gray-500 mb-4">Drag picks to reorder. Click ✕ to remove.</p>
        <div
          hx-get="/draft/picks"
          hx-trigger="load"
          hx-swap="outerHTML"
        >
          <div class="text-gray-400 text-sm py-4">Loading picks…</div>
        </div>
      </div>
      <!-- Right: Public mock drafts -->
      <div>
        ${publicMockDraftPanel()}
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('htmx:afterSwap', function(evt) {
      if (evt.target.id === 'picks-list' || evt.detail?.target?.id === 'picks-list') {
        const list = document.getElementById('picks-list');
        if (!list) return;
        Sortable.create(list, {
          animation: 150,
          ghostClass: 'bg-blue-50',
          onEnd: function() {
            const picks = [...document.querySelectorAll('[data-pick-id]')]
              .map((el, i) => ({ pickNumber: i + 1, id: el.dataset.pickId }));
            htmx.ajax('POST', '/draft/picks', {
              values: { picks: JSON.stringify(picks) },
              target: '#picks-list',
              swap: 'outerHTML'
            });
          }
        });
      }
    });
  </script>`;
  return baseLayout(content, "NFL Draft Predictor — LLL Experience", clerkPublishableKey);
}
