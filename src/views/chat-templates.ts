import {baseLayout, escapeHtml, draftTopBar} from './templates.js';
import {getFirstRoundTeams} from '../config/draft-data.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessageDisplay {
  id: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  content: string;
  createdAt: string; // ISO string
  isOwn: boolean;
}

export interface ChatGroupDisplay {
  id: number;
  name: string;
  isDefault: boolean;
  memberCount: number;
}

export interface TickerPick {
  pickNumber: number;
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
  if (first && last) {return `${first} ${last.charAt(0)}.`;}
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

// ─── Single message bubble ───────────────────────────────────────────────────

export function chatSingleMessageFragment(m: ChatMessageDisplay): string {
  const time = formatTime(m.createdAt);
  const name = shortName(m.firstName, m.lastName);
  const ini = initials(m.firstName, m.lastName);

  if (m.isOwn) {
    return `
    <div class="flex justify-end gap-2 mb-2" data-msg-ts="${escapeHtml(m.createdAt)}" data-msg-id="${m.id}">
      <div class="max-w-[75%] sm:max-w-[65%]">
        <div class="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 shadow-sm">
          <p class="text-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</p>
        </div>
        <p class="text-[10px] text-slate-500 text-right mt-0.5 pr-1">${time}</p>
      </div>
    </div>`;
  }

  return `
  <div class="flex gap-2 mb-2" data-msg-ts="${escapeHtml(m.createdAt)}" data-msg-id="${m.id}">
    <div class="shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-white mt-1">${ini}</div>
    <div class="max-w-[75%] sm:max-w-[65%]">
      <p class="text-[11px] text-slate-400 mb-0.5 pl-1 font-medium">${escapeHtml(name)}</p>
      <div class="bg-slate-700 text-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2 shadow-sm">
        <p class="text-sm whitespace-pre-wrap break-words">${escapeHtml(m.content)}</p>
      </div>
      <p class="text-[10px] text-slate-500 mt-0.5 pl-1">${time}</p>
    </div>
  </div>`;
}

// ─── Messages fragment (polling endpoint returns this) ───────────────────────

export function chatMessagesFragment(messages: ChatMessageDisplay[]): string {
  return messages.map((m) => chatSingleMessageFragment(m)).join('');
}

// ─── Ticker fragment ─────────────────────────────────────────────────────────

export function chatTickerFragment(last2: TickerPick[], next3: TickerPick[]): string {
  if (last2.length === 0 && next3.length === 0) {
    return `<div class="text-center text-slate-500 text-xs py-2">Draft hasn't started yet — picks will appear here during the draft.</div>`;
  }

  const lastCards = last2
    .map(
      (p) => `
    <div class="flex items-center gap-2 bg-green-900/40 border border-green-700/50 rounded-lg px-2.5 py-1.5 min-w-0">
      <span class="text-green-400 font-bold text-xs shrink-0">#${p.pickNumber}</span>
      <span class="text-white text-xs font-medium truncate">${escapeHtml(p.teamName)}</span>
      <span class="text-green-300 text-xs truncate">${p.playerName ? escapeHtml(p.playerName) : '—'}</span>
      ${p.position ? `<span class="text-green-500/70 text-[10px] shrink-0">${escapeHtml(p.position)}</span>` : ''}
    </div>`,
    )
    .join('');

  const nextCards = next3
    .map(
      (p) => `
    <div class="flex items-center gap-2 bg-amber-900/30 border border-amber-700/40 rounded-lg px-2.5 py-1.5 min-w-0">
      <span class="text-amber-400 font-bold text-xs shrink-0">#${p.pickNumber}</span>
      <span class="text-white text-xs font-medium truncate">${escapeHtml(p.teamName)}</span>
      <span class="text-amber-300/50 text-xs">???</span>
    </div>`,
    )
    .join('');

  return `
  <div class="flex flex-col sm:flex-row gap-2 sm:gap-4">
    ${
      last2.length > 0
        ? `<div class="flex items-center gap-2 min-w-0">
        <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Last</span>
        <div class="flex gap-1.5 overflow-x-auto min-w-0">${lastCards}</div>
      </div>`
        : ''
    }
    ${
      next3.length > 0
        ? `<div class="flex items-center gap-2 min-w-0">
        <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Next</span>
        <div class="flex gap-1.5 overflow-x-auto min-w-0">${nextCards}</div>
      </div>`
        : ''
    }
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
  if (isDefault) {return '';}
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
  ticker: {last2: TickerPick[]; next3: TickerPick[]},
  year: number,
  currentUserId: number,
  clerkPublishableKey?: string,
  isAdmin = false,
): string {
  const lastTs = messages.length > 0 ? messages[messages.length - 1].createdAt : new Date(0).toISOString();

  const messagesHtml =
    messages.length > 0
      ? messages.map((m) => chatSingleMessageFragment(m)).join('')
      : `<div id="chat-empty" class="flex flex-col items-center justify-center py-12 text-slate-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0m-12.375 0c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9a8.96 8.96 0 01-4.998-1.516L3.75 20.25l1.766-4.248A8.96 8.96 0 013.75 12z" /></svg>
          <p class="text-sm font-medium">No messages yet</p>
          <p class="text-xs mt-1">Start the conversation!</p>
        </div>`;

  const content = `
  <div class="min-h-screen bg-slate-800 text-gray-100 flex flex-col">
    ${draftTopBar(year, 'chat', isAdmin)}
    <div class="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 pt-3 pb-4 overflow-hidden" style="height: calc(100dvh - 57px)">

      <!-- Group selector -->
      <div class="shrink-0 mb-2">
        ${chatGroupBar(groups, activeGroupId, year)}
        ${chatInviteSection(activeGroup.id, year, activeGroup.isDefault)}
      </div>

      <!-- Draft ticker -->
      <div id="chat-ticker" class="shrink-0 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 mb-3"
           hx-get="/draft/${year}/chat/ticker"
           hx-trigger="every 30s"
           hx-swap="innerHTML">
        ${chatTickerFragment(ticker.last2, ticker.next3)}
      </div>

      <!-- Messages area -->
      <div id="chat-messages-scroll" class="flex-1 overflow-y-auto min-h-0 px-1 py-2">
        <div id="chat-messages">
          ${messagesHtml}
        </div>
        <!-- Polling sentinel -->
        <div id="chat-poll"
             hx-get="/draft/${year}/chat/messages?groupId=${activeGroupId}&after=${encodeURIComponent(lastTs)}"
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

    // ─── After HTMX swaps new messages, update polling URL + auto-scroll ───
    document.body.addEventListener('htmx:afterSettle', function(e) {
      var target = e.detail.target;
      if (!target || target.id !== 'chat-messages') return;

      // Remove empty placeholder if messages arrived
      var empty = document.getElementById('chat-empty');
      if (empty && target.children.length > 1) empty.remove();

      // Update polling timestamp
      var msgs = target.querySelectorAll('[data-msg-ts]');
      if (msgs.length > 0) {
        var latest = msgs[msgs.length - 1].getAttribute('data-msg-ts');
        var poll = document.getElementById('chat-poll');
        if (poll && latest) {
          var base = poll.getAttribute('hx-get').split('?')[0];
          var params = new URLSearchParams(poll.getAttribute('hx-get').split('?')[1] || '');
          params.set('after', latest);
          poll.setAttribute('hx-get', base + '?' + params.toString());
          htmx.process(poll);
        }
      }

      // Auto-scroll if near bottom
      if (isNearBottom()) {
        setTimeout(scrollToBottom, 50);
      }
    });

    // ─── Send form: clear input + scroll after send ───
    var form = document.getElementById('chat-send-form');
    var input = document.getElementById('chat-input');
    if (form) {
      form.addEventListener('htmx:afterRequest', function(e) {
        if (input) input.value = '';
        setTimeout(scrollToBottom, 100);
      });
      // Submit on Enter
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

    // ─── Clerk auth token for HTMX ───
    // Already handled by the global htmx:configRequest listener in baseLayout
  })();
  </script>`;

  return baseLayout(content, `Chat — NFL Draft ${year}`, clerkPublishableKey);
}
