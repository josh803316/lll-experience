import {baseLayout} from './templates.js';

export interface ExpertAccuracy {
  expertName: string;
  org: string | null;
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

export function analyzerDashboard(clerkKey?: string): string {
  const content = `
    <header class="border-b border-black/10 py-6 px-4 bg-white/50 backdrop-blur-sm sticky top-0 z-[100]">
      <div class="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 class="text-4xl font-bold tracking-tighter text-black">DRAFT ANALYZER</h1>
          <p class="text-[10px] text-muted font-bold uppercase tracking-widest">Intelligence & Historical Tracking</p>
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
          <a href="/analyzer" class="tab-active text-black">Dashboard</a>
          <a href="/analyzer/experts" class="text-muted hover:text-accent transition-colors">Experts</a>
          <a href="/analyzer/teams" class="text-muted hover:text-accent transition-colors">Teams</a>
        </nav>
      </div>
    </header>

    <main class="max-w-5xl mx-auto py-12 px-4 text-black">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-16 text-black">
        <!-- Left: Main Column -->
        <div class="md:col-span-2 space-y-16">
          <!-- Hero -->
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-4">State of the league · 2026 In-Season</div>
            <h2 class="text-7xl font-bold tracking-tighter text-black leading-[0.9] mb-6">
              The <span class="italic serif font-normal">market</span> doesn't lie.
            </h2>
            <p class="text-2xl text-muted serif italic max-w-xl leading-relaxed">
              We track every rookie contract through the 2nd signing. 847 players analyzed. 20 experts audited. One definitive truth.
            </p>
          </section>

          <!-- Success Leaderboard -->
          <section class="space-y-8 text-black">
             <div class="flex justify-between items-end border-b-2 border-black pb-2 text-black">
               <h3 class="text-xs font-bold uppercase tracking-[0.3em] text-black">SUCCESS INDEX · TOP 5</h3>
               <a href="/analyzer/teams" class="text-[9px] font-bold text-muted hover:text-accent uppercase tracking-widest transition-colors">View 32 Teams →</a>
             </div>
             <div id="success-leaderboard" hx-get="/analyzer/fragment/success-leaderboard" hx-trigger="load">
                <p class="italic py-8 text-muted text-center text-sm">Aggregating 10 years of receipts...</p>
             </div>
          </section>

          <!-- Latest Intel -->
          <section class="space-y-8 text-black">
            <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b border-black/10 pb-2 text-black">LATEST INTEL</h3>
            <div id="timeline-feed" hx-get="/analyzer/fragment/timeline" hx-trigger="load">
              <p class="italic py-4 text-muted text-sm text-black">Loading intel wire...</p>
            </div>
          </section>
        </div>

        <!-- Right: Sidebar -->
        <div class="space-y-12 text-black">
          <!-- Index Movers -->
          <div class="card-paper p-8 rounded-lg border-t-[12px] border-black shadow-xl">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-6 text-black text-black">INDEX MOVERS</h3>
            <div class="space-y-6 text-black">
              <div class="flex justify-between items-center group cursor-help">
                <div>
                  <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">LIONS</div>
                  <div class="text-[9px] text-muted uppercase tracking-tighter">Hutchinson extension signal</div>
                </div>
                <div class="text-right">
                  <div class="font-mono font-bold text-accent text-lg">+1.4</div>
                  <div class="text-[8px] text-muted font-bold uppercase">LLL DELTA</div>
                </div>
              </div>
              <div class="flex justify-between items-center border-t border-black/5 pt-6 group cursor-help text-black">
                <div>
                  <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">EAGLES</div>
                  <div class="text-[9px] text-muted uppercase tracking-tighter">Quinyon Mitchell Y1 Snap %</div>
                </div>
                <div class="text-right">
                  <div class="font-mono font-bold text-accent text-lg">+0.8</div>
                  <div class="text-[8px] text-muted font-bold uppercase">LLL DELTA</div>
                </div>
              </div>
              <div class="flex justify-between items-center border-t border-black/5 pt-6 group cursor-help text-black">
                <div>
                  <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">PANTHERS</div>
                  <div class="text-[9px] text-muted uppercase tracking-tighter">Bryce Young Contract Cliff</div>
                </div>
                <div class="text-right text-black/30">
                  <div class="font-mono font-bold text-lg">−0.6</div>
                  <div class="text-[8px] font-bold uppercase">LLL DELTA</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Experts -->
          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-6 text-black text-black">ORACLE LEADERBOARD</h3>
            <div id="top-experts-mini" hx-get="/analyzer/fragment/top-experts-mini" hx-trigger="load">
               <p class="text-[10px] italic text-muted text-center py-4 text-black">Auditing the scouts...</p>
            </div>
          </div>

          <!-- Proprietary Scale Info -->
          <div class="p-6 bg-accent text-white rounded-lg shadow-xl relative overflow-hidden group text-black">
            <div class="absolute -right-4 -bottom-4 text-black/10 text-9xl font-bold italic group-hover:scale-110 transition-transform">LLL</div>
            <h3 class="font-bold text-sm mb-2 uppercase tracking-widest relative z-10 text-white">Proprietary Metric</h3>
            <p class="text-xs opacity-90 relative z-10 font-serif italic leading-relaxed text-white">
              "Performance Score = Average of best 4 of 6 seasons + Trajectory Modifier + Contract Market Signal."
            </p>
          </div>
        </div>
      </div>
    </main>
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
        <div class="font-bold text-black text-black">${e.expertName}</div>
        <div class="text-[10px] text-muted uppercase tracking-widest font-bold">${e.org || 'Independent'}</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg">${e.rmse}</td>
      <td class="py-4 text-center text-muted font-bold">${e.sampleSize}</td>
      <td class="py-4 pr-4 text-right">
        <button class="text-[10px] font-bold uppercase tracking-widest border-b-2 border-accent hover:bg-accent hover:text-white transition-all px-2 py-1 text-black">Intel Board</button>
      </td>
    </tr>
  `,
    )
    .join('');

