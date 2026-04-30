import {baseLayout, escapeHtml} from './templates.js';
import type {TeamSuccessRow, TeamBreakdown, BreakdownYear, PickOutcome, ScoredPick} from '../services/team-scout.js';
import type {ExpertOracleRow, ExpertScoutRow, ExpertProfile} from '../services/expert-audit.js';
import {teamLogoUrl} from '../services/lll-rating-engine.js';
import type {PlayerProfileData, SeasonRow} from '../services/draft-scout.js';

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
  window: number;
  isAdmin?: boolean;
  debug?: boolean;
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

  const modalLayer = `
    <div id="team-modal-root"></div>
    <script>
      (function () {
        if (window.__lllTeamModal) return;
        window.__lllTeamModal = true;
        window.closeTeamModal = function () {
          const root = document.getElementById('team-modal-root');
          if (root) root.innerHTML = '';
          document.body.style.overflow = '';
        };
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeTeamModal(); });
        document.addEventListener('htmx:afterSwap', (e) => {
          if (e.detail && e.detail.target && e.detail.target.id === 'team-modal-root' && e.detail.target.innerHTML.trim() !== '') {
            document.body.style.overflow = 'hidden';
          }
        });
      })();
    </script>
  `;
  return baseLayout(
    `<div class="theme-paper min-h-screen text-black">
      ${analyzerStyles}
      ${content}
      ${modalLayer}
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

/**
 * Shared view controls — Career / Single Season toggle + season picker + window picker.
 * Used on both the dashboard and the /teams page so a window selection on one
 * carries to the other through URL params.
 */
export function renderViewControls(opts: {mode: 'career' | 'season'; selectedSeason: number; window: number}): string {
  const isCareer = opts.mode === 'career';
  const seasonOptions = [2024, 2023, 2022, 2021, 2020, 2019, 2018];
  const windowOptions = [3, 5, 6, 8];
  return `
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div class="flex items-center bg-black/[0.05] rounded-md p-1 text-[10px] font-bold uppercase tracking-[0.2em]">
        <button onclick="setView({mode:'career'})"
          class="px-3 py-1.5 rounded-md transition-all ${isCareer ? 'bg-black text-white' : 'text-muted hover:text-black'}">
          Career
        </button>
        <button onclick="setView({mode:'season'})"
          class="px-3 py-1.5 rounded-md transition-all ${!isCareer ? 'bg-black text-white' : 'text-muted hover:text-black'}">
          Single Season
        </button>
      </div>
      <select onchange="setView({season:this.value})"
        class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] border border-black bg-white ${isCareer ? 'opacity-30 pointer-events-none' : ''}">
        ${seasonOptions
          .map((y) => `<option value="${y}" ${y === opts.selectedSeason ? 'selected' : ''}>${y} season</option>`)
          .join('')}
      </select>
      <div class="flex items-center bg-black/[0.05] rounded-md p-1">
        ${windowOptions
          .map(
            (w) => `
          <button onclick="setView({window:${w}})"
            class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-md transition-all ${
              w === opts.window ? 'bg-black text-white' : 'text-muted hover:text-black'
            }">
            ${w}Y
          </button>
        `,
          )
          .join('')}
      </div>
      <span class="text-[10px] text-muted serif italic">
        ${
          isCareer
            ? `Career view · last ${opts.window} draft years`
            : `${opts.selectedSeason} NFL season · last ${opts.window} draft years`
        }
      </span>
    </div>
    <script>
      (function () {
        if (window.__lllSetView) return;
        window.__lllSetView = true;
        window.setView = function (updates) {
          const url = new URL(window.location.href);
          if (updates.mode === 'career') {
            url.searchParams.set('mode', 'career');
            url.searchParams.delete('season');
          } else if (updates.mode === 'season') {
            url.searchParams.set('mode', 'season');
            if (!url.searchParams.get('season')) url.searchParams.set('season', '${opts.selectedSeason}');
          }
          if (updates.season) {
            url.searchParams.set('mode', 'season');
            url.searchParams.set('season', updates.season);
          }
          if (updates.window) {
            url.searchParams.set('window', updates.window);
          }
          window.location.href = url.toString();
        };
      })();
    </script>
  `;
}

export function liveBadge(): string {
  return `
    <span class="lll-tip inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700" tabindex="0">
      <span class="live-dot"></span>LIVE
      <span role="tooltip" class="tip-body">Ratings auto-sync from the nflverse Approximate Value feed. Career numbers update every time we re-run the ingestion cron.</span>
    </span>
  `;
}

function header(
  active: 'dashboard' | 'experts' | 'teams' = 'dashboard',
  _extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  return `
    <header class="border-b border-black/10 py-6 px-4 bg-white/50 backdrop-blur-sm sticky top-0 z-[100]">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter text-black">DRAFT ANALYZER</h1>
          <div class="flex items-center gap-3 mt-0.5 flex-wrap">
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

function adminFlags(extras: {isAdmin?: boolean; debug?: boolean}): {isAdmin: boolean; debug: boolean} {
  return {isAdmin: extras.isAdmin ?? false, debug: extras.debug ?? false};
}

