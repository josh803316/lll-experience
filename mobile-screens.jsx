// Mobile screens for LLL — designed to live inside <IOSFrame>
// Each screen is a function component returning a <div> with .lll class on the parent.

const {
  TEAMS: M_TEAMS,
  EXPERTS: M_EXPERTS,
  PLAYERS: M_PLAYERS,
  EXPERT_GRADES: M_GRADES,
  TEAM_HISTORY: M_HIST,
  NEWS_FEED: M_FEED,
  EXPERT_HISTORY: M_EHIST,
} = window.LLL_DATA;

// === Mobile chrome: tab bar + top bar ===
function MobileTopBar({title, kicker, right, leadingDot = false}) {
  return (
    <div style={{padding: '8px 16px 10px', borderBottom: '1px solid var(--rule)'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          {leadingDot && (
            <span
              style={{width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', display: 'inline-block'}}
            />
          )}
          <div
            className='mono'
            style={{fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink)'}}
          >
            L · L · L
          </div>
        </div>
        {right}
      </div>
      {kicker && (
        <div className='eyebrow' style={{marginTop: 12}}>
          {kicker}
        </div>
      )}
      {title && (
        <h1
          className='serif'
          style={{margin: '2px 0 0', fontSize: 28, lineHeight: 1.05, fontWeight: 600, letterSpacing: '-0.02em'}}
        >
          {title}
        </h1>
      )}
    </div>
  );
}

function MobileTabBar({active, onChange}) {
  const tabs = [
    {id: 'team', label: 'Teams'},
    {id: 'player', label: 'Players'},
    {id: 'expert', label: 'Experts'},
    {id: 'recap', label: 'Drafts'},
    {id: 'feed', label: 'Live'},
  ];
  return (
    <div
      style={{
        borderTop: '1px solid var(--rule)',
        background: 'var(--paper)',
        paddingTop: 6,
        paddingBottom: 22, // home indicator clearance
        display: 'flex',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 0,
            padding: '8px 0 6px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            className='mono'
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: active === t.id ? 'var(--ink)' : 'var(--ink-mute)',
              fontWeight: active === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </span>
          <span
            style={{
              width: 18,
              height: 2,
              background: active === t.id ? 'var(--accent)' : 'transparent',
            }}
          />
        </button>
      ))}
    </div>
  );
}

// =================================================================
// SCREEN: Team scorecard (Lions)
// =================================================================
function MobileTeamScorecard({teamId = 'DET', onPlayer}) {
  const team = M_TEAMS.find((t) => t.id === teamId);
  const hist = M_HIST[teamId] || [];
  const players = M_PLAYERS.filter((p) => p.team === teamId);
  const lllNow = hist[hist.length - 1]?.lll ?? 70;
  const lllPrev = hist[hist.length - 2]?.lll ?? 70;
  const delta = lllNow - lllPrev;
  const sortedPlayers = [...players].sort((a, b) => b.year - a.year || a.pick - b.pick).slice(0, 6);

  return (
    <>
      <MobileTopBar
        kicker='Team scorecard · 2019 → 2025'
        title={`${team.city} ${team.name}`}
        right={<button style={chipBtn}>Compare</button>}
      />

      {/* Hero block */}
      <div style={{padding: '16px', borderBottom: '1px solid var(--rule)'}}>
        <div style={{display: 'grid', gridTemplateColumns: '88px 1fr', gap: 16, alignItems: 'center'}}>
          <div>
            <div className='eyebrow'>LLL Index</div>
            <div
              className='mono tnum'
              style={{fontSize: 56, lineHeight: 0.95, fontWeight: 600, color: LLL_lllColor(lllNow)}}
            >
              {lllNow}
            </div>
            <div className='mono' style={{fontSize: 11, color: delta >= 0 ? 'var(--pos)' : 'var(--neg)', marginTop: 4}}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} YoY
            </div>
          </div>
          <div>
            <Sparkline values={hist.map((h) => h.lll)} w={180} h={56} stroke={LLL_lllColor(lllNow)} dot fill />
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
              <span>{hist[0]?.year}</span>
              <span>{hist[hist.length - 1]?.year}</span>
            </div>
          </div>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18}}>
          <Stat label='Hits' value={hist.reduce((a, h) => a + h.hits, 0)} sub='career-grade A/A−' color='var(--pos)' />
          <Stat label='Busts' value={hist.reduce((a, h) => a + h.busts, 0)} sub='cut/traded ≤2yr' color='var(--neg)' />
          <Stat label='Picks' value={hist.reduce((a, h) => a + h.picks, 0)} sub='across 7 cycles' />
        </div>
      </div>

      {/* LLL vs experts */}
      <div style={{padding: '14px 16px', borderBottom: '1px solid var(--rule)'}}>
        <SectionHead kicker='LLL vs expert consensus' title='The gap, year by year' />
        <div>
          {hist.map((h) => {
            const diff = h.lll - h.expertAvg;
            return (
              <div
                key={h.year}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '38px 1fr 44px',
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px dotted var(--rule-soft)',
                }}
              >
                <div className='mono' style={{fontSize: 12, color: 'var(--ink-mute)'}}>
                  {h.year}
                </div>
                <div style={{position: 'relative', height: 14}}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'var(--rule-soft)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: diff >= 0 ? '50%' : `${50 + (diff / 30) * 50}%`,
                      width: `${(Math.abs(diff) / 30) * 50}%`,
                      height: 8,
                      top: 3,
                      background: diff >= 0 ? 'var(--pos)' : 'var(--neg)',
                      opacity: 0.85,
                    }}
                  />
                </div>
                <div
                  className='mono tnum'
                  style={{fontSize: 12, textAlign: 'right', color: diff >= 0 ? 'var(--pos)' : 'var(--neg)'}}
                >
                  {diff >= 0 ? '+' : ''}
                  {diff}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent picks list */}
      <div style={{padding: '14px 16px 18px'}}>
        <SectionHead
          kicker='Roster from the draft'
          title='Recent picks'
          action={<button style={chipBtn}>All 36 →</button>}
        />
        {sortedPlayers.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onPlayer?.(p.id)}
            style={{
              all: 'unset',
              display: 'grid',
              gridTemplateColumns: '40px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < sortedPlayers.length - 1 ? '1px solid var(--rule-soft)' : 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <PlayerAvatar size={40} seed={i} />
            <div style={{minWidth: 0}}>
              <div className='serif' style={{fontSize: 15, fontWeight: 600, lineHeight: 1.1}}>
                {p.name}
              </div>
              <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 3}}>
                {p.pos} · R{p.round}.{p.pick} · {p.year} · {p.college}
              </div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div
                className='mono tnum'
                style={{fontSize: 18, fontWeight: 600, color: LLL_lllColor(p.lll), lineHeight: 1}}
              >
                {p.lll}
              </div>
              <div
                className='mono'
                style={{fontSize: 9, color: p.value >= 0 ? 'var(--pos)' : 'var(--neg)', marginTop: 2}}
              >
                V/E {p.value >= 0 ? '+' : ''}
                {p.value}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// =================================================================
// SCREEN: Player profile
// =================================================================
function MobilePlayerProfile({playerId = 'p10', onBack}) {
  const p = M_PLAYERS.find((x) => x.id === playerId) || M_PLAYERS[0];
  const grades = M_GRADES[p.id] || {};
  const team = M_TEAMS.find((t) => t.id === p.team);

  // synthetic per-season trajectory
  const seasons = Math.min(2025 - p.year + 1, 5);
  const traj = Array.from({length: seasons}, (_, i) => {
    const base = Math.max(40, p.lll - 18);
    return Math.round(base + (p.lll - base) * (i / Math.max(1, seasons - 1)) + Math.sin(i + p.id.length) * 4);
  });

  return (
    <>
      <MobileTopBar
        kicker={`${team.city} ${team.name} · ${p.year} R${p.round}.${p.pick}`}
        title={p.name}
        right={
          <button style={chipBtn} onClick={onBack}>
            ← Team
          </button>
        }
      />

      {/* Hero */}
      <div style={{padding: '16px', borderBottom: '1px solid var(--rule)'}}>
        <div style={{display: 'grid', gridTemplateColumns: '88px 1fr', gap: 14, alignItems: 'center'}}>
          <div style={{position: 'relative'}}>
            <PlayerAvatar size={88} seed={7} />
            <div style={{position: 'absolute', bottom: -4, right: -4}}>
              <TeamMark team={p.team} size={26} />
            </div>
          </div>
          <div>
            <div className='eyebrow'>LLL Career Grade</div>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
              <span
                className='mono tnum'
                style={{fontSize: 56, fontWeight: 600, lineHeight: 0.95, color: LLL_lllColor(p.lll)}}
              >
                {p.lll}
              </span>
              <span className='mono' style={{fontSize: 11, color: 'var(--ink-mute)'}}>
                /100
              </span>
            </div>
            <div className='mono' style={{fontSize: 11, color: 'var(--ink-mute)', marginTop: 3}}>
              {p.pos} · age {p.age} · {p.college}
            </div>
          </div>
        </div>

        {/* component breakdown */}
        <div style={{marginTop: 16, display: 'grid', gap: 8}}>
          {[
            {label: 'On-field performance', v: p.lll, max: 100},
            {label: 'Scheme fit', v: p.fit, max: 100},
            {label: 'Availability', v: Math.min(100, 60 + (p.lll - 50) * 0.7), max: 100},
            {label: 'Cap value vs. cost', v: Math.min(100, 50 + p.value * 0.8 + 20), max: 100},
          ].map((row, i) => (
            <div
              key={i}
              style={{display: 'grid', gridTemplateColumns: '120px 1fr 28px', gap: 10, alignItems: 'center'}}
            >
              <div
                className='mono'
                style={{fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em'}}
              >
                {row.label}
              </div>
              <Bar value={row.v} max={row.max} color={LLL_lllColor(row.v)} height={5} />
              <div className='mono tnum' style={{fontSize: 11, textAlign: 'right'}}>
                {Math.round(row.v)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Career arc */}
      <div style={{padding: '14px 16px', borderBottom: '1px solid var(--rule)'}}>
        <SectionHead kicker='Career arc' title='LLL grade by season' />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${traj.length}, 1fr)`,
            gap: 8,
            alignItems: 'end',
            height: 96,
          }}
        >
          {traj.map((v, i) => (
            <div
              key={i}
              style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%'}}
            >
              <div className='mono tnum' style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                {v}
              </div>
              <div
                style={{
                  width: '70%',
                  flex: 1,
                  background: LLL_lllColor(v),
                  opacity: 0.4 + (v / 100) * 0.6,
                  height: `${v}%`,
                  alignSelf: 'flex-end',
                }}
              />
              <div className='mono' style={{fontSize: 9, color: 'var(--ink-mute)'}}>
                {p.year + i}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expert grades */}
      <div style={{padding: '14px 16px 18px'}}>
        <SectionHead kicker='What the experts said in' title={`Pre-draft grades · ${p.year}`} />
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
          {Object.entries(grades).map(([eid, g]) => {
            const ex = M_EXPERTS.find((e) => e.id === eid);
            const truth = p.lll >= 75 ? 'A' : p.lll >= 60 ? 'B' : p.lll >= 45 ? 'C' : 'D';
            const diff = g.charAt(0).charCodeAt(0) - truth.charCodeAt(0);
            return (
              <div
                key={eid}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: 'var(--paper-2)',
                }}
              >
                <div style={{minWidth: 0}}>
                  <div
                    className='mono'
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ex.name}
                  </div>
                  <div className='mono' style={{fontSize: 9, color: 'var(--ink-mute)'}}>
                    {ex.outlet}
                  </div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                  <GradeChip letter={g} />
                  <span
                    className='mono'
                    style={{
                      fontSize: 9,
                      color: diff === 0 ? 'var(--ink-mute)' : diff > 0 ? 'var(--pos)' : 'var(--neg)',
                    }}
                  >
                    {diff === 0 ? '=' : diff > 0 ? `+${diff}` : diff}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// =================================================================
// SCREEN: Expert leaderboard
// =================================================================
function MobileExpertBoard({onExpert}) {
  const [sort, setSort] = useState('accuracy');
  const sorted = useMemo(() => {
    const list = [...M_EXPERTS];
    if (sort === 'accuracy') list.sort((a, b) => b.accuracy - a.accuracy);
    if (sort === 'years') list.sort((a, b) => b.years - a.years);
    if (sort === 'calls') list.sort((a, b) => b.calls - a.calls);
    return list;
  }, [sort]);

  return (
    <>
      <MobileTopBar
        kicker='Cumulative since 2008'
        title="Who's been right?"
        right={<button style={chipBtn}>Filter</button>}
      />

      {/* Sort tabs */}
      <div style={{display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--rule)'}}>
        {[
          ['accuracy', 'Accuracy'],
          ['years', 'Tenure'],
          ['calls', 'Volume'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSort(id)}
            style={{
              ...chipBtn,
              background: sort === id ? 'var(--ink)' : 'transparent',
              color: sort === id ? 'var(--paper)' : 'var(--ink)',
              borderColor: 'var(--ink)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{padding: '4px 16px 18px'}}>
        {sorted.map((e, i) => (
          <button
            key={e.id}
            onClick={() => onExpert?.(e.id)}
            style={{
              all: 'unset',
              display: 'grid',
              gridTemplateColumns: '24px 36px 1fr 80px 56px',
              gap: 10,
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid var(--rule-soft)',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <div className='mono tnum' style={{fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center'}}>
              {i + 1}
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                background: 'var(--paper-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid var(--rule)',
              }}
            >
              {e.avatar}
            </div>
            <div style={{minWidth: 0}}>
              <div className='serif' style={{fontSize: 14, fontWeight: 600, lineHeight: 1.1}}>
                {e.name}
              </div>
              <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 2}}>
                {e.outlet} · {e.years}y · {e.calls.toLocaleString()} calls
              </div>
            </div>
            <Sparkline
              values={M_EHIST[e.id]}
              w={80}
              h={26}
              stroke={e.trend === 'up' ? 'var(--pos)' : e.trend === 'down' ? 'var(--neg)' : 'var(--ink-mute)'}
              fill
            />
            <div style={{textAlign: 'right'}}>
              <div className='mono tnum' style={{fontSize: 18, fontWeight: 600}}>
                {e.accuracy.toFixed(1)}
              </div>
              <div className='mono' style={{fontSize: 9, color: 'var(--ink-mute)'}}>
                <Trend dir={e.trend} /> 10y
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// =================================================================
// SCREEN: Year-by-year recap
// =================================================================
function MobileRecap({year = 2023, onYear}) {
  const [y, setY] = useState(year);
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const teamScores = M_TEAMS.map((t) => {
    const h = (M_HIST[t.id] || []).find((r) => r.year === y);
    return {team: t, lll: h?.lll ?? 50 + Math.round(t.id.charCodeAt(0) % 30)};
  }).sort((a, b) => b.lll - a.lll);

  return (
    <>
      <MobileTopBar
        kicker={`Draft class of ${y}`}
        title={`${y} re-rank`}
        right={<button style={chipBtn}>Mock vs Real</button>}
      />

      {/* Year scrubber */}
      <div style={{padding: '12px 0', borderBottom: '1px solid var(--rule)', overflowX: 'auto'}}>
        <div style={{display: 'inline-flex', gap: 6, padding: '0 16px'}}>
          {years.map((yr) => (
            <button
              key={yr}
              onClick={() => setY(yr)}
              style={{
                ...chipBtn,
                background: yr === y ? 'var(--accent)' : 'transparent',
                color: yr === y ? '#fff' : 'var(--ink)',
                borderColor: yr === y ? 'var(--accent)' : 'var(--ink)',
                minWidth: 56,
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Top 5 picks redrafted */}
      <div style={{padding: '14px 16px', borderBottom: '1px solid var(--rule)'}}>
        <SectionHead kicker='Hindsight is 20/20' title='Top 5 in LLL re-rank' />
        {[
          {rank: 1, name: 'Sauce Gardner', pos: 'CB', team: 'NYJ', actualPick: 4},
          {rank: 2, name: 'Aidan Hutchinson', pos: 'EDGE', team: 'DET', actualPick: 2},
          {rank: 3, name: 'Tariq Woolen', pos: 'CB', team: 'SEA', actualPick: 153},
          {rank: 4, name: 'Brock Purdy', pos: 'QB', team: 'SF', actualPick: 262},
          {rank: 5, name: 'Brian Robinson Jr.', pos: 'RB', team: 'WAS', actualPick: 98},
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 60px',
              gap: 10,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: i < 4 ? '1px solid var(--rule-soft)' : 'none',
            }}
          >
            <div className='serif' style={{fontSize: 22, fontWeight: 600, lineHeight: 1, color: 'var(--accent)'}}>
              {row.rank}
            </div>
            <div>
              <div className='serif' style={{fontSize: 14, fontWeight: 600}}>
                {row.name}
              </div>
              <div className='mono' style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 2}}>
                {row.pos} · went #{row.actualPick}
              </div>
            </div>
            <div style={{textAlign: 'right'}}>
              <TeamMark team={row.team === 'SEA' || row.team === 'WAS' ? 'KC' : row.team} size={22} />
              <div
                className='mono'
                style={{fontSize: 9, color: row.actualPick > 50 ? 'var(--pos)' : 'var(--ink-mute)', marginTop: 2}}
              >
                {row.actualPick > 50 ? `+${row.actualPick - row.rank} steal` : `−${row.rank - row.actualPick}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Team class ranking */}
      <div style={{padding: '14px 16px 18px'}}>
        <SectionHead kicker={`${y} draft class`} title='Best team haul' />
        {teamScores.slice(0, 6).map((row, i) => (
          <div
            key={row.team.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 28px 1fr 40px',
              gap: 10,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: i < 5 ? '1px solid var(--rule-soft)' : 'none',
            }}
          >
            <div className='mono' style={{fontSize: 11, color: 'var(--ink-mute)'}}>
              {i + 1}
            </div>
            <TeamMark team={row.team.id} size={26} />
            <div>
              <div className='serif' style={{fontSize: 13, fontWeight: 600}}>
                {row.team.city} {row.team.name}
              </div>
              <div style={{marginTop: 4}}>
                <Bar value={row.lll} color={LLL_lllColor(row.lll)} height={4} />
              </div>
            </div>
            <div
              className='mono tnum'
              style={{fontSize: 14, fontWeight: 600, textAlign: 'right', color: LLL_lllColor(row.lll)}}
            >
              {row.lll}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// =================================================================
// SCREEN: Live news feed
// =================================================================
function MobileLiveFeed() {
  return (
    <>
      <MobileTopBar
        leadingDot
        kicker='Live · auto-updating'
        title='Combine to camp'
        right={<button style={chipBtn}>Filter</button>}
      />

      <div style={{padding: '8px 0 18px'}}>
        {M_FEED.map((item, i) => (
          <article key={item.id} style={{padding: '14px 16px', borderBottom: '1px solid var(--rule-soft)'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <span
                  className='mono'
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    padding: '2px 6px',
                  }}
                >
                  {item.tag}
                </span>
                {item.team && <TeamMark team={item.team} size={18} />}
              </div>
              <span className='mono' style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                {item.when} ago
              </span>
            </div>
            <div className='serif' style={{fontSize: 15, lineHeight: 1.25, fontWeight: 500, marginBottom: 6}}>
              {item.headline}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <span
                className='mono'
                style={{
                  fontSize: 10,
                  color: item.delta.includes('-') ? 'var(--neg)' : 'var(--pos)',
                  fontWeight: 600,
                }}
              >
                ↳ {item.delta}
              </span>
              <button style={{...chipBtn, marginLeft: 'auto'}}>Open thread</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

// === Shared chip button ===
const chipBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '5px 9px',
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--ink)',
  borderRadius: 2,
  cursor: 'pointer',
};

Object.assign(window, {
  MobileTabBar,
  MobileTeamScorecard,
  MobilePlayerProfile,
  MobileExpertBoard,
  MobileRecap,
  MobileLiveFeed,
});
