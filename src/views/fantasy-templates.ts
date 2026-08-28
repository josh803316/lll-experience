import type {
  DraftPickRow,
  GmAllTimeRow,
  GmSeasonRow,
  HeatmapTeam,
  PlayerCardData,
  SeasonSummary,
  WireRow,
} from '../services/fantasy-scout.js'
import { baseLayout, escapeHtml } from './templates.js'

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) {
    return '—'
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function record(w: number, l: number, t: number): string {
  return t ? `${w}–${l}–${t}` : `${w}–${l}`
}

function sparkSvg(finishes: number[]): string {
  if (finishes.every((f) => f === 0)) {
    return ''
  }
  const vals = finishes.map((f) => (f === 0 ? null : f))
  const present = vals.filter((v): v is number => v != null)
  const max = Math.max(...present, 1)
  const w = 72
  const h = 22
  const step = finishes.length > 1 ? w / (finishes.length - 1) : w
  const pts = finishes
    .map((f, i) => {
      if (f === 0) {
        return null
      }
      const x = i * step
      const y = 2 + ((f - 1) / max) * (h - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter(Boolean)
  return `<svg viewBox="0 0 ${w} ${h}" class="w-[72px] h-[22px]" aria-hidden="true"><polyline fill="none" stroke="#3fe1a8" stroke-width="1.6" points="${pts.join(' ')}"/></svg>`
}

const TIPS = {
  pfWeek:
    'Points for per week: your average best-ball score. Total points divided by weeks you actually played. Not adjusted for 2023 (2QB, 6 teams).',
  draftGrade:
    'We add every pick’s surplus, then rank GMs. Top fifth A, then B, C, D, F. After the auction and before games, that uses projected best-ball (RotoWire weekly stats × UCSB scoring), labeled proj. Once weeks are scored, actual FPTS replace it.',
  surplus:
    'Surplus vs what this league paid at that position for that $ (log spend curve), not linear pts/$. A $1 dart is not automatically better than a $55 QB. Before weeks are scored, FPTS is blended weekly projections (RotoWire/ESPN/FantasyPros) run through UCSB scoring.',
  ptsPerDollar: 'Season FPTS divided by auction dollars paid.',
  late: 'Points from auction picks in the last three rounds, or that cost $2 or less.',
  wire: 'Points scored for you by waiver/FA adds, from add week through drop (or season end). Trades do not count.',
  pf: 'Total best-ball fantasy points (season or career).',
  winPct:
    'All-play winning percentage. Each week your score is a win or loss against every other team. No playoffs.',
  hits: 'Late picks that scored more than a typical $1 player that year.',
  wl: 'All-play record: each week your best-ball score is a win or loss against every other team. No playoffs.',
} as const

function tipBtn(text: string, label: string): string {
  return `<button type="button" class="lll-tip" data-tip="${escapeHtml(text)}" aria-label="What ${escapeHtml(label)} means" onclick="lllTip(event)">?</button>`
}

function withTip(label: string, text: string): string {
  return `${escapeHtml(label)}${tipBtn(text, label)}`
}

function projMark(on: boolean): string {
  return on ? ' <span class="text-[10px] uppercase tracking-widest text-accent">proj</span>' : ''
}

function posChip(pos: string | null | undefined): string {
  const p = (pos || '—').toUpperCase()
  return `<span class="pos-chip pos-${escapeHtml(p)}">${escapeHtml(p)}</span>`
}

function gradePill(letter: string, projected = false): string {
  const key = letter.charAt(0)
  const cls = ['A', 'B', 'C', 'D', 'F'].includes(key) ? `grade-${key}` : 'grade-none'
  return `<span class="grade-pill ${cls}">${escapeHtml(letter)}</span>${projMark(projected)}`
}

function playerPhoto(playerId: string, position: string | null | undefined, size = 28): string {
  const pos = (position || '').toUpperCase()
  const src =
    pos === 'DEF'
      ? `https://sleepercdn.com/images/team_logos/nfl/${encodeURIComponent(playerId.toLowerCase())}.png`
      : `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(playerId)}.jpg`
  const cls = size >= 40 ? 'player-thumb player-thumb-lg' : 'player-thumb'
  return `<img class="${cls}" src="${src}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy" onerror="this.style.visibility='hidden'">`
}

function playerLink(
  playerId: string,
  name: string,
  position?: string | null,
  season?: number
): string {
  const seasonAttr = season ? ` data-season="${season}"` : ''
  return `<a class="lll-player hover:text-accent" data-player-id="${escapeHtml(playerId)}"${seasonAttr} href="/fantasy/player/${encodeURIComponent(playerId)}">${playerPhoto(playerId, position, 24)}<span>${escapeHtml(name)}</span></a>`
}

function weekChart(weeks: { week: number; points: number }[], compact = false): string {
  if (weeks.length === 0) {
    return `<p class="text-xs text-muted">${compact ? 'No weekly scoring yet.' : 'No weekly scoring on file.'}</p>`
  }
  const max = Math.max(...weeks.map((w) => w.points), 1)
  const bars = weeks
    .map((w) => {
      const h = Math.max(w.points > 0 ? 4 : 2, (w.points / max) * (compact ? 44 : 56))
      const tone = w.points >= max * 0.7 ? 'hot' : w.points >= max * 0.4 ? 'mid' : 'cool'
      return `<div class="week-bar week-bar-${tone}" style="height:${h.toFixed(0)}px" title="W${w.week}: ${fmt(w.points)}"><span class="sr-only">Week ${w.week} ${fmt(w.points)}</span></div>`
    })
    .join('')
  const labels = weeks
    .map((w) =>
      w.week === 1 || w.week === weeks.length || w.week % 4 === 0
        ? `<span>${w.week}</span>`
        : `<span class="week-tick-gap"></span>`
    )
    .join('')
  return `<div class="week-chart ${compact ? 'week-chart-compact' : ''}" role="img" aria-label="Weekly fantasy points">${bars}</div><div class="week-axis">${labels}</div>`
}

const NAV_ICONS: Record<string, string> = {
  all: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5 9.7 6h4.6L11.2 8.9l1.6 4.6L8 11.2l-4.8 2.3 1.6-4.6L1.7 6h4.6z"/></svg>',
  season:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2h1.5v1.5H4a.5.5 0 0 0-.5.5V13a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5H10.5V2H12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2.5 0h3v1.5h-3zM5 7h6v1.2H5zm0 2.5h4V10.7H5z"/></svg>',
  draft:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5c.5 0 1 .4 1 1V4h3.5A1.5 1.5 0 0 1 14 5.5V7H2V5.5A1.5 1.5 0 0 1 3.5 4H7V2.5c0-.6.4-1 1-1zM2 8h12v4.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5zm3 2v1.5h6V10z"/></svg>',
  wire: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5A6.5 6.5 0 1 1 1.5 8 6.5 6.5 0 0 1 8 1.5zM7.4 5v2.4H5v1.2h2.4V11h1.2V8.6H11V7.4H8.6V5z"/></svg>',
  bargains:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.2 9.4 5h4.1l-3.3 2.4 1.3 3.9L8 9.1 4.5 11.3l1.3-3.9L2.5 5h4.1z"/></svg>',
  rankings:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 12.5 6.2 7l2.3 2.8L14 4.2V7h1.2V2.2H10.5V3.4h2.6L8.4 11.1 6.1 8.3 2 12.8z"/></svg>',
}

function howWeScore(): string {
  return `
    <section class="card-paper rounded-lg p-5 space-y-3" id="how-we-score">
      <h2 class="text-sm font-bold uppercase tracking-widest text-accent">How we score</h2>
      <dl class="grid gap-4 md:grid-cols-3 text-sm">
        <div class="score-col score-col-mint">
          <dt class="font-bold flex items-center gap-2">${NAV_ICONS.season} PF/week</dt>
          <dd class="text-muted mt-1">Points for per week — your average best-ball score. We add the points you put up each week and divide by weeks played. 2023 is not adjusted for 2QB / 6 teams.</dd>
        </div>
        <div class="score-col score-col-violet">
          <dt class="font-bold flex items-center gap-2">${NAV_ICONS.all} Draft grade</dt>
          <dd class="text-muted mt-1">Each pick’s surplus is vs expected production at that spend <em>and position</em> in this auction (not “pts per dollar,” which makes $1 hits look like genius and Allen look like a bust). Ranked A–F among GMs. <strong class="text-accent font-bold">proj</strong> blends RotoWire + ESPN + FantasyPros weekly stats through UCSB scoring until real weeks land.</dd>
        </div>
        <div class="score-col score-col-gold">
          <dt class="font-bold flex items-center gap-2">${NAV_ICONS.bargains} Are cheap picks bargains if they score?</dt>
          <dd class="text-muted mt-1">No. Surplus = season FPTS minus (what you paid × that position’s pts per dollar). A $1 RB who scores 80 when RBs returned 5 pts/$ is +75. A $1 RB who scores 4 is not a bargain. They have to beat the going rate, not merely put up points.</dd>
        </div>
      </dl>
    </section>`
}

function sortTh(label: string, col: number, type: 'num' | 'str' = 'num', tipText?: string): string {
  const help = tipText ? tipBtn(tipText, label) : ''
  return `<th class="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-muted cursor-pointer select-none" data-col="${col}" data-type="${type}" onclick="lllSort(this)">${escapeHtml(label)}${help} <span class="si opacity-40">↕</span></th>`
}

export function fantasyLayout(
  content: string,
  title = 'UCSB Legacy',
  clerkPublishableKey?: string
): string {
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
        --sl-gold: #f0b429;
        --sl-sky: #5aa9ff;
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
      .theme-sleeper .lll-tip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.05rem;
        height: 1.05rem;
        margin-left: 0.25rem;
        border-radius: 999px;
        border: 1px solid var(--sl-border);
        background: var(--sl-elevated);
        color: var(--sl-muted);
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0;
        text-transform: none;
        cursor: help;
        vertical-align: middle;
      }
      .theme-sleeper .lll-tip:hover,
      .theme-sleeper .lll-tip[aria-expanded="true"] {
        color: var(--sl-accent);
        border-color: var(--sl-accent);
      }
      .lll-tip-pop {
        position: fixed;
        z-index: 80;
        max-width: 20rem;
        padding: 0.7rem 0.85rem;
        background: #1e2530;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        color: #f4f7fb;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 13px;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
        line-height: 1.45;
        box-shadow: 0 12px 32px rgba(0,0,0,0.45);
      }
      .theme-sleeper .brand-mark {
        width: 2rem;
        height: 2rem;
        border-radius: 0.55rem;
        background: linear-gradient(135deg, #3fe1a8 0%, #7c6bff 100%);
        box-shadow: 0 0 18px rgba(63,225,168,0.28);
        flex-shrink: 0;
      }
      .theme-sleeper .header-rule {
        height: 2px;
        background: linear-gradient(90deg, #3fe1a8 0%, #7c6bff 42%, transparent 100%);
      }
      .theme-sleeper nav a { display: inline-flex; align-items: center; gap: 0.4rem; }
      .theme-sleeper nav svg { width: 12px; height: 12px; opacity: 0.7; }
      .theme-sleeper nav .tab-active svg { opacity: 1; }
      .theme-sleeper .score-col { padding-left: 0.85rem; border-left: 3px solid var(--sl-border); }
      .theme-sleeper .score-col svg { width: 13px; height: 13px; }
      .theme-sleeper .score-col-mint { border-left-color: var(--sl-accent); }
      .theme-sleeper .score-col-violet { border-left-color: var(--sl-accent-2); }
      .theme-sleeper .score-col-gold { border-left-color: var(--sl-gold); }
      .theme-sleeper .pos-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.1rem;
        padding: 0.12rem 0.4rem;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.04em;
        line-height: 1.2;
      }
      .theme-sleeper .pos-QB { background: rgba(124,107,255,0.22); color: #c4bbff; }
      .theme-sleeper .pos-RB { background: rgba(63,225,168,0.18); color: #3fe1a8; }
      .theme-sleeper .pos-WR { background: rgba(90,169,255,0.2); color: #8ec4ff; }
      .theme-sleeper .pos-TE { background: rgba(240,180,41,0.2); color: #f0b429; }
      .theme-sleeper .pos-DEF, .theme-sleeper .pos-K { background: rgba(139,149,168,0.22); color: #c5ccd8; }
      .theme-sleeper .grade-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        padding: 0.1rem 0.4rem;
        border-radius: 0.35rem;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }
      .theme-sleeper .grade-A { background: #3fe1a8; color: #04140e; }
      .theme-sleeper .grade-B { background: rgba(63,225,168,0.28); color: #3fe1a8; }
      .theme-sleeper .grade-C { background: rgba(255,255,255,0.08); color: #c5ccd8; }
      .theme-sleeper .grade-D { background: rgba(240,180,41,0.22); color: #f0b429; }
      .theme-sleeper .grade-F { background: rgba(255,122,138,0.22); color: #ff7a8a; }
      .theme-sleeper .grade-none { background: rgba(255,255,255,0.06); color: var(--sl-muted); }
      .theme-sleeper .player-thumb {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        background: var(--sl-elevated);
        flex-shrink: 0;
      }
      .theme-sleeper .player-thumb-lg {
        border-radius: 12px;
      }
      .theme-sleeper a.lll-player {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-weight: 600;
      }
      .theme-sleeper .rank-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        background: rgba(255,255,255,0.06);
        color: var(--sl-muted);
      }
      .theme-sleeper .rank-1 { background: rgba(240,180,41,0.28); color: #f0b429; }
      .theme-sleeper .rank-2 { background: rgba(196,210,230,0.22); color: #d5deea; }
      .theme-sleeper .rank-3 { background: rgba(205,127,50,0.28); color: #e09a5a; }
      .theme-sleeper .stat-chip {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.45rem 0.55rem;
        border-radius: 0.5rem;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--sl-border);
        min-width: 4.2rem;
      }
      .theme-sleeper .stat-chip dt { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sl-muted); }
      .theme-sleeper .stat-chip dd { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .lll-player-pop {
        position: fixed;
        z-index: 90;
        width: min(22.5rem, calc(100vw - 16px));
        pointer-events: auto;
      }
      .lll-player-card {
        background: #1e2530;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        box-shadow: 0 18px 48px rgba(0,0,0,0.5);
        color: #f4f7fb;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        overflow: hidden;
      }
      .lll-player-card--loading { padding: 1rem; color: #8b95a8; font-size: 13px; }
      .lll-player-card .card-hero {
        display: flex;
        gap: 0.75rem;
        padding: 0.9rem 0.95rem 0.7rem;
        background: linear-gradient(135deg, rgba(63,225,168,0.12), rgba(124,107,255,0.16));
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .lll-player-card .card-hero img { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; background: #171c24; }
      .week-chart {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 56px;
        padding: 0 0.15rem;
      }
      .week-chart-compact { height: 44px; gap: 2px; }
      .week-bar {
        flex: 1;
        min-width: 4px;
        border-radius: 3px 3px 1px 1px;
      }
      .week-bar-hot { background: #3fe1a8; }
      .week-bar-mid { background: #7c6bff; }
      .week-bar-cool { background: rgba(139,149,168,0.55); }
      .week-axis {
        display: flex;
        gap: 3px;
        margin-top: 0.2rem;
        font-size: 8px;
        color: #8b95a8;
        font-variant-numeric: tabular-nums;
      }
      .week-axis span { flex: 1; text-align: center; }
      .week-tick-gap { visibility: hidden; }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0,0,0,0);
        border: 0;
      }
    </style>
    <script>
      (function () {
        if (window.lllTip) return;
        var openBtn = null;
        window.lllTip = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var btn = ev.currentTarget;
          var old = document.getElementById('lll-tip-pop');
          if (old) old.remove();
          document.querySelectorAll('.lll-tip[aria-expanded="true"]').forEach(function (b) {
            b.setAttribute('aria-expanded', 'false');
          });
          if (openBtn === btn) {
            openBtn = null;
            return;
          }
          var pop = document.createElement('div');
          pop.id = 'lll-tip-pop';
          pop.className = 'lll-tip-pop';
          pop.setAttribute('role', 'tooltip');
          pop.textContent = btn.getAttribute('data-tip') || '';
          document.body.appendChild(pop);
          btn.setAttribute('aria-expanded', 'true');
          openBtn = btn;
          var r = btn.getBoundingClientRect();
          var left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 12);
          left = Math.max(8, left);
          var top = r.bottom + 8;
          if (top + pop.offsetHeight > window.innerHeight - 8) {
            top = r.top - pop.offsetHeight - 8;
          }
          pop.style.left = left + 'px';
          pop.style.top = Math.max(8, top) + 'px';
        };
        document.addEventListener('click', function (e) {
          if (e.target.closest('.lll-tip') || e.target.closest('#lll-tip-pop')) return;
          var t = document.getElementById('lll-tip-pop');
          if (t) t.remove();
          document.querySelectorAll('.lll-tip[aria-expanded="true"]').forEach(function (b) {
            b.setAttribute('aria-expanded', 'false');
          });
          openBtn = null;
        });
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
        if (window.lllPlayerInit) return;
        window.lllPlayerInit = true;
        var cache = {};
        var showTimer = null;
        var hideTimer = null;
        var pop = null;
        var currentId = null;
        var currentAnchor = null;
        function canHover() {
          return !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        }
        function place(anchor) {
          if (!pop || !anchor) return;
          var r = anchor.getBoundingClientRect();
          var left = Math.min(Math.max(8, r.left), window.innerWidth - pop.offsetWidth - 12);
          var top = r.bottom + 8;
          if (top + pop.offsetHeight > window.innerHeight - 8) {
            top = r.top - pop.offsetHeight - 8;
          }
          pop.style.left = left + 'px';
          pop.style.top = Math.max(8, top) + 'px';
        }
        function hidePop() {
          if (pop) { pop.remove(); pop = null; }
          currentId = null;
          currentAnchor = null;
        }
        function scheduleHide() {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(hidePop, 160);
        }
        function cancelHide() { clearTimeout(hideTimer); }
        function ensurePop() {
          if (pop) return pop;
          pop = document.createElement('div');
          pop.className = 'lll-player-pop';
          pop.id = 'lll-player-pop';
          pop.setAttribute('role', 'tooltip');
          pop.addEventListener('mouseenter', cancelHide);
          pop.addEventListener('mouseleave', scheduleHide);
          document.body.appendChild(pop);
          return pop;
        }
        function showCard(anchor) {
          var id = anchor.getAttribute('data-player-id');
          if (!id) return;
          var season = anchor.getAttribute('data-season') || '';
          var cacheKey = id + ':' + season;
          currentAnchor = anchor;
          currentId = cacheKey;
          ensurePop();
          if (cache[cacheKey]) {
            pop.innerHTML = cache[cacheKey];
            place(anchor);
            return;
          }
          pop.innerHTML = '<div class="lll-player-card lll-player-card--loading">Loading card…</div>';
          place(anchor);
          var headers = {};
          if (window.__clerkToken) headers['Authorization'] = 'Bearer ' + window.__clerkToken;
          var url = '/fantasy/player/' + encodeURIComponent(id) + '/card' + (season ? '?season=' + encodeURIComponent(season) : '');
          fetch(url, {headers: headers, credentials: 'same-origin'})
            .then(function (res) { return res.text().then(function (html) { return {ok: res.ok, html: html}; }); })
            .then(function (out) {
              var html = (out.ok && out.html.indexOf('lll-player-card') !== -1)
                ? out.html
                : '<div class="lll-player-card lll-player-card--loading">Couldn’t load card.</div>';
              cache[cacheKey] = html;
              if (currentId === cacheKey && pop) {
                pop.innerHTML = html;
                place(anchor);
              }
            })
            .catch(function () {
              if (currentId === cacheKey && pop) {
                pop.innerHTML = '<div class="lll-player-card lll-player-card--loading">Couldn’t load card.</div>';
              }
            });
        }
        document.addEventListener('mouseover', function (e) {
          if (!canHover()) return;
          var a = e.target.closest && e.target.closest('a.lll-player');
          if (!a) return;
          clearTimeout(showTimer);
          cancelHide();
          showTimer = setTimeout(function () { showCard(a); }, 220);
        });
        document.addEventListener('mouseout', function (e) {
          var a = e.target.closest && e.target.closest('a.lll-player');
          if (!a) return;
          var rel = e.relatedTarget;
          if (rel && (a.contains(rel) || (pop && pop.contains(rel)))) return;
          clearTimeout(showTimer);
          scheduleHide();
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') hidePop();
        });
        window.addEventListener('scroll', function () {
          if (pop && currentAnchor) place(currentAnchor);
        }, true);
      })();
    </script>
  `
  return baseLayout(
    `<div class="theme-sleeper min-h-screen">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      ${styles}
      ${content}
    </div>`,
    title,
    clerkPublishableKey
  )
}

function nav(active: string, seasons: SeasonSummary[], year?: number): string {
  const latest = seasons.at(-1)?.season
  const y = year ?? latest
  const tab = (href: string, key: string, label: string) =>
    `<a href="${href}" class="pb-2 text-[11px] font-bold uppercase tracking-[0.2em] ${active === key ? 'tab-active' : 'text-muted hover:text-accent'}">${NAV_ICONS[key] ?? ''}${label}</a>`
  const yearLinks = seasons
    .map(
      (s) =>
        `<a href="/fantasy/season/${s.season}" class="px-2 py-1 text-[10px] font-bold rounded ${year !== undefined && s.season === year ? 'text-accent bg-black/5' : 'text-muted hover:text-black'}">${s.season}</a>`
    )
    .join('')
  return `
    <header class="border-b border-black/10 bg-[#0e1116]/90 backdrop-blur sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-end justify-between gap-4">
        <div class="flex items-start gap-3">
          <span class="brand-mark mt-3" aria-hidden="true"></span>
          <div>
            <a href="/apps" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← Apps</a>
            <h1 class="text-3xl font-extrabold tracking-tight mt-1">UCSB Legacy</h1>
            <p class="text-sm text-muted">Auction best-ball · $200 / $100 FAAB · all-play, no playoffs</p>
          </div>
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
      <div class="header-rule"></div>
    </header>`
}

function emptyIngest(): string {
  return `
    <div class="card-paper rounded-lg p-8 text-center">
      <h2 class="text-2xl font-bold tracking-tighter mb-2">No Sleeper data yet</h2>
      <p class="text-muted">Run <code class="text-sm bg-black/5 px-1">bun run sleeper:ingest</code> then refresh.</p>
    </div>`
}

export function fantasyDashboard(
  gms: GmAllTimeRow[],
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const cards = gms
    .map((g, i) => {
      const accent = i < 3 ? 'border-accent' : 'border-black/20'
      return `
      <a href="/fantasy/manager/${encodeURIComponent(g.slug)}" class="card-paper p-5 rounded-lg border-t-4 ${accent} hover:shadow-md transition-shadow block">
        <div class="flex justify-between items-start gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="rank-badge rank-${i + 1 <= 3 ? i + 1 : 'x'}">${i + 1}</span>
              <div class="text-[8px] font-bold text-muted uppercase tracking-[0.2em]">All-play</div>
            </div>
            <h3 class="text-xl font-bold tracking-tighter mt-1">${escapeHtml(g.displayName)}</h3>
            <div class="text-[11px] text-muted">${g.seasons} season${g.seasons === 1 ? '' : 's'} · avg finish ${fmt(g.avgFinish)}</div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-extrabold text-accent tabular-nums">${pct(g.winPct)}</div>
            <div class="text-[11px] text-muted">${record(g.wins, g.losses, g.ties)}</div>
          </div>
        </div>
        <div class="mt-4 flex items-end justify-between gap-3">
          <div class="grid grid-cols-3 gap-3 text-[10px] uppercase tracking-widest text-muted">
            <div>PF/week <span class="block text-black font-bold normal-case tracking-normal text-sm">${fmt(g.pfPerWeek)}</span></div>
            <div>Grade <span class="block mt-0.5">${gradePill(g.draftGrade, g.draftProjected)}</span></div>
            <div>Wire <span class="block text-black font-bold normal-case tracking-normal text-sm">${fmt(g.wireFpts, 0)}</span></div>
          </div>
          ${sparkSvg(g.sparkline)}
        </div>
      </a>`
    })
    .join('')

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
        <td class="px-3 py-2" data-val="${g.draftSurplus}">${gradePill(g.draftGrade, g.draftProjected)} <span class="text-muted">${fmt(g.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2" data-val="${g.lateFpts}">${fmt(g.lateFpts, 0)}</td>
        <td class="px-3 py-2" data-val="${g.wireFpts}">${fmt(g.wireFpts, 0)}</td>
      </tr>`
    })
    .join('')

  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-8">
      ${
        gms.length === 0
          ? emptyIngest()
          : `
      <p class="text-sm text-muted max-w-3xl">Each week every GM’s best-ball score plays every other GM. Finish is all-play wins, then points — no playoffs. Tap a <span class="text-accent whitespace-nowrap">?</span> on a column header for the short version.</p>
      ${howWeScore()}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${cards}</div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]">
            <tr>
              ${sortTh('#', 0)}
              ${sortTh('GM', 1, 'str')}
              ${sortTh('Yrs', 2)}
              ${sortTh('Win%', 3, 'num', TIPS.winPct)}
              ${sortTh('W-L', 4, 'num', TIPS.wl)}
              ${sortTh('PF', 5, 'num', TIPS.pf)}
              ${sortTh('PF/week', 6, 'num', TIPS.pfWeek)}
              ${sortTh('Avg fin.', 7)}
              ${sortTh('Grade', 8, 'num', TIPS.draftGrade)}
              ${sortTh('Late', 9, 'num', TIPS.late)}
              ${sortTh('Wire', 10, 'num', TIPS.wire)}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
      }
    </main>`
  return fantasyLayout(body, 'UCSB Legacy — All-time', clerkKey)
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) {
    return `${n}th`
  }
  if (n % 10 === 1) {
    return `${n}st`
  }
  if (n % 10 === 2) {
    return `${n}nd`
  }
  if (n % 10 === 3) {
    return `${n}rd`
  }
  return `${n}th`
}

function heatBg(rank: number, n: number): string {
  const t = n <= 1 ? 0 : (rank - 1) / (n - 1)
  const hue = 152 - t * 152
  return `background:hsl(${hue.toFixed(0)} 62% ${32 + t * 6}%);color:#f4f7fb`
}

function heatCell(rank: number, pts: number, n: number): string {
  const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : ''
  return `<td class="px-2 py-2 text-center font-bold tabular-nums rounded-sm" style="${heatBg(rank, n)}" title="${fmt(pts, 0)} FPTS" data-val="${rank}">${medal}${ordinal(rank)}<div class="text-[10px] font-semibold opacity-80">${fmt(pts, 0)}</div></td>`
}

function fantasyHeatmap(teams: HeatmapTeam[]): string {
  if (teams.length === 0) {
    return ''
  }
  const n = teams.length
  const head = ['OVR', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF']
  const keys = ['ovr', 'qb', 'rb', 'wr', 'te', 'flex', 'def'] as const
  const body = teams
    .map((t) => {
      const cells = keys.map((k) => heatCell(t[k].rank, t[k].pts, n)).join('')
      return `<tr class="border-t border-black/5">
        <td class="px-3 py-2 font-bold whitespace-nowrap"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(t.slug)}">${escapeHtml(t.displayName)}</a></td>
        ${cells}
      </tr>`
    })
    .join('')
  const projected = teams.some((t) => t.projected)
  return `
    <div>
      <h3 class="text-xl font-bold tracking-tighter mb-1">Positional heat map</h3>
      <p class="text-xs text-muted mb-3">${projected ? 'Projected starter-slot FPTS (blended weekly stats × UCSB scoring). ' : ''}OVR is the starting lineup — QB+RB+WR+TE+FLEX+DEF, same points as the other columns. Bench does not count. FLEX is the leftover RB/WR/TE after 2 RB / 3 WR / 1 TE. Green = 1st in the room, red = last. Same idea as last year’s FFR board.</p>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead><tr>
            <th class="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-muted">GM</th>
            ${head.map((h) => `<th class="px-2 py-2 text-center text-[9px] font-bold uppercase tracking-widest text-muted">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`
}

export function fantasySeasonPage(
  summary: SeasonSummary | null,
  standings: GmSeasonRow[],
  seasons: SeasonSummary[],
  heatmap: HeatmapTeam[] = [],
  clerkKey?: string
): string {
  const year = summary?.season
  const preDraft = summary?.draftStatus === 'pre_draft' || summary?.status === 'pre_draft'
  const rows = standings
    .map(
      (
        r
      ) => `<tr class="border-t border-black/5 hover:bg-black/[0.03] cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(r.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${r.finish}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}
          <div class="text-[11px] text-muted font-normal">${escapeHtml(r.teamName || '')}</div></td>
        <td class="px-3 py-2" data-val="${r.winPct}">${pct(r.winPct)}</td>
        <td class="px-3 py-2" data-val="${r.wins}">${record(r.wins, r.losses, r.ties)}</td>
        <td class="px-3 py-2" data-val="${r.fpts}">${fmt(r.fpts)}</td>
        <td class="px-3 py-2" data-val="${r.pfPerWeek}">${fmt(r.pfPerWeek)}</td>
        <td class="px-3 py-2" data-val="${r.draftSurplus}">${gradePill(r.draftGrade, r.draftProjected)} <span class="text-muted">${fmt(r.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2" data-val="${r.wireFpts}">${fmt(r.wireFpts, 0)}</td>
      </tr>`
    )
    .join('')
  const body = `
    ${nav('season', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        summary
          ? `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-3xl font-bold tracking-tighter">${year} standings</h2>
          <p class="text-sm text-muted">${summary.teamCount} teams · ${escapeHtml(summary.status)}${preDraft ? ' — auction has not started on Sleeper yet' : ''}${standings.some((s) => s.projected) ? ' · W-L / PF / Grade are <span class="text-accent">projected</span> (RotoWire+ESPN+FantasyPros weekly × UCSB scoring; surplus vs positional spend, not pts/$) until weeks are played' : ''}</p>
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
            ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Win%', 2, 'num', TIPS.winPct)}${sortTh('W-L', 3, 'num', TIPS.wl)}
            ${sortTh('PF', 4, 'num', TIPS.pf)}${sortTh('PF/week', 5, 'num', TIPS.pfWeek)}
            ${sortTh('Grade', 6, 'num', TIPS.draftGrade)}${sortTh('Wire', 7, 'num', TIPS.wire)}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-xs text-muted">W-L is all-play: each week your best-ball score is a win or loss against every other team. No playoffs. Tap a <span class="text-accent whitespace-nowrap">?</span> on PF/week or Grade for how those are calculated.</p>
      ${fantasyHeatmap(heatmap)}`
      }`
          : emptyIngest()
      }
    </main>`
  return fantasyLayout(body, `UCSB Legacy — ${year ?? 'season'}`, clerkKey)
}

function pickRowsHtml(
  picks: (DraftPickRow & { season?: number })[],
  withSeason = false,
  seasonFallback?: number
): string {
  return picks
    .map((p) => {
      const seasonCell = withSeason
        ? `<td class="px-3 py-2" data-val="${p.season ?? 0}">${p.season ?? ''}</td>`
        : ''
      return `<tr class="border-t border-black/5">
        ${seasonCell}
        <td class="px-3 py-2" data-val="${p.pickNo}">${p.pickNo}${p.isKeeper ? ' <span class="text-accent text-[10px]">K</span>' : ''}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(p.displayName)}"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(p.slug)}">${escapeHtml(p.displayName)}</a></td>
        <td class="px-3 py-2" data-val="${escapeHtml(p.playerName)}">${playerLink(p.playerId, p.playerName, p.position, p.season ?? seasonFallback)}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(p.position)}">${posChip(p.position)}</td>
        <td class="px-3 py-2" data-val="${p.amount}">$${p.amount}</td>
        <td class="px-3 py-2" data-val="${p.fpts}">${fmt(p.fpts)}</td>
        <td class="px-3 py-2" data-val="${p.value}">${fmt(p.value)}</td>
        <td class="px-3 py-2 ${p.surplus >= 0 ? 'text-emerald-800' : 'text-rose-400'}" data-val="${p.surplus}">${p.surplus >= 0 ? '+' : ''}${fmt(p.surplus)}</td>
        <td class="px-3 py-2" data-val="${p.pffGrade ?? -1}">${p.pffGrade == null ? '—' : fmt(p.pffGrade)}</td>
      </tr>`
    })
    .join('')
}

export function fantasyDraftPage(
  summary: SeasonSummary | null,
  picks: DraftPickRow[],
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const year = summary?.season
  const body = `
    ${nav('draft', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        summary
          ? picks.length === 0
            ? `<h2 class="text-3xl font-bold tracking-tighter">${year} auction</h2>
               <div class="card-paper rounded-lg p-6 text-muted italic">Draft opens on Sleeper — this page fills after ingest.</div>`
            : `<h2 class="text-3xl font-bold tracking-tighter">${year} auction</h2>
               ${howWeScore()}
               <p class="text-sm text-muted">Draft credit = that player’s league FPTS all season (even if later dropped). Surplus is vs expected FPTS at that $ and position in this room (log spend curve) — a $1 average guy is not automatically a better pick than Allen. Before weeks are scored, FPTS are blended weekly projections. PFF is overlay, not the sort. Hover a player for week-over-week scoring.</p>
               <div class="card-paper rounded-lg overflow-x-auto">
                 <table class="w-min min-w-full text-sm">
                   <thead class="bg-black/[0.03]"><tr>
                     ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Player', 2, 'str')}${sortTh('Pos', 3, 'str')}
                     ${sortTh('$', 4)}${sortTh('FPTS', 5)}${sortTh('Pts/$', 6, 'num', TIPS.ptsPerDollar)}${sortTh('Surplus', 7, 'num', TIPS.surplus)}${sortTh('PFF', 8)}
                   </tr></thead>
                   <tbody>${pickRowsHtml(picks, false, year)}</tbody>
                 </table>
               </div>`
          : emptyIngest()
      }
    </main>`
  return fantasyLayout(body, `UCSB Legacy — ${year ?? ''} auction`, clerkKey)
}

export function fantasyWirePage(
  summary: SeasonSummary | null,
  rows: WireRow[],
  missed: WireRow[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string
): string {
  const year = summary?.season
  const gmRollup = new Map<
    string,
    { slug: string; displayName: string; fpts: number; faab: number; adds: number }
  >()
  for (const r of rows) {
    const cur = gmRollup.get(r.slug) ?? {
      slug: r.slug,
      displayName: r.displayName,
      fpts: 0,
      faab: 0,
      adds: 0,
    }
    cur.fpts += r.fpts
    cur.faab += r.waiverBid
    cur.adds += 1
    gmRollup.set(r.slug, cur)
  }
  const gmRows = [...gmRollup.values()]
    .sort((a, b) => b.fpts - a.fpts)
    .map(
      (
        g,
        i
      ) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(g.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${i + 1}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}">${escapeHtml(g.displayName)}</td>
        <td class="px-3 py-2" data-val="${g.adds}">${g.adds}</td>
        <td class="px-3 py-2" data-val="${g.faab}">$${g.faab}</td>
        <td class="px-3 py-2" data-val="${g.fpts}">${fmt(g.fpts)}</td>
        <td class="px-3 py-2" data-val="${g.fpts / Math.max(g.faab, 1)}">${fmt(g.fpts / Math.max(g.faab, 1))}</td>
      </tr>`
    )
    .join('')
  const log = rows
    .map(
      (r) => `<tr class="border-t border-black/5">
        <td class="px-3 py-2" data-val="${r.addWeek}">W${r.addWeek}${r.dropWeek === r.addWeek ? '' : `–${r.dropWeek}`}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.playerName)}">${playerLink(r.playerId, r.playerName, null, year)}</td>
        <td class="px-3 py-2" data-val="${escapeHtml(r.type)}">${escapeHtml(r.type)}</td>
        <td class="px-3 py-2" data-val="${r.waiverBid}">$${r.waiverBid}</td>
        <td class="px-3 py-2" data-val="${r.fpts}">${fmt(r.fpts)}</td>
      </tr>`
    )
    .join('')
  const missedRows = missed
    .map(
      (r) => `<tr class="border-t border-black/5 text-muted">
        <td class="px-3 py-2">W${r.addWeek}</td>
        <td class="px-3 py-2">${escapeHtml(r.displayName)}</td>
        <td class="px-3 py-2">${playerLink(r.playerId, r.playerName, null, year)}</td>
        <td class="px-3 py-2">$${r.waiverBid}</td>
      </tr>`
    )
    .join('')
  const body = `
    ${nav('wire', seasons, year)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        summary
          ? `<h2 class="text-3xl font-bold tracking-tighter">${year} wire</h2>
             <p class="text-sm text-muted">Complete waivers and free-agent adds. Wire FPTS = points on that roster from add week through drop (or season end). Trades are not scored as pickup skill.</p>
             <div class="card-paper rounded-lg overflow-x-auto">
               <table class="w-min min-w-full text-sm">
                 <thead class="bg-black/[0.03]"><tr>
                   ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Adds', 2)}${sortTh('FAAB', 3)}
                   ${sortTh('Wire FPTS', 4, 'num', TIPS.wire)}${sortTh('Pts/$', 5, 'num', TIPS.ptsPerDollar)}
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
          : emptyIngest()
      }
    </main>`
  return fantasyLayout(body, `UCSB Legacy — ${year ?? ''} wire`, clerkKey)
}

export function fantasyBargainsPage(
  byGm: { slug: string; displayName: string; lateFpts: number; latePicks: number; hits: number }[],
  rows: (DraftPickRow & { season: number })[],
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const gmRows = byGm
    .map(
      (
        g,
        i
      ) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(g.slug)}'">
        <td class="px-3 py-2 tbl-rank font-bold">${i + 1}</td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}">${escapeHtml(g.displayName)}</td>
        <td class="px-3 py-2" data-val="${g.latePicks}">${g.latePicks}</td>
        <td class="px-3 py-2" data-val="${g.hits}">${g.hits}</td>
        <td class="px-3 py-2" data-val="${g.lateFpts}">${fmt(g.lateFpts)}</td>
      </tr>`
    )
    .join('')
  const body = `
    ${nav('bargains', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h2 class="text-3xl font-bold tracking-tighter">Late-round bargains</h2>
      <p class="text-sm text-muted">A pick is late if it is in the last three auction rounds <em>or</em> cost $2 or less. Scoring a few points does not make it a bargain — Hits are late picks that beat a typical $1 player.</p>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('#', 0)}${sortTh('GM', 1, 'str')}${sortTh('Picks', 2)}${sortTh('Hits', 3, 'num', TIPS.hits)}${sortTh('Late FPTS', 4, 'num', TIPS.late)}
          </tr></thead>
          <tbody>${gmRows || '<tr><td class="px-3 py-4 text-muted" colspan="5">No late picks ingested.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7, 'num', TIPS.ptsPerDollar)}${sortTh('vs $1', 8, 'num', TIPS.hits)}${sortTh('PFF', 9)}
          </tr></thead>
          <tbody>${pickRowsHtml(rows, true)}</tbody>
        </table>
      </div>
    </main>`
  return fantasyLayout(body, 'UCSB Legacy — Bargains', clerkKey)
}

export function fantasyRankingsPage(
  seasons: number[],
  gms: GmAllTimeRow[],
  seasonMeta: SeasonSummary[],
  clerkKey?: string
): string {
  const head = seasons.map((y, i) => sortTh(String(y), i + 2)).join('')
  const rows = gms
    .map((g) => {
      const cells = seasons
        .map((_y, i) => {
          const fin = g.sparkline[i] ?? 0
          const bg =
            fin === 0
              ? ''
              : fin === 1
                ? 'bg-emerald-200'
                : fin <= 3
                  ? 'bg-emerald-50'
                  : fin >= 10
                    ? 'bg-red-50'
                    : 'bg-black/5'
          return `<td class="px-3 py-2 text-center ${bg}" data-val="${fin === 0 ? 99 : fin}">${fin === 0 ? '—' : fin}</td>`
        })
        .join('')
      return `<tr class="border-t border-black/5">
        <td class="px-3 py-2 tbl-rank font-bold"></td>
        <td class="px-3 py-2 font-bold" data-val="${escapeHtml(g.displayName)}"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(g.slug)}">${escapeHtml(g.displayName)}</a></td>
        ${cells}
      </tr>`
    })
    .join('')
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
    </main>`
  return fantasyLayout(body, 'UCSB Legacy — Rankings', clerkKey)
}

export function fantasyManagerPage(
  gm: GmAllTimeRow,
  draftPicks: (DraftPickRow & { season: number })[],
  wire: (WireRow & { season: number })[],
  missed: (WireRow & { season: number })[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string
): string {
  const yearRows = gm.years
    .map(
      (
        y
      ) => `<tr class="border-t border-black/5 cursor-pointer" onclick="location.href='/fantasy/season/${y.season}'">
        <td class="px-3 py-2 font-bold">${y.season}</td>
        <td class="px-3 py-2">${y.finish}</td>
        <td class="px-3 py-2">${record(y.wins, y.losses, y.ties)}</td>
        <td class="px-3 py-2">${fmt(y.fpts)}</td>
        <td class="px-3 py-2">${gradePill(y.draftGrade, y.draftProjected)} <span class="text-muted">${fmt(y.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2">${fmt(y.wireFpts, 0)}</td>
        <td class="px-3 py-2 text-muted">${escapeHtml(y.teamName || '')}</td>
      </tr>`
    )
    .join('')
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
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('PF/week', TIPS.pfWeek)}</div><div class="text-2xl font-bold">${fmt(gm.pfPerWeek)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">Avg finish</div><div class="text-2xl font-bold">${fmt(gm.avgFinish)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('Grade', TIPS.draftGrade)}</div><div class="text-2xl font-bold mt-1">${gradePill(gm.draftGrade, gm.draftProjected)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('Wire FPTS', TIPS.wire)}</div><div class="text-2xl font-bold">${fmt(gm.wireFpts, 0)}</div></div>
      </div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Year</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">Fin</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">${withTip('W-L', TIPS.wl)}</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">${withTip('PF', TIPS.pf)}</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">${withTip('Grade', TIPS.draftGrade)}</th>
            <th class="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted">${withTip('Wire', TIPS.wire)}</th>
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
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7, 'num', TIPS.ptsPerDollar)}${sortTh('Surplus', 8, 'num', TIPS.surplus)}${sortTh('PFF', 9)}
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
                <td class="px-3 py-2">${playerLink(r.playerId, r.playerName, null, r.season)}</td>
                <td class="px-3 py-2">${escapeHtml(r.type)}</td>
                <td class="px-3 py-2">$${r.waiverBid}</td>
                <td class="px-3 py-2">${fmt(r.fpts)}</td>
              </tr>`
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
                       `<tr class="border-t border-black/5 text-muted"><td class="px-3 py-2">${r.season} W${r.addWeek}</td><td class="px-3 py-2">${playerLink(r.playerId, r.playerName, null, r.season)}</td><td class="px-3 py-2">$${r.waiverBid}</td></tr>`
                   )
                   .join('')}</tbody>
               </table>
             </div>`
          : ''
      }
    </main>`
  return fantasyLayout(body, `${gm.displayName} — UCSB Legacy`, clerkKey)
}

export function fantasyManagerNotFound(slug: string, clerkKey?: string): string {
  const body = `
    <main class="max-w-3xl mx-auto px-4 py-16">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted">← All-time</a>
      <h2 class="text-3xl font-bold tracking-tighter mt-4">No GM named “${escapeHtml(slug)}”</h2>
    </main>`
  return fantasyLayout(body, 'GM not found', clerkKey)
}

export function fantasyPlayerCard(data: PlayerCardData): string {
  const meta = [
    data.owner ? escapeHtml(data.owner) : null,
    data.amount == null ? null : `$${data.amount}`,
    data.surplus == null ? null : `${data.surplus >= 0 ? '+' : ''}${fmt(data.surplus)} surplus`,
  ]
    .filter(Boolean)
    .join(' · ')
  const stats = [
    { label: 'FPTS', value: fmt(data.fpts) },
    { label: 'Avg', value: fmt(data.avg) },
    { label: 'High', value: fmt(data.high) },
    ...data.stats.map((s) => ({ label: s.label, value: fmt(s.value, s.digits) })),
  ]
  const chips = stats
    .map((s) => `<div class="stat-chip"><dt>${escapeHtml(s.label)}</dt><dd>${s.value}</dd></div>`)
    .join('')
  return `
    <article class="lll-player-card">
      <div class="card-hero">
        ${playerPhoto(data.playerId, data.position, 48)}
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            ${posChip(data.position)}
            <span class="text-[10px] font-bold uppercase tracking-widest text-muted">${escapeHtml(data.team || 'FA')} · ${data.season}${data.projected ? ' proj' : ''}</span>
          </div>
          <h3 class="text-lg font-extrabold tracking-tight truncate">${escapeHtml(data.name)}</h3>
          <p class="text-[11px] text-muted truncate">${meta || 'No auction row'}</p>
        </div>
      </div>
      <div class="px-3 pt-3 pb-2 flex flex-wrap gap-2">${chips}</div>
      <div class="px-3 pb-3">
        <div class="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">Week-over-week ${data.projected ? 'proj ' : ''}pts</div>
        ${weekChart(data.weeks, true)}
      </div>
    </article>`
}

export function fantasyPlayerPage(
  data: {
    playerId: string
    name: string
    position: string | null
    team: string | null
    drafts: (DraftPickRow & { season: number })[]
    weeks: {
      season: number
      week: number
      points: number
      slug: string
      displayName: string
      projected?: boolean
    }[]
    pff: { season: number; category: string; grade: number }[]
  },
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const bySeason = new Map<number, { week: number; points: number }[]>()
  for (const w of data.weeks) {
    const list = bySeason.get(w.season) ?? []
    const existing = list.find((x) => x.week === w.week)
    if (existing) {
      existing.points += w.points
    } else {
      list.push({ week: w.week, points: w.points })
    }
    bySeason.set(w.season, list)
  }
  const seasonCharts = [...bySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, weeks]) => {
      weeks.sort((a, b) => a.week - b.week)
      const max = weeks.length > 0 ? Math.max(...weeks.map((w) => w.week)) : 0
      const padded: { week: number; points: number }[] = []
      const map = new Map(weeks.map((w) => [w.week, w.points]))
      for (let i = 1; i <= max; i++) {
        padded.push({ week: i, points: map.get(i) ?? 0 })
      }
      const projected = data.weeks.some((w) => w.season === year && w.projected)
      return `<div class="card-paper rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-bold">${year}${projMark(projected)}</h4>
          <span class="text-xs text-muted tabular-nums">${fmt(padded.reduce((s, w) => s + w.points, 0))} FPTS</span>
        </div>
        ${weekChart(padded)}
      </div>`
    })
    .join('')
  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← All-time</a>
      <div class="flex flex-wrap items-center gap-4">
        ${playerPhoto(data.playerId, data.position, 64)}
        <div>
          <div class="flex items-center gap-2">${posChip(data.position)}<span class="text-sm text-muted">${escapeHtml(data.team || 'FA')}</span></div>
          <h2 class="text-4xl font-bold tracking-tighter">${escapeHtml(data.name)}</h2>
        </div>
      </div>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7, 'num', TIPS.ptsPerDollar)}${sortTh('Surplus', 8, 'num', TIPS.surplus)}${sortTh('PFF', 9)}
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
                      `<tr class="border-t border-black/5"><td class="px-3 py-2">${r.season}</td><td class="px-3 py-2">${escapeHtml(r.category)}</td><td class="px-3 py-2 font-bold">${fmt(r.grade)}</td></tr>`
                  )
                  .join('')
          }</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">Weekly fantasy points</h3>
      <div class="grid gap-3 md:grid-cols-2">${seasonCharts || '<p class="text-sm text-muted">No weekly scoring on file.</p>'}</div>
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
                `<tr class="border-t border-black/5"><td class="px-3 py-2">${w.season}${projMark(Boolean(w.projected))}</td><td class="px-3 py-2">${w.week}</td><td class="px-3 py-2">${escapeHtml(w.displayName)}</td><td class="px-3 py-2">${fmt(w.points)}</td></tr>`
            )
            .join('')}</tbody>
        </table>
      </div>
    </main>`
  return fantasyLayout(body, `${data.name} — UCSB Legacy`, clerkKey)
}

export function fantasyPlayerNotFound(id: string, clerkKey?: string): string {
  const body = `
    <main class="max-w-3xl mx-auto px-4 py-16">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted">← All-time</a>
      <h2 class="text-3xl font-bold tracking-tighter mt-4">No player ${escapeHtml(id)}</h2>
    </main>`
  return fantasyLayout(body, 'Player not found', clerkKey)
}
