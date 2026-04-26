// Desktop screens for LLL
const {
  TEAMS: D_TEAMS,
  EXPERTS: D_EXPERTS,
  PLAYERS: D_PLAYERS,
  EXPERT_GRADES: D_GRADES,
  TEAM_HISTORY: D_HIST,
  NEWS_FEED: D_FEED,
  EXPERT_HISTORY: D_EHIST,
} = window.LLL_DATA;

function DesktopShell({children, active, onNav, breadcrumbs}) {
  const navItems = [
    {id: 'dashboard', label: 'Dashboard'},
    {id: 'teams', label: 'Teams'},
    {id: 'players', label: 'Players'},
    {id: 'experts', label: 'Experts'},
    {id: 'drafts', label: 'Drafts'},
    {id: 'live', label: 'Live'},
  ];
  return (
    <div style={{display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100%', background: 'var(--paper)'}}>
      <aside
        style={{borderRight: '1px solid var(--rule)', padding: '20px 18px', display: 'flex', flexDirection: 'column'}}
      >
        <div className='mono' style={{fontSize: 11, letterSpacing: '0.22em', fontWeight: 700, marginBottom: 4}}>
          L · L · L
        </div>
        <div className='serif' style={{fontSize: 13, color: 'var(--ink-mute)', marginBottom: 28, fontStyle: 'italic'}}>
          Last Letter League
        </div>
        <nav style={{display: 'flex', flexDirection: 'column', gap: 2}}>
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => onNav?.(n.id)}
              style={{
                all: 'unset',
                padding: '7px 10px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: active === n.id ? 'var(--paper)' : 'var(--ink)',
                background: active === n.id ? 'var(--ink)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{marginTop: 'auto', paddingTop: 28, borderTop: '1px solid var(--rule-soft)'}}>
          <div className='eyebrow' style={{marginBottom: 8}}>
            Live now
          </div>
          <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', lineHeight: 1.5}}>
            <div>
              <span style={{color: 'var(--accent)'}}>●</span> 14 grade updates / hr
            </div>
            <div>Combine wk 2 · OTAs open</div>
            <div>Next sync: 04:12</div>
          </div>
        </div>
      </aside>
      <main style={{minWidth: 0}}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 28px',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <div
            className='mono'
            style={{fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-mute)'}}
          >
            {breadcrumbs || 'Dashboard'}
          </div>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input
              placeholder='Search players, teams, experts…'
              style={{
                background: 'var(--paper-2)',
                border: '1px solid var(--rule)',
                padding: '6px 10px',
                fontSize: 12,
                fontFamily: 'var(--sans)',
                color: 'var(--ink)',
                width: 280,
                outline: 'none',
              }}
            />
            <button style={{...chipBtnD, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)'}}>
              2026 Big Board
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

const chipBtnD = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '6px 11px',
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--ink)',
  borderRadius: 2,
  cursor: 'pointer',
};

// === Dashboard ===
function DesktopDashboard({onTeam}) {
  // Build LLL trajectory comparison series
  const series = ['DET', 'PHI', 'KC', 'NYJ'].map((tid, i) => {
    const t = D_TEAMS.find((x) => x.id === tid);
    return {
      id: tid,
      label: `${t.city} ${t.name}`,
      color: ['var(--accent)', 'var(--pos)', 'var(--ink)', 'var(--neg)'][i],
      values: D_HIST[tid].map((r) => r.lll),
      labels: D_HIST[tid].map((r) => r.year),
    };
  });

  return (
    <div style={{padding: '28px'}}>
      {/* Hero */}
      <div style={{display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, marginBottom: 28}}>
        <div>
          <div className='eyebrow' style={{marginBottom: 8}}>
            State of the league · April 26, 2026
          </div>
          <h1
            className='serif'
            style={{margin: 0, fontSize: 52, lineHeight: 1.0, fontWeight: 600, letterSpacing: '-0.02em'}}
          >
            Detroit is hitting on <span style={{color: 'var(--accent)'}}>4 of 5</span> first-rounders.
            <br />
            <span style={{color: 'var(--ink-mute)'}}>Mel Kipling — finally — agrees.</span>
          </h1>
          <div
            className='serif'
            style={{fontSize: 14, color: 'var(--ink-mute)', marginTop: 16, maxWidth: 640, lineHeight: 1.55}}
          >
            LLL re-grades every pick on the day it ages: combine times, camp reps, snap counts, retention, contracts.
            Below: how the league looks today, after seven cycles of evidence.
          </div>
        </div>

        <div style={{background: 'var(--paper-2)', padding: 18, border: '1px solid var(--rule)'}}>
          <SectionHead kicker='Index movers · 24h' title="Today's deltas" />
          {[
            {team: 'DET', name: 'Lions', delta: '+1.4', why: 'Hutchinson uncapped'},
            {team: 'PHI', name: 'Eagles', delta: '+0.8', why: '2024 R3 LB earns 1s'},
            {team: 'BAL', name: 'Ravens', delta: '+0.3', why: 'Rookie OL camp report'},
            {team: 'NYJ', name: 'Jets', delta: '−3.1', why: '2021 R1 waived'},
            {team: 'CAR', name: 'Panthers', delta: '−0.6', why: '2023 QB benched in OTA'},
          ].map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < 4 ? '1px solid var(--rule-soft)' : 'none',
              }}
            >
              <TeamMark team={row.team} size={22} />
              <div>
                <div className='serif' style={{fontSize: 13, fontWeight: 600}}>
                  {row.name}
                </div>
                <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                  {row.why}
                </div>
              </div>
              <div
                className='mono tnum'
                style={{fontSize: 14, fontWeight: 600, color: row.delta.includes('−') ? 'var(--neg)' : 'var(--pos)'}}
              >
                {row.delta}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Big chart */}
      <div style={{background: 'var(--paper-2)', padding: 24, border: '1px solid var(--rule)', marginBottom: 24}}>
        <SectionHead
          kicker='LLL team index · 2019 → 2025'
          title='The drafting gap'
          action={
            <div style={{display: 'flex', gap: 6}}>
              {series.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    border: '1px solid var(--rule-soft)',
                  }}
                >
                  <span style={{width: 8, height: 8, background: s.color, display: 'inline-block'}} />
                  <span className='mono' style={{fontSize: 10}}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          }
        />
        <LineChart series={series} w={920} h={260} yMin={40} yMax={100} highlight='DET' />
      </div>

      {/* Lower row */}
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
        <div style={{background: 'var(--paper-2)', padding: 20, border: '1px solid var(--rule)'}}>
          <SectionHead kicker='Best drafting teams · 7-yr avg' title='The League Leaderboard' />
          {[...D_TEAMS]
            .map((t) => ({
              ...t,
              avg: D_HIST[t.id]
                ? Math.round(D_HIST[t.id].reduce((a, h) => a + h.lll, 0) / D_HIST[t.id].length)
                : 50 + (t.id.charCodeAt(1) % 20),
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8)
            .map((t, i) => (
              <button
                key={t.id}
                onClick={() => onTeam?.(t.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '24px 30px 1fr 90px 40px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: i < 7 ? '1px solid var(--rule-soft)' : 'none',
                  width: '100%',
                }}
              >
                <div className='mono' style={{fontSize: 11, color: 'var(--ink-mute)'}}>
                  {i + 1}
                </div>
                <TeamMark team={t.id} size={26} />
                <div>
                  <div className='serif' style={{fontSize: 14, fontWeight: 600}}>
                    {t.city} {t.name}
                  </div>
                  <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                    {t.record} · 2025 season
                  </div>
                </div>
                <Sparkline
                  values={(D_HIST[t.id] || []).map((h) => h.lll)}
                  w={90}
                  h={24}
                  stroke={LLL_lllColor(t.avg)}
                  fill
                />
                <div
                  className='mono tnum'
                  style={{fontSize: 16, fontWeight: 600, textAlign: 'right', color: LLL_lllColor(t.avg)}}
                >
                  {t.avg}
                </div>
              </button>
            ))}
        </div>

        <div style={{background: 'var(--paper-2)', padding: 20, border: '1px solid var(--rule)'}}>
          <SectionHead kicker='Live wire · combine to camp' title='What just changed' />
          {D_FEED.slice(0, 5).map((item, i) => (
            <div key={item.id} style={{padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--rule-soft)' : 'none'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span
                  className='mono'
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    padding: '2px 6px',
                  }}
                >
                  {item.tag}
                </span>
                {item.team && <TeamMark team={item.team} size={16} />}
                <span className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginLeft: 'auto'}}>
                  {item.when} ago
                </span>
              </div>
              <div className='serif' style={{fontSize: 13, lineHeight: 1.3, fontWeight: 500}}>
                {item.headline}
              </div>
              <div
                className='mono'
                style={{fontSize: 10, color: item.delta.includes('-') ? 'var(--neg)' : 'var(--pos)', marginTop: 4}}
              >
                ↳ {item.delta}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// === Team detail ===
function DesktopTeam({teamId = 'DET', onPlayer}) {
  const team = D_TEAMS.find((t) => t.id === teamId);
  const hist = D_HIST[teamId] || [];
  const players = D_PLAYERS.filter((p) => p.team === teamId);
  const lllNow = hist[hist.length - 1]?.lll ?? 70;

  return (
    <div style={{padding: '28px'}}>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28, marginBottom: 24}}>
        <div>
          <div className='eyebrow' style={{marginBottom: 8}}>
            Team scorecard
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
            <TeamMark team={teamId} size={64} />
            <div>
              <h1
                className='serif'
                style={{margin: 0, fontSize: 48, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.02em'}}
              >
                {team.city} {team.name}
              </h1>
              <div className='mono' style={{fontSize: 11, color: 'var(--ink-mute)', marginTop: 6}}>
                2025 record {team.record} · 51 active draftees · GM Brad Holmes
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 18,
              marginTop: 24,
              padding: '16px 0',
              borderTop: '1px solid var(--rule)',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <Stat label='LLL Index' value={lllNow} sub='rank #2 of 32' color={LLL_lllColor(lllNow)} />
            <Stat
              label='Hits'
              value={hist.reduce((a, h) => a + h.hits, 0)}
              sub='career grade ≥ A−'
              color='var(--pos)'
            />
            <Stat label='Busts' value={hist.reduce((a, h) => a + h.busts, 0)} sub='cut ≤ 2 yrs' color='var(--neg)' />
            <Stat
              label='Retained'
              value={`${Math.round((players.filter((p) => p.retained).length / Math.max(1, players.length)) * 100)}%`}
              sub='stayed past rookie deal'
            />
            <Stat
              label='Value Over'
              value={`+${players.reduce((a, p) => a + p.value, 0)}`}
              sub='picks vs. expected'
              color='var(--pos)'
            />
          </div>
        </div>

        <div style={{background: 'var(--paper-2)', padding: 18, border: '1px solid var(--rule)'}}>
          <SectionHead kicker='LLL trajectory' title='2019 → 2025' />
          <Sparkline values={hist.map((h) => h.lll)} w={280} h={80} stroke='var(--accent)' dot fill />
          <div
            className='mono'
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: 'var(--ink-mute)',
              marginTop: 4,
            }}
          >
            {hist.map((h) => (
              <span key={h.year}>{String(h.year).slice(2)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Players grid */}
      <SectionHead
        kicker='Active draftees · sorted by LLL'
        title='The roster, scored'
        action={<button style={chipBtnD}>Add to compare</button>}
      />
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16}}>
        {[...players]
          .sort((a, b) => b.lll - a.lll)
          .map((p, i) => (
            <button
              key={p.id}
              onClick={() => onPlayer?.(p.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                background: 'var(--paper-2)',
                border: '1px solid var(--rule)',
                padding: 16,
              }}
            >
              <div
                style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12}}
              >
                <PlayerAvatar size={48} seed={i + 3} />
                <div
                  className='mono tnum'
                  style={{fontSize: 32, fontWeight: 600, lineHeight: 1, color: LLL_lllColor(p.lll)}}
                >
                  {p.lll}
                </div>
              </div>
              <div className='serif' style={{fontSize: 16, fontWeight: 600, lineHeight: 1.1}}>
                {p.name}
              </div>
              <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 4}}>
                {p.pos} · {p.year} R{p.round}.{p.pick} · {p.college}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--rule-soft)',
                }}
              >
                <div>
                  <div
                    className='mono'
                    style={{fontSize: 9, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em'}}
                  >
                    Fit
                  </div>
                  <div className='mono tnum' style={{fontSize: 14, fontWeight: 600}}>
                    {p.fit}
                  </div>
                </div>
                <div>
                  <div
                    className='mono'
                    style={{fontSize: 9, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em'}}
                  >
                    V/E
                  </div>
                  <div
                    className='mono tnum'
                    style={{fontSize: 14, fontWeight: 600, color: p.value >= 0 ? 'var(--pos)' : 'var(--neg)'}}
                  >
                    {p.value >= 0 ? '+' : ''}
                    {p.value}
                  </div>
                </div>
                <div>
                  <div
                    className='mono'
                    style={{fontSize: 9, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em'}}
                  >
                    Status
                  </div>
                  <div className='mono' style={{fontSize: 11, fontWeight: 600, textTransform: 'capitalize'}}>
                    {p.status}
                  </div>
                </div>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

// === Expert leaderboard (desktop) ===
function DesktopExperts({onExpert}) {
  return (
    <div style={{padding: '28px'}}>
      <div style={{marginBottom: 24}}>
        <div className='eyebrow' style={{marginBottom: 8}}>
          Expert ledger
        </div>
        <h1
          className='serif'
          style={{margin: 0, fontSize: 44, lineHeight: 1.0, fontWeight: 600, letterSpacing: '-0.02em'}}
        >
          Receipts. Across <span style={{color: 'var(--accent)'}}>18 cycles.</span>
        </h1>
        <div
          className='serif'
          style={{fontSize: 14, color: 'var(--ink-mute)', marginTop: 12, maxWidth: 720, lineHeight: 1.55}}
        >
          Every grade an analyst publishes is logged at time of pick, then scored against the player's LLL career grade.
          Below: who actually saw it coming.
        </div>
      </div>

      <div style={{background: 'var(--paper-2)', padding: 20, border: '1px solid var(--rule)', marginBottom: 24}}>
        <SectionHead kicker='Year-by-year accuracy · 2016 → 2025' title='The expert trajectory chart' />
        <LineChart
          series={D_EXPERTS.map((e, i) => ({
            id: e.id,
            label: e.name,
            values: D_EHIST[e.id],
            color: i === 2 ? 'var(--accent)' : i === 4 ? 'var(--neg)' : 'var(--ink-mute)',
            labels: ['16', '17', '18', '19', '20', '21', '22', '23', '24', '25'],
          }))}
          w={920}
          h={240}
          yMin={50}
          yMax={90}
          highlight='db'
        />
      </div>

      <SectionHead kicker='Cumulative accuracy · all-time' title='The leaderboard' />
      <div style={{background: 'var(--paper-2)', border: '1px solid var(--rule)'}}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 50px 2fr 1fr 90px 1fr 80px',
            gap: 14,
            padding: '10px 16px',
            borderBottom: '1px solid var(--rule)',
          }}
          className='eyebrow'
        >
          <div>#</div>
          <div></div>
          <div>Analyst</div>
          <div>Outlet</div>
          <div>10y trend</div>
          <div>Volume</div>
          <div style={{textAlign: 'right'}}>Accuracy</div>
        </div>
        {[...D_EXPERTS]
          .sort((a, b) => b.accuracy - a.accuracy)
          .map((e, i) => (
            <button
              key={e.id}
              onClick={() => onExpert?.(e.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '40px 50px 2fr 1fr 90px 1fr 80px',
                gap: 14,
                padding: '12px 16px',
                borderBottom: '1px solid var(--rule-soft)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div className='mono tnum' style={{fontSize: 12, color: 'var(--ink-mute)'}}>
                {i + 1}
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: 'var(--paper-3)',
                  border: '1px solid var(--rule)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {e.avatar}
              </div>
              <div>
                <div className='serif' style={{fontSize: 15, fontWeight: 600}}>
                  {e.name}
                </div>
                <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                  {e.years} years covering · debut 200{8 + ((22 - e.years) % 10)}
                </div>
              </div>
              <div className='mono' style={{fontSize: 11}}>
                {e.outlet}
              </div>
              <Sparkline
                values={D_EHIST[e.id]}
                w={90}
                h={28}
                stroke={e.trend === 'up' ? 'var(--pos)' : e.trend === 'down' ? 'var(--neg)' : 'var(--ink-mute)'}
                fill
              />
              <div>
                <div className='mono tnum' style={{fontSize: 13}}>
                  {e.calls.toLocaleString()}
                </div>
                <div className='mono' style={{fontSize: 9, color: 'var(--ink-mute)'}}>
                  graded calls
                </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div className='mono tnum' style={{fontSize: 22, fontWeight: 600}}>
                  {e.accuracy.toFixed(1)}
                </div>
                <div className='mono' style={{fontSize: 9, color: 'var(--ink-mute)'}}>
                  <Trend dir={e.trend} /> 10y
                </div>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

Object.assign(window, {DesktopShell, DesktopDashboard, DesktopTeam, DesktopExperts});
