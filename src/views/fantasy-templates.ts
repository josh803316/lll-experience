import { CANONICAL_MANAGERS } from '../config/fantasy-managers.js'
import type {
  DraftPickRow,
  FantasyCohortRow,
  FantasyEvolutionData,
  FantasyManagerExtras,
  FantasyRecordRow,
  FantasyRecordsData,
  FantasySeasonExtras,
  FantasyTimelineData,
  FantasyWeeklyScore,
  GmAllTimeRow,
  GmSeasonRow,
  HeatmapTeam,
  ManagerTeamPlayer,
  PlayerCardData,
  SeasonSummary,
  WireRow,
} from '../services/fantasy-scout.js'
import type {
  FantasyEvolutionPoint,
  FantasyTimelinePoint,
  TimelineDecision,
} from '../services/fantasy-timeline.js'
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
          <dt class="font-bold flex items-center gap-2">${NAV_ICONS.season} ${withTip('PF/week', TIPS.pfWeek)}</dt>
          <dd class="text-muted mt-1">Points for per week — your average best-ball score. We add the points you put up each week and divide by weeks played. 2023 is not adjusted for 2QB / 6 teams.</dd>
        </div>
        <div class="score-col score-col-violet">
          <dt class="font-bold flex items-center gap-2">${NAV_ICONS.all} ${withTip('Draft grade', TIPS.draftGrade)}</dt>
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
      .theme-sleeper {
        background:
          radial-gradient(1100px 520px at 12% -8%, rgba(63,225,168,.10), transparent 60%),
          radial-gradient(900px 500px at 88% -4%, rgba(124,107,255,.12), transparent 62%),
          #0b0e13;
        min-height:100vh;
      }
      body:has(.theme-sleeper) { background:#0b0e13; }
      .fx-header { position:sticky; top:0; z-index:30; background:rgba(11,14,19,.86); backdrop-filter:blur(16px); border-bottom:1px solid rgba(255,255,255,.06); }
      .fx-header-inner, .fx-tabs, .fx-main, .fx-footer { max-width:1280px; margin:0 auto; }
      .fx-header-inner { padding:16px 28px 0; display:flex; align-items:flex-start; justify-content:space-between; gap:24px; flex-wrap:wrap; }
      .fx-brand { width:42px; height:42px; border-radius:13px; background:linear-gradient(140deg,#3fe1a8,#7c6bff); box-shadow:0 0 26px rgba(63,225,168,.32); flex:0 0 42px; }
      .fx-eyebrow, .fx-label, .fx-number { font-family:'JetBrains Mono',monospace; }
      .fx-eyebrow { color:#7c6bff; font-size:9px; font-weight:700; letter-spacing:.28em; }
      .fx-league-title, .fx-h1, .fx-h2, .fx-h3, .fx-hero-name, .fx-hero-value { font-family:Archivo,sans-serif; letter-spacing:-.04em; }
      .fx-league-title { margin:3px 0 0; font-size:30px; line-height:1; font-weight:900; color:#f4f7fb; }
      .fx-subtitle { margin:5px 0 0; color:#8b95a8; font-size:12px; }
      .fx-season-pills { display:flex; gap:4px; flex-wrap:wrap; }
      .fx-season-link { display:inline-flex; padding:5px 11px; border:1px solid rgba(255,255,255,.08); border-radius:8px; color:#8b95a8; font:700 11px 'JetBrains Mono',monospace; }
      .fx-season-link:hover, .fx-season-link-active { color:#3fe1a8; border-color:rgba(63,225,168,.55); background:rgba(63,225,168,.14); }
      .fx-tabs { display:flex; gap:26px; padding:14px 28px 0; overflow-x:auto; }
      .fx-tab { padding:0 0 12px; color:#8b95a8; font-size:11.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; white-space:nowrap; }
      .fx-tab:hover, .fx-tab-active { color:#3fe1a8; border-bottom:2px solid #3fe1a8; }
      .fx-main { padding:34px 28px 0; display:flex; flex-direction:column; gap:40px; }
      .fx-card { background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(19,24,32,0)),#131820; border:1px solid rgba(255,255,255,.07); border-radius:18px; }
      .fx-spotlights { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; }
      .fx-spotlight { padding:20px 22px; }
      .fx-h1 { margin:0; color:#f4f7fb; font-size:36px; line-height:1; font-weight:900; }
      .fx-h2 { margin:0; color:#f4f7fb; font-size:24px; line-height:1; font-weight:800; }
      .fx-h3 { margin:0; color:#f4f7fb; font-size:17px; line-height:1.1; font-weight:800; }
      .fx-muted { color:#8b95a8; }
      .fx-section-copy { margin:6px 0 0; max-width:66ch; color:#8b95a8; font-size:13px; line-height:1.5; }
      .fx-podium { display:grid; grid-template-columns:1fr 1.18fr 1fr; gap:16px; align-items:end; }
      .fx-podium-card { padding:6px 20px 22px; text-align:center; }
      .fx-podium-body { display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:32px; }
      .fx-avatar { display:inline-flex; align-items:center; justify-content:center; border-radius:34%; font:700 13px 'JetBrains Mono',monospace; }
      .fx-ladder { overflow:hidden; }
      .fx-ladder-head, .fx-ladder-row { display:grid; gap:12px; align-items:center; grid-template-columns:44px 1fr 84px 96px 74px 58px 64px; }
      .fx-ladder-head { padding:11px 20px; background:rgba(255,255,255,.025); color:#8b95a8; font:700 9px 'JetBrains Mono',monospace; letter-spacing:.16em; }
      .fx-ladder-row { padding:13px 20px; border-top:1px solid rgba(255,255,255,.045); color:#f4f7fb; transition:background .14s; }
      .fx-ladder-row:hover { background:rgba(63,225,168,.055); }
      .fx-rank { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:9px; background:rgba(255,255,255,.05); color:#8b95a8; font:700 11px 'JetBrains Mono',monospace; }
      .fx-rank-top { background:rgba(63,225,168,.12); color:#3fe1a8; }
      .fx-bar { height:4px; border-radius:9px; background:rgba(255,255,255,.07); overflow:hidden; }
      .fx-panel { padding:22px 26px 26px; }
      .fx-cohort-bar { display:flex; height:14px; border-radius:999px; overflow:hidden; background:rgba(0,0,0,.35); }
      .fx-chip { display:inline-flex; gap:6px; padding:5px 11px; border-radius:999px; color:#e6ebf3; font-size:11.5px; font-weight:600; }
      .fx-sort { padding:6px 13px; border:1px solid rgba(255,255,255,.09); border-radius:999px; background:transparent; color:#8b95a8; font-size:11px; font-weight:700; cursor:pointer; }
      .fx-sort-active { border-color:rgba(63,225,168,.55); background:rgba(63,225,168,.14); color:#3fe1a8; }
      .fx-table-wrap { overflow-x:auto; border-radius:18px; }
      .fx-form { display:flex; align-items:flex-end; justify-content:center; gap:3px; height:22px; }
      .fx-form-bar { width:7px; min-height:9px; border-radius:3px; }
      .fx-heat-grid { min-width:660px; display:flex; flex-direction:column; gap:5px; }
      .fx-heat-row { display:grid; grid-template-columns:150px repeat(7,1fr); gap:5px; align-items:stretch; }
      .fx-heat-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:7px 4px; border-radius:8px; font:700 11.5px 'JetBrains Mono',monospace; }
      .fx-matrix { min-width:760px; display:flex; flex-direction:column; gap:3px; }
      .fx-matrix-row { display:grid; grid-template-columns:86px repeat(12,1fr); gap:3px; }
      .fx-matrix-cell { display:flex; align-items:center; justify-content:center; min-height:30px; border-radius:6px; font:700 10.5px 'JetBrains Mono',monospace; }
      .fx-two-up { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; }
      .fx-section-card { padding:22px; }
      .fx-bars { display:flex; align-items:flex-end; gap:4px; height:132px; }
      .fx-week-bar { flex:1; min-width:5px; border-radius:4px 4px 2px 2px; }
      .fx-ledger-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.028); border:1px solid rgba(255,255,255,.05); }
      .fx-rival { display:grid; grid-template-columns:78px 1fr 62px; gap:10px; align-items:center; }
      .fx-records { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
      .fx-record { padding:22px; min-height:160px; display:flex; flex-direction:column; gap:4px; }
      .fx-shame-row { display:flex; align-items:center; gap:16px; padding:15px 22px; border-top:1px solid rgba(255,255,255,.05); }
      .fx-footer { margin-top:40px; padding:22px 28px; border-top:1px solid rgba(255,255,255,.06); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; color:#5c667a; font-size:11.5px; }
      @media (max-width:720px) {
        .fx-header-inner, .fx-tabs, .fx-main, .fx-footer { padding-left:16px; padding-right:16px; }
        .fx-podium { grid-template-columns:1fr; }
        .fx-podium-card:first-child { order:-1; }
        .fx-ladder-head, .fx-ladder-row { grid-template-columns:34px minmax(170px,1fr) 76px 80px 66px 52px 58px; }
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
        var metricTips = {
          'WIN%': "All-play winning percentage: each week's best-ball score is compared with every other team.",
          'ALL-PLAY': "All-play record: weekly wins, losses, and ties against every other team.",
          'PF': 'Total best-ball fantasy points for the season or career.',
          'PF/WK': 'Average best-ball points scored per week played.',
          'DRAFT': 'Auction grade based on surplus versus expected production at the price and position.',
          'DRAFT ROI': 'Total auction surplus versus the room spend curve, using position-aware expectations.',
          'WIRE': 'Fantasy points scored by waiver and free-agent additions.',
          'WIRE FPTS': 'Fantasy points scored by waiver and free-agent additions.',
          'POINTS KING': 'Highest average best-ball points per week across the league.',
          'BIGGEST WEEK': 'Highest single-week best-ball score recorded in the league.',
          'HIGH WEEK': 'Highest single-week best-ball score recorded in this season.',
          'LEAGUE AVG': 'Average best-ball points per team per week in this season.',
          'FAAB LEFT': 'Average waiver budget remaining across teams.',
          'TOP 3S': 'Number of seasons finishing in the top three by all-play winning percentage.',
          'FORM': 'Placement in each of the last three completed weeks, shown oldest to newest.',
          'SURPLUS': 'Surplus is points above the expected return for the auction price and position. Green means positive value; red means below expectation, not negative fantasy points.',
          'COST': 'Auction dollars spent on the player.',
          'ACQUIRED': 'How and when the player joined the roster.',
        };
        function installMetricTips() {
          function addTipButton(target, tip, label) {
            if (target.querySelector('.lll-tip')) return;
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'lll-tip';
            button.setAttribute('data-tip', tip);
            button.setAttribute('aria-label', 'What ' + label + ' means');
            button.textContent = '?';
            button.addEventListener('click', window.lllTip);
            target.appendChild(button);
          }
          document.querySelectorAll('.fx-label, .fx-ladder-head span').forEach(function (label) {
            var key = (label.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
            var tip = metricTips[key];
            if (!tip || label.querySelector('.lll-tip')) return;
            addTipButton(label, tip, key);
          });
          document.querySelectorAll('.fx-ladder-row').forEach(function (row) {
            var cells = row.children;
            [
              [2, 'WIN%'],
              [3, 'ALL-PLAY'],
              [4, 'PF/WK'],
              [5, 'DRAFT'],
              [6, row.querySelector('.fx-form') ? 'FORM' : 'WIRE'],
            ].forEach(function (entry) {
              var cell = cells[entry[0]];
              var tip = metricTips[entry[1]];
              if (cell && tip && !cell.getAttribute('title')) cell.setAttribute('title', tip);
            });
          });
          document.querySelectorAll('.fx-ledger-row').forEach(function (row) {
            var numbers = row.querySelectorAll(':scope > .fx-number');
            if (numbers.length >= 2) {
              numbers[0].setAttribute('title', metricTips.COST);
              numbers[1].setAttribute('title', metricTips.SURPLUS);
              addTipButton(numbers[0], metricTips.COST, 'cost');
              addTipButton(numbers[1], metricTips.SURPLUS, 'surplus');
            } else if (numbers.length === 1 && /FPTS/.test(numbers[0].textContent || '')) {
              numbers[0].setAttribute('title', metricTips.WIRE);
              addTipButton(numbers[0], metricTips.WIRE, 'wire FPTS');
            }
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', installMetricTips);
        } else {
          installMetricTips();
        }
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
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
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
    `<a href="${href}" class="fx-tab ${active === key ? 'fx-tab-active' : ''}">${escapeHtml(label)}</a>`
  const yearLinks = seasons
    .map(
      (s) =>
        `<a href="/fantasy/season/${s.season}" class="fx-season-link ${year !== undefined && s.season === year ? 'fx-season-link-active' : ''}">${s.season}</a>`
    )
    .join('')
  return `
    <header class="fx-header">
      <div class="fx-header-inner">
        <div class="flex items-start gap-3">
          <span class="fx-brand" aria-hidden="true"></span>
          <div>
            <a href="/apps" class="fx-eyebrow">SLEEPER · UCSB LEGACY</a>
            <h1 class="fx-league-title">League HQ</h1>
            <p class="fx-subtitle">Auction best-ball · $200 cap · $100 FAAB · all-play, no playoffs</p>
          </div>
        </div>
        <div class="fx-season-pills">${yearLinks}</div>
      </div>
      <nav class="fx-tabs">
        ${tab('/fantasy', 'all', 'League HQ')}
        ${tab(y ? `/fantasy/season/${y}` : '/fantasy', 'season', 'Season')}
        ${tab(y ? `/fantasy/manager/${CANONICAL_MANAGERS[0]?.slug ?? 'josh'}${y ? `?season=${y}` : ''}` : '/fantasy', 'gm', 'GM Lab')}
        ${tab('/fantasy/records', 'room', 'Trophy Room')}
      </nav>
      <div class="header-rule"></div>
    </header>`
}

const renderNav = nav

function emptyIngest(): string {
  return `
    <div class="card-paper rounded-lg p-8 text-center">
      <h2 class="text-2xl font-bold tracking-tighter mb-2">No Sleeper data yet</h2>
      <p class="text-muted">Run <code class="text-sm bg-black/5 px-1">bun run sleeper:ingest</code> then refresh.</p>
    </div>`
}

function _fantasyDashboardLegacy(
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

function fantasyHeatmap(teams: HeatmapTeam[], season?: number): string {
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
        <td class="px-3 py-2 font-bold whitespace-nowrap"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(t.slug)}${season ? `?season=${season}` : ''}">${escapeHtml(t.displayName)}</a></td>
        ${cells}
      </tr>`
    })
    .join('')
  const projected = teams.some((t) => t.projected)
  return `
    <div>
      <h3 class="text-xl font-bold tracking-tighter mb-1">Positional heat map</h3>
      <p class="text-xs text-muted mb-3">${projected ? 'Projected weekly best-ball (blended weekly stats × UCSB scoring). ' : ''}Best-ball: each week we start the highest eligible lineup from the whole roster, so depth counts on byes and off weeks. A second QB only counts the weeks he beats your first. OVR is the sum of those weekly lineups (same as the position columns). FLEX is the leftover RB/WR/TE after 2 RB / 3 WR / 1 TE. Green = 1st in the room, red = last.</p>
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

function _fantasySeasonPageLegacy(
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
      ) => `<tr class="border-t border-black/5 hover:bg-black/[0.03] cursor-pointer" onclick="location.href='/fantasy/manager/${encodeURIComponent(r.slug)}${year ? `?season=${year}` : ''}'">
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
      ${fantasyHeatmap(heatmap, year)}`
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

function _fantasyManagerPageLegacy(
  gm: GmAllTimeRow,
  team: ManagerTeamPlayer[],
  draftPicks: (DraftPickRow & { season: number })[],
  wire: (WireRow & { season: number })[],
  missed: (WireRow & { season: number })[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string,
  seasonRow: GmSeasonRow | null = null
): string {
  const viewSeason = seasonRow?.season
  const visiblePicks = viewSeason
    ? draftPicks.filter((pick) => pick.season === viewSeason)
    : draftPicks
  const visibleWire = viewSeason ? wire.filter((row) => row.season === viewSeason) : wire
  const visibleMissed = viewSeason ? missed.filter((row) => row.season === viewSeason) : missed
  const teamRows = team
    .map(
      (player) =>
        `<tr class="border-t border-black/5"><td class="px-3 py-2">${playerLink(player.playerId, player.playerName, player.position, viewSeason)}</td><td class="px-3 py-2">${posChip(player.position)}</td><td class="px-3 py-2">${player.source === 'auction' ? 'Auction' : `Added W${player.addWeek ?? '—'}`}</td></tr>`
    )
    .join('')
  const yearRows = gm.years
    .filter((year) => !viewSeason || year.season === viewSeason)
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
    ${nav(viewSeason ? 'season' : 'all', seasons, viewSeason)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <a href="${viewSeason ? `/fantasy/season/${viewSeason}` : '/fantasy'}" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← ${viewSeason ? `${viewSeason} standings` : 'All-time'}</a>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-4xl font-bold tracking-tighter">${escapeHtml(gm.displayName)}${viewSeason ? ` · ${viewSeason}` : ''}</h2>
          <p class="text-muted">${viewSeason ? `${record(seasonRow.wins, seasonRow.losses, seasonRow.ties)} · ${pct(seasonRow.winPct)} · ${seasonRow.projected ? 'projected' : 'actual'} · ${escapeHtml(seasonRow.teamName || 'Current roster')}` : `${gm.seasons} seasons · ${pct(gm.winPct)} · ${record(gm.wins, gm.losses, gm.ties)}`}</p>
        </div>
        <div class="flex items-center gap-4">
          ${viewSeason ? '' : sparkSvg(gm.sparkline)}
          <a href="/fantasy/manager/${encodeURIComponent(gm.slug)}/timeline${viewSeason ? `?season=${viewSeason}` : ''}" class="text-accent font-bold text-sm hover:underline">Evolution →</a>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('PF/week', TIPS.pfWeek)}</div><div class="text-2xl font-bold">${fmt(viewSeason ? seasonRow.pfPerWeek : gm.pfPerWeek)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${viewSeason ? 'Finish' : 'Avg finish'}</div><div class="text-2xl font-bold">${viewSeason ? seasonRow.finish : fmt(gm.avgFinish)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('Grade', TIPS.draftGrade)}</div><div class="text-2xl font-bold mt-1">${gradePill(viewSeason ? seasonRow.draftGrade : gm.draftGrade, viewSeason ? seasonRow.draftProjected : gm.draftProjected)}</div></div>
        <div class="card-paper rounded-lg p-4"><div class="text-[9px] uppercase tracking-widest text-muted">${withTip('Wire FPTS', TIPS.wire)}</div><div class="text-2xl font-bold">${fmt(viewSeason ? seasonRow.wireFpts : gm.wireFpts, 0)}</div></div>
      </div>
      ${
        viewSeason
          ? `<section class="card-paper rounded-lg overflow-x-auto"><div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">${viewSeason} current team</h3><p class="text-xs text-muted">Roster reconstructed from the season draft and settled transactions. Click a player for season-specific scoring and information.</p></div><table class="w-min min-w-full text-sm"><thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Player</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Pos</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Acquired</th></tr></thead><tbody>${teamRows || '<tr><td class="px-3 py-3 text-muted" colspan="3">No roster snapshot is available.</td></tr>'}</tbody></table></section>`
          : ''
      }
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
      <h3 class="text-xl font-bold tracking-tighter">${viewSeason ? `${viewSeason} auction picks` : 'Auction picks'}</h3>
      <div class="card-paper rounded-lg overflow-x-auto">
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            ${sortTh('Year', 0)}${sortTh('#', 1)}${sortTh('GM', 2, 'str')}${sortTh('Player', 3, 'str')}
            ${sortTh('Pos', 4, 'str')}${sortTh('$', 5)}${sortTh('FPTS', 6)}${sortTh('Pts/$', 7, 'num', TIPS.ptsPerDollar)}${sortTh('Surplus', 8, 'num', TIPS.surplus)}${sortTh('PFF', 9)}
          </tr></thead>
          <tbody>${pickRowsHtml(visiblePicks, !viewSeason, viewSeason)}</tbody>
        </table>
      </div>
      <h3 class="text-xl font-bold tracking-tighter">${viewSeason ? `${viewSeason} wire hits` : 'Wire hits'}</h3>
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
          <tbody>${visibleWire
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
      <p class="text-sm"><a class="text-accent font-bold" href="/fantasy/manager/${encodeURIComponent(gm.slug)}${viewSeason ? `?season=${viewSeason}&` : '?'}missed=1">${showMissed ? 'Hide' : 'Show'} bids that missed (${visibleMissed.length})</a></p>
      ${
        showMissed
          ? `<div class="card-paper rounded-lg overflow-x-auto">
               <table class="w-min min-w-full text-sm">
                <tbody>${visibleMissed
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

function gmConfig(slug: string) {
  return CANONICAL_MANAGERS.find((manager) => manager.slug === slug)
}

function gmColor(slug: string, fallback = '#3fe1a8'): string {
  const hue = gmConfig(slug)?.hue
  return hue == null ? fallback : `oklch(0.78 0.15 ${hue})`
}

function gmAvatar(slug: string, name: string, size = 32): string {
  const hue = gmConfig(slug)?.hue ?? 180
  const initials = name.slice(0, 2).toUpperCase()
  return `<span class="fx-avatar" style="width:${size}px;height:${size}px;flex:0 0 ${size}px;border:1px solid oklch(0.55 0.13 ${hue} / .5);background:linear-gradient(140deg,oklch(.42 .10 ${hue}),oklch(.28 .06 ${hue}));color:oklch(.85 .13 ${hue});font-size:${Math.max(10, Math.round(size * 0.36))}px">${escapeHtml(initials)}</span>`
}

function rgbRamp(rank: number, count: number): { bg: string; fg: string } {
  const t = count <= 1 ? 0 : Math.max(0, Math.min(1, (rank - 1) / (count - 1)))
  const start = [63, 225, 168]
  const middle = [38, 45, 58]
  const end = [255, 122, 138]
  const mix = (a: number[], b: number[], amount: number) =>
    a.map((value, index) => Math.round(value + (b[index] - value) * amount))
  const rgb = t < 0.5 ? mix(start, middle, t * 2) : mix(middle, end, (t - 0.5) * 2)
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  return { bg: `rgb(${rgb.join(',')})`, fg: luminance > 0.55 ? '#06130d' : '#eef2f8' }
}

function fxFooter(): string {
  return `<footer class="fx-footer"><span>UCSB Legacy · Sleeper league 1386100455410528256 · synced nightly</span><span class="fx-number">All-play · no playoffs · best-ball PPR</span></footer>`
}

function fxRecordCard(row: FantasyRecordRow, color: string, shame = false): string {
  if (shame) {
    return `<div class="fx-shame-row"><strong class="fx-hero-value" style="min-width:80px;color:#ff7a8a;font-size:26px">${escapeHtml(row.valueText || '—')}</strong><div style="flex:1"><div style="font-weight:700;font-size:13.5px">${escapeHtml(row.label)}</div><div class="fx-muted" style="font-size:12px;margin-top:2px">${escapeHtml(row.detail)}</div></div><span class="fx-number" style="padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.05);font-size:11px">${escapeHtml(row.holderName)}</span></div>`
  }
  return `<article class="fx-card fx-record" style="background:linear-gradient(150deg,${color}18,rgba(19,24,32,0)),#131820"><span class="fx-label fx-muted" style="font-size:9px;letter-spacing:.2em">${escapeHtml(row.label)}</span><strong class="fx-hero-value" style="margin-top:8px;color:${color};font-size:42px">${escapeHtml(row.valueText || '—')}</strong><span style="font-weight:700;font-size:15px;margin-top:8px">${escapeHtml(row.holderName)}</span><span class="fx-muted" style="font-size:12.5px;line-height:1.5">${escapeHtml(row.detail)}</span></article>`
}

function fxFocusScript(): string {
  return `<script>
    window.fxFocusBump = function(slug) {
      document.querySelectorAll('[data-fx-bump]').forEach(function(line) {
        var active = !slug || line.getAttribute('data-fx-bump') === slug;
        line.style.opacity = active ? '1' : '.12';
        line.style.strokeWidth = active ? '3' : '1.5';
      });
      document.querySelectorAll('[data-fx-bump-label]').forEach(function(label) {
        label.style.opacity = !slug || label.getAttribute('data-fx-bump-label') === slug ? '1' : '.25';
      });
    };
    window.fxSortLadder = function(key) {
      var box = document.querySelector('[data-fx-ladder]');
      if (!box) return;
      var rows = Array.from(box.querySelectorAll('[data-fx-row]'));
      rows.sort(function(a,b) {
        var av = parseFloat(a.getAttribute('data-' + key) || '0');
        var bv = parseFloat(b.getAttribute('data-' + key) || '0');
        return bv - av;
      });
      rows.forEach(function(row, index) {
        var rank = row.querySelector('[data-fx-rank]');
        if (rank) rank.textContent = String(index + 1);
        box.appendChild(row);
      });
      document.querySelectorAll('[data-fx-sort]').forEach(function(btn) {
        btn.classList.toggle('fx-sort-active', btn.getAttribute('data-fx-sort') === key);
      });
    };
  </script>`
}

export function fantasyDashboard(
  data: {
    seasons: SeasonSummary[]
    gms: GmAllTimeRow[]
    cohorts: FantasyCohortRow[]
    records: FantasyRecordsData
    biggestWeek: FantasyWeeklyScore | null
  },
  clerkKey?: string
): string {
  const { seasons, gms } = data
  const byWin = [...gms].sort((a, b) => b.winPct - a.winPct || b.fpts - a.fpts)
  const top = byWin.slice(0, 3)
  const maxBy = (key: 'pfPerWeek' | 'draftSurplus' | 'wireFpts') =>
    [...gms].sort((a, b) => b[key] - a[key])[0]
  const pointsKing = maxBy('pfPerWeek')
  const draftKing = maxBy('draftSurplus')
  const wireKing = maxBy('wireFpts')
  const latest = seasons.at(-1)?.season
  const pctText = (value: number) => pct(value)
  const spotlight = (
    label: string,
    value: string,
    unit: string,
    who: string,
    sub: string,
    color: string
  ) =>
    `<article class="fx-card fx-spotlight" style="background:linear-gradient(160deg,${color}18,rgba(19,24,32,0)),#131820"><div style="display:flex;justify-content:space-between"><span class="fx-label fx-muted" style="font-size:9px;letter-spacing:.2em">${label}</span><span style="width:8px;height:8px;border-radius:50%;background:${color}"></span></div><div style="display:flex;align-items:baseline;gap:7px;margin-top:14px"><strong class="fx-hero-value" style="font-size:38px;color:${color}">${value}</strong><span class="fx-number fx-muted" style="font-size:11px">${unit}</span></div><div style="margin-top:9px;font-size:13px;font-weight:700">${escapeHtml(who)}</div><div class="fx-muted" style="font-size:11.5px;margin-top:2px">${escapeHtml(sub)}</div></article>`
  const biggest = data.biggestWeek
  const spotlights = [
    spotlight(
      'POINTS KING',
      pointsKing ? fmt(pointsKing.pfPerWeek) : '—',
      'PF/WK',
      pointsKing?.displayName ?? '—',
      'Highest career best-ball points per week',
      '#3fe1a8'
    ),
    spotlight(
      'DRAFT ROI',
      draftKing
        ? `${draftKing.draftSurplus >= 0 ? '+' : ''}${fmt(draftKing.draftSurplus, 0)}`
        : '—',
      'SURPLUS',
      draftKing?.displayName ?? '—',
      'Best auction value against the room spend curve',
      '#7c6bff'
    ),
    spotlight(
      'WIRE WIZARD',
      wireKing ? fmt(wireKing.wireFpts, 0) : '—',
      'FPTS',
      wireKing?.displayName ?? '—',
      'Points scored by waiver and free-agent adds',
      '#5aa9ff'
    ),
    spotlight(
      'BIGGEST WEEK',
      biggest ? fmt(biggest.points) : '—',
      biggest ? `W${biggest.week} · ${biggest.season}` : 'FPTS',
      biggest?.displayName ?? '—',
      'Highest single best-ball week on record',
      '#f0b429'
    ),
  ].join('')
  const podium = [top[1], top[0], top[2]]
    .filter(Boolean)
    .map((g, _index) => {
      const rank = byWin.indexOf(g) + 1
      const first = rank === 1
      const color = first ? '#f0b429' : rank === 2 ? '#d5deea' : '#e09a5a'
      return `<article class="fx-card fx-podium-card" style="${first ? 'border-color:rgba(63,225,168,.35);box-shadow:0 0 44px rgba(63,225,168,.12);' : ''}"><div style="display:flex;justify-content:center;margin-bottom:-25px;position:relative"><span class="fx-number" style="padding:6px 15px;border-radius:999px;background:${color}22;border:1px solid ${color}88;color:${color};font-size:11px">${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : 'rd'}</span></div><div class="fx-podium-body"><div>${gmAvatar(g.slug, g.displayName, first ? 68 : 54)}</div><strong class="fx-hero-name" style="font-size:${first ? 26 : 21}px">${escapeHtml(g.displayName)}</strong><strong class="fx-hero-value" style="font-size:${first ? 30 : 24}px;color:${first ? '#3fe1a8' : color}">${pctText(g.winPct)}</strong><span class="fx-number fx-muted" style="font-size:11px">${record(g.wins, g.losses, g.ties)} all-play</span><div style="display:flex;gap:16px;margin-top:8px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);width:100%;justify-content:center"><span><b class="fx-number">${fmt(g.pfPerWeek)}</b><small class="fx-label fx-muted" style="display:block;font-size:9px">PF/WK</small></span><span><b class="fx-number">${g.sparkline.filter((f) => f > 0 && f <= 3).length}</b><small class="fx-label fx-muted" style="display:block;font-size:9px">TOP 3s</small></span><span><b class="fx-number" style="color:${color}">${escapeHtml(g.draftGrade)}</b><small class="fx-label fx-muted" style="display:block;font-size:9px">DRAFT</small></span></div></div></article>`
    })
    .join('')
  const cohortCards = data.cohorts.map((cohort) => {
    const color = cohort.cohort === 'dad' ? '#3fe1a8' : '#7c6bff'
    const label = cohort.cohort === 'dad' ? 'DADS' : 'KIDS'
    return `<div><div style="display:flex;justify-content:${cohort.cohort === 'kid' ? 'flex-end' : 'flex-start'};gap:8px;align-items:baseline;margin-bottom:8px"><span class="fx-label" style="font-size:9px;color:${color}">${label} H2H</span><span class="fx-number" style="font-size:10px;color:${color}" title="${escapeHtml(`Head-to-head all-play record versus the ${cohort.cohort === 'dad' ? 'Kids' : 'Dads'} cohort`)}">${pct(cohort.crossWinPct)} · ${record(cohort.crossWins, cohort.crossLosses, cohort.crossTies)}</span></div><div style="display:flex;flex-wrap:wrap;gap:6px;${cohort.cohort === 'kid' ? 'justify-content:flex-end' : ''}">${cohort.members.map((member) => `<span class="fx-chip" style="background:${color}14;border:1px solid ${color}33">${escapeHtml(member.displayName)} <b class="fx-number" title="${escapeHtml(`All-time all-play winning percentage for ${member.displayName}`)}">${pct(member.winPct)}</b></span>`).join('')}</div></div>`
  })
  const dad = data.cohorts.find((cohort) => cohort.cohort === 'dad')
  const kid = data.cohorts.find((cohort) => cohort.cohort === 'kid')
  const dadPct = dad?.winPct ?? 0
  const kidPct = kid?.winPct ?? 0
  const share = dadPct + kidPct || 1
  const ladder = byWin
    .map(
      (g, index) =>
        `<div class="fx-ladder-row" data-fx-row data-win="${g.winPct}" data-pf="${g.pfPerWeek}" data-draft="${g.draftSurplus}" data-wire="${g.wireFpts}" onclick="fxFocusBump('${escapeHtml(g.slug)}')"><span class="fx-rank ${index < 3 ? 'fx-rank-top' : ''}" data-fx-rank>${index + 1}</span><div style="display:flex;align-items:center;gap:11px;min-width:0">${gmAvatar(g.slug, g.displayName, 32)}<div style="min-width:0"><a href="/fantasy/manager/${encodeURIComponent(g.slug)}" style="font-weight:700;font-size:14px" onclick="event.stopPropagation()">${escapeHtml(g.displayName)}</a><div class="fx-muted" style="font-size:10.5px">${g.seasons} seasons · avg finish ${fmt(g.avgFinish)} · ${gmConfig(g.slug)?.cohort ?? 'other'}</div></div></div><div style="text-align:right"><span class="fx-number" style="font-weight:700">${pct(g.winPct)}</span><span class="fx-bar" style="display:block;margin-top:5px"><span style="display:block;width:${Math.max(6, Math.min(100, ((g.winPct - 0.36) / 0.28) * 100)).toFixed(1)}%;height:100%;background:${gmColor(g.slug)}"></span></span></div><span class="fx-number" style="font-size:12px;color:#c5ccd8">${record(g.wins, g.losses, g.ties)}</span><span class="fx-number" style="font-size:13px;text-align:right">${fmt(g.pfPerWeek)}</span><span style="text-align:center">${gradePill(g.draftGrade, g.draftProjected)}</span><span class="fx-number" style="font-size:12.5px;text-align:right;color:#5aa9ff">${fmt(g.wireFpts, 0)}</span></div>`
    )
    .join('')
  const x0 = 76
  const x1 = 856
  const y = (finish: number) => 28 + ((finish - 1) * 250) / 11
  const bump = byWin
    .map((g) => {
      const points = g.sparkline
        .map((finish, index) =>
          finish > 0
            ? `${(x0 + index * ((x1 - x0) / Math.max(seasons.length - 1, 1))).toFixed(1)},${y(finish).toFixed(1)}`
            : null
        )
        .filter(Boolean)
      if (points.length === 0) return ''
      const color = gmColor(g.slug)
      return `<polyline data-fx-bump="${escapeHtml(g.slug)}" points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${byWin.indexOf(g) < 3 ? 3 : 1.5}" stroke-opacity="${byWin.indexOf(g) < 3 ? 1 : 0.55}" stroke-linecap="round" stroke-linejoin="round"></polyline>`
    })
    .join('')
  const bumpLabels = byWin
    .map((g) => {
      const last = [...g.sparkline]
        .map((f, i) => ({ f, i }))
        .filter((v) => v.f > 0)
        .at(-1)
      return last
        ? `<text data-fx-bump-label="${escapeHtml(g.slug)}" x="${(x0 + last.i * ((x1 - x0) / Math.max(seasons.length - 1, 1)) + 12).toFixed(1)}" y="${(y(last.f) + 4).toFixed(1)}" fill="${gmColor(g.slug)}" font-family="Inter,sans-serif" font-size="11" font-weight="700">${escapeHtml(g.displayName)}</text>`
        : ''
    })
    .join('')
  const badges = data.records.badges.length > 0 ? data.records.badges : []
  const body = `${nav('all', seasons, latest)}
    <main class="fx-main">
      <section class="fx-spotlights">${spotlights}</section>
      <section><h2 class="fx-h2">The all-time podium</h2><p class="fx-section-copy">Every week your best-ball score plays every other GM — so this is the record that can't be schedule-lucky.</p><div class="fx-podium" style="margin-top:20px">${podium || '<div class="fx-card fx-panel">No scored seasons yet.</div>'}</div></section>
      <section class="fx-card fx-panel"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><h2 class="fx-h2" style="font-size:20px">Dads vs. Kids</h2><p class="fx-section-copy">Pooled all-play record; <strong>other</strong> cohort members are excluded from both bars.</p></div><span class="fx-number" style="padding:6px 11px;border-radius:999px;color:#f0b429;background:#f0b42922">NEW</span></div><div style="display:flex;justify-content:space-between;margin-top:18px"><strong class="fx-hero-value" style="font-size:32px;color:#3fe1a8">${pct(dadPct)} <small class="fx-label" style="font-size:13px">DADS</small></strong><strong class="fx-hero-value" style="font-size:32px;color:#7c6bff"><small class="fx-label" style="font-size:13px">KIDS</small> ${pct(kidPct)}</strong></div><div class="fx-cohort-bar" style="margin-top:10px"><span style="width:${((dadPct / share) * 100).toFixed(1)}%;background:linear-gradient(90deg,#2bbd8b,#3fe1a8)"></span><span style="width:${((kidPct / share) * 100).toFixed(1)}%;background:linear-gradient(90deg,#7c6bff,#a596ff)"></span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:18px">${cohortCards.join('')}</div></section>
      <section><div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap"><h2 class="fx-h2">All-play ladder</h2><div style="display:flex;gap:5px"><button class="fx-sort fx-sort-active" data-fx-sort="win" onclick="fxSortLadder('win')">Win%</button><button class="fx-sort" data-fx-sort="pf" onclick="fxSortLadder('pf')">PF/wk</button><button class="fx-sort" data-fx-sort="draft" onclick="fxSortLadder('draft')">Draft</button><button class="fx-sort" data-fx-sort="wire" onclick="fxSortLadder('wire')">Wire</button></div></div><div class="fx-card fx-ladder" data-fx-ladder><div class="fx-ladder-head"><span>#</span><span>GM</span><span style="text-align:right">WIN%</span><span>ALL-PLAY</span><span style="text-align:right">PF/WK</span><span style="text-align:center">DRAFT</span><span style="text-align:right">WIRE</span></div>${ladder}</div></section>
      <section><div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap"><div><h2 class="fx-h2">The climb</h2><p class="fx-section-copy">Finishing position by season. Click a GM in the ladder to isolate their line.</p></div><button class="fx-sort" onclick="fxFocusBump('')">Show all</button></div><div class="fx-card" style="padding:24px 20px 16px;background:linear-gradient(180deg,#141a23,#10151c)"><svg viewBox="0 0 980 320" style="width:100%;height:auto;display:block"><g>${[1, 3, 5, 7, 9, 11].map((rank) => `<line x1="52" x2="880" y1="${y(rank)}" y2="${y(rank)}" stroke="rgba(255,255,255,.05)"></line><text x="40" y="${y(rank) + 4}" text-anchor="end" fill="#5c667a" font-family="JetBrains Mono,monospace" font-size="10">${ordinal(rank)}</text>`).join('')}${seasons.map((season, index) => `<text x="${x0 + index * ((x1 - x0) / Math.max(seasons.length - 1, 1))}" y="312" text-anchor="middle" fill="#8b95a8" font-family="JetBrains Mono,monospace" font-size="11">${season.season}</text>`).join('')}${bump}${bumpLabels}</g></svg></div></section>
      <section><h2 class="fx-h2">Trophy case</h2><p class="fx-section-copy" style="margin-bottom:18px">Earned automatically from ingest. Argument-settling and permanently on your profile.</p><div class="fx-records">${badges.map((badge, index) => fxRecordCard(badge, ['#3fe1a8', '#5aa9ff', '#f0b429', '#7c6bff', '#3fe1a8', '#ff7a8a', '#5aa9ff', '#f0b429'][index % 8])).join('')}</div></section>
      ${howWeScore()}
    </main>${fxFooter()}${fxFocusScript()}`
  return fantasyLayout(body, 'UCSB Legacy — League HQ', clerkKey)
}

export function fantasySeasonPage(
  summary: SeasonSummary | null,
  standings: GmSeasonRow[],
  seasons: SeasonSummary[],
  heatmap: HeatmapTeam[] = [],
  clerkKey?: string,
  extras: FantasySeasonExtras = {
    weekly: [],
    h2h: [],
    highWeek: 0,
    leagueAverage: 0,
    leagueMedian: 0,
  }
): string {
  const year = summary?.season
  const weekly = extras.weekly
  const weeksBySlug = new Map<string, FantasyWeeklyScore[]>()
  for (const score of weekly) {
    const list = weeksBySlug.get(score.slug) ?? []
    list.push(score)
    weeksBySlug.set(score.slug, list)
  }
  const form = (slug: string) =>
    (weeksBySlug.get(slug) ?? [])
      .slice(-3)
      .map((score) => {
        const color =
          score.rank <= Math.max(1, Math.ceil((summary?.teamCount ?? standings.length) / 3))
            ? '#3fe1a8'
            : score.rank <= Math.ceil(((summary?.teamCount ?? standings.length) * 2) / 3)
              ? '#7c6bff'
              : '#ff7a8a'
        const height = Math.max(9, Math.min(29, 34 - score.rank * 2))
        return `<span class="fx-form-bar" style="height:${height}px;background:${color}" title="Week ${score.week}: ${fmt(score.points)} FPTS · rank ${score.rank}"></span>`
      })
      .join('')
  const rows = standings
    .map(
      (row) =>
        `<div class="fx-ladder-row" style="grid-template-columns:40px 1fr 78px 82px 90px 80px 92px" onclick="location.href='/fantasy/manager/${encodeURIComponent(row.slug)}?season=${year ?? ''}'"><span class="fx-rank ${row.finish <= 3 ? 'fx-rank-top' : ''}">${row.finish}</span><div style="display:flex;align-items:center;gap:11px;min-width:0">${gmAvatar(row.slug, row.displayName, 32)}<div style="min-width:0"><div style="font-weight:700;font-size:14px">${escapeHtml(row.displayName)}</div><div class="fx-muted" style="font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(row.teamName ?? '')}</div></div></div><span class="fx-number" style="text-align:right;font-weight:700">${pct(row.winPct)}</span><span class="fx-number" style="text-align:right;color:#c5ccd8">${record(row.wins, row.losses, row.ties)}</span><span class="fx-number" style="text-align:right;color:#c5ccd8">${fmt(row.fpts, 0)}</span><span class="fx-number" style="text-align:right">${fmt(row.pfPerWeek)}</span><span class="fx-form">${form(row.slug)}</span></div>`
    )
    .join('')
  const heatKeys = ['ovr', 'qb', 'rb', 'wr', 'te', 'flex', 'def'] as const
  const heat = heatmap
    .map(
      (team) =>
        `<div class="fx-heat-row"><span style="display:flex;align-items:center;gap:9px;font-weight:600;font-size:13px">${gmAvatar(team.slug, team.displayName, 24)}${escapeHtml(team.displayName)}</span>${heatKeys
          .map((key) => {
            const ramp = rgbRamp(team[key].rank, heatmap.length)
            return `<span class="fx-heat-cell" style="background:${ramp.bg};color:${ramp.fg}" title="${escapeHtml(team.displayName)} ${key.toUpperCase()}: ${ordinal(team[key].rank)} · ${fmt(team[key].pts)} FPTS">${ordinal(team[key].rank)}<b style="font-size:9.5px;opacity:.72">${fmt(team[key].pts, 0)}</b></span>`
          })
          .join('')}</div>`
    )
    .join('')
  const names = standings.map((row) => row.displayName)
  const h2hMap = new Map(extras.h2h.map((cell) => [`${cell.a}|${cell.b}`, cell]))
  const matrix = standings
    .map(
      (row) =>
        `<div class="fx-matrix-row" style="grid-template-columns:86px repeat(${Math.max(names.length, 1)},1fr)"><span style="display:flex;align-items:center;font-size:12px;font-weight:600">${escapeHtml(row.displayName)}</span>${standings
          .map((opponent) => {
            if (row.slug === opponent.slug)
              return '<span class="fx-matrix-cell" style="background:rgba(255,255,255,.03);color:#39424f">·</span>'
            const cell = h2hMap.get(`${row.slug}|${opponent.slug}`)
            const wins = cell?.wins ?? 0
            const losses = cell?.losses ?? 0
            const games = cell?.games ?? 0
            const share = games ? wins / games : 0.5
            const ramp = rgbRamp(
              Math.round(
                1 +
                  (1 - Math.max(0, Math.min(1, (share - 0.28) / 0.44))) *
                    Math.max(names.length - 1, 1)
              ),
              names.length
            )
            return `<span class="fx-matrix-cell" style="background:${ramp.bg};color:${ramp.fg}" title="${escapeHtml(row.displayName)} vs ${escapeHtml(opponent.displayName)}: ${wins}-${losses}">${wins}-${losses}</span>`
          })
          .join('')}</div>`
    )
    .join('')
  const preDraft = summary?.draftStatus === 'pre_draft' || summary?.status === 'pre_draft'
  const body = `${nav('season', seasons, year)}<main class="fx-main"><section style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap"><div><div class="fx-eyebrow" style="margin-bottom:6px">SEASON ${year ?? '—'} · WEEK ${weekly.length > 0 ? Math.max(...weekly.map((score) => score.week)) : 0}</div><h2 class="fx-h1">Standings</h2><p class="fx-section-copy">${summary?.teamCount ?? 0} teams · ${escapeHtml(summary?.status ?? 'no data')}</p></div><div style="display:flex;gap:10px;flex-wrap:wrap">${[
    ['HIGH WEEK', extras.highWeek, '#3fe1a8'],
    ['LEAGUE AVG', extras.leagueAverage, '#f4f7fb'],
    [
      'FAAB LEFT',
      summary
        ? Math.max(
            0,
            100 -
              standings.reduce((sum, row) => sum + row.waiverBudgetUsed, 0) /
                Math.max(standings.length, 1)
          )
        : 0,
      '#5aa9ff',
    ],
  ]
    .map(
      ([label, value, color]) =>
        `<div class="fx-card" style="padding:11px 16px;min-width:112px;border-radius:13px"><div class="fx-label fx-muted" style="font-size:9px">${label}</div><div class="fx-hero-value" style="font-size:21px;color:${color}">${typeof value === 'number' && value > 0 ? fmt(value) : '—'}</div></div>`
    )
    .join(
      ''
    )}</div></section>${preDraft && standings.every((row) => row.wins === 0 && row.fpts === 0) ? '<div class="fx-card fx-panel fx-muted">Draft opens on Sleeper — this page fills after ingest.</div>' : `<section class="fx-card fx-ladder"><div class="fx-ladder-head" style="grid-template-columns:40px 1fr 78px 82px 90px 80px 92px"><span>#</span><span>GM · TEAM</span><span>WIN%</span><span>W–L</span><span>PF</span><span>PF/WK</span><span>FORM</span></div>${rows}</section>`}<section><h2 class="fx-h2">Positional heat map</h2><p class="fx-section-copy">${heatmap.some((team) => team.projected) ? 'Projected weekly best-ball. ' : ''}Best-ball depth counts on byes. Mint is first in the room, coral is last. FLEX is the leftover RB/WR/TE.</p><div class="fx-card fx-panel" style="overflow-x:auto;margin-top:16px"><div class="fx-heat-grid"><div class="fx-heat-row fx-label fx-muted" style="font-size:9px;letter-spacing:.16em"><span>GM</span>${heatKeys.map((key) => `<span style="text-align:center">${key.toUpperCase()}</span>`).join('')}</div>${heat || '<div class="fx-muted">No heat map data yet.</div>'}</div></div></section><section><h2 class="fx-h2">Who owns who</h2><p class="fx-section-copy">Read across: mint means the row GM beats the column GM more often than not.</p><div class="fx-card fx-panel" style="overflow-x:auto;margin-top:16px"><div class="fx-matrix"><div class="fx-matrix-row" style="grid-template-columns:86px repeat(${Math.max(names.length, 1)},1fr)"><span></span>${standings.map((row) => `<span class="fx-number fx-muted" style="text-align:center;font-size:9px">${escapeHtml(row.displayName.slice(0, 2).toUpperCase())}</span>`).join('')}</div>${matrix}</div></div></section></main>${fxFooter()}`
  return fantasyLayout(body, `UCSB Legacy — ${year ?? 'Season'}`, clerkKey)
}

export function fantasyManagerPage(
  gm: GmAllTimeRow,
  team: ManagerTeamPlayer[],
  draftPicks: (DraftPickRow & { season: number })[],
  wire: (WireRow & { season: number })[],
  missed: (WireRow & { season: number })[],
  seasons: SeasonSummary[],
  showMissed: boolean,
  clerkKey?: string,
  seasonRow: GmSeasonRow | null = null,
  extras: FantasyManagerExtras = { weekly: [], leagueMedian: 0, heatmap: null, h2h: [] }
): string {
  const nav = (_active: string, navSeasons: SeasonSummary[], navYear?: number) =>
    renderNav('gm', navSeasons, navYear)
  const year = seasonRow?.season
  const visiblePicks = year ? draftPicks.filter((pick) => pick.season === year) : draftPicks
  const visibleWire = year ? wire.filter((row) => row.season === year) : wire
  const weeks = extras.weekly.filter((score) => score.slug === gm.slug)
  const rivals = extras.h2h
    .filter((cell) => cell.a === gm.slug)
    .map((cell) => {
      const opponent = extras.weekly.find((score) => score.slug === cell.b)
      const total = cell.games || 1
      return `<div class="fx-rival"><span style="font-size:12.5px;font-weight:600">${escapeHtml(opponent?.displayName ?? cell.b)}</span><span style="display:flex;height:9px;border-radius:9px;overflow:hidden;background:rgba(255,255,255,.06)"><span style="width:${((cell.wins / total) * 100).toFixed(1)}%;background:#3fe1a8"></span><span style="width:${((cell.losses / total) * 100).toFixed(1)}%;background:#ff7a8a"></span></span><span class="fx-number" style="text-align:right;color:${cell.wins >= cell.losses ? '#3fe1a8' : '#ff7a8a'}">${cell.wins}–${cell.losses}</span></div>`
    })
    .join('')
  const shapeKeys = ['qb', 'rb', 'wr', 'te', 'flex', 'def'] as const
  const shape = extras.heatmap
    ? shapeKeys
        .map((key) => {
          const rank = extras.heatmap?.[key].rank ?? 0
          const ramp = rgbRamp(rank, 12)
          return `<div><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span class="fx-label" style="font-size:11px;color:#c5ccd8">${key.toUpperCase()}</span><span class="fx-number" style="font-size:11px;color:${ramp.bg}">${ordinal(rank)} of 12</span></div><span class="fx-bar" style="height:8px;display:block"><span style="display:block;height:100%;width:${(((12 - rank) / 11) * 92 + 8).toFixed(0)}%;background:${ramp.bg}"></span></span></div>`
        })
        .join('')
    : '<span class="fx-muted">No roster-shape data yet.</span>'
  const teamRows = team
    .map(
      (player) =>
        `<div class="fx-ledger-row">${playerLink(player.playerId, player.playerName, player.position, year)}<span class="fx-number fx-muted">${player.source === 'auction' ? 'Auction' : `Added W${player.addWeek ?? '—'}`}</span></div>`
    )
    .join('')
  const currentTeam = year
    ? `<section class="fx-card fx-section-card"><h3 class="fx-h3">${year} current team</h3><p class="fx-section-copy" style="font-size:12px">Roster reconstructed from the season draft and settled transactions. Click a player for season-specific scoring and information.</p><div style="display:flex;flex-direction:column;gap:9px;margin-top:16px">${teamRows || '<span class="fx-muted">No roster snapshot is available.</span>'}</div></section>`
    : ''
  const pickRows = visiblePicks
    .map(
      (pick) =>
        `<div class="fx-ledger-row">${posChip(pick.position)}<span style="flex:1;font-weight:600;font-size:13.5px">${playerLink(pick.playerId, pick.playerName, pick.position, year)}</span><span class="fx-number fx-muted">$${pick.amount}</span><span class="fx-number" style="min-width:56px;text-align:right;color:${pick.surplus >= 0 ? '#3fe1a8' : '#ff7a8a'}">${pick.surplus >= 0 ? '+' : ''}${fmt(pick.surplus)}</span></div>`
    )
    .join('')
  const weekBars = weeks
    .map(
      (week) =>
        `<span class="fx-week-bar" style="height:${Math.max(4, Math.min(100, (week.points / Math.max(...weeks.map((item) => item.points), 1)) * 100)).toFixed(1)}%;background:${week.points >= extras.leagueMedian ? 'linear-gradient(180deg,#3fe1a8,#3fe1a866)' : 'rgba(139,149,168,.4)'}" title="Week ${week.week}: ${fmt(week.points)} FPTS"></span>`
    )
    .join('')
  const body = `${nav(year ? 'season' : 'all', seasons, year)}<main class="fx-main"><div style="display:flex;gap:7px;flex-wrap:wrap">${CANONICAL_MANAGERS.map((manager) => `<a class="fx-sort ${manager.slug === gm.slug ? 'fx-sort-active' : ''}" href="/fantasy/manager/${encodeURIComponent(manager.slug)}${year ? `?season=${year}` : ''}">${escapeHtml(manager.displayName)}</a>`).join('')}</div><section class="fx-card fx-panel" style="border-radius:22px;background:linear-gradient(130deg,oklch(.4 .11 ${gmConfig(gm.slug)?.hue ?? 180} / .22),rgba(19,24,32,0)),#131820;display:flex;gap:28px;align-items:center;flex-wrap:wrap"><div>${gmAvatar(gm.slug, gm.displayName, 96)}</div><div style="flex:1;min-width:220px"><div class="fx-label fx-muted" style="font-size:10px">${gmConfig(gm.slug)?.cohort ?? 'other'} · ${year ? `SEASON ${year}` : `${gm.seasons} SEASONS`}</div><h2 class="fx-hero-name" style="font-size:44px;margin:6px 0 0">${escapeHtml(gm.displayName)}${year ? ` · ${year}` : ''}</h2><div style="margin-top:6px;font-size:14px;color:#c5ccd8">${escapeHtml(seasonRow?.teamName ?? 'All-time profile')}</div><p class="fx-muted" style="font-size:13.5px;max-width:60ch;line-height:1.55">${escapeHtml(`${gm.displayName} has an all-play mark of ${record(year && seasonRow ? seasonRow.wins : gm.wins, year && seasonRow ? seasonRow.losses : gm.losses, year && seasonRow ? seasonRow.ties : gm.ties)}. Draft grade ${year && seasonRow ? seasonRow.draftGrade : gm.draftGrade}, with ${fmt(year && seasonRow ? seasonRow.wireFpts : gm.wireFpts, 0)} wire points.`)}</p></div><div style="display:grid;grid-template-columns:repeat(2,minmax(96px,1fr));gap:10px">${[
    ['WIN%', year && seasonRow ? pct(seasonRow.winPct) : pct(gm.winPct), '#3fe1a8'],
    ['PF/WK', fmt(year && seasonRow ? seasonRow.pfPerWeek : gm.pfPerWeek), '#f4f7fb'],
    ['DRAFT', year && seasonRow ? seasonRow.draftGrade : gm.draftGrade, '#7c6bff'],
    ['WIRE', fmt(year && seasonRow ? seasonRow.wireFpts : gm.wireFpts, 0), '#5aa9ff'],
  ]
    .map(
      ([label, value, color]) =>
        `<div class="fx-card" style="padding:12px 14px;background:rgba(0,0,0,.32);border-radius:13px"><div class="fx-label fx-muted" style="font-size:9px">${label}</div><div class="fx-hero-value" style="font-size:22px;color:${color}">${value}</div></div>`
    )
    .join(
      ''
    )}</div></section>${currentTeam}<section class="fx-two-up"><div class="fx-card fx-section-card"><h3 class="fx-h3">Roster shape</h3><p class="fx-section-copy" style="font-size:12px;margin-bottom:18px">League rank by position, from the same source as the Season heat map.</p><div style="display:flex;flex-direction:column;gap:13px">${shape}</div></div><div class="fx-card fx-section-card"><h3 class="fx-h3">Weekly output</h3><p class="fx-section-copy" style="font-size:12px;margin-bottom:18px">Best-ball points by week. Dashed line is the league median.</p><div class="fx-bars">${weekBars || '<span class="fx-muted">No scored weeks yet.</span>'}</div></div></section><section class="fx-two-up"><div class="fx-card fx-section-card"><h3 class="fx-h3" style="margin-bottom:16px">${year ? `${year} auction picks` : 'Auction ledger'}</h3><div style="display:flex;flex-direction:column;gap:9px">${pickRows || '<span class="fx-muted">No auction picks yet.</span>'}</div></div><div class="fx-card fx-section-card"><h3 class="fx-h3">Rivalries</h3><p class="fx-section-copy" style="font-size:12px;margin-bottom:16px">All-play record against every other GM, all-time.</p><div style="display:flex;flex-direction:column;gap:8px">${rivals || '<span class="fx-muted">No head-to-head data yet.</span>'}</div></div></section><section class="fx-card fx-panel"><h3 class="fx-h3">${year ? `${year} wire activity` : 'Wire activity'}</h3><div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${visibleWire.map((row) => `<div class="fx-ledger-row"><span class="fx-number fx-muted">W${row.addWeek}–${row.dropWeek}</span>${playerLink(row.playerId, row.playerName, null, row.season)}<span class="fx-number" style="margin-left:auto;color:#5aa9ff">${fmt(row.fpts, 0)} FPTS</span></div>`).join('') || '<span class="fx-muted">No wire adds yet.</span>'}</div>${showMissed ? `<p class="fx-muted" style="margin-top:14px">Missed bids: ${missed.length}</p>` : ''}</section></main>${fxFooter()}`
  return fantasyLayout(body, `${gm.displayName} — UCSB Legacy`, clerkKey)
}

export function fantasyRecordsPage(
  data: FantasyRecordsData,
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const recordKeys = [
    'highest_week',
    'longest_top3_streak',
    'best_dollar_pick',
    'most_faab',
    'closest_week',
    'biggest_climb',
  ]
  const emptyRecord = (key: string, label: string): FantasyRecordRow => ({
    key,
    label,
    valueNum: null,
    valueText: '—',
    holderSlug: null,
    holderName: '—',
    season: null,
    week: null,
    detail: 'This record will fill as qualifying league data is recorded.',
  })
  const records = recordKeys.map(
    (key) =>
      data.records.find((record) => record.key === key) ??
      emptyRecord(key, key.replaceAll('_', ' '))
  )
  const shameKeys = [
    'lowest_week',
    'worst_bust',
    'worst_allplay_week',
    'zero_faab',
    'worst_draft_surplus',
  ]
  const shame = shameKeys.map(
    (key) =>
      data.records.find((record) => record.key === key) ??
      emptyRecord(key, key.replaceAll('_', ' '))
  )
  const body = `${nav('room', seasons)}<main class="fx-main"><div><div class="fx-eyebrow" style="color:#f0b429;margin-bottom:6px">RECORD BOOK</div><h2 class="fx-h1">Trophy Room</h2><p class="fx-section-copy">Every superlative the ingest can prove. Screenshot-ready — that is the whole point.</p></div><section class="fx-records">${records.map((row, index) => fxRecordCard(row, ['#f0b429', '#3fe1a8', '#7c6bff', '#5aa9ff', '#f4f7fb', '#3fe1a8'][index % 6])).join('') || '<div class="fx-card fx-panel fx-muted">Records will appear after the first scored ingest.</div>'}</section><section><h3 class="fx-h2" style="font-size:20px;margin-bottom:14px">Hall of shame</h3><div class="fx-card" style="border-color:rgba(255,122,138,.18);background:linear-gradient(150deg,rgba(255,122,138,.07),rgba(19,24,32,0)),#131820">${shame.map((row) => fxRecordCard(row, '#ff7a8a', true)).join('') || '<div class="fx-panel fx-muted">No shame records yet.</div>'}</div></section></main>${fxFooter()}`
  return fantasyLayout(body, 'UCSB Legacy — Trophy Room', clerkKey)
}

export function fantasyPlayerNotFound(id: string, clerkKey?: string): string {
  const body = `
    <main class="max-w-3xl mx-auto px-4 py-16">
      <a href="/fantasy" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted">← All-time</a>
      <h2 class="text-3xl font-bold tracking-tighter mt-4">No player ${escapeHtml(id)}</h2>
    </main>`
  return fantasyLayout(body, 'Player not found', clerkKey)
}

function timelineChart(
  points: FantasyTimelinePoint[],
  key: 'strengthPoints' | 'cumulativePerformance',
  color: string
): string {
  const values = points.map((point) => point[key])
  if (values.length === 0 || Math.max(...values) <= 0) {
    return '<p class="text-sm text-muted py-8 text-center">No scored weeks yet.</p>'
  }
  const width = 760
  const height = 220
  const padX = 28
  const padY = 20
  const max = Math.max(...values, 1)
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : width - padX * 2
  const coords = points.map((point, index) => {
    const x = padX + index * step
    const y = height - padY - (point[key] / max) * (height - padY * 2)
    return { point, x, y }
  })
  const line = coords.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ')
  const dots = coords
    .map(
      ({ point, x, y }) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"><title>Week ${point.week}: ${fmt(point[key])}</title></circle>`
    )
    .join('')
  const labels = coords
    .filter(
      ({ point }) => point.week === 0 || point.week === points.at(-1)?.week || point.week % 4 === 0
    )
    .map(
      ({ point, x }) =>
        `<text x="${x.toFixed(1)}" y="${height - 3}" text-anchor="middle" fill="#8b95a8" font-size="10">W${point.week}</text>`
    )
    .join('')
  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-56" role="img" aria-label="Timeline chart">
    <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="rgba(255,255,255,.12)" />
    <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${line}" />
    ${dots}${labels}
  </svg>`
}

function timelineInsightClass(insight: string): string {
  if (insight.includes('Great') || insight.includes('Strong value')) {
    return 'text-accent'
  }
  if (insight.includes('Weak')) {
    return 'text-rose-300'
  }
  if (insight.includes('expensive')) {
    return 'text-amber-300'
  }
  return 'text-slate-300'
}

function timelinePerformanceBars(points: FantasyTimelinePoint[]): string {
  const weekly = points.filter((point) => point.week > 0)
  const max = Math.max(...weekly.map((point) => point.performancePoints), 0)
  if (max <= 0) {
    return ''
  }
  const bars = weekly
    .map(
      (point) =>
        `<div class="flex-1 min-w-[5px] group relative h-20 flex items-end"><div class="w-full rounded-t bg-[#7c6bff]" style="height:${Math.max(3, (point.performancePoints / max) * 100)}%" title="W${point.week}: ${fmt(point.performancePoints)}"></div><span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-muted">${point.week % 4 === 0 ? `W${point.week}` : ''}</span></div>`
    )
    .join('')
  return `<div class="flex items-end gap-1 px-1 pb-5 border-b border-black/10">${bars}</div>`
}

function evolutionChart(
  points: FantasyEvolutionPoint[],
  key: 'strengthPoints' | 'standingsRank',
  chartId: string
): string {
  const weeks = [...new Set(points.map((point) => point.week))].sort((a, b) => a - b)
  const series = [...new Map(points.map((point) => [point.slug, point.displayName])).entries()]
  if (weeks.length === 0 || series.length === 0) {
    return '<p class="text-sm text-muted py-8 text-center">No evolution snapshots yet.</p>'
  }
  const width = 760
  const height = 250
  const padX = 30
  const padY = 24
  const values = points.map((point) => point[key])
  const min = key === 'standingsRank' ? Math.min(...values, 1) : 0
  const max = Math.max(...values, min + 1)
  const colors = [
    '#3fe1a8',
    '#7c6bff',
    '#ffb86b',
    '#f178b6',
    '#79c7ff',
    '#c7e36f',
    '#ff7e79',
    '#b39cff',
  ]
  const xAt = (index: number) =>
    padX + (weeks.length === 1 ? 0 : (index / (weeks.length - 1)) * (width - padX * 2))
  const yAt = (value: number) => padY + ((value - min) / (max - min)) * (height - padY * 2)
  const lines = series
    .map(([slug, _displayName], seriesIndex) => {
      const seriesId = `${chartId}-series-${seriesIndex}`
      const rowByWeek = new Map(
        points.filter((point) => point.slug === slug).map((point) => [point.week, point])
      )
      const coords = weeks
        .map((week, index) => {
          const point = rowByWeek.get(week)
          return point ? `${xAt(index).toFixed(1)},${yAt(point[key]).toFixed(1)}` : null
        })
        .filter((value): value is string => value !== null)
      const dots = weeks
        .map((week, index) => {
          const point = rowByWeek.get(week)
          if (!point) {
            return ''
          }
          const tooltip =
            key === 'strengthPoints'
              ? `W${point.week} · ${point.displayName} · strength ${fmt(point.strengthPoints, 0)} · rank #${point.strengthRank} · ${record(point.projectedWins, point.projectedLosses, point.projectedTies)} projected all-play`
              : `W${point.week} · ${point.displayName} · rank #${point.standingsRank} · ${record(point.projectedWins, point.projectedLosses, point.projectedTies)} projected all-play · strength ${fmt(point.strengthPoints, 0)}`
          return `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(point[key]).toFixed(1)}" r="4" fill="${colors[seriesIndex % colors.length]}" class="cursor-pointer" tabindex="0" data-evolution-point data-evolution-series-id="${seriesId}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></circle>`
        })
        .join('')
      return `<g data-evolution-series="${seriesId}"><polyline fill="none" stroke="${colors[seriesIndex % colors.length]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}"></polyline>${dots}</g>`
    })
    .join('')
  const labels = weeks
    .filter((week, index) => index === 0 || index === weeks.length - 1 || week % 4 === 0)
    .map((week) => {
      const index = weeks.indexOf(week)
      return `<text x="${xAt(index).toFixed(1)}" y="${height - 4}" text-anchor="middle" fill="#8b95a8" font-size="10">W${week}</text>`
    })
    .join('')
  const legend = series
    .map(
      ([slug, displayName], index) =>
        `<span class="inline-flex items-center gap-1 text-[10px] text-muted"><button type="button" class="evolution-series-toggle inline-flex items-center gap-1 hover:text-accent" data-evolution-chart="${chartId}" data-evolution-series="${chartId}-series-${index}" aria-pressed="true"><i class="w-2 h-2 rounded-full" style="background:${colors[index % colors.length]}"></i>${escapeHtml(displayName)}</button><a class="text-muted hover:text-accent" href="/fantasy/manager/${encodeURIComponent(slug)}/timeline" aria-label="Open ${escapeHtml(displayName)} timeline">↗</a></span>`
    )
    .join('')
  return `<div data-evolution-chart-container="${chartId}"><svg viewBox="0 0 ${width} ${height}" class="w-full h-64" role="img" aria-label="${key === 'strengthPoints' ? 'Weekly roster strength' : 'Weekly standings rank'} chart">
    <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" stroke="rgba(0,0,0,.12)" />
    <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="rgba(0,0,0,.12)" />
    ${lines}${labels}
  </svg><div class="evolution-tooltip pointer-events-none fixed z-50 hidden rounded bg-[#0e1116] px-2 py-1 text-[11px] text-white shadow-lg" role="status"></div><div class="flex flex-wrap gap-x-3 gap-y-1 px-2" aria-label="Toggle teams">${legend}</div><p class="mt-2 text-[10px] text-muted">Click a name to hide/show its line. Hover a point for the underlying snapshot.</p></div>`
}

function evolutionRankRows(rows: FantasyEvolutionPoint[], positive: boolean): string {
  return rows
    .filter((row) => (positive ? row.standingsChange > 0 : row.standingsChange < 0))
    .slice(0, 6)
    .map(
      (row) =>
        `<tr class="border-t border-black/5"><td class="px-3 py-2 font-bold">${escapeHtml(row.displayName)}</td><td class="px-3 py-2">${row.standingsChange > 0 ? '+' : ''}${row.standingsChange}</td><td class="px-3 py-2 text-muted">#${row.standingsRank} · ${record(row.projectedWins, row.projectedLosses, row.projectedTies)}</td></tr>`
    )
    .join('')
}

function depthSummary(depth: Record<string, number>): string {
  const entries = Object.entries(depth)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  return entries.length === 0
    ? '—'
    : entries.map(([position, count]) => `${position} ${count}`).join(' · ')
}

function moveBadge(decision: TimelineDecision): string {
  if (decision.label === 'Choice bonus') {
    return '<span class="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">Choice bonus</span>'
  }
  if (decision.label === 'Double negative') {
    return '<span class="rounded bg-rose-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-300">Double negative</span>'
  }
  if (decision.bestBallDelta > 0) {
    return '<span class="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent">Winning move</span>'
  }
  if (decision.bestBallDelta < 0) {
    return '<span class="rounded bg-amber-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">Miss</span>'
  }
  return '<span class="rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted">Neutral</span>'
}

function weeklyMoveReports(decisions: TimelineDecision[]): string {
  const byWeek = new Map<number, TimelineDecision[]>()
  for (const decision of decisions) {
    const week = byWeek.get(decision.week) ?? []
    week.push(decision)
    byWeek.set(decision.week, week)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, moves]) => {
      const best = [...moves].sort((a, b) => b.bestBallDelta - a.bestBallDelta)[0]
      const miss = [...moves].sort((a, b) => a.bestBallDelta - b.bestBallDelta)[0]
      const move = (decision: TimelineDecision): string =>
        `<a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(decision.slug)}/timeline">${escapeHtml(decision.displayName)}</a> ${moveBadge(decision)} <span class="text-muted">${decision.bestBallDelta >= 0 ? '+' : ''}${fmt(decision.bestBallDelta, 0)} rest-of-season best-ball</span>`
      return `<article class="rounded-lg border border-black/10 p-3"><div class="text-[10px] font-bold uppercase tracking-widest text-muted">Week ${best.week} · ${moves.length} decision${moves.length === 1 ? '' : 's'}</div><div class="mt-2 grid gap-2 md:grid-cols-2 text-sm"><div><span class="text-[10px] uppercase tracking-widest text-muted">Best move</span><p class="mt-1">${move(best)}</p></div><div><span class="text-[10px] uppercase tracking-widest text-muted">Biggest miss</span><p class="mt-1">${move(miss)}</p></div></div></article>`
    })
    .join('')
}

export function fantasyEvolutionPage(
  data: FantasyEvolutionData | null,
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const selectedSeason = data?.season ?? seasons.at(-1)?.season
  const body = `
    ${nav('evolution', seasons, selectedSeason)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      ${
        data
          ? (
              () => {
                const finalWeek = Math.max(...data.points.map((point) => point.week), 0)
                const current = data.points
                  .filter((point) => point.week === finalWeek)
                  .sort((a, b) => a.standingsRank - b.standingsRank)
                const decisions = data.decisions
                const decisionByRoster = new Map<number, number>()
                for (const decision of decisions) {
                  decisionByRoster.set(
                    decision.rosterId,
                    (decisionByRoster.get(decision.rosterId) ?? 0) + decision.netDelta
                  )
                }
                const trackRows = current
                  .map((point) => {
                    const transactionValue = decisionByRoster.get(point.rosterId) ?? 0
                    return `<tr class="border-t border-black/5"><td class="px-3 py-2">${point.standingsRank}</td><td class="px-3 py-2 font-bold"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(point.slug)}/timeline?season=${data.season}">${escapeHtml(point.displayName)}</a></td><td class="px-3 py-2">${point.draftSurplus >= 0 ? '+' : ''}${fmt(point.draftSurplus, 0)}</td><td class="px-3 py-2 ${transactionValue >= 0 ? 'text-accent' : 'text-rose-300'}">${transactionValue >= 0 ? '+' : ''}${fmt(transactionValue, 0)}</td><td class="px-3 py-2">${record(point.projectedWins, point.projectedLosses, point.projectedTies)} · #${point.projectedRank}</td></tr>`
                  })
                  .join('')
                const decisionRows = decisions
                  .slice(0, 30)
                  .map(
                    (decision) =>
                      `<tr class="border-t border-black/5"><td class="px-3 py-2">W${decision.week}</td><td class="px-3 py-2 font-bold">${escapeHtml(decision.displayName)}</td><td class="px-3 py-2">${decision.players.map((player) => `${player.kind === 'add' ? '+' : '−'} ${escapeHtml(player.playerName)}`).join('<br>')}</td><td class="px-3 py-2 text-muted">${decision.addedPoints >= 0 ? '+' : ''}${fmt(decision.addedPoints, 0)} / −${fmt(decision.droppedPoints, 0)} player FPTS</td><td class="px-3 py-2 font-bold ${decision.bestBallDelta >= 0 ? 'text-accent' : 'text-rose-300'}">${decision.bestBallDelta >= 0 ? '+' : ''}${fmt(decision.bestBallDelta, 0)}<span class="block text-[10px] font-normal text-muted">${fmt(decision.bestBallBefore, 0)} → ${fmt(decision.bestBallAfter, 0)} rest-season best-ball</span></td><td class="px-3 py-2 text-[11px] text-muted">${depthSummary(decision.depthBefore)} → ${depthSummary(decision.depthAfter)}</td><td class="px-3 py-2">${moveBadge(decision)}</td></tr>`
                  )
                  .join('')
                const rawDecisionData = escapeHtml(JSON.stringify(decisions, null, 2))
                const seasonLinks = seasons
                  .map(
                    (season) =>
                      `<option value="${season.season}" ${season.season === data.season ? 'selected' : ''}>${season.season}</option>`
                  )
                  .join('')
                return `
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div><p class="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">League-wide transaction lab</p><h2 class="text-4xl font-bold tracking-tighter mt-2">Evolution</h2><p class="text-sm text-muted">${data.season} · ${data.projected ? 'current blended projections' : 'retrospective actuals'} · snapshots replay settled moves before each week</p></div>
        <label class="text-[10px] font-bold uppercase tracking-widest text-muted">Season <select class="ml-2 rounded border border-black/10 bg-transparent px-2 py-1 text-black" onchange="location.href='/fantasy/evolution?season='+this.value">${seasonLinks}</select></label>
      </div>
      <div class="flex flex-wrap gap-3"><a href="/fantasy/${data.season}/chat" class="card-paper rounded-lg px-4 py-3 text-sm font-bold hover:text-accent">Message board →</a><div class="card-paper rounded-lg px-4 py-3 text-sm text-muted">Basis <strong class="text-black">${data.projected ? 'Projected' : 'Actual'}</strong> · ${data.strengthBasis}</div><div class="card-paper rounded-lg px-4 py-3 text-sm text-muted">Latest snapshot <strong class="text-black">W${finalWeek}</strong> · ${current.length} teams</div></div>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="card-paper rounded-lg p-4"><h3 class="font-bold mb-1">Team strength over time</h3><p class="text-xs text-muted mb-2">Full-season best-ball value of the roster held at each cutoff.</p>${evolutionChart(data.points, 'strengthPoints', 'strength')}</section>
        <section class="card-paper rounded-lg p-4"><h3 class="font-bold mb-1">Standings movement</h3><p class="text-xs text-muted mb-2">${data.projected ? 'Projected all-play rank' : 'Actual all-play rank'} at each cutoff; lower rank is better.</p>${evolutionChart(data.points, 'standingsRank', 'standings')}</section>
      </div>
      <section class="card-paper rounded-lg p-4"><h3 class="text-xl font-bold tracking-tighter">Weekly move reports</h3><p class="text-sm text-muted mt-1 mb-3">A move is judged by the roster’s rest-of-season best-ball change, not by raw player points alone.</p><div class="grid gap-3 md:grid-cols-2">${weeklyMoveReports(decisions) || '<p class="text-sm text-muted">No settled transactions.</p>'}</div></section>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="card-paper rounded-lg overflow-x-auto"><div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Risers</h3><p class="text-xs text-muted">Latest rank changes from the prior snapshot.</p></div><table class="w-min min-w-full text-sm"><thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">GM</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Δ rank</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Snapshot</th></tr></thead><tbody>${evolutionRankRows(current, true) || '<tr><td class="px-3 py-3 text-muted" colspan="3">No risers yet.</td></tr>'}</tbody></table></section>
        <section class="card-paper rounded-lg overflow-x-auto"><div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Fallers</h3><p class="text-xs text-muted">Latest rank changes from the prior snapshot.</p></div><table class="w-min min-w-full text-sm"><thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">GM</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Δ rank</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Snapshot</th></tr></thead><tbody>${evolutionRankRows(current, false) || '<tr><td class="px-3 py-3 text-muted" colspan="3">No fallers yet.</td></tr>'}</tbody></table></section>
      </div>
      <section class="card-paper rounded-lg overflow-x-auto"><div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Decision tracks</h3><p class="text-xs text-muted">Draft surplus and in-season transaction delta are separate. Neither is a claim about historical information available at the time.</p></div><table class="w-min min-w-full text-sm"><thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Rank</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">GM</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Draft value</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Transaction value</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Counterfactual all-play</th></tr></thead><tbody>${trackRows}</tbody></table></section>
      <section class="card-paper rounded-lg overflow-x-auto"><div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Transaction decision leaderboard</h3><p class="text-xs text-muted">Player FPTS are the raw opportunity-cost context. The best-ball column measures the roster’s marginal rest-of-season output; negative means the move left fewer points available to the lineup, not that a player scored negative points.</p></div><table class="w-min min-w-full text-sm"><thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Week</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">GM</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Players</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Player FPTS</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Lineup impact</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Depth</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Read</th></tr></thead><tbody>${decisionRows || '<tr><td class="px-3 py-3 text-muted" colspan="7">No settled transactions.</td></tr>'}</tbody></table><details class="m-4 rounded border border-black/10 p-3"><summary class="cursor-pointer text-sm font-bold">Raw transaction calculations</summary><pre class="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap text-[10px] text-muted">${rawDecisionData}</pre></details></section>
      <section class="card-paper rounded-lg p-5"><h3 class="text-xl font-bold tracking-tighter">How this view works</h3><div class="grid gap-3 md:grid-cols-2 mt-3 text-sm text-muted"><p><strong class="text-black">Snapshot:</strong> Week 0 is the draft roster. For week N, settled transactions through N are replayed first, then that roster is evaluated against the whole league room.</p><p><strong class="text-black">Strength:</strong> The roster is scored across the full season using best-ball lineups. ${data.projected ? 'The source is current blended projections.' : 'The source is retrospective actual player scoring.'}</p><p><strong class="text-black">Projected all-play:</strong> Every snapshot is a counterfactual: what record would this exact roster have produced against the league room over the source weeks?</p><p><strong class="text-black">Choice bonus / double negative:</strong> A choice bonus marks a positive add that another manager dropped in the same transaction. A double negative marks dropped-player points exceeding added-player points. Values are signals, not causal proof.</p></div></section>`
              }
            )()
          : '<section class="card-paper rounded-lg p-6"><h2 class="text-3xl font-bold">Evolution</h2><p class="text-sm text-muted mt-2">No league evolution data is available.</p></section>'
      }
    </main>
    <script>
      (function () {
        if (window.__lllEvolutionChartControls) return;
        window.__lllEvolutionChartControls = true;
        function toggleSeries(chart, seriesId) {
          var button = chart.querySelector('.evolution-series-toggle[data-evolution-series="' + seriesId + '"]');
          var group = chart.querySelector('g[data-evolution-series="' + seriesId + '"]');
          if (!button || !group) return;
          var visible = button.getAttribute('aria-pressed') === 'true';
          button.setAttribute('aria-pressed', String(!visible));
          button.classList.toggle('opacity-40', visible);
          group.style.display = visible ? 'none' : '';
        }
        function placeTip(point, tip) {
          var box = point.getBoundingClientRect();
          var x = box.left + 12;
          var y = box.top - 12;
          tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, x)) + 'px';
          tip.style.top = Math.max(8, y - tip.offsetHeight) + 'px';
        }
        function showTip(point) {
          var chart = point.closest('[data-evolution-chart-container]');
          var tip = chart && chart.querySelector('.evolution-tooltip');
          if (!tip) return;
          tip.textContent = point.getAttribute('data-tooltip') || '';
          tip.classList.remove('hidden');
          placeTip(point, tip);
        }
        function hideTip(point) {
          var chart = point && point.closest('[data-evolution-chart-container]');
          var tip = chart && chart.querySelector('.evolution-tooltip');
          if (tip) tip.classList.add('hidden');
        }
        document.addEventListener('click', function (event) {
          var target = event.target;
          var button = target && target.closest && target.closest('.evolution-series-toggle');
          var point = target && target.closest && target.closest('[data-evolution-point]');
          if (button) {
            var buttonChart = button.closest('[data-evolution-chart-container]');
            if (buttonChart) toggleSeries(buttonChart, button.getAttribute('data-evolution-series'));
          } else if (point) {
            var pointChart = point.closest('[data-evolution-chart-container]');
            if (pointChart) toggleSeries(pointChart, point.getAttribute('data-evolution-series-id'));
          }
        });
        document.addEventListener('pointerover', function (event) {
          var point = event.target.closest && event.target.closest('[data-evolution-point]');
          if (point) showTip(point);
        });
        document.addEventListener('pointermove', function (event) {
          var point = event.target.closest && event.target.closest('[data-evolution-point]');
          if (point) {
            var chart = point.closest('[data-evolution-chart-container]');
            var tip = chart && chart.querySelector('.evolution-tooltip');
            if (tip) placeTip(point, tip);
          }
        });
        document.addEventListener('pointerout', function (event) {
          var point = event.target.closest && event.target.closest('[data-evolution-point]');
          if (point && (!event.relatedTarget || !point.contains(event.relatedTarget))) hideTip(point);
        });
        document.addEventListener('focusin', function (event) {
          var point = event.target.closest && event.target.closest('[data-evolution-point]');
          if (point) showTip(point);
        });
        document.addEventListener('focusout', function (event) {
          var point = event.target.closest && event.target.closest('[data-evolution-point]');
          if (point) hideTip(point);
        });
      })();
    </script>`
  return fantasyLayout(body, 'Evolution — UCSB Legacy', clerkKey)
}

export function fantasyTimelinePage(
  data: FantasyTimelineData,
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const points = data.points
  const final = points.at(-1)
  const finalWeek = final?.week ?? 0
  const finalRoom = data.room
    .filter((point) => point.week === finalWeek)
    .sort((a, b) => a.strengthRank - b.strengthRank)
  const seasonLinks = seasons
    .map(
      (season) =>
        `<a href="/fantasy/manager/${encodeURIComponent(data.manager.slug)}/timeline?season=${season.season}" class="px-2 py-1 rounded text-[10px] font-bold ${season.season === data.season ? 'text-accent bg-black/5' : 'text-muted hover:text-black'}">${season.season}</a>`
    )
    .join('')
  const transactionRows = points
    .filter((point) => point.events.length > 0)
    .flatMap((point) =>
      point.events.map(
        (event) => `<tr class="border-t border-black/5">
          <td class="px-3 py-2"><a class="hover:text-accent" href="#snapshot-${point.week}">W${point.week}</a></td>
          <td class="px-3 py-2 ${event.kind === 'add' ? 'text-accent' : 'text-rose-300'}">${event.kind === 'add' ? 'Add' : 'Drop'}</td>
          <td class="px-3 py-2 font-semibold">${escapeHtml(event.playerName)}</td>
          <td class="px-3 py-2 text-muted">${escapeHtml(event.type)}${event.waiverBid == null ? '' : ` · $${event.waiverBid}`} · ${event.pointDelta >= 0 ? '+' : ''}${fmt(event.pointDelta, 0)} pts</td>
        </tr>`
      )
    )
    .join('')
  const roomRows = finalRoom
    .map(
      (point) => `<tr class="border-t border-black/5">
        <td class="px-3 py-2">${point.strengthRank}</td>
        <td class="px-3 py-2 font-bold"><a class="hover:text-accent" href="/fantasy/manager/${encodeURIComponent(point.slug)}/timeline?season=${data.season}">${escapeHtml(point.displayName)}</a></td>
        <td class="px-3 py-2">${fmt(point.strengthPoints, 0)}</td>
        <td class="px-3 py-2">${point.draftGrade} <span class="text-muted">${point.draftSurplus >= 0 ? '+' : ''}${fmt(point.draftSurplus, 0)}</span></td>
        <td class="px-3 py-2 ${timelineInsightClass(point.insight)}">${escapeHtml(point.insight)}</td>
      </tr>`
    )
    .join('')
  const snapshotRows = points
    .map(
      (point) => `<tr id="snapshot-${point.week}" class="border-t border-black/5">
        <td class="px-3 py-2 font-bold">${point.week === 0 ? 'Draft' : `W${point.week}`}</td>
        <td class="px-3 py-2">${fmt(point.strengthPoints, 0)}</td>
        <td class="px-3 py-2 ${point.strengthDelta >= 0 ? 'text-accent' : 'text-rose-300'}">${point.strengthDelta >= 0 ? '+' : ''}${fmt(point.strengthDelta, 0)}</td>
        <td class="px-3 py-2">${point.strengthRank}</td>
        <td class="px-3 py-2">${point.week === 0 ? '—' : fmt(point.performancePoints)}</td>
        <td class="px-3 py-2">${point.week === 0 ? '—' : fmt(point.cumulativePerformance)}</td>
        <td class="px-3 py-2">${point.performanceRank === 0 ? '—' : `${record(point.performanceWins, point.performanceLosses, point.performanceTies)} · #${point.performanceRank}`}</td>
        <td class="px-3 py-2">${point.week === 0 ? '—' : `${point.performanceChange >= 0 ? '+' : ''}${fmt(point.performanceChange)}`}</td>
        <td class="px-3 py-2 ${timelineInsightClass(point.insight)}">${escapeHtml(point.insight)}</td>
        <td class="px-3 py-2 text-muted">${point.events.length > 0 ? `${point.events.length} move${point.events.length === 1 ? '' : 's'}` : '—'}</td>
      </tr>`
    )
    .join('')
  const body = `
    ${nav('all', seasons, data.season)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="/fantasy/manager/${encodeURIComponent(data.manager.slug)}" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← ${escapeHtml(data.manager.displayName)}</a>
          <h2 class="text-4xl font-bold tracking-tighter mt-2">Team evolution</h2>
          <p class="text-sm text-muted">${data.season} · ${data.projected ? 'Projected strength from current blended projections' : 'Actual strength from retrospective actuals'} · snapshots after settled transactions</p>
        </div>
        <div class="flex gap-1 flex-wrap">
          <a href="/fantasy/manager/${encodeURIComponent(data.manager.slug)}/timeline?season=all" class="px-2 py-1 rounded text-[10px] font-bold text-muted hover:text-black">All seasons</a>
          ${seasonLinks}
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <a href="/fantasy/${data.season}/chat" class="card-paper rounded-lg px-4 py-3 text-sm font-bold hover:text-accent">Message board →</a>
        <div class="card-paper rounded-lg px-4 py-3 text-sm text-muted">Draft grade <strong class="text-black">${final?.draftGrade ?? '—'}</strong> · ${final && final.draftSurplus >= 0 ? '+' : ''}${fmt(final?.draftSurplus ?? 0, 0)} surplus</div>
        <div class="card-paper rounded-lg px-4 py-3 text-sm text-muted">Performance <strong class="text-black">${final && final.performanceRank > 0 ? record(final.performanceWins, final.performanceLosses, final.performanceTies) : '—'}</strong> · rank ${final?.performanceRank || '—'}</div>
        <div class="card-paper rounded-lg px-4 py-3 text-sm text-muted">Current strength <strong class="text-black">${fmt(final?.strengthPoints ?? 0, 0)}</strong> · rank ${final?.strengthRank ?? '—'}</div>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <section class="card-paper rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold">Roster strength</h3>
            <span class="text-[10px] uppercase tracking-widest text-muted">${data.projected ? 'proj' : 'actual'} · ${data.points[0]?.strengthBasis ?? ''}</span>
          </div>
          ${timelineChart(points, 'strengthPoints', '#3fe1a8')}
          <p class="text-xs text-muted">Best-ball strength of the roster held at each snapshot. Finished seasons use retrospective actuals; 2026 uses current projections.</p>
        </section>
        <section class="card-paper rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold">Performance accumulated</h3>
            <span class="text-[10px] uppercase tracking-widest text-muted">actual</span>
          </div>
          ${timelineChart(points, 'cumulativePerformance', '#7c6bff')}
          ${timelinePerformanceBars(points)}
          <p class="text-xs text-muted">Actual points scored through each week. Projected seasons remain at zero until games are played.</p>
        </section>
      </div>
      <section class="card-paper rounded-lg p-4">
        <h3 class="text-xl font-bold tracking-tighter mb-1">The two-axis read</h3>
        <p class="text-sm text-muted mb-3">Draft grade measures auction value. Strength rank measures the roster you actually assembled. They are intentionally shown separately.</p>
        <div class="rounded-lg bg-black/[0.03] p-4">
          <div class="text-2xl font-extrabold ${timelineInsightClass(final?.insight ?? '')}">${escapeHtml(final?.insight ?? 'No read yet')}</div>
          <p class="text-sm text-muted mt-1">At the latest snapshot: ${fmt(final?.strengthPoints ?? 0, 0)} strength points, rank ${final?.strengthRank ?? '—'}, and ${final && final.draftSurplus >= 0 ? '+' : ''}${fmt(final?.draftSurplus ?? 0, 0)} draft surplus.</p>
        </div>
      </section>
      <section class="card-paper rounded-lg overflow-x-auto">
        <div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Weekly snapshots</h3><p class="text-xs text-muted">Week 0 is the draft baseline. Moves apply before that week’s snapshot.</p></div>
        <table class="w-min min-w-full text-sm">
          <thead class="bg-black/[0.03]"><tr>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Snapshot</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Strength</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Δ base</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Rank</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Week FPTS</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Cumulative</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">All-play</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Δ/wk</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Read</th>
            <th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Moves</th>
          </tr></thead>
          <tbody>${snapshotRows}</tbody>
        </table>
      </section>
      <div class="grid gap-6 md:grid-cols-2">
        <section class="card-paper rounded-lg overflow-x-auto">
          <div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Room at W${finalWeek}</h3></div>
          <table class="w-min min-w-full text-sm">
            <thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Rank</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">GM</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Strength</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Grade</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Read</th></tr></thead>
            <tbody>${roomRows}</tbody>
          </table>
        </section>
        <section class="card-paper rounded-lg overflow-x-auto">
          <div class="p-4 pb-2"><h3 class="text-xl font-bold tracking-tighter">Transaction markers</h3></div>
          <table class="w-min min-w-full text-sm">
            <thead class="bg-black/[0.03]"><tr><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Week</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Action</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Player</th><th class="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-muted">Source</th></tr></thead>
            <tbody>${transactionRows || '<tr><td class="px-3 py-4 text-muted" colspan="4">No settled transactions.</td></tr>'}</tbody>
          </table>
        </section>
      </div>
    </main>`
  return fantasyLayout(body, `${data.manager.displayName} — Evolution`, clerkKey)
}

export function fantasyTimelineOverviewPage(
  data: FantasyTimelineData[],
  seasons: SeasonSummary[],
  clerkKey?: string
): string {
  const manager = data[0]?.manager
  const cards = data
    .slice()
    .sort((a, b) => b.season - a.season)
    .map((season) => {
      const final = season.points.at(-1)
      return `<a href="/fantasy/manager/${encodeURIComponent(season.manager.slug)}/timeline?season=${season.season}" class="card-paper rounded-lg p-5 hover:shadow-md transition-shadow block">
        <div class="flex items-start justify-between gap-3">
          <div><h3 class="text-xl font-bold">${season.season}</h3><p class="text-xs text-muted">${season.projected ? 'Current projections' : 'Retrospective actuals'}</p></div>
          <span class="text-accent font-bold">Open →</span>
        </div>
        <div class="grid grid-cols-3 gap-3 mt-5 text-[10px] uppercase tracking-widest text-muted">
          <div>Strength<span class="block text-black text-base normal-case tracking-normal font-bold">${fmt(final?.strengthPoints ?? 0, 0)}</span></div>
          <div>Rank<span class="block text-black text-base normal-case tracking-normal font-bold">${final?.strengthRank ?? '—'}</span></div>
          <div>Draft<span class="block text-black text-base normal-case tracking-normal font-bold">${final?.draftGrade ?? '—'}</span></div>
        </div>
        <p class="text-sm mt-4 ${timelineInsightClass(final?.insight ?? '')}">${escapeHtml(final?.insight ?? 'No read yet')}</p>
      </a>`
    })
    .join('')
  const body = `
    ${nav('all', seasons)}
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <a href="/fantasy/manager/${encodeURIComponent(manager?.slug ?? '')}" class="text-[10px] font-bold uppercase tracking-[0.3em] text-muted hover:text-accent">← ${escapeHtml(manager?.displayName ?? 'Manager')}</a>
      <div>
        <h2 class="text-4xl font-bold tracking-tighter mt-2">Evolution over all seasons</h2>
        <p class="text-sm text-muted">Each season keeps its own draft baseline, weekly roster replay, strength track, and performance track.</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">${cards || '<p class="text-muted">No timeline data.</p>'}</div>
    </main>`
  return fantasyLayout(body, `${manager?.displayName ?? 'Manager'} — Evolution`, clerkKey)
}
