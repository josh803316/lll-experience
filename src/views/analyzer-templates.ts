import {baseLayout} from './templates.js';

export interface ExpertAccuracy {
  expertName: string;
  org: string;
  rmse: string;
  sampleSize: number;
}

export interface TeamSuccess {
  team: string;
  retention: number;
  value: number;
  grade: string;
}

export function analyzerLayout(content: string, title = 'LLL Draft Analyzer', clerkPublishableKey?: string): string {
  // We can customize the base styles here specifically for the Analyzer's "paper" feel
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
    </style>
  `;

  return baseLayout(
    `<div class="theme-paper min-h-screen">
      ${analyzerStyles}
      ${content}
    </div>`,
    title,
    clerkPublishableKey,
  );
}

export function analyzerDashboard(clerkKey?: string): string {
  const content = `
    <header class="border-b border-black/10 py-6 px-4">
      <div class="max-w-5xl mx-auto flex justify-between items-end">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter text-black">DRAFT ANALYZER</h1>
          <p class="text-muted italic">Year-round intelligence & historical tracking</p>
        </div>
        <nav class="hidden md:flex gap-6 text-sm font-bold uppercase tracking-widest">
          <a href="/analyzer" class="tab-active text-black">Dashboard</a>
          <a href="/analyzer/experts" class="text-muted hover:text-accent transition-colors">Experts</a>
          <a href="/analyzer/teams" class="text-muted hover:text-accent transition-colors">Teams</a>
        </nav>
      </div>
    </header>

    <main class="max-w-5xl mx-auto py-8 px-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
        <!-- Main Content -->
        <div class="md:col-span-2 space-y-12">
          <!-- Hero Section -->
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-2">State of the league · April 2026</div>
            <h2 class="text-5xl font-bold tracking-tighter text-black leading-none mb-4">
              Detroit is hitting on <span class="text-accent italic">4 of 5</span> first-rounders.
            </h2>
            <p class="text-lg text-muted serif italic max-w-xl">
              LLL re-grades every pick on the day it ages: combine times, camp reps, snap counts, and retention.
            </p>
          </section>

          <!-- Latest Updates Feed -->
          <section class="space-y-6">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] border-b border-black pb-2 text-black">LATEST INTEL</h3>
            <div id="timeline-feed" hx-get="/analyzer/fragment/timeline" hx-trigger="load">
              <p class="italic py-4 text-muted text-sm">Loading intel feed...</p>
            </div>
          </section>
        </div>

        <!-- Sidebar -->
        <div class="space-y-8">
          <!-- Index Movers -->
          <div class="card-paper p-6 rounded-lg border-t-8 border-black">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-black">INDEX MOVERS · 24H</h3>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <div>
                  <div class="font-bold text-sm text-black">LIONS</div>
                  <div class="text-[10px] text-muted uppercase">Hutchinson uncapped</div>
                </div>
                <div class="font-mono font-bold text-accent">+1.4</div>
              </div>
              <div class="flex justify-between items-center border-t border-black/5 pt-4">
                <div>
                  <div class="font-bold text-sm text-black">EAGLES</div>
                  <div class="text-[10px] text-muted uppercase">Rookie LB earns 1s</div>
                </div>
                <div class="font-mono font-bold text-accent">+0.8</div>
              </div>
              <div class="flex justify-between items-center border-t border-black/5 pt-4">
                <div>
                  <div class="font-bold text-sm text-black">PANTHERS</div>
                  <div class="text-[10px] text-muted uppercase">2023 QB benched</div>
                </div>
                <div class="font-mono font-bold text-black opacity-40">−0.6</div>
              </div>
            </div>
          </div>

          <!-- Top Experts Mini-Board -->
          <div class="card-paper p-6 rounded-lg">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-black">TOP ACCURACY · 10Y</h3>
            <div id="top-experts-mini" hx-get="/analyzer/fragment/top-experts-mini" hx-trigger="load">
               <p class="text-xs italic text-muted text-center py-4">Calculating receipts...</p>
            </div>
          </div>

          <!-- LLL Ratings Card -->
          <div class="card-paper p-6 rounded-lg border-b-8 border-accent">
            <h3 class="font-bold text-lg mb-4 text-black font-serif">LLL RATINGS</h3>
            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-[10px] font-bold uppercase mb-1 text-muted">
                  <span>RETENTION</span>
                  <span class="text-black">84%</span>
                </div>
                <div class="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                  <div class="h-full bg-black" style="width: 84%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-[10px] font-bold uppercase mb-1 text-muted">
                  <span>VALUE ADDED</span>
                  <span class="text-accent">+12.4</span>
                </div>
                <div class="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                  <div class="h-full bg-accent" style="width: 70%"></div>
                </div>
              </div>
            </div>
            <a href="/analyzer/teams" class="block w-full mt-6 py-2 border-2 border-black font-bold text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all text-center text-black">SUCCESS INDEX</a>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile Navigation (Prototype Style) -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/10 px-6 py-3 flex justify-between items-center z-50">
      <a href="/analyzer" class="flex flex-col items-center gap-1 text-accent">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-tighter">Feed</span>
      </a>
      <a href="/analyzer/experts" class="flex flex-col items-center gap-1 text-muted opacity-50">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-tighter">Experts</span>
      </a>
      <a href="/analyzer/teams" class="flex flex-col items-center gap-1 text-muted opacity-50">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-tighter">Teams</span>
      </a>
    </nav>
  `;
  return analyzerLayout(content, 'Dashboard — LLL Draft Analyzer', clerkKey);
}

export function expertLeaderboard(experts: ExpertAccuracy[], clerkKey?: string): string {
  const rows = experts
    .map(
      (e, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors">
      <td class="py-4 px-4 font-bold text-lg text-black">#${i + 1}</td>
      <td class="py-4">
        <div class="font-bold text-black">${e.expertName}</div>
        <div class="text-[10px] text-muted uppercase tracking-widest">${e.org}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent">${e.rmse}</td>
      <td class="py-4 text-center text-muted font-bold">${e.sampleSize}</td>
      <td class="py-4 pr-4 text-right">
        <button class="text-[10px] font-bold uppercase tracking-widest border-b-2 border-accent hover:bg-accent hover:text-white transition-all px-2 py-1 text-black">Intel Board</button>
      </td>
    </tr>
  `,
    )
    .join('');

  const content = `
    <div class="max-w-5xl mx-auto py-8 px-4">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-6 inline-block transition-colors">← Back to Dashboard</a>
      <h2 class="text-5xl font-bold tracking-tighter mb-2 text-black">ORACLE LEADERBOARD</h2>
      <p class="text-muted italic mb-10 border-b border-black/10 pb-4">Ranked by Mock Draft Accuracy (RMSE — Lower is better)</p>
      
      <div class="card-paper rounded-lg overflow-hidden border-t-8 border-black">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-black text-white text-[10px] uppercase tracking-[0.2em]">
              <th class="py-4 px-4">Rank</th>
              <th class="py-4">Expert / Source</th>
              <th class="py-4 text-center">RMSE Score</th>
              <th class="py-4 text-center">Sample Size</th>
              <th class="py-4 pr-4"></th>
            </tr>
          </thead>
          <tbody class="text-black">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return analyzerLayout(content, 'Expert Leaderboard — LLL', clerkKey);
}

export function teamLeaderboard(teams: TeamSuccess[], clerkKey?: string): string {
  const cards = teams
    .map(
      (t) => `
    <div class="card-paper p-8 rounded-lg border-t-8 ${t.grade.startsWith('A') ? 'border-accent' : 'border-black'}">
      <div class="flex justify-between items-baseline mb-6">
        <h3 class="text-4xl font-bold tracking-tighter text-black">${t.team}</h3>
        <span class="text-3xl font-bold text-accent italic font-serif">${t.grade}</span>
      </div>
      <div class="space-y-6">
        <div>
          <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2 text-muted">
            <span>Core Retention</span>
            <span class="text-black">${t.retention}%</span>
          </div>
          <div class="h-2 bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-black" style="width: ${t.retention}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2 text-muted">
            <span>Value Premium</span>
            <span class="text-accent">+${t.value}%</span>
          </div>
          <div class="h-2 bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-accent" style="width: ${t.value}%"></div>
          </div>
        </div>
      </div>
      <button class="w-full mt-8 py-3 border-2 border-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all text-black">Deep Analysis</button>
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="max-w-5xl mx-auto py-8 px-4">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-6 inline-block transition-colors">← Back to Dashboard</a>
      <h2 class="text-5xl font-bold tracking-tighter mb-2 text-black">SUCCESS INDEX</h2>
      <p class="text-muted italic mb-10 border-b border-black/10 pb-4">3-Year Rolling Analysis: Retention & Performance vs Expected Draft Value</p>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        ${cards}
      </div>
    </div>
  `;
  return analyzerLayout(content, 'Team Success Index — LLL', clerkKey);
}

export function topExpertsMini(experts: ExpertAccuracy[]): string {
  const items = experts
    .slice(0, 3)
    .map(
      (e, i) => `
    <div class="flex justify-between items-center ${i < 2 ? 'border-b border-black/5 pb-3 mb-3' : ''}">
      <div>
        <div class="font-bold text-sm text-black">${e.expertName}</div>
        <div class="text-[9px] text-muted uppercase tracking-widest">${e.org}</div>
      </div>
      <div class="text-right">
        <div class="font-mono font-bold text-black">${e.rmse}</div>
        <div class="text-[9px] text-accent font-bold uppercase">Rank #${i + 1}</div>
      </div>
    </div>
  `,
    )
    .join('');

  return `
    <div class="space-y-1">
      ${items}
      <a href="/analyzer/experts" class="block text-center text-[9px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mt-4 transition-colors">View All Receipts</a>
    </div>
  `;
}

export function timelineFragment(events: any[]): string {
  return events
    .map(
      (item, i) => `
    <div class="py-6 ${i < events.length - 1 ? 'border-b border-black/5' : ''}">
      <div class="flex items-center gap-3 mb-2">
        <span class="mono text-[9px] font-bold uppercase tracking-[0.1em] bg-black text-white px-2 py-0.5">
          ${item.type}
        </span>
        <span class="mono text-[10px] text-muted ml-auto">${new Date(item.date).toLocaleDateString()}</span>
      </div>
      <div class="serif text-xl font-bold leading-tight text-black mb-2">${item.title}</div>
      <div class="text-sm text-muted mb-3">${item.content}</div>
      <div class="mono text-[10px] ${item.content.includes('increased') ? 'text-accent' : 'text-black'} font-bold">
        ↳ LLL Delta: ${item.content.includes('increased') ? '+' : ''}4.2%
      </div>
    </div>
  `,
    )
    .join('');
}

export function playerProfile(profile: any, clerkKey?: string): string {
  const performanceRows = profile.performanceHistory
    .map(
      (p: any) => `
    <div class="flex justify-between items-center py-4 border-b border-black/5">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-muted">${p.evaluationYear} EVALUATION</div>
        <div class="font-bold text-black text-lg">${p.justification}</div>
      </div>
      <div class="text-right text-black">
        <div class="text-3xl font-bold text-accent">${p.rating}</div>
        <div class="text-[10px] font-bold uppercase tracking-tighter text-muted">0-10 SCALE</div>
      </div>
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="max-w-5xl mx-auto py-8 px-4">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-8 inline-block transition-colors">← Back to Dashboard</a>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
        <!-- Player Info -->
        <div class="md:col-span-2 space-y-8">
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-2">Drafted 2023 · Round 1, Pick 2</div>
            <h2 class="text-6xl font-bold tracking-tighter text-black leading-none mb-4">${profile.playerName.toUpperCase()}</h2>
            <p class="text-xl text-muted serif italic mb-8">Currently rated as a <span class="text-black font-bold border-b-2 border-black">${profile.careerStatus}</span></p>
            
            <div class="space-y-6">
              <h3 class="text-xs font-bold uppercase tracking-[0.2em] border-b border-black pb-2 text-black">CAREER TRAJECTORY</h3>
              ${performanceRows}
            </div>
          </section>
        </div>

        <!-- Sidebar Details -->
        <div class="space-y-8 text-black">
          <div class="card-paper p-6 rounded-lg border-t-8 border-black">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-black">EXPERT ACCURACY DELTA</h3>
            <div class="space-y-4">
              ${profile.accuracySummary
                .map(
                  (a: any) => `
                <div class="flex justify-between text-sm">
                  <span class="font-bold">${a.expert}</span>
                  <span class="${a.isAccurate ? 'text-accent' : 'text-muted'} font-bold font-mono">${a.predictedRank}</span>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return analyzerLayout(content, `${profile.playerName} — LLL Profile`, clerkKey);
}
