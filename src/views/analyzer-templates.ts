import {baseLayout, escapeHtml} from './templates.js';
import type {TeamSuccessRow} from '../services/team-scout.js';
import type {ExpertOracleRow, ExpertScoutRow} from '../services/expert-audit.js';

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

function header(active: 'dashboard' | 'experts' | 'teams' = 'dashboard'): string {
  return `
    <header class="border-b border-black/10 py-6 px-4 bg-white/50 backdrop-blur-sm sticky top-0 z-[100]">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter text-black">DRAFT ANALYZER</h1>
          <p class="text-[10px] text-muted font-bold uppercase tracking-widest">Intelligence &amp; Historical Tracking</p>
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
            <p class="text-2xl text-muted serif italic max-w-xl leading-relaxed">
              ${snapshot.totalPicks.toLocaleString()} picks scored · ${snapshot.totalExperts} experts audited ·
              best-4-of-6 + trajectory + contract market signal.
            </p>
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
             <div id="success-leaderboard" hx-get="/analyzer/fragment/success-leaderboard?window=6" hx-trigger="load">
                <p class="italic py-8 text-muted text-center text-sm">Aggregating receipts...</p>
             </div>
             <script>
               function fetchSuccessIndex(window) {
                 htmx.ajax('GET', '/analyzer/fragment/success-leaderboard?window=' + window, '#success-leaderboard');
               }
             </script>
          </section>

          <section class="space-y-8 text-black">
            <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b border-black/10 pb-2 text-black">
              LEAGUE-WIDE INDEX MOVERS
            </h3>
            ${movers}
          </section>
        </div>

        <div class="space-y-12 text-black">
          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">ORACLE · MOCK ACCURACY</h3>
            <p class="text-[10px] text-muted mb-5">RMSE between expert big-board rank and actual draft slot. Lower is better.</p>
            ${oracle}
          </div>

          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">SCOUT · TALENT DELTA</h3>
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
  `;
  return analyzerLayout(content, 'Dashboard — LLL Draft Analyzer', clerkKey);
}

function renderMovers(hits: IndexMover[], busts: IndexMover[]): string {
  const renderRow = (m: IndexMover, isBust = false) => `
    <a href="/analyzer/player/${encodeURIComponent(m.name)}"
       class="flex justify-between items-center py-3 border-b border-black/5 group hover:bg-black/[0.02] transition-colors px-2 -mx-2">
      <div>
        <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${escapeHtml(m.name)}</div>
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">
          R${m.round} · ${m.year} · ${escapeHtml(m.team)}
        </div>
      </div>
      <div class="text-right">
        <div class="font-mono font-bold text-lg ${isBust ? 'text-black/40' : 'text-accent'}">
          ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}
        </div>
        <div class="text-[8px] text-muted font-bold uppercase tracking-tighter">LLL DELTA</div>
      </div>
    </a>
  `;
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-black">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-3">Biggest Hits</div>
        ${hits.map((h) => renderRow(h, false)).join('')}
      </div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-3">Biggest Busts</div>
        ${busts.map((b) => renderRow(b, true)).join('')}
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
        <div class="flex justify-between items-center ${i < 3 ? 'border-b border-black/5 pb-3 mb-3' : ''} group">
          <div>
            <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</div>
            <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${escapeHtml(e.org || 'Independent')} · n=${e.sampleSize}</div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-black text-lg">${e.rmse.toFixed(1)}</div>
            <div class="text-[8px] text-accent font-bold uppercase tracking-tighter">RMSE</div>
          </div>
        </div>
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
        <div class="flex justify-between items-center ${i < 3 ? 'border-b border-black/5 pb-3 mb-3' : ''} group">
          <div>
            <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${escapeHtml(e.expertName)}</div>
            <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${escapeHtml(e.org || 'Independent')} · n=${e.sampleSize}</div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-black text-lg">${e.talentDelta.toFixed(2)}</div>
            <div class="text-[8px] text-accent font-bold uppercase tracking-tighter">DELTA · ${e.letter}</div>
          </div>
        </div>
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
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors">
      <td class="py-4 px-4 font-bold text-lg text-black">#${i + 1}</td>
      <td class="py-4">
        <div class="font-bold text-black">${escapeHtml(e.expertName)}</div>
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
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors">
      <td class="py-4 px-4 font-bold text-lg text-black">#${i + 1}</td>
      <td class="py-4">
        <div class="font-bold text-black">${escapeHtml(e.expertName)}</div>
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
        <div class="flex items-baseline justify-between mb-4">
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">ORACLE · Mock Draft Accuracy</h3>
          <p class="text-[11px] text-muted italic">RMSE(predicted rank, actual draft slot) · lower = better</p>
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
        <div class="flex items-baseline justify-between mb-4">
          <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">SCOUT · Talent Delta</h3>
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

export function teamLeaderboard(teams: TeamSuccessRow[], clerkKey?: string): string {
  const totalPicks = teams.reduce((s, t) => s + t.totalPicks, 0);
  const cards = teams
    .map((t, i) => {
      const accent = i < 8 ? 'border-accent' : 'border-black/20';
      return `
    <div class="card-paper p-6 rounded-lg border-t-4 ${accent} shadow-sm hover:shadow-md transition-all group">
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="text-[8px] font-bold text-muted uppercase tracking-[0.2em] mb-1">Rank #${i + 1}</div>
          <h3 class="text-xl font-bold tracking-tighter text-black group-hover:text-accent transition-colors">${escapeHtml(t.team)}</h3>
        </div>
        <span class="text-2xl font-bold text-black serif italic">${t.grade}</span>
      </div>
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>Hit Rate</span>
            <span class="text-black font-bold">${t.hitRate}% (${t.hits}/${t.totalPicks})</span>
          </div>
          <div class="h-1 w-full bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-black" style="width: ${t.hitRate}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>League Position</span>
            <span class="text-accent font-bold mono">Δ ${t.avgDelta > 0 ? '+' : ''}${t.avgDelta.toFixed(2)}</span>
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

export function successLeaderboard(teams: TeamSuccessRow[]): string {
  const rows = teams
    .map(
      (t, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group">
      <td class="py-4 px-4 font-bold text-black text-xl serif italic">#${i + 1}</td>
      <td class="py-4 text-black">
        <div class="font-bold text-black text-lg tracking-tighter">${escapeHtml(t.team.toUpperCase())}</div>
        <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${t.totalPicks} picks · ${t.hits} hits</div>
      </td>
      <td class="py-4 text-center text-black">
        <div class="inline-block px-3 py-1 bg-black text-white text-xs font-bold rounded-sm">${t.hitRate}%</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg">${t.avgDelta > 0 ? '+' : ''}${t.avgDelta.toFixed(2)}</td>
      <td class="py-4 pr-4 text-right text-black">
        <div class="text-2xl font-bold text-black serif italic leading-none">${t.grade}</div>
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
            <th class="py-3 text-center">Hit Rate</th>
            <th class="py-3 text-center">Avg Δ</th>
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