export function analyzerDashboard(snapshot: DashboardSnapshot, clerkKey?: string): string {
  const movers = renderMovers(snapshot.topMovers, snapshot.bustMovers);
  const oracle = renderOracleMini(snapshot.oracleTop);
  const scout = renderScoutMini(snapshot.scoutTop);

  const isCareer = snapshot.mode === 'career';
  const selectedSeason = snapshot.selectedSeason ?? 2024;
  const selectedWindow = snapshot.window ?? 6;

  const modeStrip = renderViewControls({
    mode: snapshot.mode,
    selectedSeason,
    window: selectedWindow,
  });

  const modeQs = `${isCareer ? 'mode=career' : `mode=season&season=${selectedSeason}`}&window=${selectedWindow}`;

  const content = `
    ${header('dashboard', adminFlags(snapshot))}
    <main class="max-w-5xl mx-auto py-6 px-4 text-black">
      <section class="mb-8">
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 class="text-3xl md:text-4xl font-bold tracking-tighter text-black leading-tight">
            The <span class="italic serif font-normal">market</span> doesn't lie.
          </h2>
          <span class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">
            ${snapshot.windowStart}–${snapshot.windowEnd} window
          </span>
        </div>
        <p class="text-xs md:text-sm text-muted serif italic mb-4">
          ${snapshot.totalPicks.toLocaleString()} picks scored · ${snapshot.totalExperts} experts audited ·
          best-4-of-6 + trajectory + contract market signal.
        </p>
        ${modeStrip}
      </section>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-10 text-black">
        <div class="md:col-span-2 space-y-12">

          <section class="space-y-6 text-black">
             <div class="flex justify-between items-end border-b-2 border-black pb-2">
               <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">FRANCHISE INDEX · TOP 10</h3>
               <span class="text-[10px] text-muted serif italic">Window controls above filter all sections</span>
             </div>
             <div id="success-leaderboard" hx-get="/analyzer/fragment/success-leaderboard?${modeQs}" hx-trigger="load">
                <p class="italic py-8 text-muted text-center text-sm">Aggregating receipts...</p>
             </div>
             <div class="flex justify-end pt-2">
               <a href="/analyzer/teams?${modeQs}"
                  class="text-[10px] font-bold uppercase tracking-[0.3em] text-black hover:text-accent border-b-2 border-accent pb-0.5 transition-colors">
                 View all 32 teams →
               </a>
             </div>
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <a href="/analyzer/players?filter=hits&${modeQs}"
                 class="text-[10px] font-bold uppercase tracking-[0.3em] text-black hover:text-accent border-b-2 border-accent pb-0.5 transition-colors text-center md:text-left">
                View all hits →
              </a>
              <a href="/analyzer/players?filter=busts&${modeQs}"
                 class="text-[10px] font-bold uppercase tracking-[0.3em] text-black hover:text-accent border-b-2 border-accent pb-0.5 transition-colors text-center md:text-right">
                View all busts →
              </a>
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
            <h3 class="font-bold text-sm mb-2 uppercase tracking-widest relative z-10 text-white">How the math works</h3>
            <div class="text-xs opacity-95 relative z-10 font-mono leading-relaxed text-white space-y-1.5">
              <div>career = best-4 avg of season ratings</div>
              <div>perf = career + contract bonus</div>
              <div>Δ = perf − round_expected</div>
            </div>
            <p class="text-[10px] opacity-80 relative z-10 font-serif italic leading-relaxed text-white mt-3">
              Per-season ratings get an award floor (Pro Bowl ≥ 5.5, All-Pro ≥ 6.5/8.0, MVP/DPOY ≥ 9.0) before the best-4 average.
              Contract bonus only applies in Career view — Single-Season view grades pure production.
            </p>
          </div>
        </div>
      </div>
    </main>
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

export function expertLeaderboard(
  oracle: ExpertOracleRow[],
  scout: ExpertScoutRow[],
  clerkKey?: string,
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const _admin = adminFlags(extras);
  let oracleSeenWithData = 0;
  const oracleRows = oracle
    .map((e) => {
      const hasData = e.sampleSize > 0;
      if (hasData) {
        oracleSeenWithData++;
      }
      const rankCell = hasData ? `#${oracleSeenWithData}` : '—';
      const interactive = hasData
        ? `cursor-pointer onclick="window.location.href='/analyzer/expert/${encodeURIComponent(e.expertSlug)}'"`
        : '';
      const nameCell = hasData
        ? `<a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}" class="font-bold text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</a>`
        : `<span class="font-bold text-black/50">${escapeHtml(e.expertName)}</span>`;
      return `
    <tr class="border-b border-black/5 ${hasData ? 'hover:bg-black/[0.02]' : 'bg-black/[0.02]'} transition-colors group" ${interactive}>
      <td class="py-4 px-4 font-bold text-lg ${hasData ? 'text-black' : 'text-black/40'}">${rankCell}</td>
      <td class="py-4">
        ${nameCell}
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">${escapeHtml(e.org || 'Independent')}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold ${hasData ? 'text-accent' : 'text-black/30'} text-lg">${hasData ? e.rmse.toFixed(1) : '—'}</td>
      <td class="py-4 text-center ${hasData ? 'text-muted' : 'text-black/30'} font-bold">${hasData ? e.sampleSize : 'No data yet'}</td>
      <td class="py-4 text-center text-[11px] ${hasData ? 'text-muted' : 'text-black/30 italic'}">${hasData ? e.yearsCovered.join(', ') : 'awaiting ingestion'}</td>
    </tr>
  `;
    })
    .join('');

  let scoutSeenWithData = 0;
  const scoutRows = scout
    .map((e) => {
      const hasData = e.sampleSize > 0;
      if (hasData) {
        scoutSeenWithData++;
      }
      const rankCell = hasData ? `#${scoutSeenWithData}` : '—';
      const interactive = hasData
        ? `cursor-pointer onclick="window.location.href='/analyzer/expert/${encodeURIComponent(e.expertSlug)}'"`
        : '';
      const nameCell = hasData
        ? `<a href="/analyzer/expert/${encodeURIComponent(e.expertSlug)}" class="font-bold text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</a>`
        : `<span class="font-bold text-black/50">${escapeHtml(e.expertName)}</span>`;
      return `
    <tr class="border-b border-black/5 ${hasData ? 'hover:bg-black/[0.02]' : 'bg-black/[0.02]'} transition-colors group" ${interactive}>
      <td class="py-4 px-4 font-bold text-lg ${hasData ? 'text-black' : 'text-black/40'}">${rankCell}</td>
      <td class="py-4">
        ${nameCell}
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">${escapeHtml(e.org || 'Independent')}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold ${hasData ? 'text-accent' : 'text-black/30'} text-lg">${hasData ? e.talentDelta.toFixed(2) : '—'}</td>
      <td class="py-4 text-center ${hasData ? 'text-muted' : 'text-black/30'} font-bold">${hasData ? e.sampleSize : 'No data yet'}</td>
      <td class="py-4 text-center font-bold serif italic text-xl ${hasData ? '' : 'text-black/30'}">${escapeHtml(e.letter)}</td>
    </tr>
  `;
    })
    .join('');

  const content = `
    ${header('experts', _admin)}
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
  opts: {mode?: 'career' | 'season'; season?: number; window?: number} = {},
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const _admin = adminFlags(extras);
  const isSeason = opts.mode === 'season' && opts.season !== undefined;
  const selectedSeason = opts.season ?? 2024;
  const selectedWindow = opts.window ?? 6;
  const viewLabel = isSeason ? `${opts.season} NFL season` : 'Career';
  const totalPicks = teams.reduce((s, t) => s + t.totalPicks, 0);
  const controls = renderViewControls({
    mode: opts.mode ?? 'career',
    selectedSeason,
    window: selectedWindow,
  });
  const modeQs = `${isSeason ? `mode=season&season=${selectedSeason}` : 'mode=career'}&window=${selectedWindow}`;
  const cards = teams
    .map((t, i) => {
      const accent = i < 8 ? 'border-accent' : 'border-black/20';
      return `
    <div class="card-paper p-6 rounded-lg border-t-4 ${accent} shadow-sm hover:shadow-md transition-all group cursor-pointer"
         hx-get="/analyzer/fragment/team-breakdown/${encodeURIComponent(t.teamKey)}?${modeQs}"
         hx-target="#team-modal-root"
         hx-swap="innerHTML"
         hx-trigger="click[!event.target.closest('a')]"
         title="Why this grade? Click for the breakdown.">
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
    ${header('teams', _admin)}
    <div class="max-w-6xl mx-auto py-6 px-4 text-black">
      <a href="/analyzer?${modeQs}" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent mb-3 inline-block transition-colors">← Back to Dashboard</a>
      <div class="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 class="text-3xl md:text-4xl font-bold tracking-tighter text-black leading-tight">FRANCHISE INDEX</h2>
          <span class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">${escapeHtml(viewLabel)}</span>
        </div>
        <div class="bg-black text-white px-4 py-2 rounded-md shadow shrink-0">
           <span class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mr-2">Picks scored</span>
           <span class="text-xl font-bold tracking-tighter">${totalPicks.toLocaleString()}</span>
        </div>
      </div>
      <p class="text-xs md:text-sm text-muted serif italic mb-4">
        All 32 teams. Hit Rate (% of picks beating round expectation) and League Position
        (avg delta vs league spread). Letter grade is rank-relative.
      </p>
      ${controls}

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-black">
        ${cards}
      </div>
    </div>
  `;
  return analyzerLayout(content, 'Franchise Index — LLL Draft Analyzer', clerkKey);
}

export function successLeaderboard(
  teams: TeamSuccessRow[],
  opts: {mode?: 'career' | 'season'; season?: number; window?: number; debug?: boolean} = {},
): string {
  const winQs = opts.window ? `&window=${opts.window}` : '';
  const debugQs = opts.debug ? '&debug=1' : '';
  const modeQs =
    opts.mode === 'season' && opts.season !== undefined
      ? `mode=season&season=${opts.season}${winQs}${debugQs}`
      : `mode=career${winQs}${debugQs}`;
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

export function playerProfile(
  profile: PlayerProfileData,
  clerkKey?: string,
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const _admin = adminFlags(extras);
  const seasonRows = profile.seasonHistory
    .map((s) => {
      const stats = s.stats ?? {};
      const keyStats = formatKeyStats(stats, s.side);
      return `
      <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors">
        <td class="py-2 px-3 font-bold text-black">${s.season}</td>
        <td class="py-2 px-3 text-center text-sm text-black">${s.games ?? '—'}</td>
        <td class="py-2 px-3 text-sm text-black mono">${keyStats}</td>
        <td class="py-2 px-3 text-center text-sm text-black mono">${s.prodScore?.toFixed(2) ?? '—'}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-lg ${ratingColor(s.rating)}">${s.rating.toFixed(2)}</td>
      </tr>
    `;
    })
    .join('');

  const accuracyRows = profile.accuracySummary
    .map(
      (a) => `
    <div class="flex justify-between items-baseline border-b border-black/5 pb-2">
      <div>
        <div class="font-bold text-sm">${escapeHtml(a.expert)}</div>
        ${a.impliedRating !== null ? `<div class="text-[9px] text-muted">Implied rating ${a.impliedRating}</div>` : ''}
      </div>
      <div class="text-right">
        <span class="${a.isAccurate ? 'text-accent' : 'text-muted'} font-bold font-mono text-lg">#${a.predictedRank ?? '—'}</span>
        <div class="text-[8px] font-bold text-muted uppercase">PREDICTED</div>
      </div>
    </div>
  `,
    )
    .join('');

  const altRatingsCard = renderAltRatingsCard(profile);
  const debugPanel = _admin.isAdmin ? renderPlayerDebugPanel(profile) : '';
  const finalSign = profile.finalGrade > 0 ? '+' : '';

  const content = `
    ${header('dashboard', _admin)}
    <div class="max-w-5xl mx-auto py-6 px-4 text-black">
      <a href="javascript:history.back()" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-3 inline-block transition-colors">← Back</a>

      <div class="flex flex-wrap items-baseline justify-between gap-4 mb-2">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          ${profile.teamKey ? teamLogo(profile.teamKey, 'w-10 h-10') : ''}
          <h2 class="text-3xl md:text-4xl font-bold tracking-tighter text-black leading-tight">
            ${escapeHtml(profile.playerName.toUpperCase())}
          </h2>
          ${profile.position ? `<span class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">${escapeHtml(profile.position)}</span>` : ''}
        </div>
        <div class="bg-black text-white px-4 py-2 rounded-md shadow shrink-0">
           <span class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mr-2">LLL Grade</span>
           <span class="text-xl font-bold tracking-tighter">${finalSign}${profile.finalGrade.toFixed(2)}</span>
           <span class="text-[10px] font-bold uppercase tracking-widest opacity-60 ml-2">${escapeHtml(profile.outcome)}</span>
        </div>
      </div>

      <p class="text-xs md:text-sm text-muted serif italic mb-6">
        ${profile.team ? escapeHtml(profile.team) : 'Unknown team'}
        ${profile.draftYear ? ` · Drafted ${profile.draftYear}` : ''}
        ${profile.round ? ` · R${profile.round}${profile.pickNumber ? ` #${profile.pickNumber}` : ''}` : ''}
        ${profile.contractOutcome ? ` · Contract: ${escapeHtml(profile.contractOutcome)}` : ''}
      </p>
      <p class="text-[11px] mono text-muted mb-6">
        career ${profile.careerRating.toFixed(2)}
        ${profile.contractBonus !== 0 ? ` ${profile.contractBonus > 0 ? '+' : '−'} ${Math.abs(profile.contractBonus).toFixed(2)} contract` : ''}
        = perf ${profile.performanceScore.toFixed(2)} − ${profile.expectedForRound} (R${profile.round ?? '?'}) = Δ ${finalSign}${profile.finalGrade.toFixed(2)}
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="md:col-span-2 space-y-8">
          ${altRatingsCard}

          <section>
            <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-black pb-2 mb-3 text-black">SEASON-BY-SEASON</h3>
            <div class="card-paper rounded-lg overflow-hidden">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-black/5 text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
                    <th class="py-2 px-3">Season</th>
                    <th class="py-2 px-3 text-center">G</th>
                    <th class="py-2 px-3">Key stats</th>
                    <th class="py-2 px-3 text-center">${tooltip('Prod', 'Position-specific raw production score (~0-15) before scaling and the experience bonus.')}</th>
                    <th class="py-2 px-3 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>${seasonRows || '<tr><td colspan="5" class="py-8 text-center italic text-muted">No per-season data ingested for this player yet.</td></tr>'}</tbody>
              </table>
            </div>
          </section>

          ${debugPanel}
        </div>

        <div class="space-y-8">
          <div class="card-paper p-6 rounded-lg border-t-8 border-black shadow-xl">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">EXPERT TAKES</h3>
            <div class="space-y-4">
              ${accuracyRows || '<p class="text-[11px] italic text-muted">No tracked experts ranked this player.</p>'}
            </div>
          </div>

          <div class="card-paper p-6 rounded-lg shadow-lg">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-3 text-black">MARKET SIGNAL</h3>
            <div class="text-xl font-bold text-accent italic serif mb-2">${escapeHtml(profile.contractOutcome || 'ROOKIE DEAL')}</div>
            <p class="text-[11px] text-muted leading-relaxed">
              2nd contract value is the league's own truth signal — primary for stat-light roles.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
  return analyzerLayout(content, `${profile.playerName} — LLL Profile`, clerkKey);
}

