import {baseLayout, escapeHtml} from './templates.js';
import type {
  DraftPickRow,
  GmAllTimeRow,
  GmSeasonRow,
  SeasonSummary,
  WireRow,
} from '../services/fantasy-scout.js';

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) {
    return '—';
  }
  return n.toLocaleString('en-US', {maximumFractionDigits: digits, minimumFractionDigits: digits});
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function record(w: number, l: number, t: number): string {
  return t ? `${w}–${l}–${t}` : `${w}–${l}`;
}

function sparkSvg(finishes: number[]): string {
  if (finishes.every((f) => f === 0)) {
    return '';
  }
  const vals = finishes.map((f) => (f === 0 ? null : f));
  const present = vals.filter((v): v is number => v != null);
  const max = Math.max(...present, 1);
  const w = 72;
  const h = 22;
  const step = finishes.length > 1 ? w / (finishes.length - 1) : w;
  const pts = finishes
    .map((f, i) => {
      if (f === 0) {
        return null;
      }
      const x = i * step;
      const y = 2 + ((f - 1) / max) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);
  return `<svg viewBox="0 0 ${w} ${h}" class="w-[72px] h-[22px]" aria-hidden="true"><polyline fill="none" stroke="#3fe1a8" stroke-width="1.6" points="${pts.join(' ')}"/></svg>`;
}

function sortTh(label: string, col: number, type: 'num' | 'str' = 'num', extra = ''): string {
  return `<th class="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-muted cursor-pointer select-none ${extra}" data-col="${col}" data-type="${type}" onclick="lllSort(this)">${label} <span class="si opacity-40">↕</span></th>`;
}

export function fantasyLayout(content: string, title = 'UCSB Legacy', clerkPublishableKey?: string): string {
  const styles = `
    <style>
      /* Sleeper-inspired dark lab — distinct from draft (light gray) and analyzer (cream/crimson). */
      .theme-sleeper {
        --sl-bg: #0e1116;
        --sl-surface: #171c24;
        --sl-elevated: #1e2530;
        --sl-border: rgba(255,255,255,0.08);
        --sl-text: #f4f7fb;
        --sl-muted: #8b95a8;
        --sl-accent: #3fe1a8;
        --sl-accent-2: #7c6bff;
        --sl-loss: #ff7a8a;
        background: var(--sl-bg);
        color: var(--sl-text);
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      body:has(.theme-sleeper) { background: #0e1116; }
      .theme-sleeper .card-paper {
        background: var(--sl-surface);
        border: 1px solid var(--sl-border);
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      }
      .theme-sleeper .tab-active { border-bottom: 2px solid var(--sl-accent); color: var(--sl-accent); }
      .theme-sleeper .text-muted { color: var(--sl-muted); }
      .theme-sleeper .text-accent { color: var(--sl-accent); }
      .theme-sleeper .text-black { color: var(--sl-text); }
      .theme-sleeper .hover\\:text-accent:hover { color: var(--sl-accent); }
      .theme-sleeper .hover\\:text-black:hover { color: #fff; }
      .theme-sleeper .border-accent { border-color: var(--sl-accent); }
      .theme-sleeper .border-black\\/10 { border-color: var(--sl-border); }
      .theme-sleeper .border-black\\/5 { border-color: rgba(255,255,255,0.05); }
      .theme-sleeper .border-black\\/20 { border-color: rgba(255,255,255,0.14); }
      .theme-sleeper .bg-black\\/5 { background: rgba(255,255,255,0.06); }
      .theme-sleeper .bg-black\\/\\[0\\.03\\] { background: rgba(255,255,255,0.03); }
      .theme-sleeper .hover\\:bg-black\\/\\[0\\.03\\]:hover { background: rgba(63,225,168,0.08); }
      .theme-sleeper .text-emerald-800 { color: var(--sl-accent); }
      .theme-sleeper .bg-emerald-200 { background: rgba(63,225,168,0.45); color: #04140e; }
      .theme-sleeper .bg-emerald-50 { background: rgba(63,225,168,0.16); }
      .theme-sleeper .bg-red-50 { background: rgba(255,122,138,0.16); }
      .theme-sleeper a { color: inherit; }
      .theme-sleeper code { color: var(--sl-accent); }
      .theme-sleeper thead { background: var(--sl-elevated); }
      .theme-sleeper table { color: var(--sl-text); }
    </style>
    <script>
      (function () {
        if (window.lllSort) return;
        window.lllSort = function (th) {
          var table = th.closest('table');
          var tbody = table.querySelector('tbody');
          var col = parseInt(th.dataset.col, 10);
          var type = th.dataset.type || 'num';
          var dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
          table.querySelectorAll('thead th[data-col]').forEach(function (h) {
            h.dataset.dir = '';
            h.classList.remove('text-accent');
            var ind = h.querySelector('.si');
            if (ind) { ind.textContent = '\\u2195'; ind.style.opacity = '0.4'; }
          });
          th.dataset.dir = dir;
          th.classList.add('text-accent');
          var ind = th.querySelector('.si');
          if (ind) { ind.textContent = dir === 'asc' ? '\\u2191' : '\\u2193'; ind.style.opacity = '1'; }
          var rows = Array.from(tbody.querySelectorAll('tr'));
          rows.sort(function (a, b) {
            var av = a.cells[col] ? (a.cells[col].dataset.val || '') : '';
            var bv = b.cells[col] ? (b.cells[col].dataset.val || '') : '';
            var cmp = type === 'num' ? (parseFloat(av) - parseFloat(bv)) : av.localeCompare(bv);
            if (isNaN(cmp)) cmp = 0;
            return dir === 'asc' ? cmp : -cmp;
          });
          var rank = 1;
          rows.forEach(function (r) {
            var rc = r.querySelector('.tbl-rank');
            if (rc) rc.textContent = String(rank++);
            tbody.appendChild(r);
          });
        };
      })();
    </script>
  `;
  return baseLayout(
    `<div class="theme-sleeper min-h-screen">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      ${styles}
      ${content}
    </div>`,
    title,
    clerkPublishableKey,
  );
}

function nav(active: string, seasons: SeasonSummary[], year?: number): string {
  const latest = seasons.at(-1)?.season;
  const y = year ?? latest;
  const tab = (href: string, key: string, label: string) =>
    `<a href="${href}" class="pb-2 text-[11px] font-bold uppercase tracking-[0.2em] ${active === key ? 'tab-active' : 'text-muted hover:text-accent'}">${label}</a>`;
  const yearLinks = seasons
    .map(
      (s) =>
        `<a href="/fantasy/season/${s.season}" class="px-2 py-1 text-[10px] font-bold rounded ${year !== undefined && s.season === year ? 'text-accent bg-black/5' : 'text-muted hover:text-black'}">${s.season}</a>`,
    )
    .join('');
  return `
    <header class="border-b border-black/10 bg-[#0e1116]/90 backdrop-blur sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="/apps" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← Apps</a>
          <h1 class="text-3xl font-extrabold tracking-tight mt-1">UCSB Legacy</h1>
          <p class="text-sm text-muted">Auction best-ball · $200 / $100 FAAB · all-play, no playoffs</p>
        </div>
        <div class="flex gap-1 flex-wrap">${yearLinks}</div>
      </div>
      <nav class="max-w-6xl mx-auto px-4 flex gap-6 overflow-x-auto">
        ${tab('/fantasy', 'all', 'All-time')}
        ${tab(y ? `/fantasy/season/${y}` : '/fantasy', 'season', 'Season')}
        ${tab(y ? `/fantasy/draft/${y}` : '/fantasy', 'draft', 'Auction')}
        ${tab(y ? `/fantasy/wire/${y}` : '/fantasy', 'wire', 'Wire')}
        ${tab('/fantasy/bargains', 'bargains', 'Bargains')}
        ${tab('/fantasy/rankings', 'rankings', 'Over time')}
      </nav>
    </header>`;
}

function emptyIngest(): string {
  return `
    <div class="card-paper rounded-lg p-8 text-center">
      <h2 class="text-2xl font-bold tracking-tighter mb-2">No Sleeper data yet</h2>
      <p class="text-muted">Run <code class="text-sm bg-black/5 px-1">bun run sleeper:ingest</code> then refresh.</p>
    </div>`;
}

export function fantasyDashboard(gms: GmAllTimeRow[], seasons: SeasonSummary[], clerkKey?: string): string {
  const cards = gms
    .map((g, i) => {
      const accent = i < 3 ? 'border-accent' : 'border-black/20';
      return `
      <a href="/fantasy/manager/${encodeURIComponent(g.slug)}" class="card-paper p-5 rounded-lg border-t-4 ${accent} hover:shadow-md transition-shadow block">
        <div class="flex justify-between items-start gap-3">
          <div>
            <div class="text-[8px] font-bold text-muted uppercase tracking-[0.2em]">Rank #${i + 1}</div>
            <h3 class="text-xl font-bold tracking-tighter">${escapeHtml(g.displayName)}</h3>
            <div class="text-[11px] text-muted">${g.seasons} season${g.seasons === 1 ? '' : 's'} · avg finish ${fmt(g.avgFinish)}</div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-extrabold text-accent tabular-nums">${pct(g.winPct)}</div>
            <div class="text-[11px] text-muted">${record(g.wins, g.losses, g.ties)}</div>
          </div>
        </div>
        <div class="mt-4 flex items-end justify-between gap-3">
          <div class="grid grid-cols-3 gap-3 text-[10px] uppercase tracking-widest text-muted">
            <div>PF/W <span class="block text-black font-bold normal-case tracking-normal text-sm">${fmt(g.pfPerWeek)}</span></div>
            <div>Draft <span class="block text-black font-bold normal-case tracking-normal text-sm">${escapeHtml(g.draftGrade)}</span></div>
            <div>Wire <span class="block text-black font-bold normal-case tracking-normal text-sm">${fmt(g.wireFpts, 0)}</span></div>
          </div>
          ${sparkSvg(g.sparkline)}
        </div>
      </a>`;
    })
    .join('');

  const tableRows = gms
    .map((g, i) => {
      return `<tr class="border-t border-black/5 hover:bg-black/[0.03] cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(g.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${i + 1}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}">${escapeHtml(g.displayName)}</td>
        <td class="px-3 py-2" data-val="${g.seasons}">${g.seasons}</td>
        <td class="px-3 py-2" data-val="${g.winPct}">${pct(g.winPct)}</td>
        <td class="px-3 py-2" data-val="${g.wins}">${record(g.wins, g.losses, g.ties)}</td>
        <td class="px-3 py-2" data-val="${g.fpts}">${fmt(g.fpts, 0)}</td>
        <td class="px-3 py-2" data-val="${g.pfPerWeek}">${fmt(g.pfPerWeek)}</td>
        <td class="px-3 py-2" data-val="${g.avgFinish}">${fmt(g.avgFinish)}</td>
        <td class="px-3 py-2" data-val="${g.draftSurplus}">${escapeHtml(g.draftGrade)} <span class="text-muted">${fmt(g.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2" data-val="${g.lateFpts}">${fmt(g.lateFpts, 0)}</td>
        <td class="px-3 py-2" data-val="${g.wireFpts}">${fmt(g.wireFpts, 0)}</td>
      </tr>`;
    })
    .join('');

  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-8">
      ${
        gms.length === 0
          ? emptyIngest()
          : `
      <p class="text-sm text-muted max-w-3xl">Each week every GM’s best-ball score plays every other GM. Finish is all-play wins, then points — no playoffs. PF/W is <em>not</em> era-adjusted (2023 was 2QB / 6 teams). Draft letter is rank among GMs on auction surplus, not a shared curve that can fail everyone.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${cards}</div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]">
            <tr>
              ${sortTh('#', 0)}
              ${sortTh('GM', 1, 'str')}
              ${sortTh('Yrs', 2)}
              ${sortTh('Win%', 3)}
              ${sortTh('W-L', 4)}
              ${sortTh('PF', 5)}
              ${sortTh('PF/W', 6)}
              ${sortTh('Avg fin.', 7)}
              ${sortTh('Draft', 8)}
              ${sortTh('Late', 9)}
              ${sortTh('Wire', 10)}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
      }
    </main>`;
  return fantasyLayout(body, 'UCSB Legacy — All-time', clerkKey);
}

export function fantasySeasonPage(
  summary: SeasonSummary | null,
  standings: GmSeasonRow[],
  seasons: SeasonSummary[],
  clerkKey?: string,
): string {
  const year = summary?.season;
  const preDraft = summary?.draftStatus === 'pre_draft' || summary?.status === 'pre_draft';
  const rows = standings
    .map(
      (r) => `<tr class="border-t border-black/5 hover:bg-black/[0.03] cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(r.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${r.finish}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}
          <div class="text-[11px] text-muted font-normal">${escapeHtml(r.teamName || '')}</div></td>
        <td class="px-3 py-2" data-val="${r.winPct}">${pct(r.winPct)}</td>
        <td class="px-3 py-2" data-val="${r.wins}">${record(r.wins, r.losses, r.ties)}</td>
        <td class="px-3 py-2" data-val="${r.fpts}">${fmt(r.fpts)}</td>
        <td class="px-3 py-2" data-val="${r.pfPerWeek}">${fmt(r.pfPerWeek)}</td>
        <td class="px-3 py-2" data-val="${r.draftSurplus}">${escapeHtml(r.draftGrade)} <span class="text-muted">${fmt(r.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2" data-val="${r.wireFpts}">${fmt(r.wireFpts, 0)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    ${nav('season', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        !summary
          ? emptyIngest()
          : `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-3xl font-bold tracking-tighter">${year} standings</h2>
          <p class="text-sm text-muted">${summary.teamCount} teams · ${escapeHtml(summary.status)}${preDraft ? ' — auction has not started on Sleeper yet' : ''}</p>
        </div>
        <div class="flex gap-3 text-sm font-bold">
          <a class="text-accent hover:underline" href="/fantasy/draft/${year}">Auction →</a>
          <a class="text-accent hover:underline" href="/fantasy/wire/${year}">Wire →</a>
        </div>
      </div>
      ${
        preDraft && standings.every((s) => s.wins === 0 && s.fpts === 0)
          ? `<div class="card-paper rounded-lg p-6 text-muted italic">Draft opens on Sleeper — this page fills after ingest.</div>`
          : `<div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Win%', 2)}${sortTh('W-L', 3)}
            ${sortTh('PF', 4)}${sortTh('PF/W', 5)}
            ${sortTh('Draft', 6)}${sortTh('Wire', 7)}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-xs text-muted">W-L is all-play: each week your best-ball score is a win or loss against every other team. No playoffs. Draft letter is rank among this season’s GMs on total auction surplus (A–F quintiles).</p>`
      }`
      }
    </main>`;
  return fantasyLayout(body, `UCSB Legacy — ${year ?? 'season'}`, clerkKey);
}

function pickRowsHtml(picks: (DraftPickRow & {season?: number})[], withSeason = false): string {
  return picks
    .map((p) => {
      const seasonCell = withSeason
        ? `<td class="px-3 py-2" data-val="${p.season ?? 0}">${p.season ?? ''}</td>`
        : '';
      return `<tr class="border-t border-black/5">
        ${seasonCell}
        <td class="px-3 py-2" data-val="${p.pickNo}">${p.pickNo}${p.isKeeper ? ' <span class="text-accent text-[10px]">K</span>' : ''}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(p.displayName)}"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(p.slug)}">${escapeHtml(p.displayName)}</a></td>
        <td class="px-3 py-2" data-val="${escapeHtml(p.playerName)}"><a class="hover:text-accent" href="/fantasy/player/${encodeURIComponent(p.playerId)}">${escapeHtml(p.playerName)}</a></td>
        <td class="px-3 py-2" data-val="${escapeHtml(p.position)}">${escapeHtml(p.position)}</td>
        <td class="px-3 py-2" data-val="${p.amount}">$${p.amount}</td>
        <td class="px-3 py-2" data-val="${p.fpts}">${fmt(p.fpts)}</td>
        <td class="px-3 py-2" data-val="${p.value}">${fmt(p.value)}</td>
        <td class="px-3 py-2 ${p.surplus >= 0 ? 'text-emerald-800' : 'text-rose-400'}" data-val="${p.surplus}">${p.surplus >= 0 ? '+' : ''}${fmt(p.surplus)}</td>
        <td class="px-3 py-2" data-val="${p.pffGrade ?? -1}">${p.pffGrade == null ? '—' : fmt(p.pffGrade)}</td>
      </tr>`;
    })
    .join('');
}

export function fantasyDraftPage(
  summary: SeasonSummary | null,
  picks: DraftPickRow[],
  seasons: SeasonSummary[],
  clerkKey?: string,
): string {
  const year = summary?.season;
  const body = `
    ${nav('draft', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        !summary
          ? emptyIngest()
          : picks.length === 0
            ? `<h2 class="text-3xl font-bold tracking-tighter">${year} auction</h2>
               <div class="card-paper rounded-lg p-6 text-muted italic">Draft opens on Sleeper — this page fills after ingest.</div>`
            : `<h2 class="text-3xl font-bold tracking-tighter">${year} auction</h2>
               <p class="text-sm text-muted">Draft credit = that player’s league FPTS all season (even if later dropped). Surplus = FPTS minus $ × that position’s in-league pts/$. Team grade is rank among GMs on total surplus (A–F quintiles), not an absolute cutoff. Ungraded until drafts differ. PFF is overlay, not the sort.</p>
               <div class="card-paper rounded-lg overflow-x-auto">
                 <table class="w-min min-w-full text-sm">
                   <thead class="bg-black/[0.03]"><tr>
                     ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Player', 2, 'str')}${sortTh('Pos', 3, 'str')}
                     ${sortTh('$', 4)}${sortTh('FPTS', 5)}${sortTh('Pts/$', 6)}${sortTh('Surplus', 7)}${sortTh('PFF', 8)}
                   </tr></thead>
                   <tbody>${pickRowsHtml(picks)}</tbody>
                 </table>
               </div>`
      }
    </main>`;
  return fantasyLayout(body, `UCSB Legacy — ${year ?? ''} auction`, clerkKey);
}

export function fantasyWirePage(
  summary: SeasonSummary | null,
  rows: WireRow[],
  missed: WireRow[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string,
): string {
  const year = summary?.season;
  const gmRollup = new Map<string, {slug: string; displayName: string; fpts: number; faab: number; adds: number}>();
  for (const r of rows) {
    const cur = gmRollup.get(r.slug) ?? {slug: r.slug, displayName: r.displayName, fpts: 0, faab: 0, adds: 0};
    cur.fpts += r.fpts;
    cur.faab += r.waiverBid;
    cur.adds += 1;
    gmRollup.set(r.slug, cur);
  }
  const gmRows = [...gmRollup.values()]
    .sort((a, b) => b.fpts - a.fpts)
    .map(
      (g, i) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(g.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${i + 1}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}">${escapeHtml(g.displayName)}</td>
        <td class="px-3 py-2" data-val="${g.adds}">${g.adds}</td>
        <td class="px-3 py-2" data-val="${g.faab}">$${g.faab}</td>
        <td class="px-3 py-2" data-val="${g.fpts}">${fmt(g.fpts)}</td>
        <td class="px-3 py-2" data-val="${g.fpts / Math.max(g.faab, 1)}">${fmt(g.fpts / Math.max(g.faab, 1))}</td>
      </tr>`,
    )
    .join('');
  const log = rows
    .map(
      (r) => `<tr class="border-t border-black/5">
        <td class="px-3 py-2" data-val="${r.addWeek}">W${r.addWeek}${r.dropWeek !== r.addWeek ? `–${r.dropWeek}` : ''}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.playerName)}"><a class="hover:text-accent" href="/fantasy/player/${encodeURIComponent(r.playerId)}">${escapeHtml(r.playerName)}</a></td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.type)}">${escapeHtml(r.type)}</td>
        <td class="px-3 py-2" data-val="${r.waiverBid}">$${r.waiverBid}</td>
        <td class="px-3 py-2" data-val="${r.fpts}">${fmt(r.fpts)}</td>
      </tr>`,
    )
    .join('');
  const missedRows = missed
    .map(
      (r) => `<tr class="border-t border-black/5 text-muted">
        <td class="px-3 py-2">W${r.addWeek}</td>
        <td class="px-3 py-2">${escapeHtml(r.displayName)}</td>
        <td class="px-3 py-2">${escapeHtml(r.playerName)}</td>
        <td class="px-3 py-2">$${r.waiverBid}</td>
      </tr>`,
    )
    .join('');
  const body = `
    ${nav('wire', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        !summary
          ? emptyIngest()
          : `<h2 class="text-3xl font-bold tracking-tighter">${year} wire</h2>
             <p class="text-sm text-muted">Complete waivers and free-agent adds. Wire FPTS = points on that roster from add week through drop (or season end). Trades are not scored as pickup skill.</p>
             <div class="card-paper rounded-lg overflow-x-auto">
               <table class="w-min min-w-full text-sm">
                 <thead class="bg-black/[0.03]"><tr>
                   ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Adds', 2)}${sortTh('FAAB', 3)}
                   ${sortTh('Wire FPTS', 4)}${sortTh('Pts/$', 5)}
                 </tr></thead>
                 <tbody>${gmRows || '<tr><td class="px-3 py-4 text-muted" colspan="6">No completed adds this season.</td></tr>'}</tbody>
               </table>
             </div>
             <h3 class="text-xl font-bold tracking-tighter">Log</h3>
             <div class="card-paper rounded-lg overflow-x-auto">
               <table class="w-min min-w-full text-sm">
                 <thead class="bg-black/[0.03]"><tr>
                   ${sortTh('Weeks', 0)}${sortTh('GM', 1, 'str')}${sortTh('Player', 2, 'str')}${sortTh('Type', 3, 'str')}
                   ${sortTh('$', 4)}${sortTh('FPTS', 5)}
                 </tr></thead>
                 <tbody>${log}</tbody>
               </table>
             </div>
             <p class="text-sm"><a class="text-accent font-bold" href="/fantasy/wire/${year}?missed=1">${showMissed ? 'Hide' : 'Show'} bids that missed (${missed.length})</a></p>
             ${
               showMissed
                 ? `<div class="card-paper rounded-lg overflow-x-auto">
                      <table class="w-min min-w-full text-sm">
                        <thead class="bg-black/[0.03]"><tr>
                          <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Week</th>
                          <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">GM</th>
                          <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Player</th>
                          <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Bid</th>
                        </tr></thead>
                        <tbody>${missedRows}</tbody>
                      </table>
                    </div>`
                 : ''
             }`
      }
    </main>`;
  return fantasyLayout(body, `UCSB Legacy — ${year ?? ''} wire`, clerkKey);
}

export function fantasyBargainsPage(
  byGm: {slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number}[],
  rows: (DraftPickRow & {season: number})[],
  seasons: SeasonSummary[],
  clerkKey?: string,
): string {
  const gmRows = byGm
    .map(
      (g, i) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(g.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${i + 1}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}">${escapeHtml(g.displayName)}</td>
        <td class="px-3 py-2" data-val="${g.latePicks}">${g.latePicks}</td>
        <td class="px-3 py-2" data-val="${g.hits}">${g.hits}</td>
        <td class="px-3 py-2" data-val="${g.lateFpts}">${fmt(g.lateFpts)}</td>
      </tr>`,
    )
    .join('');
  const body = `
    ${nav('bargains', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h2 class="text-3xl font-bold tracking-tighter">Late-round bargains</h2>
      <p class="text-sm text-muted">A pick is late if it is in the last three auction rounds <em>or</em> cost $2 or less.</p>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Picks', 2)}${sortTh('Hits', 3)}${sortTh('Late FPTS', 4)}
          </tr></thead>
          <tbody>${gmRows || '<tr><td class="px-3 py-4 text-muted" colspan="5">No late picks ingested.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7)}${sortTh('vs $1', 8)}${sortTh('PFF', 9)}
          </tr></thead>
          <tbody>${pickRowsHtml(rows, true)}</tbody>
        </table>
      </div>
    </main>`;
  return fantasyLayout(body, 'UCSB Legacy — Bargains', clerkKey);
}

export function fantasyRankingsPage(seasons: number[], gms: GmAllTimeRow[], seasonMeta: SeasonSummary[], clerkKey?: string): string {
  const head = seasons
    .map((y, i) => sortTh(String(y), i + 2))
    .join('');
  const rows = gms
    .map((g) => {
      const cells = seasons
        .map((y, i) => {
          const fin = g.sparkline[i] ?? 0;
          const bg =
            fin === 0 ? '' : fin === 1 ? 'bg-emerald-200' : fin <= 3 ? 'bg-emerald-50' : fin >= 10 ? 'bg-red-50' : 'bg-black/5';
          return `<td class="px-3 py-2 text-center ${bg}" data-val="${fin === 0 ? 99 : fin}">${fin === 0 ? '—' : fin}</td>`;
        })
        .join('');
      return `<tr class="border-t border-black/5">
        <td class="px-3 py-2 tbl-rank font-bold"></td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(g.slug)}">${escapeHtml(g.displayName)}</a></td>
        ${cells}
      </tr>`;
    })
    .join('');
  const body = `
    ${nav('rankings', seasonMeta)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h2 class="text-3xl font-bold tracking-tighter">Finish over time</h2>
      <p class="text-sm text-muted">Season finish = all-play wins, then points. Blank = did not play that year. No playoffs.</p>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${head}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </main>`;
  return fantasyLayout(body, 'UCSB Legacy — Rankings', clerkKey);
}

export function fantasyManagerPage(
  gm: GmAllTimeRow,
  draftPicks: (DraftPickRow & {season: number})[],
  wire: (WireRow & {season: number})[],
  missed: (WireRow & {season: number})[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string,
): string {
  const yearRows = gm.years
    .map(
      (y) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/season/${y.season}'">
        <td class="px-3 py-2 font-bold">${y.season}</td>
        <td class="px-3 py-2">${y.finish}</td>
        <td class="px-3 py-2">${record(y.wins, y.losses, y.ties)}</td>
        <td class="px-3 py-2">${fmt(y.fpts)}</td>
        <td class="px-3 py-2">${escapeHtml(y.draftGrade)} <span class="text-muted">${fmt(y.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2">${fmt(y.wireFpts, 0)}</td>
        <td class="px-3 py-2 text-muted">${escapeHtml(y.teamName || '')}</td>
      </tr>`,
    )
    .join('');
  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← All-time</a>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-4xl font-bold tracking-tighter">${escapeHtml(gm.displayName)}</h2>
          <p class="text-muted">${gm.seasons} seasons · ${pct(gm.winPct)} · ${record(gm.wins, gm.losses, gm.ties)}</p>
        </div>
        ${sparkSvg(gm.sparkline)}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">PF/W</div><div class="text-2xl font-bold">${fmt(gm.pfPerWeek)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">Avg finish</div><div class="text-2xl font-bold">${fmt(gm.avgFinish)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">Draft</div><div class="text-2xl font-bold">${escapeHtml(gm.draftGrade)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">Wire FPTS</div><div class="text-2xl font-bold">${fmt(gm.wireFpts, 0)}</div></div>
      </div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Year</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Fin</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">W-L</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">PF</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Draft</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Wire</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Team</th>
          </tr></thead>
          <tbody>${yearRows}</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">Auction picks</h3>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7)}${sortTh('Surplus', 8)}${sortTh('PFF', 9)}
          </tr></thead>
          <tbody>${pickRowsHtml(draftPicks, true)}</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">Wire hits</h3>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Year</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Weeks</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Player</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Type</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">$</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">FPTS</th>
          </tr></thead>
          <tbody>${wire
            .map(
              (r) => `<tr class="border-t border-black/5">
                <td class="px-3 py-2">${r.season}</td>
                <td class="px-3 py-2">W${r.addWeek}–${r.dropWeek}</td>
                <td class="px-3 py-2"><a class="hover:text-accent" href="/fantasy/player/${encodeURIComponent(r.playerId)}">${escapeHtml(r.playerName)}</a></td>
                <td class="px-3 py-2">${escapeHtml(r.type)}</td>
                <td class="px-3 py-2">$${r.waiverBid}</td>
                <td class="px-3 py-2">${fmt(r.fpts)}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>
      </div>
      <p class="text-sm"><a class="text-accent font-bold" href="/fantasy/manager/${encodeURIComponent(gm.slug)}?missed=1">${showMissed ? 'Hide' : 'Show'} bids that missed (${missed.length})</a></p>
      ${
        showMissed
          ? `<div class="card-paper rounded-lg overflow-x-auto">
               <table class="w-min min-w-full text-sm">
                 <tbody>${missed
                   .map(
                     (r) =>
                       `<tr class="border-t border-black/5 text-muted"><td class="px-3 py-2">${r.season} W${r.addWeek}</td><td class="px-3 py-2">${escapeHtml(r.playerName)}</td><td class="px-3 py-2">$${r.waiverBid}</td></tr>`,
                   )
                   .join('')}</tbody>
               </table>
             </div>`
          : ''
      }
    </main>`;
  return fantasyLayout(body, `${gm.displayName} — UCSB Legacy`, clerkKey);
}

export function fantasyManagerNotFound(slug: string, clerkKey?: string): string {
  const body = `
    <main class="max-w-3xl mx-auto px-4 py-16">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted">← All-time</a>
      <h2 class="text-3xl font-bold tracking-tighter mt-4">No GM named “${escapeHtml(slug)}”</h2>
    </main>`;
  return fantasyLayout(body, 'GM not found', clerkKey);
}

export function fantasyPlayerPage(
  data: {
    playerId: string;
    name: string;
    position: string | null;
    team: string | null;
    drafts: (DraftPickRow & {season: number})[];
    weeks: {season: number; week: number; points: number; slug: string; displayName: string}[];
    pff: {season: number; category: string; grade: number}[];
  },
  seasons: SeasonSummary[],
  clerkKey?: string,
): string {
  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← All-time</a>
      <h2 class="text-4xl font-bold tracking-tighter">${escapeHtml(data.name)}</h2>
      <p class="text-muted">${escapeHtml(data.position || '')} · ${escapeHtml(data.team || 'FA')}</p>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7)}${sortTh('Surplus', 8)}${sortTh('PFF', 9)}
          </tr></thead>
          <tbody>${pickRowsHtml(data.drafts, true)}</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">PFF overlay</h3>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <tbody>${
            data.pff.length === 0
              ? '<tr><td class="px-3 py-4 text-muted">No PFF row matched this name.</td></tr>'
              : data.pff
                  .map(
                    (r) =>
                      `<tr class="border-t border-black/5"><td class="px-3 py-2">${r.season}</td><td class="px-3 py-2">${escapeHtml(r.category)}</td><td class="px-3 py-2 font-bold">${fmt(r.grade)}</td></tr>`,
                  )
                  .join('')
          }</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">Weekly fantasy points</h3>
      <div class="card-paper rounded-lg overflow-x-auto max-h-[480px] overflow-y-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03] sticky top-0"><tr>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Year</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Wk</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">GM</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Pts</th>
          </tr></thead>
          <tbody>${data.weeks
            .map(
              (w) =>
                `<tr class="border-t border-black/5"><td class="px-3 py-2">${w.season}</td><td class="px-3 py-2">${w.week}</td><td class="px-3 py-2">${escapeHtml(w.displayName)}</td><td class="px-3 py-2">${fmt(w.points)}</td></tr>`,
            )
            .join('')}</tbody>
        </table>
      </div>
    </main>`;
  return fantasyLayout(body, `${data.name} — UCSB Legacy`, clerkKey);
}

export function fantasyPlayerNotFound(id: string, clerkKey?: string): string {
  const body = `
    <main class="max-w-3xl mx-auto px-4 py-16">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted">← All-time</a>
      <h2 class="text-3xl font-bold tracking-tighter mt-4">No player ${escapeHtml(id)}</h2>
    </main>`;
  return fantasyLayout(body, 'Player not found', clerkKey);
}
