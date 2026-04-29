import {baseLayout, escapeHtml} from './templates.js';
import type {TeamSuccessRow, TeamBreakdown, BreakdownYear, PickOutcome} from '../services/team-scout.js';
import type {ExpertOracleRow, ExpertScoutRow, ExpertProfile} from '../services/expert-audit.js';
import {teamLogoUrl} from '../services/lll-rating-engine.js';

export type {TeamSuccessRow} from '../services/team-scout.js';
// ExpertAccuracy retained as a type alias for the controllers / tests still importing it.
export type ExpertAccuracy = ExpertOracleRow;

export interface IndexMover {
  name: string;
  team: string;
  teamKey: string;
  round: number;
  year: number;
  delta: number;
  rating: number;
}

export interface DashboardSnapshot {
  totalPicks: number;
  totalExperts: number;
  windowStart: number;
  windowEnd: number;
  topMovers: IndexMover[];
  bustMovers: IndexMover[];
  oracleTop: ExpertOracleRow[];
  scoutTop: ExpertScoutRow[];
  mode: 'career' | 'season';
  selectedSeason?: number;
}

export function analyzerLayout(content: string, title = 'LLL Draft Analyzer', clerkPublishableKey?: string): string {
  const analyzerStyles = `
    <style>
      :root {
        --paper: #f3ede0;
        --ink: #14110b;
        --accent: #c9341d;
        --muted: #6b5e44;
      }
      .theme-paper {
        background-color: var(--paper);
        color: var(--ink);
        font-family: 'Source Serif 4', Georgia, serif;
      }
      .card-paper {
        background: white;
        border: 1px solid rgba(20, 17, 11, 0.1);
        box-shadow: 0 4px 12px rgba(20, 17, 11, 0.05);
      }
      .tab-active {
        border-bottom: 3px solid var(--accent);
        color: var(--accent);
      }
      .serif { font-family: 'Source Serif 4', Georgia, serif; }
      .mono { font-family: 'JetBrains Mono', monospace; }

      /* Inline tooltip for jargon (RMSE, Delta, etc.) */
      .lll-tip { position: relative; cursor: help; }
      .lll-tip > .tip-marker {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px; height: 14px;
        margin-left: 4px;
        border: 1px solid currentColor;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        opacity: 0.55;
        font-family: 'JetBrains Mono', monospace;
      }
      .lll-tip:hover > .tip-marker { opacity: 1; }
      .lll-tip > .tip-body {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        min-width: 220px;
        max-width: 280px;
        padding: 10px 12px;
        background: #14110b;
        color: #f3ede0;
        border-radius: 6px;
        box-shadow: 0 18px 40px -12px rgba(0,0,0,0.4);
        font-size: 11px;
        line-height: 1.45;
        font-family: 'Source Serif 4', Georgia, serif;
        font-style: italic;
        text-transform: none;
        letter-spacing: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.18s ease;
        z-index: 250;
      }
      .lll-tip:hover > .tip-body,
      .lll-tip:focus-within > .tip-body { opacity: 1; }

      /* Live indicator dot (pulses) */
      .live-dot {
        display: inline-block;
        width: 8px; height: 8px;
        border-radius: 999px;
        background: #16a34a;
        box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55);
        animation: live-pulse 1.6s infinite;
      }
      @keyframes live-pulse {
        0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
        70% { box-shadow: 0 0 0 8px rgba(22, 163, 74, 0); }
        100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
      }
    </style>
  `;

  return baseLayout(
    `<div class="theme-paper min-h-screen text-black">
      ${analyzerStyles}
      ${content}
    </div>`,
    title,
    clerkPublishableKey,
  );
}

/**
 * Inline color logo for a team. Use `size` to control width in tailwind units (e.g. '6' = 1.5rem).
 * Falls back to nothing if the team isn't recognised.
 */
export function teamLogo(teamKey: string | null | undefined, sizeClass = 'w-6 h-6'): string {
  const url = teamLogoUrl(teamKey);
  if (!url) {
    return '';
  }
  return `<img src="${url}" alt="" loading="lazy" class="${sizeClass} object-contain shrink-0" />`;
}

/**
 * Tooltip pill: hover the [?] icon to see the explanation.
 * `label` is the visible text; `body` is the hover content.
 */
export function tooltip(label: string, body: string, extraClass = ''): string {
  return `<span class="lll-tip ${extraClass}" tabindex="0">${label}<span class="tip-marker" aria-hidden="true">?</span><span role="tooltip" class="tip-body">${escapeHtml(body)}</span></span>`;
}

const TOOLTIPS = {
  rmse: 'Root-Mean-Square Error. Take the gap between the expert\u2019s predicted draft slot and the actual slot for every player they ranked, square it, average, and square-root. Lower = closer to the truth.',
  lllDelta:
    'LLL Delta = how much a pick out- or under-performed the expected value for its draft round. Positive numbers beat the round, negative miss it.',
  talentDelta:
    'Talent Delta. Same RMSE math as Mock Accuracy, but applied to the rating their rank implied vs the player\u2019s actual career rating. Lower = they were right about the talent, even if the league disagreed on draft slot.',
  hitRate:
    'Hit Rate = the share of a team\u2019s picks that beat the expected value for their round (LLL Delta > 0.5). The cleanest way to see who\u2019s consistently winning the draft.',
  outcomes:
    'Each pick is bucketed by its LLL Delta: ELITE HIT > +1.5 over expectation, HIT > +0.5, MET EXPECTATION within \u00b10.5, UNDERPERFORMED \u22120.5 to \u22121.5, BUST below that. PENDING = drafted in the last two cycles, not enough seasons to grade.',
} as const;

export function liveBadge(): string {
  return `
    <span class="lll-tip inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700" tabindex="0">
      <span class="live-dot"></span>LIVE
      <span role="tooltip" class="tip-body">Ratings auto-sync from the nflverse Approximate Value feed. Career numbers update every time we re-run the ingestion cron.</span>
    </span>
  `;
}