function ratingColor(r: number): string {
  if (r >= 7) {
    return 'text-emerald-700';
  }
  if (r >= 4) {
    return 'text-black';
  }
  if (r >= 2) {
    return 'text-amber-700';
  }
  return 'text-rose-700';
}

function formatKeyStats(stats: Record<string, number>, side?: string): string {
  if (!stats || Object.keys(stats).length === 0) {
    return '—';
  }
  const fmt = (n: number | undefined) => (n !== undefined && n !== null ? n.toString() : '0');
  if (side === 'DEF') {
    const sacks = stats.sacks ? `${stats.sacks} sk` : '';
    const tfl = stats.tackles_for_loss ? `${stats.tackles_for_loss} TFL` : '';
    const tot = (stats.tackles_solo ?? 0) + (stats.tackles_assist ?? 0);
    const tackles = tot > 0 ? `${tot} tk` : '';
    const ints = stats.interceptions ? `${stats.interceptions} INT` : '';
    const ff = stats.fumbles_forced ? `${stats.fumbles_forced} FF` : '';
    const pd = stats.pass_defended ? `${stats.pass_defended} PD` : '';
    return [sacks, tfl, tackles, ints, ff, pd].filter(Boolean).join(' · ') || '—';
  }
  // Offensive — pick the dominant stat
  if (stats.pass_yards) {
    return `${fmt(stats.pass_yards)} pyd · ${fmt(stats.pass_tds)} pTD · ${fmt(stats.interceptions)} INT`;
  }
  if (stats.rush_yards || stats.receptions) {
    const ry = stats.rush_yards ? `${stats.rush_yards} ryd` : '';
    const rtd = stats.rush_tds ? `${stats.rush_tds} rTD` : '';
    const rec = stats.receptions ? `${stats.receptions} rec` : '';
    const recyd = stats.rec_yards ? `${stats.rec_yards} recyd` : '';
    const rectd = stats.rec_tds ? `${stats.rec_tds} recTD` : '';
    return [ry, rtd, rec, recyd, rectd].filter(Boolean).join(' · ') || '—';
  }
  return '—';
}