  const content = `
    <div class="max-w-5xl mx-auto py-12 px-4 text-black">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-6 inline-block transition-colors">← Back to Dashboard</a>
      <h2 class="text-6xl font-bold tracking-tighter mb-2 text-black">ORACLE LEADERBOARD</h2>
      <p class="text-muted italic mb-10 border-b border-black/10 pb-4 serif text-lg">Ranked by Mock Draft Accuracy (RMSE — Lower is better)</p>
      
      <div class="card-paper rounded-lg overflow-hidden border-t-8 border-black shadow-xl">
        <table class="w-full text-left border-collapse text-black">
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
  const cards = teams.map((t, i) => `
    <div class="card-paper p-6 rounded-lg border-t-4 ${t.grade.startsWith('A') ? 'border-accent' : 'border-black/20'} shadow-sm hover:shadow-md transition-all group">
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="text-[8px] font-bold text-muted uppercase tracking-[0.2em] mb-1">Rank #${i + 1}</div>
          <h3 class="text-xl font-bold tracking-tighter text-black group-hover:text-accent transition-colors">${t.team}</h3>
        </div>
        <span class="text-xl font-bold text-black serif italic">${t.grade}</span>
      </div>
      <div class="space-y-4">
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>Retention</span>
            <span class="text-black font-bold">${t.retention}%</span>
          </div>
          <div class="h-1 w-full bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-black" style="width: ${t.retention}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest mb-1.5 text-muted">
            <span>Value Added</span>
            <span class="text-accent font-bold">+${t.value}%</span>
          </div>
          <div class="h-1 w-full bg-black/5 rounded-full overflow-hidden">
            <div class="h-full bg-accent" style="width: ${t.value}%"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  const content = `
    <div class="max-w-6xl mx-auto py-12 px-4 text-black">
      <div class="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
        <div>
          <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent mb-4 inline-block transition-colors">← Back to Dashboard</a>
          <h2 class="text-6xl font-bold tracking-tighter text-black">FRANCHISE INDEX</h2>
          <p class="text-muted italic serif text-xl max-w-xl leading-relaxed">
            A comprehensive look at all 32 teams. Ranked by LLL's proprietary blend of core retention and value premium vs. draft slot.
          </p>
        </div>
        <div class="bg-black text-white px-6 py-4 rounded-lg shadow-xl shrink-0">
           <div class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-1">Total Analysis</div>
           <div class="text-3xl font-bold tracking-tighter">847 <span class="text-sm opacity-60 uppercase tracking-widest font-normal">Picks</span></div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-black">
        ${cards}
      </div>
    </div>
  `;
  return analyzerLayout(content, 'Franchise Index — LLL Draft Analyzer', clerkKey);
}