function header(active: 'dashboard' | 'experts' | 'teams' = 'dashboard'): string {
  return `
    <header class="border-b border-black/10 py-6 px-4 bg-white/50 backdrop-blur-sm sticky top-0 z-[100]">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter text-black">DRAFT ANALYZER</h1>
          <div class="flex items-center gap-3 mt-0.5">
            <p class="text-[10px] text-muted font-bold uppercase tracking-widest">Intelligence &amp; Historical Tracking</p>
            ${liveBadge()}
          </div>
        </div>
        <div class="relative w-full md:w-64 group">
          <input
            type="text"
            name="q"
            placeholder="Search players or experts..."
            class="w-full bg-white/80 border border-black/10 px-4 py-2 text-sm focus:outline-none focus:border-accent serif italic shadow-sm"
            hx-get="/analyzer/api/search"
            hx-trigger="keyup changed delay:300ms"
            hx-target="#search-results"
          />
          <div id="search-results" class="absolute top-full left-0 right-0 z-[110] mt-1 shadow-2xl text-black"></div>
        </div>
        <nav class="flex gap-6 text-[10px] font-bold uppercase tracking-[0.2em]">
          <a href="/analyzer" class="${active === 'dashboard' ? 'tab-active' : 'text-muted hover:text-accent'} transition-colors">Dashboard</a>
          <a href="/analyzer/experts" class="${active === 'experts' ? 'tab-active' : 'text-muted hover:text-accent'} transition-colors">Experts</a>
          <a href="/analyzer/teams" class="${active === 'teams' ? 'tab-active' : 'text-muted hover:text-accent'} transition-colors">Teams</a>
        </nav>
      </div>
    </header>
  `;
}

