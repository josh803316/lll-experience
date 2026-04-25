import {baseLayout, escapeHtml, draftTopBar} from './templates.js';
import {getFirstRoundTeams} from '../config/draft-data.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReactionGroup {
  emoji: string;
  count: number;
  names: string[];
  currentUserReacted: boolean;
}

export interface ChatMessageDisplay {
  id: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  content: string;
  createdAt: string; // ISO string
  isOwn: boolean;
  reactions: ReactionGroup[];
}

export interface ChatGroupDisplay {
  id: number;
  name: string;
  isDefault: boolean;
  memberCount: number;
}

export interface TickerPick {
  pickNumber: number; // overall pick number
  round: number;
  pickInRound: number; // pick within the round
  teamName: string;
  playerName: string | null;
  position: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function displayName(first: string | null, last: string | null): string {
  const parts = [first, last].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Anonymous';
}

function shortName(first: string | null, last: string | null): string {
  if (first && last) {
    return `${first} ${last.charAt(0)}.`;
  }
  return first || last || 'Anon';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function initials(first: string | null, last: string | null): string {
  const f = first?.charAt(0)?.toUpperCase() || '';
  const l = last?.charAt(0)?.toUpperCase() || '';
  return f + l || '?';
}

// ─── Quick reaction emojis ───────────────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '😂', '🔥', '❤️', '😱', '💯'];

// ─── Reactions display below a message ───────────────────────────────────────

export function messageReactionsFragment(messageId: number, reactions: ReactionGroup[], year: number): string {
  if (reactions.length === 0) {
    return `<div id="reactions-${messageId}" class="msg-reactions"></div>`;
  }

  const pills = reactions
    .map((r) => {
      const activeClass = r.currentUserReacted
        ? 'bg-blue-900/40 border-blue-500/50'
        : 'bg-slate-800 border-slate-600 hover:border-slate-500';
      const tooltip = r.names.join(', ');
      return `<button type="button"
        class="react-btn inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs transition-colors ${activeClass}"
        data-msg-id="${messageId}" data-emoji="${r.emoji}"
        title="${escapeHtml(tooltip)}">
        <span>${r.emoji}</span><span class="text-slate-400">${r.count}</span>
      </button>`;
    })
    .join('');

  return `<div id="reactions-${messageId}" class="msg-reactions flex flex-wrap gap-1 mt-1">${pills}</div>`;
}

function inlineReactions(m: ChatMessageDisplay): string {
  if (m.reactions.length === 0) {
    return `<div id="reactions-${m.id}" class="msg-reactions"></div>`;
  }
  // Use 0 for year since inline reactions don't need a year for the toggle endpoint
  return messageReactionsFragment(m.id, m.reactions, 0);
}

// ─── Single message bubble ───────────────────────────────────────────────────

export function chatSingleMessageFragment(m: ChatMessageDisplay): string {
  const time = formatTime(m.createdAt);
  const name = shortName(m.firstName, m.lastName);
  const ini = initials(m.firstName, m.lastName);

  const reactionBar = `<div class="react-bar hidden absolute ${m.isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-0 z-10">
    <div class="flex gap-0.5 bg-slate-900 border border-slate-600 rounded-full px-1.5 py-1 shadow-lg">
      ${QUICK_REACTIONS.map((e) => `<button type="button" class="react-quick w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-700 text-sm transition-colors" data-msg-id="${m.id}" data-emoji="${e}">${e}</button>`).join('')}
    </div>
  </div>`;

  if (m.isOwn) {
    return `
    <div class="flex justify-end gap-2 mb-2" data-msg-ts="${escapeHtml(m.createdAt)}" data-msg-id="${m.id}">
      <div class="max-w-[75%] sm:max-w-[65%]">
        <div class="relative msg-bubble group">
          ${reactionBar}
          <div class="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 shadow-sm">
            <p class="text-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</p>
          </div>
        </div>
        ${inlineReactions(m)}
        <p class="text-[10px] text-slate-500 text-right mt-0.5 pr-1">${time}</p>
      </div>
    </div>`;
  }

  return `
  <div class="flex gap-2 mb-2" data-msg-ts="${escapeHtml(m.createdAt)}" data-msg-id="${m.id}">
    <div class="shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-white mt-1">${ini}</div>
    <div class="max-w-[75%] sm:max-w-[65%]">
      <p class="text-[11px] text-slate-400 mb-0.5 pl-1 font-medium">${escapeHtml(name)}</p>
      <div class="relative msg-bubble group">
        ${reactionBar}
        <div class="bg-slate-700 text-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2 shadow-sm">
          <p class="text-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</p>
        </div>
      </div>
      ${inlineReactions(m)}
      <p class="text-[10px] text-slate-500 mt-0.5 pl-1">${time}</p>
    </div>
  </div>`;
}

// ─── Messages fragment (polling endpoint returns this) ───────────────────────

export function chatMessagesFragment(messages: ChatMessageDisplay[]): string {
  return messages.map((m) => chatSingleMessageFragment(m)).join('');
}

// ─── NFL team metadata ───────────────────────────────────────────────────────

interface TeamMeta {
  abbr: string;
  primary: string; // bg color
  secondary: string; // text/accent color
  espnId: string; // ESPN team ID for logo URL
}

const NFL_TEAMS: Record<string, TeamMeta> = {
  'Arizona Cardinals': {abbr: 'ARI', primary: '#97233F', secondary: '#FFB612', espnId: '22'},
  'Atlanta Falcons': {abbr: 'ATL', primary: '#A71930', secondary: '#000000', espnId: '1'},
  'Baltimore Ravens': {abbr: 'BAL', primary: '#241773', secondary: '#9E7C0C', espnId: '33'},
  'Buffalo Bills': {abbr: 'BUF', primary: '#00338D', secondary: '#C60C30', espnId: '2'},
  'Carolina Panthers': {abbr: 'CAR', primary: '#0085CA', secondary: '#101820', espnId: '29'},
  'Chicago Bears': {abbr: 'CHI', primary: '#0B162A', secondary: '#C83803', espnId: '3'},
  'Cincinnati Bengals': {abbr: 'CIN', primary: '#FB4F14', secondary: '#000000', espnId: '4'},
  'Cleveland Browns': {abbr: 'CLE', primary: '#311D00', secondary: '#FF3C00', espnId: '5'},
  'Dallas Cowboys': {abbr: 'DAL', primary: '#003594', secondary: '#869397', espnId: '6'},
  'Denver Broncos': {abbr: 'DEN', primary: '#FB4F14', secondary: '#002244', espnId: '7'},
  'Detroit Lions': {abbr: 'DET', primary: '#0076B6', secondary: '#B0B7BC', espnId: '8'},
  'Green Bay Packers': {abbr: 'GB', primary: '#203731', secondary: '#FFB612', espnId: '9'},
  'Houston Texans': {abbr: 'HOU', primary: '#03202F', secondary: '#A71930', espnId: '34'},
  'Indianapolis Colts': {abbr: 'IND', primary: '#002C5F', secondary: '#A2AAAD', espnId: '11'},
  'Jacksonville Jaguars': {abbr: 'JAX', primary: '#006778', secondary: '#D7A22A', espnId: '30'},
  'Kansas City Chiefs': {abbr: 'KC', primary: '#E31837', secondary: '#FFB81C', espnId: '12'},
  'Las Vegas Raiders': {abbr: 'LV', primary: '#000000', secondary: '#A5ACAF', espnId: '13'},
  'Los Angeles Chargers': {abbr: 'LAC', primary: '#0080C6', secondary: '#FFC20E', espnId: '24'},
  'Los Angeles Rams': {abbr: 'LAR', primary: '#003594', secondary: '#FFA300', espnId: '14'},
  'Miami Dolphins': {abbr: 'MIA', primary: '#008E97', secondary: '#FC4C02', espnId: '15'},
  'Minnesota Vikings': {abbr: 'MIN', primary: '#4F2683', secondary: '#FFC62F', espnId: '16'},
  'New England Patriots': {abbr: 'NE', primary: '#002244', secondary: '#C60C30', espnId: '17'},
  'New Orleans Saints': {abbr: 'NO', primary: '#D3BC8D', secondary: '#101820', espnId: '18'},
  'New York Giants': {abbr: 'NYG', primary: '#0B2265', secondary: '#A71930', espnId: '19'},
  'New York Jets': {abbr: 'NYJ', primary: '#125740', secondary: '#FFFFFF', espnId: '20'},
  'Philadelphia Eagles': {abbr: 'PHI', primary: '#004C54', secondary: '#A5ACAF', espnId: '21'},
  'Pittsburgh Steelers': {abbr: 'PIT', primary: '#FFB612', secondary: '#101820', espnId: '23'},
  'San Francisco 49ers': {abbr: 'SF', primary: '#AA0000', secondary: '#B3995D', espnId: '25'},
  'Seattle Seahawks': {abbr: 'SEA', primary: '#002244', secondary: '#69BE28', espnId: '26'},
  'Tampa Bay Buccaneers': {abbr: 'TB', primary: '#D50A0A', secondary: '#FF7900', espnId: '27'},
  'Tennessee Titans': {abbr: 'TEN', primary: '#0C2340', secondary: '#4B92DB', espnId: '10'},
  'Washington Commanders': {abbr: 'WSH', primary: '#5A1414', secondary: '#FFB612', espnId: '28'},
};

function getTeamMeta(teamName: string): TeamMeta {
  return (
    NFL_TEAMS[teamName] ?? {
      abbr: teamName.slice(0, 3).toUpperCase(),
      primary: '#374151',
      secondary: '#9CA3AF',
      espnId: '',
    }
  );
}

function teamLogoUrl(espnId: string): string {
  if (!espnId) {
    return '';
  }
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${espnId}.png&h=40&w=40`;
}

// ─── Ticker fragment (ESPN-style horizontal scroll) ─────────────────────────

export function chatTickerFragment(picks: TickerPick[], isLive = false, activeRound = 1): string {
  // Group picks by round
  const rounds = new Map<number, TickerPick[]>();
  for (const p of picks) {
    if (!rounds.has(p.round)) {rounds.set(p.round, []);}
    rounds.get(p.round).push(p);
  }
  const roundNumbers = Array.from(rounds.keys()).sort((a, b) => a - b);
  if (roundNumbers.length === 0) {roundNumbers.push(1);}

  // Show current round's picks
  const currentPicks = rounds.get(activeRound) ?? [];
  const onTheClockIdx = currentPicks.findIndex((p) => !p.playerName);
  const completedInRound = currentPicks.filter((p) => p.playerName).length;
  const totalInRound = currentPicks.length;
  const totalCompleted = picks.filter((p) => p.playerName).length;

  function teamLogo(team: TeamMeta, size: 'sm' | 'lg'): string {
    const dim = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
    const url = teamLogoUrl(team.espnId);
    if (url) {
      return `<img src="${url}" alt="${team.abbr}" class="${dim} shrink-0 object-contain" loading="lazy" />`;
    }
    const textSize = size === 'lg' ? 'text-xs' : 'text-[10px]';
    return `<div class="${dim} ${textSize} rounded-full flex items-center justify-center font-extrabold shrink-0 border border-white/20" style="background:${team.primary};color:${team.secondary}">${team.abbr}</div>`;
  }

  const cards = currentPicks
    .map((p, i) => {
      const tm = getTeamMeta(p.teamName);
      const isComplete = !!p.playerName;
      const isOnClock = i === onTheClockIdx;
      const ovrLabel = `Rd ${p.round}, Pick ${p.pickInRound} (${p.pickNumber} OVR)`;

      if (isOnClock) {
        return `
        <div class="ticker-card shrink-0 w-36 rounded-lg px-3 py-2.5 border-2 border-amber-400 shadow-lg shadow-amber-900/40 relative overflow-hidden" data-pick="${p.pickNumber}" style="background:linear-gradient(135deg, ${tm.primary}ee, ${tm.primary}bb)">
          <div class="absolute top-0 right-0 bg-amber-500 text-[9px] font-bold text-white px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">On The Clock</div>
          <div class="flex items-center gap-2 mt-2.5">
            ${teamLogo(tm, 'lg')}
            <div class="min-w-0">
              <div class="text-white text-xs font-bold truncate">${escapeHtml(p.teamName)}</div>
              <div class="text-[10px] text-white/60">${ovrLabel}</div>
            </div>
          </div>
        </div>`;
      }

      if (isComplete) {
        return `
        <div class="ticker-card shrink-0 w-36 rounded-lg px-3 py-2 border border-slate-600 relative" data-pick="${p.pickNumber}" style="background:linear-gradient(135deg, ${tm.primary}40, ${tm.primary}15)">
          <div class="flex items-center gap-2">
            ${teamLogo(tm, 'sm')}
            <div class="min-w-0 flex-1">
              <div class="text-white text-[11px] font-bold truncate">${escapeHtml(p.playerName ?? '')}</div>
              <div class="text-[10px] text-slate-400 truncate">${escapeHtml(p.teamName)}${p.position ? ` · <span class="text-slate-300">${escapeHtml(p.position)}</span>` : ''}</div>
            </div>
          </div>
          <div class="text-[9px] text-slate-500 mt-1">${ovrLabel}</div>
        </div>`;
      }

      // Future pick
      return `
      <div class="ticker-card shrink-0 w-36 rounded-lg px-3 py-2 border border-slate-700/50 bg-slate-800/40" data-pick="${p.pickNumber}">
        <div class="flex items-center gap-2">
          ${teamLogo(tm, 'sm')}
          <div class="min-w-0">
            <div class="text-slate-400 text-[11px] font-medium truncate">${escapeHtml(p.teamName)}</div>
            <div class="text-[10px] text-slate-600">${ovrLabel}</div>
          </div>
        </div>
      </div>`;
    })
    .join('');

  // Round tabs
  const roundTabs = roundNumbers
    .map((r) => {
      const roundPicks = rounds.get(r) ?? [];
      const done = roundPicks.filter((p) => p.playerName).length;
      const isActive = r === activeRound;
      const cls = isActive
        ? 'bg-slate-600 text-white'
        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white';
      // Round tabs use JS to switch (avoid full page reload) by updating the ticker via HTMX
      return `<button type="button" class="ticker-round-tab px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${cls}" data-round="${r}">R${r}${done > 0 ? ` <span class="text-slate-500">${done}</span>` : ''}</button>`;
    })
    .join('');

  const liveIndicator = isLive
    ? `<span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span></span>
       <span class="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Live</span>`
    : '';

  return `
  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
    ${liveIndicator}
    <div class="flex gap-1">${roundTabs}</div>
    <span class="text-[10px] text-slate-500 ml-auto">${completedInRound}/${totalInRound} picks · ${totalCompleted} total</span>
  </div>
  <div class="relative">
    <button type="button" class="ticker-scroll-left absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900/90 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-lg" style="display:none;">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
    </button>
    <div class="ticker-scroll flex gap-2 overflow-x-auto px-1 py-1" style="scrollbar-width:none;-ms-overflow-style:none;">
      ${cards}
    </div>
    <button type="button" class="ticker-scroll-right absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-900/90 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-lg">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>`;
}

// ─── Group selector bar ──────────────────────────────────────────────────────

export function chatGroupBar(groups: ChatGroupDisplay[], activeGroupId: number, year: number): string {
  const pills = groups
    .map((g) => {
      const isActive = g.id === activeGroupId;
      const cls = isActive
        ? 'bg-slate-600 text-white'
        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white';
      return `<a href="/draft/${year}/chat?groupId=${g.id}" class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${cls}">${escapeHtml(g.name)}${g.memberCount > 0 ? ` <span class="text-slate-500">${g.memberCount}</span>` : ''}</a>`;
    })
    .join('');

  return `
  <div class="flex items-center gap-2 overflow-x-auto pb-1">
    ${pills}
    <button type="button" id="create-group-btn" class="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white text-sm font-bold transition-colors" title="Create new group">+</button>
  </div>
  <!-- Inline create-group form (hidden by default) -->
  <form id="create-group-form" class="hidden mt-2 flex gap-2"
        hx-post="/draft/${year}/chat/groups"
        hx-target="body"
        hx-swap="none">
    <input name="name" type="text" placeholder="Group name..." maxlength="50"
           class="flex-1 bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600" autocomplete="off" required />
    <button type="submit" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">Create</button>
    <button type="button" id="create-group-cancel" class="px-2 py-1.5 text-slate-400 hover:text-white text-xs transition-colors">Cancel</button>
  </form>`;
}

// ─── Invite form fragment ────────────────────────────────────────────────────

export function chatInviteSection(groupId: number, year: number, isDefault: boolean): string {
  if (isDefault) {
    return '';
  }
  return `
  <div class="mt-2">
    <button type="button" id="invite-toggle-btn" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Invite someone</button>
    <form id="invite-form" class="hidden mt-1.5 flex gap-2"
          hx-post="/draft/${year}/chat/groups/${groupId}/invite"
          hx-target="#invite-status"
          hx-swap="innerHTML">
      <input name="email" type="email" placeholder="Email address..."
             class="flex-1 bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600" autocomplete="off" required />
      <button type="submit" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">Invite</button>
    </form>
    <div id="invite-status" class="mt-1 text-xs"></div>
  </div>`;
}

// ─── Emoji panel ─────────────────────────────────────────────────────────────

const EMOJI_CATEGORIES: Array<{label: string; emojis: string[]}> = [
  {
    label: 'Football',
    emojis: ['🏈', '🏆', '🥇', '🥈', '🥉', '🎯', '💪', '🔥', '⭐', '🏟️', '🎉', '🎊', '📈', '📉', '💯', '🏅'],
  },
  {
    label: 'Reactions',
    emojis: ['😂', '🤣', '😭', '😱', '🤯', '😤', '🙄', '😎', '🤔', '😬', '🫣', '🤦', '👀', '💀', '🤡', '😈'],
  },
  {
    label: 'Hands',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✊', '👊', '🤙', '✌️', '🫡', '🖐️', '👋', '🤞', '🫶', '💅', '🤷'],
  },
  {
    label: 'People',
    emojis: ['🧠', '👑', '🐐', '🦅', '🐻', '🦁', '🐬', '🐴', '🐏', '🐆', '🦬', '🐦', '🐯', '🦈', '⚡', '🌪️'],
  },
];

function emojiPanelHtml(): string {
  const cats = EMOJI_CATEGORIES.map(
    (cat) => `
    <div class="mb-2">
      <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1 px-1">${cat.label}</p>
      <div class="grid grid-cols-8 gap-0.5">${cat.emojis.map((e) => `<button type="button" class="emoji-pick w-8 h-8 flex items-center justify-center rounded hover:bg-slate-600 text-lg transition-colors cursor-pointer" data-emoji="${e}">${e}</button>`).join('')}</div>
    </div>`,
  ).join('');

  return `
  <div id="emoji-panel" class="hidden absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 w-72 max-h-64 overflow-y-auto">
    ${cats}
  </div>`;
}

// ─── Full chat page ──────────────────────────────────────────────────────────

export function chatPage(
  messages: ChatMessageDisplay[],
  groups: ChatGroupDisplay[],
  activeGroupId: number,
  activeGroup: {id: number; name: string; isDefault: boolean},
  ticker: {picks: TickerPick[]; draftLive: boolean; mockActive: boolean; currentRound: number},
  year: number,
  currentUserId: number,
  clerkPublishableKey?: string,
  isAdmin = false,
): string {
  const isLive = ticker.draftLive || ticker.mockActive;
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  const messagesHtml =
    messages.length > 0
      ? messages.map((m) => chatSingleMessageFragment(m)).join('')
      : `<div id="chat-empty" class="flex flex-col items-center justify-center py-12 text-slate-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0m-12.375 0c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9a8.96 8.96 0 01-4.998-1.516L3.75 20.25l1.766-4.248A8.96 8.96 0 013.75 12z" /></svg>
          <p class="text-sm font-medium">No messages yet</p>
          <p class="text-xs mt-1">Start the conversation!</p>
        </div>`;

  const content = `
  <style>
    .msg-bubble:hover .react-bar,
    .msg-bubble .react-bar.active { display: block !important; }
    .ticker-scroll::-webkit-scrollbar { display: none; }
  </style>
  <div class="min-h-screen bg-slate-800 text-gray-100 flex flex-col">
    ${draftTopBar(year, 'chat', isAdmin)}
    <div class="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 pt-3 pb-4 overflow-hidden" style="height: calc(100dvh - 57px)">

      <!-- Group selector -->
      <div class="shrink-0 mb-2">
        ${chatGroupBar(groups, activeGroupId, year)}
        ${chatInviteSection(activeGroup.id, year, activeGroup.isDefault)}
      </div>

      <!-- Draft ticker — polls every 10s when live, 30s otherwise -->
      <div id="chat-ticker" class="shrink-0 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 mb-3"
           hx-get="/draft/${year}/chat/ticker"
           hx-trigger="every ${isLive ? '10' : '30'}s"
           hx-swap="innerHTML">
        ${chatTickerFragment(ticker.picks, isLive, ticker.currentRound)}
      </div>

      <!-- Messages area -->
      <div id="chat-messages-scroll" class="flex-1 overflow-y-auto min-h-0 px-1 py-2">
        <div id="chat-messages">
          ${messagesHtml}
        </div>
        <!-- Polling sentinel -->
        <div id="chat-poll"
             hx-get="/draft/${year}/chat/messages?groupId=${activeGroupId}&afterId=${lastId}"
             hx-trigger="every 4s"
             hx-target="#chat-messages"
             hx-swap="beforeend">
        </div>
      </div>

      <!-- Input area -->
      <div class="shrink-0 border-t border-slate-700 pt-3 mt-1">
        <form id="chat-send-form"
              hx-post="/draft/${year}/chat/send"
              hx-target="#chat-messages"
              hx-swap="beforeend">
          <input type="hidden" name="groupId" value="${activeGroupId}">
          <div class="flex items-end gap-2">
            <div class="relative">
              ${emojiPanelHtml()}
              <button type="button" id="emoji-btn" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-xl transition-colors" title="Emoji">😀</button>
            </div>
            <input name="content" id="chat-input" type="text" placeholder="Type a message..."
                   class="flex-1 bg-slate-700 text-white rounded-full px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 border border-slate-600"
                   autocomplete="off" maxlength="1000" />
            <button type="submit" id="chat-send-btn" class="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors" title="Send">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/></svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
  (function() {
    // ─── Scroll management ───
    var scrollEl = document.getElementById('chat-messages-scroll');
    function isNearBottom() {
      if (!scrollEl) return true;
      return scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 60;
    }
    function scrollToBottom() {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }
    // Initial scroll
    scrollToBottom();

    // ─── Ticker scroll buttons + auto-scroll to "On The Clock" ───
    function initTickerScroll() {
      var ticker = document.querySelector('.ticker-scroll');
      var leftBtn = document.querySelector('.ticker-scroll-left');
      var rightBtn = document.querySelector('.ticker-scroll-right');
      if (!ticker) return;

      function updateArrows() {
        if (leftBtn) leftBtn.style.display = ticker.scrollLeft > 10 ? '' : 'none';
        if (rightBtn) rightBtn.style.display = ticker.scrollLeft < ticker.scrollWidth - ticker.clientWidth - 10 ? '' : 'none';
      }

      if (leftBtn) leftBtn.addEventListener('click', function() {
        ticker.scrollBy({left: -240, behavior: 'smooth'});
      });
      if (rightBtn) rightBtn.addEventListener('click', function() {
        ticker.scrollBy({left: 240, behavior: 'smooth'});
      });

      ticker.addEventListener('scroll', updateArrows, {passive: true});

      // Auto-scroll to "On The Clock" card (has border-amber-400)
      var onClock = ticker.querySelector('.border-amber-400');
      if (onClock) {
        var offset = onClock.offsetLeft - ticker.offsetLeft - 40;
        ticker.scrollLeft = Math.max(0, offset);
      }
      setTimeout(updateArrows, 50);
    }
    initTickerScroll();

    // Re-init ticker after HTMX poll replaces it
    document.body.addEventListener('htmx:afterSettle', function(e) {
      if (e.detail.target && e.detail.target.id === 'chat-ticker') {
        initTickerScroll();
      }
    });

    // Round tab switching — re-fetch ticker for the selected round
    document.addEventListener('click', function(e) {
      var tab = e.target.closest('.ticker-round-tab');
      if (!tab) return;
      var round = tab.getAttribute('data-round');
      if (!round) return;
      var tickerEl = document.getElementById('chat-ticker');
      if (!tickerEl) return;
      // Update the polling URL to include the round param
      var baseUrl = tickerEl.getAttribute('hx-get').split('?')[0];
      tickerEl.setAttribute('hx-get', baseUrl + '?round=' + round);
      htmx.process(tickerEl);
      htmx.trigger(tickerEl, 'htmx:trigger');
    });

    // ─── Dedup + update polling cursor + auto-scroll ───
    function updatePollCursor() {
      var container = document.getElementById('chat-messages');
      if (!container) return;
      var msgs = container.querySelectorAll('[data-msg-id]');
      if (msgs.length === 0) return;
      var latestId = msgs[msgs.length - 1].getAttribute('data-msg-id');
      var poll = document.getElementById('chat-poll');
      if (poll && latestId) {
        var base = poll.getAttribute('hx-get').split('?')[0];
        var params = new URLSearchParams(poll.getAttribute('hx-get').split('?')[1] || '');
        params.set('afterId', latestId);
        poll.setAttribute('hx-get', base + '?' + params.toString());
        htmx.process(poll);
      }
    }

    // Before HTMX swaps in new content, remove duplicates
    document.body.addEventListener('htmx:beforeSwap', function(e) {
      var target = e.detail.target;
      if (!target || target.id !== 'chat-messages') return;
      // Parse incoming HTML and strip messages already in the DOM
      var tmp = document.createElement('div');
      tmp.innerHTML = e.detail.serverResponse;
      var incoming = tmp.querySelectorAll('[data-msg-id]');
      for (var i = 0; i < incoming.length; i++) {
        var id = incoming[i].getAttribute('data-msg-id');
        if (target.querySelector('[data-msg-id="' + id + '"]')) {
          incoming[i].remove();
        }
      }
      e.detail.serverResponse = tmp.innerHTML;
    });

    document.body.addEventListener('htmx:afterSettle', function(e) {
      var target = e.detail.target;
      if (!target || target.id !== 'chat-messages') return;

      // Remove empty placeholder if messages arrived
      var empty = document.getElementById('chat-empty');
      if (empty && target.children.length > 1) empty.remove();

      // Update polling cursor to latest message ID
      updatePollCursor();

      // Auto-scroll if near bottom
      if (isNearBottom()) {
        setTimeout(scrollToBottom, 50);
      }
    });

    // ─── Send form: clear input + scroll after send ───
    var form = document.getElementById('chat-send-form');
    var input = document.getElementById('chat-input');
    if (form) {
      // htmx:afterRequest fires on the requesting element (the form),
      // unlike afterSettle which fires on the target (#chat-messages)
      form.addEventListener('htmx:afterRequest', function(e) {
        if (input) input.value = '';
        updatePollCursor();
        setTimeout(scrollToBottom, 100);
      });
      // Submit on Enter or Send button
      if (input) {
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.value.trim()) {
              htmx.trigger(form, 'submit');
            }
          }
        });
      }
    }

    // ─── Emoji panel ───
    var emojiBtn = document.getElementById('emoji-btn');
    var emojiPanel = document.getElementById('emoji-panel');
    if (emojiBtn && emojiPanel) {
      emojiBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        emojiPanel.classList.toggle('hidden');
      });
      emojiPanel.addEventListener('click', function(e) {
        var pick = e.target.closest('.emoji-pick');
        if (!pick) return;
        var emoji = pick.getAttribute('data-emoji');
        if (input && emoji) {
          var start = input.selectionStart || input.value.length;
          input.value = input.value.slice(0, start) + emoji + input.value.slice(input.selectionEnd || start);
          input.focus();
          input.selectionStart = input.selectionEnd = start + emoji.length;
        }
        emojiPanel.classList.add('hidden');
      });
      document.addEventListener('click', function(e) {
        if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
          emojiPanel.classList.add('hidden');
        }
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') emojiPanel.classList.add('hidden');
      });
    }

    // ─── Create group toggle ───
    var createBtn = document.getElementById('create-group-btn');
    var createForm = document.getElementById('create-group-form');
    var cancelBtn = document.getElementById('create-group-cancel');
    if (createBtn && createForm) {
      createBtn.addEventListener('click', function() {
        createForm.classList.toggle('hidden');
        var nameInput = createForm.querySelector('input[name="name"]');
        if (nameInput && !createForm.classList.contains('hidden')) nameInput.focus();
      });
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          createForm.classList.add('hidden');
        });
      }
    }

    // ─── Invite toggle ───
    var inviteToggle = document.getElementById('invite-toggle-btn');
    var inviteForm = document.getElementById('invite-form');
    if (inviteToggle && inviteForm) {
      inviteToggle.addEventListener('click', function() {
        inviteForm.classList.toggle('hidden');
        var emailInput = inviteForm.querySelector('input[name="email"]');
        if (emailInput && !inviteForm.classList.contains('hidden')) emailInput.focus();
      });
    }

    // ─── Reactions: quick bar + existing reaction pills ───
    var DRAFT_YEAR = ${year};
    document.addEventListener('click', function(e) {
      var quickBtn = e.target.closest('.react-quick');
      var reactBtn = e.target.closest('.react-btn');
      var btn = quickBtn || reactBtn;
      if (!btn) return;

      var msgId = btn.getAttribute('data-msg-id');
      var emoji = btn.getAttribute('data-emoji');
      if (!msgId || !emoji) return;

      // POST to toggle reaction
      var token = window.__clerkToken;
      fetch('/draft/' + DRAFT_YEAR + '/chat/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': token ? 'Bearer ' + token : ''
        },
        body: 'messageId=' + encodeURIComponent(msgId) + '&emoji=' + encodeURIComponent(emoji)
      })
      .then(function(res) { return res.text(); })
      .then(function(html) {
        var target = document.getElementById('reactions-' + msgId);
        if (target) {
          target.outerHTML = html;
        }
      });
    });

    // Mobile: tap to show reaction bar (since no hover)
    document.addEventListener('touchstart', function(e) {
      var bubble = e.target.closest('.msg-bubble');
      // Close all other open reaction bars
      document.querySelectorAll('.react-bar.active').forEach(function(bar) {
        if (!bubble || !bubble.contains(bar)) bar.classList.remove('active');
      });
      if (bubble) {
        var bar = bubble.querySelector('.react-bar');
        if (bar) bar.classList.toggle('active');
      }
    }, {passive: true});

    // ─── Clerk auth token for HTMX ───
    // Already handled by the global htmx:configRequest listener in baseLayout
  })();
  </script>`;

  return baseLayout(content, `Chat — NFL Draft ${year}`, clerkPublishableKey);
}
