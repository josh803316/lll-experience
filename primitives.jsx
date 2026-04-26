// Shared primitives for LLL screens
// All components are pure functions. Style via className using tokens.css.

const {useMemo, useState, useEffect, useRef} = React;

// === Color helpers ===
function gradeColor(letter) {
  const head = (letter || '').charAt(0).toUpperCase();
  return (
    {A: 'var(--grade-a)', B: 'var(--grade-b)', C: 'var(--grade-c)', D: 'var(--grade-d)', F: 'var(--grade-f)'}[head] ||
    'var(--ink-mute)'
  );
}
function lllColor(score) {
  if (score >= 85) return 'var(--grade-a)';
  if (score >= 75) return 'var(--grade-b)';
  if (score >= 65) return 'var(--grade-c)';
  if (score >= 50) return 'var(--grade-d)';
  return 'var(--grade-f)';
}

// === Sparkline ===
function Sparkline({values, w = 64, h = 18, stroke = 'var(--ink)', dot = false, fill = false}) {
  if (!values?.length) return null;
  const min = Math.min(...values),
    max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 2) - 1]);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg className='spark' width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={area} fill={stroke} fillOpacity='0.12' />}
      <path d={d} fill='none' stroke={stroke} strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' />
      {dot && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r='2' fill={stroke} />}
    </svg>
  );
}

// === Bar row ===
function Bar({value, max = 100, color = 'var(--ink)', height = 4}) {
  return (
    <div style={{background: 'var(--rule-soft)', height, borderRadius: 1}}>
      <div
        style={{width: `${Math.min(100, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: 1}}
      />
    </div>
  );
}

// === Letter grade chip ===
function GradeChip({letter, size = 'sm'}) {
  const sizeClass = size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '';
  return (
    <span className={`grade ${sizeClass}`} style={{color: gradeColor(letter)}}>
      {letter}
    </span>
  );
}

// === Team mark — solid square with abbreviation ===
function TeamMark({team, size = 28}) {
  const t = window.LLL_DATA.TEAMS.find((x) => x.id === team) || {id: team, primary: '#222', secondary: '#fff'};
  return (
    <div
      className='mono'
      style={{
        width: size,
        height: size,
        background: t.primary,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: '0.02em',
        borderRadius: 2,
      }}
    >
      {t.id}
    </div>
  );
}

// === Player headshot placeholder — striped silhouette ===
function PlayerAvatar({size = 40, seed = 0}) {
  const stripeId = `s${seed}`;
  return (
    <svg width={size} height={size} viewBox='0 0 40 40' style={{display: 'block'}}>
      <defs>
        <pattern id={stripeId} width='4' height='4' patternUnits='userSpaceOnUse' patternTransform='rotate(35)'>
          <rect width='4' height='4' fill='var(--paper-2)' />
          <rect width='2' height='4' fill='var(--paper-3)' />
        </pattern>
      </defs>
      <rect width='40' height='40' fill={`url(#${stripeId})`} />
      <circle cx='20' cy='15' r='6' fill='var(--ink-faint)' opacity='0.35' />
      <path d='M 8 36 C 10 26, 30 26, 32 36 Z' fill='var(--ink-faint)' opacity='0.35' />
    </svg>
  );
}

// === Trend arrow ===
function Trend({dir}) {
  if (dir === 'up') return <span style={{color: 'var(--pos)'}}>▲</span>;
  if (dir === 'down') return <span style={{color: 'var(--neg)'}}>▼</span>;
  return <span style={{color: 'var(--ink-mute)'}}>▬</span>;
}

// === Stat line ===
function Stat({label, value, sub, color}) {
  return (
    <div>
      <div className='eyebrow' style={{marginBottom: 4}}>
        {label}
      </div>
      <div className='mono tnum' style={{fontSize: 22, lineHeight: 1, color: color || 'var(--ink)', fontWeight: 600}}>
        {value}
      </div>
      {sub && (
        <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 3}}>
          {sub}
        </div>
      )}
    </div>
  );
}

// === Multi-line chart (for desktop) ===
function LineChart({series, w = 600, h = 220, yMin = 0, yMax = 100, showAxes = true, highlight = null}) {
  const padL = 36,
    padR = 12,
    padT = 12,
    padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const N = series[0]?.values.length || 0;
  const sx = (i) => padL + (innerW * i) / Math.max(1, N - 1);
  const sy = (v) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block'}}>
      {showAxes &&
        yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke='var(--rule-soft)' strokeWidth='1' />
            <text
              x={padL - 6}
              y={sy(t) + 3}
              fontSize='10'
              textAnchor='end'
              fill='var(--ink-mute)'
              fontFamily='var(--mono)'
            >
              {t}
            </text>
          </g>
        ))}
      {series.map((s, si) => {
        const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
        const dim = highlight && highlight !== s.id;
        return (
          <g key={s.id} opacity={dim ? 0.18 : 1}>
            <path
              d={d}
              fill='none'
              stroke={s.color}
              strokeWidth={s.id === highlight ? 2.4 : 1.4}
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={sx(i)} cy={sy(v)} r={s.id === highlight ? 2.5 : 0} fill={s.color} />
            ))}
          </g>
        );
      })}
      {showAxes && s_xLabels(series, sx, h, padB)}
    </svg>
  );
}
function s_xLabels(series, sx, h, padB) {
  const N = series[0]?.values.length || 0;
  const labels = series[0]?.labels || Array.from({length: N}, (_, i) => i + 1);
  return labels.map((l, i) => (
    <text
      key={i}
      x={sx(i)}
      y={h - padB + 14}
      fontSize='10'
      textAnchor='middle'
      fill='var(--ink-mute)'
      fontFamily='var(--mono)'
    >
      {l}
    </text>
  ));
}

// === Section header ===
function SectionHead({kicker, title, action}) {
  return (
    <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10}}>
      <div>
        {kicker && (
          <div className='eyebrow' style={{marginBottom: 2}}>
            {kicker}
          </div>
        )}
        <h3 className='serif' style={{margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em'}}>
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}

// Expose globally
Object.assign(window, {
  LLL_gradeColor: gradeColor,
  LLL_lllColor: lllColor,
  Sparkline,
  Bar,
  GradeChip,
  TeamMark,
  PlayerAvatar,
  Trend,
  Stat,
  LineChart,
  SectionHead,
});