export function analyzerDashboard(snapshot: DashboardSnapshot, clerkKey?: string): string {
  const movers = renderMovers(snapshot.topMovers, snapshot.bustMovers);
  const oracle = renderOracleMini(snapshot.oracleTop);
  const scout = renderScoutMini(snapshot.scoutTop);

  const isCareer = snapshot.mode === 'career';
  const selectedSeason = snapshot.selectedSeason ?? 2024;
  const seasonOptions = [2024, 2023, 2022, 2021, 2020, 2019, 2018];

  const modeStrip = `
    <div class="flex flex-wrap items-center gap-3 mb-8">
      <div class="flex items-center bg-black/[0.05] rounded-md p-1 text-[10px] font-bold uppercase tracking-[0.2em]">
        <button onclick="setMode('career')"
          class="px-3 py-1.5 rounded-md transition-all ${isCareer ? 'bg-black text-white' : 'text-muted hover:text-black'}">
          Career
        </button>
        <button onclick="setMode('season')"
          class="px-3 py-1.5 rounded-md transition-all ${!isCareer ? 'bg-black text-white' : 'text-muted hover:text-black'}">
          Single Season
        </button>
      </div>
      <select id="season-picker" onchange="setSeason(this.value)"
        class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] border border-black bg-white ${isCareer ? 'opacity-30 pointer-events-none' : ''}">
        ${seasonOptions.map((y) => `<option value="${y}" ${y === selectedSeason ? 'selected' : ''}>${y} season</option>`).join('')}
      </select>
      <span class="text-[10px] text-muted serif italic">
        ${
          isCareer
            ? 'Career view: cumulative production through today.'
            : `${selectedSeason} view: only what each player did in the ${selectedSeason} NFL season.`
        }
      </span>
    </div>
    <script>
      function setMode(mode) {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        if (mode === 'career') url.searchParams.delete('season');
        else if (!url.searchParams.get('season')) url.searchParams.set('season', '${selectedSeason}');
        window.location.href = url.toString();
      }
      function setSeason(year) {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', 'season');
        url.searchParams.set('season', year);
        window.location.href = url.toString();
      }
    </script>
  `;

  const modeQs = isCareer ? 'mode=career' : `mode=season&season=${selectedSeason}`;

  const content = `
    ${header('dashboard')}
    <main class="max-w-5xl mx-auto py-12 px-4 text-black">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-16 text-black">
        <div class="md:col-span-2 space-y-16">
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-4">
              State of the league · ${snapshot.windowStart}–${snapshot.windowEnd} window
            </div>
            <h2 class="text-7xl font-bold tracking-tighter text-black leading-[0.9] mb-6">
              The <span class="italic serif font-normal">market</span> doesn't lie.
            </h2>
            <p class="text-2xl text-muted serif italic max-w-xl leading-relaxed mb-6">
              ${snapshot.totalPicks.toLocaleString()} picks scored · ${snapshot.totalExperts} experts audited ·
              best-4-of-6 + trajectory + contract market signal.
            </p>
            ${modeStrip}
          </section>

          <section class="space-y-8 text-black">
             <div class="flex justify-between items-end border-b-2 border-black pb-2">
               <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">FRANCHISE INDEX · TOP 10</h3>
               <div class="flex gap-2">
                 ${[3, 5, 6, 8]
                   .map(
                     (y) => `
                   <button
                     onclick="fetchSuccessIndex(${y})"
                     class="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border border-black hover:bg-black hover:text-white transition-all ${y === 6 ? 'bg-black text-white' : ''}"
                   >${y}Y</button>
                 `,
                   )
                   .join('')}
               </div>
             </div>
             <div id="success-leaderboard" hx-get="/analyzer/fragment/success-leaderboard?window=6&${modeQs}" hx-trigger="load">
                <p class="italic py-8 text-muted text-center text-sm">Aggregating receipts...</p>
             </div>
             <div class="flex justify-end pt-2">
               <a href="/analyzer/teams?${modeQs}"
                  class="text-[10px] font-bold uppercase tracking-[0.3em] text-black hover:text-accent border-b-2 border-accent pb-0.5 transition-colors">
                 View all 32 teams →
               </a>
             </div>
             <script>
               function fetchSuccessIndex(window) {
                 htmx.ajax('GET', '/analyzer/fragment/success-leaderboard?window=' + window + '&${modeQs}', '#success-leaderboard');
               }
             </script>
          </section>

          <section class="space-y-6 text-black">
            <div class="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-2">
              <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">
                LEAGUE-WIDE INDEX MOVERS · TOP 10
              </h3>
              <div class="flex flex-wrap gap-1.5" id="movers-year-filter">
                ${['all', '2023', '2022', '2021', '2020', '2019', '2018']
                  .map(
                    (y) => `
                  <button
                    onclick="fetchMovers('${y}')"
                    data-year="${y}"
                    class="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border border-black hover:bg-black hover:text-white transition-all ${y === 'all' ? 'bg-black text-white' : ''}">
                    ${y === 'all' ? 'ALL YEARS' : y}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>
            <p class="text-[10px] text-muted">${tooltip('LLL Delta', TOOLTIPS.lllDelta)} = how far each pick beat or missed its round expectation. ${isCareer ? 'Cumulative career view.' : `Filtered to the ${selectedSeason} NFL season only.`} Buttons below filter by draft year.</p>
            <div id="movers-feed" hx-get="/analyzer/fragment/movers?year=all&${modeQs}" hx-trigger="load">
              ${movers}
            </div>
            <script>
              function fetchMovers(year) {
                document.querySelectorAll('#movers-year-filter button').forEach(b => {
                  b.classList.toggle('bg-black', b.dataset.year === year);
                  b.classList.toggle('text-white', b.dataset.year === year);
                });
                htmx.ajax('GET', '/analyzer/fragment/movers?year=' + year + '&${modeQs}', '#movers-feed');
              }
            </script>
          </section>
        </div>

        <div class="space-y-12 text-black">
          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">ORACLE · MOCK ACCURACY</h3>
            <p class="text-[10px] text-muted mb-5">${tooltip('RMSE', TOOLTIPS.rmse)} between expert big-board rank and actual draft slot. Lower is better.</p>
            ${oracle}
          </div>

          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">SCOUT · ${tooltip('TALENT DELTA', TOOLTIPS.talentDelta)}</h3>
            <p class="text-[10px] text-muted mb-5">RMSE between expert's rank-implied quality and actual LLL career rating. Lower is better.</p>
            ${scout}
          </div>

          <div class="p-6 bg-accent text-white rounded-lg shadow-xl relative overflow-hidden group">
            <div class="absolute -right-4 -bottom-4 text-black/10 text-9xl font-bold italic group-hover:scale-110 transition-transform">LLL</div>
            <h3 class="font-bold text-sm mb-2 uppercase tracking-widest relative z-10 text-white">Proprietary Metric</h3>
            <p class="text-xs opacity-90 relative z-10 font-serif italic leading-relaxed text-white">
              "Performance Score = best 4 of 6 normalized seasons + trajectory modifier + contract market signal,
              graded against per-round expected value."
            </p>
          </div>
        </div>
      </div>
    </main>
    <div id="team-modal-root"></div>
    <script>
      function closeTeamModal() {
        const root = document.getElementById('team-modal-root');
        if (root) root.innerHTML = '';
        document.body.style.overflow = '';
      }
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTeamModal(); });
      document.addEventListener('htmx:afterSwap', (e) => {
        if (e.detail && e.detail.target && e.detail.target.id === 'team-modal-root' && e.detail.target.innerHTML.trim() !== '') {
          document.body.style.overflow = 'hidden';
        }
      });
    </script>
  `;
  return analyzerLayout(content, 'Dashboard — LLL Draft Analyzer', clerkKey);
}

export function renderMovers(hits: IndexMover[], busts: IndexMover[]): string {
  const renderRow = (m: IndexMover, isBust = false) => `
    <a href="/analyzer/player/${encodeURIComponent(m.name)}"
       class="flex justify-between items-center py-2.5 border-b border-black/5 group hover:bg-black/[0.02] transition-colors px-2 -mx-2">
      <div class="flex items-center gap-3 min-w-0">
        ${teamLogo(m.teamKey, 'w-7 h-7')}
        <div class="min-w-0">
          <div class="font-bold text-sm text-black group-hover:text-accent transition-colors truncate">${escapeHtml(m.name)}</div>
          <div class="text-[10px] text-muted uppercase tracking-widest font-bold">
            R${m.round} · ${m.year} · ${escapeHtml(m.team)}
          </div>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-mono font-bold text-lg ${isBust ? 'text-black/40' : 'text-accent'}">
          ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}
        </div>
        <div class="text-[8px] text-muted font-bold uppercase tracking-tighter">LLL DELTA</div>
      </div>
    </a>
  `;
  const empty = `<p class="text-[11px] italic text-muted py-6 text-center">No picks in this slice.</p>`;
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-black">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-3">Biggest Hits</div>
        ${hits.length > 0 ? hits.map((h) => renderRow(h, false)).join('') : empty}
      </div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-3">Biggest Busts</div>
        ${busts.length > 0 ? busts.map((b) => renderRow(b, true)).join('') : empty}
      </div>
    </div>
  `;
}

function renderOracleMini(rows: ExpertOracleRow[]): string {
  if (rows.length === 0) {
    return `<p class="text-[11px] italic text-muted text-center py-4">No expert mock data yet.</p>`;
  }
  return `
    <div class="space-y-1 text-black">
      ${rows
        .slice(0, 4)
        .map(
          (e, i) => `
        <a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}"
           class="flex justify-between items-center ${i < 3 ? 'border-b border-black/5 pb-3 mb-3' : ''} group hover:bg-black/[0.02] -mx-2 px-2 py-1 rounded transition-colors">
          <div>
            <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</div>
            <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${escapeHtml(e.org || 'Independent')} · n=${e.sampleSize}</div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-black text-lg">${e.rmse.toFixed(1)}</div>
            <div class="text-[8px] text-accent font-bold uppercase tracking-tighter">RMSE</div>
          </div>
        </a>
      `,
        )
        .join('')}
      <a href="/analyzer/experts" class="block text-center text-[9px] font-bold uppercase tracking-[0.3em] text-muted hover:text-black mt-4 transition-colors border-t border-black/5 pt-3">Full Leaderboard →</a>
    </div>
  `;
}