function renderAltRatingsCard(p: PlayerProfileData): string {
  const cell = (label: string, rating: number, formula: string, isPrimary = false) => {
    const expectedDelta = rating - p.expectedForRound;
    const sign = expectedDelta > 0 ? '+' : '';
    return `
    <div class="card-paper p-4 rounded-md ${isPrimary ? 'border-t-4 border-accent' : 'border border-black/10'}">
      <div class="text-[9px] font-bold uppercase tracking-[0.2em] text-muted mb-1">${escapeHtml(label)}</div>
      <div class="flex items-baseline gap-2">
        <div class="text-3xl font-bold tracking-tighter ${ratingColor(rating)}">${rating.toFixed(2)}</div>
        <div class="text-[10px] text-muted mono">vs ${p.expectedForRound} → ${sign}${expectedDelta.toFixed(2)}</div>
      </div>
      <div class="text-[10px] text-muted serif italic mt-1 leading-tight">${escapeHtml(formula)}</div>
    </div>
  `;
  };
  return `
    <section>
      <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-black pb-2 mb-3 text-black">
        ALTERNATIVE SCORING
        <span class="text-[10px] text-muted serif italic font-normal ml-2">All four numbers are computed live; the Career method is what currently drives the LLL Grade above. Δ shown here is rating − round_expected (contract bonus excluded — see grade above for the full math).</span>
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${cell('CAREER (current method)', p.altRatings.careerCumulative.rating, p.altRatings.careerCumulative.formula, true)}
        ${cell(`BEST 4 OF 6${p.altRatings.best4of6.usedSeasons.length > 0 ? ' (' + p.altRatings.best4of6.usedSeasons.join(', ') + ')' : ''}`, p.altRatings.best4of6.rating, p.altRatings.best4of6.formula)}
        ${cell(`PEAK SEASON${p.altRatings.peakSeason.year ? ' (' + p.altRatings.peakSeason.year + ')' : ''}`, p.altRatings.peakSeason.rating, 'highest single-season rating in this player\u2019s history')}
        ${cell(`RECENT 3 (${p.altRatings.recentAvg.window})`, p.altRatings.recentAvg.rating, p.altRatings.recentAvg.window)}
      </div>
    </section>
  `;
}