export function topExpertsMini(experts: ExpertAccuracy[]): string {
  const items = experts
    .slice(0, 3)
    .map(
      (e, i) => `
    <div class="flex justify-between items-center ${i < 2 ? 'border-b border-black/5 pb-4 mb-4' : ''} group text-black">
      <div>
        <div class="font-bold text-sm text-black group-hover:text-accent transition-colors">${e.expertName}</div>
        <div class="text-[9px] text-muted font-bold uppercase tracking-widest">${e.org || 'Independent'}</div>
      </div>
      <div class="text-right">
        <div class="font-mono font-bold text-black text-lg">${e.rmse}</div>
        <div class="text-[8px] text-accent font-bold uppercase tracking-tighter">RMSE SCORE</div>
      </div>
    </div>
  `,
    )
    .join('');

  return `
    <div class="space-y-1 text-black">
      ${items}
      <a href="/analyzer/experts" class="block text-center text-[9px] font-bold uppercase tracking-[0.3em] text-muted hover:text-black mt-6 transition-colors border-t border-black/5 pt-4">Full Oracle Leaderboard →</a>
    </div>
  `;
}

export function successLeaderboard(teams: TeamSuccess[]): string {
  const rows = teams
    .map(
      (t, i) => `
    <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group">
      <td class="py-4 px-4 font-bold text-black text-xl serif italic text-black">#${i + 1}</td>
      <td class="py-4 text-black">
        <div class="font-bold text-black text-lg tracking-tighter">${t.team.toUpperCase()}</div>
        <div class="text-[9px] text-muted font-bold uppercase tracking-widest">3-Year Rolling Index</div>
      </td>
      <td class="py-4 text-center text-black">
        <div class="inline-block px-3 py-1 bg-black text-white text-xs font-bold rounded-sm">${t.retention}%</div>
      </td>
      <td class="py-4 text-center font-mono font-bold text-accent text-lg text-black">+${t.value}%</td>
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
            <th class="py-3 text-center">Retention</th>
            <th class="py-3 text-center">Value Premium</th>
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

export function timelineFragment(events: any[]): string {
  return events
    .map(
      (item, i) => `
    <div class="py-6 ${i < events.length - 1 ? 'border-b border-black/5' : ''} text-black">
      <div class="flex items-center gap-3 mb-2 text-black">
        <span class="mono text-[9px] font-bold uppercase tracking-[0.1em] bg-black text-white px-2 py-0.5">
          ${item.type}
        </span>
        <span class="mono text-[10px] text-muted ml-auto">${new Date(item.date).toLocaleDateString()}</span>
      </div>
      <div class="serif text-xl font-bold leading-tight text-black mb-2">${item.title}</div>
      <div class="text-sm text-muted mb-3 leading-relaxed">${item.content}</div>
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
    <div class="flex justify-between items-center py-4 border-b border-black/5 text-black">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-muted">${p.evaluationYear} EVALUATION</div>
        <div class="font-bold text-black text-lg">${p.justification}</div>
      </div>
      <div class="text-right text-black">
        <div class="text-3xl font-bold text-accent">${p.rating}</div>
        <div class="text-[10px] font-bold uppercase tracking-tighter text-muted font-bold">0-10 SCALE</div>
      </div>
    </div>
  `,
    )
    .join('');

  const content = `
    <div class="max-w-5xl mx-auto py-12 px-4 text-black">
      <a href="/analyzer" class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted hover:text-accent mb-8 inline-block transition-colors">← Back to Dashboard</a>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-12 text-black">
        <!-- Player Info -->
        <div class="md:col-span-2 space-y-12">
          <section>
            <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-4">Drafted ${profile.performanceHistory[0]?.draftYear || 'N/A'} · Round ${profile.round}</div>
            <h2 class="text-7xl font-bold tracking-tighter text-black leading-none mb-6">${profile.playerName.toUpperCase()}</h2>
            <p class="text-2xl text-muted serif italic mb-10 leading-relaxed">
               LLL Grade: <span class="text-black font-bold border-b-4 border-black pb-1">${profile.finalGrade} (${profile.outcome})</span>
            </p>
            
            <div class="space-y-8 text-black">
              <h3 class="text-xs font-bold uppercase tracking-[0.3em] border-b-2 border-black pb-2 text-black">CAREER TRAJECTORY</h3>
              ${performanceRows}
            </div>
          </section>
        </div>

        <!-- Sidebar Details -->
        <div class="space-y-12 text-black">
          <div class="card-paper p-8 rounded-lg border-t-8 border-black shadow-xl">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-6 text-black">EXPERT ACCURACY DELTA</h3>
            <div class="space-y-6 text-black">
              ${profile.accuracySummary
                .map(
                  (a: any) => `
                <div class="flex justify-between items-baseline border-b border-black/5 pb-2 text-black">
                  <span class="font-bold text-sm">${a.expert}</span>
                  <div class="text-right">
                    <span class="${a.isAccurate ? 'text-accent' : 'text-muted'} font-bold font-mono text-lg">${a.predictedRank}</span>
                    <div class="text-[8px] font-bold text-muted uppercase">PRED</div>
                  </div>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
          
          <div class="card-paper p-8 rounded-lg shadow-lg text-black">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.3em] mb-4 text-black">MARKET SIGNAL</h3>
            <div class="text-2xl font-bold text-accent italic serif mb-2">${profile.contractOutcome || 'ROOKIE DEAL'}</div>
            <p class="text-xs text-muted leading-relaxed uppercase font-bold tracking-tighter">
              2nd contract valuation is our primary truth signal for stat-light impact.
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
      <div class="card-paper p-6 text-xs italic text-muted text-black shadow-2xl">
        No intelligence found for that query.
      </div>
    `;
  }

  const players = results.players
    .map(
      (p) => `
    <a href="/analyzer/player/${encodeURIComponent(p.name)}" class="block p-4 hover:bg-black/[0.04] transition-colors border-b border-black/5 group text-black">
      <div class="font-bold text-black text-base group-hover:text-accent transition-colors">${p.name.toUpperCase()}</div>
      <div class="text-[10px] text-muted font-bold uppercase tracking-widest">${p.year} · ${p.team}</div>
    </a>
  `,
    )
    .join('');

  const experts = results.experts
    .map(
      (e) => `
    <a href="/analyzer/experts" class="block p-4 hover:bg-black/[0.04] transition-colors border-b border-black/5 group text-black">
      <div class="font-bold text-black text-base group-hover:text-accent transition-colors">${e.name.toUpperCase()}</div>
      <div class="text-[10px] text-muted font-bold uppercase tracking-widest">${e.org || 'Independent'}</div>
    </a>
  `,
    )
    .join('');

  return `
    <div class="card-paper shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] max-h-[70vh] overflow-auto border-t-8 border-black text-black">
      ${
        results.players.length > 0
          ? `
        <div class="bg-black text-white px-4 py-1 text-[9px] font-bold uppercase tracking-[0.3em]">Scouted Players</div>
        ${players}
      `
          : ''
      }
      ${
        results.experts.length > 0
          ? `
        <div class="bg-black text-white px-4 py-1 text-[9px] font-bold uppercase tracking-[0.3em]">Audited Experts</div>
        ${experts}
      `
          : ''
      }
    </div>
  `;
}