function renderScoutMini(rows: ExpertScoutRow[]): string {
  if (rows.length === 0) {
    return `<p class="text-[11px] italic text-muted text-center py-4">Need more career-rating data to score scouts.</p>`;
  }
  return `
    <div class="space-y-1 text-black">
      ${rows
        .slice(0, 4)
        .map(
          (e, i) => `
        <a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}"
           class="flex justify-between items-center ${i < 3 ? 'border-b border-black/5 pb-3 mb-3' : ''} group hover:bg-black/[0.02] -mx-2 px-2 py-1 rounded transition-colors">
          <div>
            <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</div>
            <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${escapeHtml(e.org || 'Independent')} · n=${e.sampleSize}</div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-black text-lg">${e.talentDelta.toFixed(2)}</div>
            <div class="text-[8px] text-accent font-bold uppercase tracking-tighter">DELTA · ${e.letter}</div>
          </div>
        </a>
      `,
        )
        .join('')}
      <a href="/analyzer/experts" class="block text-center text-[9px] font-bold uppercase tracking-[0.3em] text-muted hover:text-black mt-4 transition-colors border-t border-black/5 pt-3">Full Leaderboard →</a>
    </div>
  `;
}

export function expertLeaderboard(oracle: ExpertOracleRow[], scout: ExpertScoutRow[], clerkKey?: string): string {
  const oracleRows = oracle
    .map(
      (e, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group cursor-pointer"
        onclick="window.location.href='/analyzer/expert/${encodeURIComponent(e.expertSlug)}'">
      <td class="py-4 px-4 font-bold text-lg text-black">#${i + 1}</td>
      <td class="py-4">
        <a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}" class="font-bold text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</a>
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">${escapeHtml(e.org || 'Independent')}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg">${e.rmse.toFixed(1)}</td>
      <td class="py-4 text-center text-muted font-bold">${e.sampleSize}</td>
      <td class="py-4 text-center text-[11px] text-muted">${e.yearsCovered.join(', ')}</td>
    </tr>
  `,
    )
    .join('');

  const scoutRows = scout
    .map(
      (e, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group cursor-pointer"
        onclick="window.location.href='/analyzer/expert/${encodeURIComponent(e.expertSlug)}'">
      <td class="py-4 px-4 font-bold text-lg text-black">#${i + 1}</td>
      <td class="py-4">
        <a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}" class="font-bold text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</a>
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">${escapeHtml(e.org || 'Independent')}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg">${e.talentDelta.toFixed(2)}</td>
      <td class="py-4 text-center text-muted font-bold">${e.sampleSize}</td>
      <td class="py-4 text-center font-bold serif italic text-xl">${e.letter}</td>
    </tr>
  `,
    )
    .join('');

  const content = `
    ${header('experts')}
    <div class="max-w-5xl mx-auto py-12 px-4 text-black">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-6 inline-block transition-colors">← Back to Dashboard</a>
      <h2 class="text-6xl font-bold tracking-tighter mb-2 text-black">EXPERT AUDIT</h2>
      <p class="text-muted italic mb-10 border-b border-black/10 pb-4 serif text-lg">
        Two scoreboards. Same talent universe.
      </p>

      <section class="mb-16">
        <div class="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">ORACLE · Mock Draft Accuracy</h3>
          <p class="text-[11px] text-muted italic">${tooltip('RMSE', TOOLTIPS.rmse)}(predicted rank, actual draft slot) · lower = better</p>
        </div>
        <div class="card-paper rounded-lg overflow-hidden border-t-8 border-black shadow-xl">
          <table class="w-full text-left border-collapse text-black">
            <thead>
              <tr class="bg-black text-white text-[10px] uppercase tracking-[0.2em]">
                <th class="py-4 px-4">Rank</th>
                <th class="py-4">Expert / Source</th>
                <th class="py-4 text-center">RMSE</th>
                <th class="py-4 text-center">Sample</th>
                <th class="py-4 text-center">Years</th>
              </tr>
            </thead>
            <tbody>
              ${oracleRows || '<tr><td colspan="5" class="py-8 text-center italic text-muted">No mock-vs-draft matches found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">SCOUT · ${tooltip('Talent Delta', TOOLTIPS.talentDelta)}</h3>
          <p class="text-[11px] text-muted italic">RMSE(rank-implied rating, actual career rating) · lower = better</p>
        </div>
        <div class="card-paper rounded-lg overflow-hidden border-t-8 border-accent shadow-xl">
          <table class="w-full text-left border-collapse text-black">
            <thead>
              <tr class="bg-black text-white text-[10px] uppercase tracking-[0.2em]">
                <th class="py-4 px-4">Rank</th>
                <th class="py-4">Expert / Source</th>
                <th class="py-4 text-center">Talent Δ</th>
                <th class="py-4 text-center">Sample</th>
                <th class="py-4 text-center">Letter</th>
              </tr>
            </thead>
            <tbody>
              ${scoutRows || '<tr><td colspan="5" class="py-8 text-center italic text-muted">Need more career-rating data.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
  return analyzerLayout(content, 'Expert Audit — LLL', clerkKey);
}

export function teamLeaderboard(
  teams: TeamSuccessRow[],
  clerkKey?: string,
  opts: {mode?: 'career' | 'season'; season?: number} = {},
): string {
  const isSeason = opts.mode === 'season' && opts.season !== undefined;
  const viewLabel = isSeason ? `${opts.season} NFL season` : 'Career';
  const totalPicks = teams.reduce((s, t) => s + t.totalPicks, 0);
  const cards = teams
    .map((t, i) => {
      const accent = i < 8 ? 'border-accent' : 'border-black/20';
      return `
    <div class="card-paper p-6 rounded-lg border-t-4 ${accent} shadow-sm hover:shadow-md transition-all group">
      <div class="flex justify-between items-start mb-4 gap-3">
        <div class="flex items-start gap-3 min-w-0">
          ${teamLogo(t.teamKey, 'w-10 h-10')}
          <div class="min-w-0">
            <div class="text-[8px] font-bold text-muted uppercase tracking-[0.2em] mb-1">Rank #${i + 1}</div>
            <h3 class="text-xl font-bold tracking-tighter text-black group-hover:text-accent transition-colors truncate">${escapeHtml(t.team)}</h3>
          </div>
        </div>
        <span class="text-2xl font-bold text-black serif italic shrink-0">${t.grade}</span>
      </div>
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>${tooltip('Hit Rate', TOOLTIPS.hitRate)}</span>
            <span class="text-black font-bold">${t.hitRate}% (${t.hits}/${t.totalPicks})</span>
          </div>
          <div class="h-1 w-full bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-black" style="width: ${t.hitRate}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>League Position</span>
            <span class="text-accent font-bold mono">${tooltip('Δ', TOOLTIPS.lllDelta)} ${t.avgDelta > 0 ? '+' : ''}${t.avgDelta.toFixed(2)}</span>
          </div>
          <div class="h-1 w-full bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-accent" style="width: ${t.value}%"></div>
          </div>
        </div>
        ${
          t.topPick
            ? `
          <div class="pt-3 border-t border-black/5 text-[10px]">
            <div class="text-muted font-bold uppercase tracking-widest mb-0.5">Best Pick</div>
            <a href="/analyzer/player/${encodeURIComponent(t.topPick.name)}" class="font-bold hover:text-accent transition-colors">${escapeHtml(t.topPick.name)}</a>
            <span class="text-muted">· R${t.topPick.round} ${t.topPick.year} · Δ ${t.topPick.delta.toFixed(2)}</span>
          </div>`
            : ''
        }
        ${
          t.worstPick
            ? `
          <div class="text-[10px]">
            <div class="text-muted font-bold uppercase tracking-widest mb-0.5">Worst Pick</div>
            <a href="/analyzer/player/${encodeURIComponent(t.worstPick.name)}" class="font-bold hover:text-accent transition-colors">${escapeHtml(t.worstPick.name)}</a>
            <span class="text-muted">· R${t.worstPick.round} ${t.worstPick.year} · Δ ${t.worstPick.delta.toFixed(2)}</span>
          </div>`
            : ''
        }
      </div>
    </div>
  `;
    })
    .join('');

  const content = `
    ${header('teams')}
    <div class="max-w-6xl mx-auto py-12 px-4 text-black">
      <div class="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
        <div>
          <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent mb-4 inline-block transition-colors">← Back to Dashboard</a>
          <h2 class="text-6xl font-bold tracking-tighter text-black">FRANCHISE INDEX</h2>
          <p class="text-muted italic serif text-xl max-w-xl leading-relaxed">
            All 32 teams. Hit Rate (% of picks beating round expectation) and League Position
            (avg delta vs league spread). Letter grade is rank-relative.
          </p>
          <div class="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-black/[0.05] rounded-md text-[10px] font-bold uppercase tracking-[0.2em]">
            <span class="text-muted">View:</span>
            <span class="text-black">${escapeHtml(viewLabel)}</span>
          </div>
        </div>
        <div class="bg-black text-white px-6 py-4 rounded-lg shadow-xl shrink-0">
           <div class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-1">Picks scored</div>
           <div class="text-3xl font-bold tracking-tighter">${totalPicks.toLocaleString()} <span class="text-sm opacity-60 uppercase tracking-widest font-normal">in window</span></div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-black">
        ${cards}
      </div>
    </div>
  `;
  return analyzerLayout(content, 'Franchise Index — LLL Draft Analyzer', clerkKey);
}

export function successLeaderboard(
  teams: TeamSuccessRow[],
  opts: {mode?: 'career' | 'season'; season?: number} = {},
): string {
  const modeQs =
    opts.mode === 'season' && opts.season !== undefined ? `mode=season&season=${opts.season}` : 'mode=career';
  const rows = teams
    .map(
      (t, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group cursor-pointer"
        hx-get="/analyzer/fragment/team-breakdown/${encodeURIComponent(t.teamKey)}?${modeQs}"
        hx-target="#team-modal-root"
        hx-swap="innerHTML"
        hx-trigger="click"
        title="Why this grade? Click for the breakdown.">
      <td class="py-4 px-4 font-bold text-black text-xl serif italic">#${i + 1}</td>
      <td class="py-4 text-black">
        <div class="flex items-center gap-3">
          ${teamLogo(t.teamKey, 'w-9 h-9')}
          <div>
            <div class="font-bold text-black text-lg tracking-tighter group-hover:text-accent transition-colors">${escapeHtml(t.team.toUpperCase())}</div>
            <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${t.totalPicks} picks · ${t.hits} hits</div>
          </div>
        </div>
      </td>
      <td class="py-4 text-center text-black">
        <div class="inline-block px-3 py-1 bg-black text-white text-xs font-bold rounded-sm">${t.hitRate}%</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg">${t.avgDelta > 0 ? '+' : ''}${t.avgDelta.toFixed(2)}</td>
      <td class="py-4 pr-4 text-right text-black">
        <div class="text-2xl font-bold text-black serif italic leading-none group-hover:text-accent transition-colors">${t.grade}</div>
        <div class="text-[8px] text-muted font-bold uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Tap →</div>
      </td>
    </tr>
  `,
    )
    .join('');

  return `
    <div class="card-paper rounded-lg overflow-hidden border-t-4 border-black shadow-lg text-black">
      <table class="w-full text-left border-collapse text-black">
        <thead>
          <tr class="bg-black/5 text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
            <th class="py-3 px-4 w-16">Rank</th>
            <th class="py-3">Franchise</th>
            <th class="py-3 text-center">${tooltip('Hit Rate', TOOLTIPS.hitRate)}</th>
            <th class="py-3 text-center">${tooltip('Avg Δ', TOOLTIPS.lllDelta)}</th>
            <th class="py-3 pr-4 text-right">LLL Grade</th>
          </tr>
        </thead>
        <tbody class="text-black">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

export function topExpertsMini(experts: ExpertOracleRow[]): string {
  return renderOracleMini(experts);
}

export function playerProfile(profile: any, clerkKey?: string): string {
  const performanceRows = (profile.performanceHistory || [])
    .map(
      (p: any) => `
    <div class="flex justify-between items-center py-4 border-b border-black/5">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-muted">${p.evaluationYear} EVALUATION</div>
        <div class="font-bold text-black text-base">${escapeHtml(p.justification || '')}</div>
      </div>
      <div class="text-right">
        <div class="text-3xl font-bold text-accent">${Number(p.rating).toFixed(1)}</div>
        <div class="text-[10px] font-bold uppercase tracking-tighter text-muted">0–10 SCALE</div>
      </div>
    </div>
  `,
    )
    .join('');

  const accuracyRows = (profile.accuracySummary || [])
    .map(
      (a: any) => `
    <div class="flex justify-between items-baseline border-b border-black/5 pb-2">
      <div>
        <div class="font-bold text-sm">${escapeHtml(a.expert)}</div>
        ${a.impliedRating ? `<div class="text-[9px] text-muted">Implied rating ${a.impliedRating}</div>` : ''}
      </div>
      <div class="text-right">
        <span class="${a.isAccurate ? 'text-accent' : 'text-muted'} font-bold font-mono text-lg">#${a.predictedRank ?? '—'}</span>
        <div class="text-[8px] font-bold text-muted uppercase">PREDICTED</div>
      </div>
    </div>
  `,
    )
    .join('');

  const content = `
    ${header('dashboard')}
    <div class="max-w-5xl mx-auto py-12 px-4 text-black">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-8 inline-block transition-colors">← Back to Dashboard</a>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-12 text-black">
        <div class="md:col-span-2 space-y-12">
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-4">
              Round ${profile.round} · ${profile.performanceHistory?.[0]?.draftYear || 'N/A'}
            </div>
            <h2 class="text-7xl font-bold tracking-tighter text-black leading-none mb-6">${escapeHtml(profile.playerName.toUpperCase())}</h2>
            <p class="text-2xl text-muted serif italic mb-2 leading-relaxed">
               LLL Grade: <span class="text-black font-bold border-b-4 border-black pb-1">${profile.finalGrade > 0 ? '+' : ''}${Number(profile.finalGrade).toFixed(2)} (${profile.outcome})</span>
            </p>
            <p class="text-sm text-muted mb-10">Performance Score ${Number(profile.weightedScore).toFixed(2)} · Expected ${(profile.weightedScore - profile.finalGrade).toFixed(2)} (round-based)</p>

            <div class="space-y-4">
              <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-black pb-2 text-black">CAREER TRAJECTORY</h3>
              ${performanceRows || '<p class="text-[12px] italic text-muted py-4">No career rating yet.</p>'}
            </div>
          </section>
        </div>

        <div class="space-y-12 text-black">
          <div class="card-paper p-8 rounded-lg border-t-8 border-black shadow-xl">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-6 text-black">EXPERT TAKES</h3>
            <div class="space-y-6">
              ${accuracyRows || '<p class="text-[11px] italic text-muted">No tracked experts ranked this player.</p>'}
            </div>
          </div>

          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">MARKET SIGNAL</h3>
            <div class="text-2xl font-bold text-accent italic serif mb-2">${escapeHtml(profile.contractOutcome || 'ROOKIE DEAL')}</div>
            <p class="text-xs text-muted leading-relaxed uppercase font-bold tracking-tighter">
              2nd contract is the league's own truth signal for stat-light positions.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
  return analyzerLayout(content, `${profile.playerName} — LLL Profile`, clerkKey);
}