function renderPlayerDebugPanel(p: PlayerProfileData): string {
  return `
    <details class="bg-black/[0.04] rounded-md border border-black/10 mt-4" open>
      <summary class="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
        🔧 ADMIN DEBUG · raw inputs &amp; tuning levers
      </summary>
      <div class="p-4 space-y-3 font-mono text-[11px] bg-white border border-black/10 m-2 rounded">
        <div><strong>Player:</strong> ${escapeHtml(p.playerName)} · ${p.position ?? '—'} · ${p.team ?? '—'}</div>
        <div><strong>Pick:</strong> ${p.draftYear ?? '?'} R${p.round ?? '?'}${p.pickNumber ? ' #' + p.pickNumber : ''} · contract ${escapeHtml(p.contractOutcome ?? 'none')}</div>
        <div><strong>Career w_av (cumulative):</strong> ${p.cumulativeWav ?? 'unknown'}</div>
        <div><strong>Years since draft:</strong> ${p.yearsSinceDraft ?? '—'}</div>
        <div class="pt-2"><strong>Current career-rating formula:</strong> ${escapeHtml(p.altRatings.careerCumulative.formula)}</div>
        <div><strong>Best-4-of-6:</strong> ${p.altRatings.best4of6.rating.toFixed(2)} via ${escapeHtml(p.altRatings.best4of6.formula)}</div>
        <div><strong>Peak season:</strong> ${p.altRatings.peakSeason.rating.toFixed(2)}${p.altRatings.peakSeason.year ? ' in ' + p.altRatings.peakSeason.year : ''}</div>
        <div><strong>Round expected (Tim's chart):</strong> ${p.expectedForRound}</div>
        <div><strong>Contract bonus:</strong> ${p.contractBonus >= 0 ? '+' : ''}${p.contractBonus.toFixed(2)}${p.contractOutcome ? ` (${escapeHtml(p.contractOutcome)})` : ''}</div>
        <div><strong>Performance score:</strong> ${p.altRatings.careerCumulative.rating.toFixed(2)} (career) ${p.contractBonus >= 0 ? '+' : '−'} ${Math.abs(p.contractBonus).toFixed(2)} (contract) = ${p.performanceScore.toFixed(2)}</div>
        <div class="pt-2"><strong>Final grade as currently computed:</strong>
          ${p.performanceScore.toFixed(2)} (perf) − ${p.expectedForRound} (R${p.round ?? '?'} expected) = ${p.finalGrade.toFixed(2)} → ${escapeHtml(p.outcome)}</div>
        <div class="pt-2 text-muted serif italic non-mono">
          Tuning idea: switch career method to best-4-of-6 (or peak) to reward high-AV players whose injury years drag the cumulative average down.
        </div>
      </div>
    </details>
  `;
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

export function teamBreakdownModal(
  b: TeamBreakdown,
  extras: {
    isAdmin?: boolean;
    debug?: boolean;
    debugPicks?: ScoredPick[];
    seasonHistories?: Map<string, SeasonRow[]>;
  } = {},
): string {
  const debugPanel =
    extras.isAdmin && extras.debugPicks && extras.debugPicks.length > 0
      ? renderTeamDebugPanel(b, extras.debugPicks, extras.seasonHistories)
      : '';
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

          ${debugPanel}

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

function renderTeamDebugPanel(
  b: TeamBreakdown,
  picks: ScoredPick[],
  seasonHistories?: Map<string, SeasonRow[]>,
): string {
  const expectedByRound: Record<number, number> = {1: 7.5, 2: 6.0, 3: 5.0, 4: 4.0, 5: 3.0, 6: 2.0, 7: 1.0};
  const ratedAvg = picks.length > 0 ? Number((picks.reduce((s, p) => s + p.delta, 0) / picks.length).toFixed(3)) : 0;
  const sortedByDelta = [...picks].sort((a, b) => b.delta - a.delta);

  const rows = sortedByDelta
    .map((p) => {
      const exp = expectedByRound[p.round] ?? 0;
      const histKey = p.name
        .toLowerCase()
        .replace(/\bjr\.?\b|\bsr\.?\b|\bii+\b|\biv\b/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const seasons = seasonHistories?.get(histKey) ?? [];
      const seasonChips = seasons
        .map((s) => {
          const cls =
            s.rating >= 7
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : s.rating >= 4
                ? 'bg-black/[0.06] text-black border-black/10'
                : s.rating >= 2
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-rose-100 text-rose-900 border-rose-300';
          return `<span class="inline-block text-[10px] font-mono px-1.5 py-0.5 mr-1 mb-1 border rounded ${cls}" title="${escapeHtml(formatKeyStats(s.stats ?? {}, s.side))} (${s.games ?? 0}g)">
            ${s.season}: ${s.rating.toFixed(1)}
          </span>`;
        })
        .join('');
      const peak = seasons.length > 0 ? Math.max(...seasons.map((s) => s.rating)) : null;
      const best4Avg = (() => {
        if (seasons.length === 0) {
          return null;
        }
        const sorted = [...seasons].sort((a, b) => b.rating - a.rating).slice(0, 4);
        return sorted.reduce((s, r) => s + r.rating, 0) / sorted.length;
      })();
      const altDeltaPeak = peak !== null ? peak - exp : null;
      const altDeltaBest4 = best4Avg !== null ? best4Avg - exp : null;

      const contractCell =
        p.contractBonus !== 0
          ? `<span title="${escapeHtml(p.contractOutcome ?? '')}">${p.contractBonus > 0 ? '+' : ''}${p.contractBonus.toFixed(2)}</span>`
          : '<span class="text-muted">0.00</span>';
      return `
      <tr class="border-b border-black/5 align-top">
        <td class="py-2 px-2 text-black">${escapeHtml(p.year + ' R' + p.round)}</td>
        <td class="py-2 px-2 text-black">
          <details class="cursor-pointer">
            <summary class="font-bold text-black hover:text-accent transition-colors">${escapeHtml(p.name)}</summary>
            <div class="mt-2 p-2 bg-black/[0.03] rounded text-[10px] non-mono">
              <div class="mb-1 text-muted serif italic">Season-by-season ratings (hover for raw stats):</div>
              <div class="flex flex-wrap">${seasonChips || '<span class="text-muted italic">No per-season data ingested.</span>'}</div>
              ${
                peak !== null && altDeltaPeak !== null && best4Avg !== null && altDeltaBest4 !== null
                  ? `<div class="mt-2 text-[10px] text-muted leading-relaxed">
                       <div><strong>Peak season:</strong> ${peak.toFixed(2)} → if used as career: Δ ${altDeltaPeak > 0 ? '+' : ''}${altDeltaPeak.toFixed(2)}</div>
                       <div><strong>Best 4 of N avg:</strong> ${best4Avg.toFixed(2)} → Δ ${altDeltaBest4 > 0 ? '+' : ''}${altDeltaBest4.toFixed(2)}</div>
                       <div class="mt-1"><a href="/analyzer/player/${encodeURIComponent(p.name)}" class="text-accent border-b border-accent">→ full profile</a></div>
                     </div>`
                  : ''
              }
            </div>
          </details>
        </td>
        <td class="py-2 px-2 text-center text-black">${p.position ?? '—'}</td>
        <td class="py-2 px-2 text-right text-black mono">${p.rating.toFixed(2)}</td>
        <td class="py-2 px-2 text-right text-black mono">${contractCell}</td>
        <td class="py-2 px-2 text-right text-black mono">${p.performanceScore.toFixed(2)}</td>
        <td class="py-2 px-2 text-right text-black mono">${exp.toFixed(2)}</td>
        <td class="py-2 px-2 text-right mono ${p.delta > 0.5 ? 'text-emerald-700' : p.delta < -1 ? 'text-rose-700' : 'text-black'}">
          ${p.delta > 0 ? '+' : ''}${p.delta.toFixed(2)}
        </td>
        <td class="py-2 px-2 text-[9px] text-muted uppercase tracking-widest">${escapeHtml(p.outcome)}</td>
      </tr>
    `;
    })
    .join('');

  return `
    <details class="bg-black/[0.04] rounded-md border border-black/10 mt-2" open>
      <summary class="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
        🔧 ADMIN DEBUG · raw math behind the grade · click any player to expand
      </summary>
      <div class="p-4 space-y-4 text-[11px]">
        <div class="font-mono text-[11px] bg-white border border-black/10 rounded p-3 leading-relaxed text-black">
          <div><strong>Per-pick math:</strong> career_rating + contract_bonus = perf_score · perf_score − round_expected = Δ</div>
          <div><strong>Career rating:</strong> best-4-of-6 of per-season ratings (Option B). Falls back to (w_av / years) × 0.667 when no per-season data.</div>
          <div><strong>Contract bonus:</strong> TOP_OF_MARKET +2.0 · MARKET_OR_ABOVE +1.5 · OTHER_TEAM_PAID +1.0 · 5TH_YEAR +0.5 · WALKED 0 · CUT_END −1.0 · CUT_EARLY −2.0. Career view only — disabled in single-season view.</div>
          <div><strong>Round expected:</strong> R1 7.5 · R2 6.0 · R3 5.0 · R4 4.0 · R5 3.0 · R6 2.0 · R7 1.0</div>
          <div><strong>Outcome buckets:</strong> Δ ≥ +1.5 ELITE HIT · &gt; +0.5 HIT · ±0.5 MET · ≥ −1.5 UNDERPERFORMED · &lt; −1.5 BUST</div>
          <div><strong>Avg Δ for ${escapeHtml(b.team)}:</strong> ${ratedAvg.toFixed(3)} across ${picks.length} graded picks. Letter grade is rank-relative across the league.</div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-[11px] bg-white border border-black/10">
            <thead>
              <tr class="bg-black/5 text-[9px] font-bold uppercase tracking-[0.15em] text-muted">
                <th class="py-2 px-2">Year/Rd</th>
                <th class="py-2 px-2">Player (click to expand)</th>
                <th class="py-2 px-2 text-center">Pos</th>
                <th class="py-2 px-2 text-right">Career</th>
                <th class="py-2 px-2 text-right">Contract</th>
                <th class="py-2 px-2 text-right">Perf</th>
                <th class="py-2 px-2 text-right">Expected</th>
                <th class="py-2 px-2 text-right">Δ</th>
                <th class="py-2 px-2">Outcome</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </details>
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

export function expertProfile(
  p: ExpertProfile,
  clerkKey?: string,
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const _admin = adminFlags(extras);
  const content = `
    ${header('experts', _admin)}
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

      ${_admin.isAdmin ? renderExpertDebugPanel(p) : ''}
    </div>
  `;
  return analyzerLayout(content, `${p.name} — Expert Audit`, clerkKey);
}

function renderExpertDebugPanel(p: ExpertProfile): string {
  const all = [...p.bestCalls, ...p.worstMisses].slice(0, 20);
  // De-dupe by player
  const seen = new Set<string>();
  const uniq = all.filter((c) => {
    const k = `${c.year}::${c.playerName}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
  uniq.sort((a, b) => Math.abs(b.talentDelta) - Math.abs(a.talentDelta));
  const rows = uniq
    .map(
      (c) => `
    <tr class="border-b border-black/5">
      <td class="py-1.5 px-2 text-black">${c.year}</td>
      <td class="py-1.5 px-2 text-black">${escapeHtml(c.playerName)}</td>
      <td class="py-1.5 px-2 text-right text-black mono">#${c.predictedRank}</td>
      <td class="py-1.5 px-2 text-right text-black mono">${c.actualPick !== null ? '#' + c.actualPick : '—'}</td>
      <td class="py-1.5 px-2 text-right text-black mono">${c.expectedRating.toFixed(2)}</td>
      <td class="py-1.5 px-2 text-right text-black mono">${c.actualRating.toFixed(2)}</td>
      <td class="py-1.5 px-2 text-right mono ${Math.abs(c.talentDelta) <= 1.5 ? 'text-emerald-700' : 'text-rose-700'}">
        ${c.talentDelta > 0 ? '+' : ''}${c.talentDelta.toFixed(2)}
      </td>
      <td class="py-1.5 px-2 text-[9px] text-muted uppercase tracking-widest">${escapeHtml(c.outcome)}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <details class="bg-black/[0.04] rounded-md border border-black/10 mt-8" open>
      <summary class="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
        🔧 ADMIN DEBUG · raw math behind ${escapeHtml(p.name)}'s grades
      </summary>
      <div class="p-4 space-y-4 text-[11px]">
        <div class="font-mono text-[11px] bg-white border border-black/10 rounded p-3 leading-relaxed text-black">
          <div><strong>Mock Δ (RMSE):</strong> sqrt(avg(predicted_rank − actual_pick)²) across all calls. Lower = better.</div>
          <div><strong>Talent Δ (RMSE):</strong> sqrt(avg(rank_implied_rating − actual_career_rating)²). Lower = better.</div>
          <div><strong>Rank → expected rating:</strong> 8.5 × exp(−rank / 120), floored at 1.</div>
          <div><strong>Sample:</strong> ${p.sampleSize} ranked players · years ${p.yearsCovered.join(', ')}.</div>
          <div><strong>This expert:</strong> RMSE ${p.rmse.toFixed(1)} (rank ${p.oracleRank}/${p.oracleTotal}) · Talent Δ ${p.talentDelta.toFixed(2)} (rank ${p.scoutRank}/${p.scoutTotal}, letter ${escapeHtml(p.letter)}).</div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse mono text-[11px] bg-white border border-black/10">
            <thead>
              <tr class="bg-black/5 text-[9px] font-bold uppercase tracking-[0.15em] text-muted">
                <th class="py-2 px-2">Year</th>
                <th class="py-2 px-2">Player</th>
                <th class="py-2 px-2 text-right">Predicted</th>
                <th class="py-2 px-2 text-right">Actual Pick</th>
                <th class="py-2 px-2 text-right">Implied Rating</th>
                <th class="py-2 px-2 text-right">Career Rating</th>
                <th class="py-2 px-2 text-right">Talent Δ</th>
                <th class="py-2 px-2">Outcome</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

export function expertProfileNotFound(
  slug: string,
  clerkKey?: string,
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const _admin = adminFlags(extras);
  const content = `
    ${header('experts', _admin)}
    <div class="max-w-3xl mx-auto py-20 px-4 text-center">
      <h2 class="text-3xl font-bold tracking-tighter text-black mb-3">No data on "${escapeHtml(slug)}"</h2>
      <p class="text-muted serif italic">We don't have ranked players from this expert in the audit window yet.</p>
      <a href="/analyzer/experts" class="mt-6 inline-block text-[10px] font-bold uppercase tracking-widest border-b-2 border-accent">Back to Expert Audit</a>
    </div>
  `;
  return analyzerLayout(content, 'Expert not found — LLL', clerkKey);
}

export interface PlayersGridOptions {
  mode: 'career' | 'season';
  selectedSeason: number;
  window: number;
  filter: 'all' | 'hits' | 'busts';
  sort: 'delta' | 'name' | 'team' | 'round' | 'year' | 'position';
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const OUTCOME_PILL: Record<string, string> = {
  'ELITE HIT': 'bg-accent text-white',
  HIT: 'bg-emerald-600 text-white',
  'MET EXPECTATION': 'bg-black/70 text-white',
  UNDERPERFORMED: 'bg-amber-500 text-black',
  BUST: 'bg-rose-600 text-white',
};

function buildPlayersQs(opts: PlayersGridOptions, override: Partial<PlayersGridOptions>): string {
  const merged = {...opts, ...override};
  const params = new URLSearchParams();
  params.set('mode', merged.mode);
  if (merged.mode === 'season') {
    params.set('season', String(merged.selectedSeason));
  }
  params.set('window', String(merged.window));
  if (merged.filter !== 'all') {
    params.set('filter', merged.filter);
  }
  params.set('sort', merged.sort);
  params.set('dir', merged.dir);
  if (merged.page > 1) {
    params.set('page', String(merged.page));
  }
  return params.toString();
}

function sortableHeader(label: string, field: PlayersGridOptions['sort'], opts: PlayersGridOptions): string {
  const active = opts.sort === field;
  const nextDir = active && opts.dir === 'desc' ? 'asc' : 'desc';
  const qs = buildPlayersQs(opts, {sort: field, dir: nextDir, page: 1});
  const arrow = active ? (opts.dir === 'desc' ? '▼' : '▲') : '';
  return `
    <a href="/analyzer/players?${qs}" class="${active ? 'text-accent' : ''} hover:text-accent transition-colors">
      ${label} <span class="text-[8px] ml-0.5">${arrow}</span>
    </a>
  `;
}

export function playersGrid(
  rows: ScoredPick[],
  total: number,
  opts: PlayersGridOptions,
  clerkKey?: string,
  extras: {isAdmin?: boolean; debug?: boolean} = {},
): string {
  const snapshot = adminFlags(extras);
  const controls = renderViewControls({
    mode: opts.mode,
    selectedSeason: opts.selectedSeason,
    window: opts.window,
  });
  const isSeason = opts.mode === 'season';
  const viewLabel = isSeason ? `${opts.selectedSeason} NFL season` : 'Career';
  const filterPill = (key: 'all' | 'hits' | 'busts', label: string) => {
    const qs = buildPlayersQs(opts, {filter: key, page: 1});
    const active = opts.filter === key;
    return `
      <a href="/analyzer/players?${qs}"
         class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-md transition-all
                ${active ? 'bg-black text-white' : 'text-muted hover:text-black'}">
        ${label}
      </a>
    `;
  };

  const tableRows = rows
    .map(
      (p) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors">
      <td class="py-3 pl-4 pr-2">
        <a href="/analyzer/player/${encodeURIComponent(p.name)}" class="font-bold text-black hover:text-accent transition-colors">${escapeHtml(p.name)}</a>
      </td>
      <td class="py-3 px-2">
        <div class="flex items-center gap-2">
          ${teamLogo(p.teamKey, 'w-6 h-6')}
          <span class="text-sm text-black">${escapeHtml(p.team)}</span>
        </div>
      </td>
      <td class="py-3 px-2 text-center text-sm text-black">${p.position ? escapeHtml(p.position) : '—'}</td>
      <td class="py-3 px-2 text-center text-sm text-black">R${p.round}${p.pickNumber ? ` · #${p.pickNumber}` : ''}</td>
      <td class="py-3 px-2 text-center text-sm text-black">${p.year}</td>
      <td class="py-3 px-2 text-center font-mono font-bold text-lg ${
        p.delta > 0 ? 'text-accent' : p.delta < -1 ? 'text-rose-600' : 'text-black/60'
      }">${p.delta > 0 ? '+' : ''}${p.delta.toFixed(2)}</td>
      <td class="py-3 pl-2 pr-4 text-right">
        <span class="inline-block text-[9px] font-bold uppercase tracking-[0.15em] px-2 py-1 rounded-sm ${OUTCOME_PILL[p.outcome] ?? 'bg-black/10 text-black/60'}">
          ${escapeHtml(p.outcome)}
        </span>
      </td>
    </tr>
  `,
    )
    .join('');

  const totalPages = Math.max(1, Math.ceil(total / opts.pageSize));
  const showingFrom = total === 0 ? 0 : (opts.page - 1) * opts.pageSize + 1;
  const showingTo = Math.min(opts.page * opts.pageSize, total);

  const pageWindow = (() => {
    const out: (number | '…')[] = [];
    const around = 2;
    const add = (n: number | '…') => {
      if (out[out.length - 1] !== n) {
        out.push(n);
      }
    };
    add(1);
    if (opts.page - around > 2) {
      add('…');
    }
    for (let i = Math.max(2, opts.page - around); i <= Math.min(totalPages - 1, opts.page + around); i++) {
      add(i);
    }
    if (opts.page + around < totalPages - 1) {
      add('…');
    }
    if (totalPages > 1) {
      add(totalPages);
    }
    return out;
  })();

  const pagination = `
    <div class="flex flex-wrap items-center justify-between gap-3 pt-4">
      <div class="text-[10px] text-muted font-bold uppercase tracking-widest">
        Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}
      </div>
      <div class="flex items-center gap-1">
        ${
          opts.page > 1
            ? `<a href="/analyzer/players?${buildPlayersQs(opts, {page: opts.page - 1})}"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-black hover:bg-black hover:text-white transition-all">
                  ← Prev
               </a>`
            : `<span class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-black/20 text-black/30">← Prev</span>`
        }
        ${pageWindow
          .map((p) => {
            if (p === '…') {
              return `<span class="px-2 py-1 text-[10px] text-muted">…</span>`;
            }
            const qs = buildPlayersQs(opts, {page: p});
            const active = p === opts.page;
            return `<a href="/analyzer/players?${qs}"
                       class="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border ${
                         active ? 'bg-black text-white border-black' : 'border-black/30 hover:bg-black hover:text-white'
                       } transition-all">${p}</a>`;
          })
          .join('')}
        ${
          opts.page < totalPages
            ? `<a href="/analyzer/players?${buildPlayersQs(opts, {page: opts.page + 1})}"
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-black hover:bg-black hover:text-white transition-all">
                  Next →
               </a>`
            : `<span class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-black/20 text-black/30">Next →</span>`
        }
      </div>
    </div>
  `;

  const content = `
    ${header('dashboard', adminFlags(snapshot))}
    <div class="max-w-6xl mx-auto py-6 px-4 text-black">
      <a href="/analyzer?${buildPlayersQs(opts, {})}"
         class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent mb-3 inline-block transition-colors">← Back to Dashboard</a>
      <div class="flex flex-wrap items-baseline justify-between gap-4 mb-3">
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 class="text-3xl md:text-4xl font-bold tracking-tighter text-black leading-tight">ALL PLAYERS</h2>
          <span class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">${escapeHtml(viewLabel)}</span>
        </div>
        <div class="bg-black text-white px-4 py-2 rounded-md shadow shrink-0">
           <span class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mr-2">Picks scored</span>
           <span class="text-xl font-bold tracking-tighter">${total.toLocaleString()}</span>
        </div>
      </div>
      <p class="text-xs md:text-sm text-muted serif italic mb-4">
        Every drafted player scored against round expectation. Sortable, filterable, paginated.
        Click any column header to sort.
      </p>
      ${controls}

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="flex items-center bg-black/[0.05] rounded-md p-1">
          ${filterPill('all', 'All')}
          ${filterPill('hits', 'Hits only')}
          ${filterPill('busts', 'Busts only')}
        </div>
        <span class="text-[10px] text-muted serif italic">
          ${tooltip('Outcomes', TOOLTIPS.outcomes)}
        </span>
      </div>

      <div class="card-paper rounded-lg overflow-hidden border-t-4 border-black shadow-lg">
        <table class="w-full text-left border-collapse text-black">
          <thead>
            <tr class="bg-black/5 text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
              <th class="py-3 pl-4 pr-2">${sortableHeader('Player', 'name', opts)}</th>
              <th class="py-3 px-2">${sortableHeader('Team', 'team', opts)}</th>
              <th class="py-3 px-2 text-center">${sortableHeader('Pos', 'position', opts)}</th>
              <th class="py-3 px-2 text-center">${sortableHeader('Round', 'round', opts)}</th>
              <th class="py-3 px-2 text-center">${sortableHeader('Drafted', 'year', opts)}</th>
              <th class="py-3 px-2 text-center">${sortableHeader('LLL Δ', 'delta', opts)}</th>
              <th class="py-3 pl-2 pr-4 text-right">Outcome</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" class="py-12 text-center italic text-muted">No picks match this filter.</td></tr>'}
          </tbody>
        </table>
      </div>

      ${pagination}
    </div>
  `;
  return analyzerLayout(content, 'All Players — LLL Draft Analyzer', clerkKey);
}