export function searchResultsFragment(results: {players: any[]; experts: any[]}): string {
  if (results.players.length === 0 && results.experts.length === 0) {
    return `
      <div class="card-paper p-6 text-xs italic text-muted shadow-2xl">
        No intelligence found for that query.
      </div>
    `;
  }

  const players = results.players
    .map(
      (p) => `
    <a href="/analyzer/player/${encodeURIComponent(p.name)}" class="block p-4 hover:bg-black/[0.04] transition-colors border-b border-black/5 group">
      <div class="font-bold text-black text-base group-hover:text-accent transition-colors">${escapeHtml((p.name || '').toUpperCase())}</div>
      <div class="text-[10px] text-muted font-bold uppercase tracking-widest">${p.year} · ${escapeHtml(p.team || '')}</div>
    </a>
  `,
    )
    .join('');

  const experts = results.experts
    .map(
      (e) => `
    <a href="/analyzer/experts" class="block p-4 hover:bg-black/[0.04] transition-colors border-b border-black/5 group">
      <div class="font-bold text-black text-base group-hover:text-accent transition-colors">${escapeHtml((e.name || '').toUpperCase())}</div>
      <div class="text-[10px] text-muted font-bold uppercase tracking-widest">${escapeHtml(e.org || 'Independent')}</div>
    </a>
  `,
    )
    .join('');

  return `
    <div class="card-paper shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] max-h-[70vh] overflow-auto border-t-8 border-black">
      ${results.players.length > 0 ? `<div class="bg-black text-white px-4 py-1 text-[9px] font-bold uppercase tracking-[0.3em]">Scouted Players</div>${players}` : ''}
      ${results.experts.length > 0 ? `<div class="bg-black text-white px-4 py-1 text-[9px] font-bold uppercase tracking-[0.3em]">Audited Experts</div>${experts}` : ''}
    </div>
  `;
}

// Legacy export retained for any external callers; no longer used by the dashboard.
export function timelineFragment(_events: unknown[]): string {
  return '';
}

const COLOR_STYLE: Record<BreakdownYear['color'], {chip: string; bar: string; label: string}> = {
  green: {
    chip: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    bar: 'bg-emerald-500',
    label: 'Productive class',
  },
  orange: {
    chip: 'bg-amber-100 text-amber-900 border-amber-300',
    bar: 'bg-amber-500',
    label: 'Mixed class',
  },
  red: {
    chip: 'bg-rose-100 text-rose-900 border-rose-300',
    bar: 'bg-rose-500',
    label: 'Rough class',
  },
  gray: {
    chip: 'bg-black/5 text-black/60 border-black/10',
    bar: 'bg-black/20',
    label: 'Pending — too early',
  },
};

const OUTCOME_STYLE: Record<PickOutcome, string> = {
  'ELITE HIT': 'bg-accent text-white',
  HIT: 'bg-emerald-600 text-white',
  'MET EXPECTATION': 'bg-black/70 text-white',
  UNDERPERFORMED: 'bg-amber-500 text-black',
  BUST: 'bg-rose-600 text-white',
  PENDING: 'bg-black/10 text-black/60',
};

function renderBreakdownYear(y: BreakdownYear): string {
  const style = COLOR_STYLE[y.color];
  const summaryBits =
    [
      y.hits > 0 ? `${y.hits} hit${y.hits === 1 ? '' : 's'}` : null,
      y.busts > 0 ? `${y.busts} bust${y.busts === 1 ? '' : 's'}` : null,
      y.pendingCount > 0 ? `${y.pendingCount} too early` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'No notable signal';

  const pickRows = y.picks
    .map(
      (p) => `
      <a href="/analyzer/player/${encodeURIComponent(p.name)}"
         class="flex items-center justify-between gap-3 py-2 border-b border-black/5 last:border-b-0 hover:bg-black/[0.03] -mx-2 px-2 rounded transition-colors group">
        <div class="min-w-0">
          <div class="font-bold text-sm text-black truncate group-hover:text-accent transition-colors">${escapeHtml(p.name)}</div>
          <div class="text-[10px] text-muted font-bold uppercase tracking-widest">
            R${p.round} · #${p.pickNumber}${p.position ? ` · ${escapeHtml(p.position)}` : ''}
          </div>
        </div>
        <span class="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-sm shrink-0 ${OUTCOME_STYLE[p.outcome]}">
          ${p.outcome}
        </span>
      </a>
    `,
    )
    .join('');

  return `
    <div class="card-paper rounded-lg p-5 border-l-4 ${style.bar.replace('bg-', 'border-')}">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-baseline gap-3">
          <h4 class="text-3xl font-bold tracking-tighter text-black">${y.year}</h4>
          <span class="text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 border ${style.chip}">${style.label}</span>
        </div>
        <span class="text-[10px] text-muted font-bold uppercase tracking-widest">${summaryBits}</span>
      </div>
      <p class="text-sm text-muted serif italic mb-3">${escapeHtml(y.headline)}</p>
      <div class="space-y-1">
        ${pickRows}
      </div>
    </div>
  `;
}

export function teamBreakdownModal(b: TeamBreakdown): string {
  const yearCards = b.years.map(renderBreakdownYear).join('');
  const topPick = b.topPick
    ? `<div class="text-[10px]">
        <div class="text-muted font-bold uppercase tracking-widest mb-0.5">Best Pick</div>
        <a href="/analyzer/player/${encodeURIComponent(b.topPick.name)}" class="font-bold hover:text-accent transition-colors">${escapeHtml(b.topPick.name)}</a>
        <span class="text-muted">· R${b.topPick.round} ${b.topPick.year} · ${b.topPick.outcome}</span>
      </div>`
    : '';
  const worstPick = b.worstPick
    ? `<div class="text-[10px]">
        <div class="text-muted font-bold uppercase tracking-widest mb-0.5">Worst Pick</div>
        <a href="/analyzer/player/${encodeURIComponent(b.worstPick.name)}" class="font-bold hover:text-accent transition-colors">${escapeHtml(b.worstPick.name)}</a>
        <span class="text-muted">· R${b.worstPick.round} ${b.worstPick.year} · ${b.worstPick.outcome}</span>
      </div>`
    : '';

  return `
    <div class="fixed inset-0 z-[200] flex items-stretch justify-center p-4 md:p-10"
         role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"
           onclick="closeTeamModal()"></div>
      <div class="relative theme-paper card-paper rounded-lg max-w-3xl w-full max-h-full overflow-y-auto shadow-2xl border-t-8 border-black">
        <button onclick="closeTeamModal()"
                aria-label="Close"
                class="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black text-white text-lg hover:bg-accent transition-colors">×</button>
        <div class="p-8 md:p-10 space-y-8 text-black">
          <header class="border-b border-black/10 pb-6">
            <div class="flex items-center justify-between gap-4 mb-3">
              <div class="flex items-center gap-4 min-w-0">
                ${teamLogo(b.teamKey, 'w-16 h-16 md:w-20 md:h-20')}
                <div class="min-w-0">
                  <div class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-1">
                    Rank #${b.rank} of ${b.totalTeams} · ${b.windowStart}–${b.windowEnd}
                  </div>
                  <h3 id="team-modal-title" class="text-4xl md:text-5xl font-bold tracking-tighter text-black truncate">${escapeHtml(b.team.toUpperCase())}</h3>
                </div>
              </div>
              <div class="text-6xl md:text-7xl font-bold serif italic text-black leading-none shrink-0">${escapeHtml(b.grade)}</div>
            </div>
            <p class="text-sm text-muted serif italic leading-relaxed">
              ${b.totalPicks} picks evaluated · ${b.hits} hits · ${b.busts} busts.
              Years are flagged
              <span class="font-bold text-emerald-700">green</span> when there's a clear hit,
              <span class="font-bold text-amber-700">orange</span> for mixed classes, and
              <span class="font-bold text-rose-700">red</span> when a class produced busts without a hit.
            </p>
            ${topPick || worstPick ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">${topPick}${worstPick}</div>` : ''}
          </header>

          <div class="space-y-4">
            ${yearCards || '<p class="italic text-muted text-center py-12 text-sm">No picks in this window.</p>'}
          </div>

          <footer class="border-t border-black/10 pt-4 text-[10px] text-muted serif italic leading-relaxed">
            ${tooltip('Outcomes', TOOLTIPS.outcomes)} are bucketed against per-round expected value. Pending = drafted in the
            last two cycles; not enough NFL seasons to grade yet. Click any player for the
            full profile.
          </footer>
        </div>
      </div>
    </div>
  `;
}

export function teamBreakdownNotFound(teamKey: string): string {
  return `
    <div class="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeTeamModal()"></div>
      <div class="relative theme-paper card-paper rounded-lg max-w-md w-full p-8 text-center shadow-2xl">
        <p class="text-sm text-muted italic">No breakdown available for ${escapeHtml(teamKey)}.</p>
        <button onclick="closeTeamModal()" class="mt-4 text-[10px] font-bold uppercase tracking-widest border-b-2 border-accent">Close</button>
      </div>
    </div>
  `;
}

const CALL_OUTCOME_STYLE: Record<'NAILED IT' | 'CLOSE' | 'OFF' | 'WAY OFF', string> = {
  'NAILED IT': 'bg-emerald-600 text-white',
  CLOSE: 'bg-amber-500 text-black',
  OFF: 'bg-rose-500 text-white',
  'WAY OFF': 'bg-rose-700 text-white',
};

function renderExpertCallRow(c: ExpertProfile['bestCalls'][number]): string {
  const tdSign = c.talentDelta > 0 ? '+' : '';
  return `
    <a href="/analyzer/player/${encodeURIComponent(c.playerName)}"
       class="flex items-center justify-between gap-3 py-3 border-b border-black/5 last:border-b-0 hover:bg-black/[0.03] -mx-2 px-2 rounded transition-colors group">
      <div class="min-w-0">
        <div class="font-bold text-sm text-black truncate group-hover:text-accent transition-colors">${escapeHtml(c.playerName)}</div>
        <div class="text-[10px] text-muted font-bold uppercase tracking-widest">
          ${c.year} · Predicted #${c.predictedRank}${c.actualPick !== null ? ` · Drafted #${c.actualPick}` : ' · Undrafted in window'}
        </div>
        <div class="text-[11px] text-muted serif italic mt-1">${escapeHtml(c.flavor)}</div>
      </div>
      <span class="text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-sm shrink-0 ${CALL_OUTCOME_STYLE[c.outcome]}" title="Talent Δ ${tdSign}${c.talentDelta.toFixed(2)}">
        ${c.outcome}
      </span>
    </a>
  `;
}

function renderExpertYearRow(y: ExpertProfile['byYear'][number]): string {
  return `
    <div class="grid grid-cols-1 md:grid-cols-[80px,1fr,1fr] gap-3 py-3 border-b border-black/5 last:border-0 items-center">
      <div class="text-3xl font-bold tracking-tighter text-black">${y.year}</div>
      <div class="text-[11px] text-muted serif italic leading-tight">
        Sample ${y.sample} · ${tooltip('RMSE', TOOLTIPS.rmse)} ${y.rmse.toFixed(1)} · ${tooltip('Talent Δ', TOOLTIPS.talentDelta)} ${y.talentDelta.toFixed(2)}
      </div>
      <div class="text-[10px] text-muted">
        ${y.bestCall ? `<div><span class="font-bold text-emerald-700 uppercase tracking-widest">Best:</span> ${escapeHtml(y.bestCall.playerName)}</div>` : ''}
        ${y.worstCall ? `<div><span class="font-bold text-rose-700 uppercase tracking-widest">Miss:</span> ${escapeHtml(y.worstCall.playerName)}</div>` : ''}
      </div>
    </div>
  `;
}

export function expertProfile(p: ExpertProfile, clerkKey?: string): string {
  const content = `
    ${header('experts')}
    <div class="max-w-5xl mx-auto py-12 px-4 text-black">
      <a href="/analyzer/experts" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-8 inline-block transition-colors">← Back to Expert Audit</a>

      <header class="border-b border-black/10 pb-6 mb-10">
        <div class="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-2">${escapeHtml(p.org || 'Independent')}</div>
            <h2 class="text-6xl font-bold tracking-tighter text-black">${escapeHtml(p.name.toUpperCase())}</h2>
          </div>
          <div class="flex items-stretch gap-4 text-center">
            <div class="px-5 py-3 bg-black text-white rounded-md min-w-[120px]">
              <div class="text-[9px] uppercase tracking-[0.2em] opacity-60">${tooltip('Mock Δ', TOOLTIPS.rmse, 'text-white')}</div>
              <div class="text-3xl font-bold tracking-tighter">${p.rmse.toFixed(1)}</div>
              <div class="text-[8px] uppercase opacity-60 tracking-widest">Rank ${p.oracleRank ?? '—'}/${p.oracleTotal}</div>
            </div>
            <div class="px-5 py-3 bg-accent text-white rounded-md min-w-[120px]">
              <div class="text-[9px] uppercase tracking-[0.2em] opacity-80">${tooltip('Talent Δ', TOOLTIPS.talentDelta, 'text-white')}</div>
              <div class="text-3xl font-bold tracking-tighter">${p.talentDelta.toFixed(2)}</div>
              <div class="text-[8px] uppercase opacity-80 tracking-widest">${escapeHtml(p.letter)} · Rank ${p.scoutRank ?? '—'}/${p.scoutTotal}</div>
            </div>
          </div>
        </div>
        <p class="text-sm text-muted serif italic mt-4 leading-relaxed">
          ${p.sampleSize} ranked players audited across ${p.yearsCovered.join(', ')}.
          Calls graded against the player's actual draft slot and normalized career rating.
        </p>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
        <section>
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-emerald-600 pb-2 mb-4 text-black">CALLS THEY NAILED</h3>
          <div class="space-y-1">
            ${p.bestCalls.map(renderExpertCallRow).join('')}
          </div>
        </section>
        <section>
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-rose-600 pb-2 mb-4 text-black">CALLS THEY MISSED</h3>
          <div class="space-y-1">
            ${p.worstMisses.map(renderExpertCallRow).join('')}
          </div>
        </section>
      </div>

      <section>
        <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-black pb-2 mb-2 text-black">YEAR-BY-YEAR</h3>
        <div class="card-paper rounded-lg p-4">
          ${p.byYear.map(renderExpertYearRow).join('')}
        </div>
      </section>
    </div>
  `;
  return analyzerLayout(content, `${p.name} — Expert Audit`, clerkKey);
}

export function expertProfileNotFound(slug: string, clerkKey?: string): string {
  const content = `
    ${header('experts')}
    <div class="max-w-3xl mx-auto py-20 px-4 text-center">
      <h2 class="text-3xl font-bold tracking-tighter text-black mb-3">No data on "${escapeHtml(slug)}"</h2>
      <p class="text-muted serif italic">We don't have ranked players from this expert in the audit window yet.</p>
      <a href="/analyzer/experts" class="mt-6 inline-block text-[10px] font-bold uppercase tracking-widest border-b-2 border-accent">Back to Expert Audit</a>
    </div>
  `;
  return analyzerLayout(content, 'Expert not found — LLL', clerkKey);
}
