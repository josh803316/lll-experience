/**
 * Site-wide draft ticker section. Self-loading via HTMX so pages don't need
 * to thread ticker data through their controllers.
 *
 * Includes the ticker container, the body-level pick-detail modal, and the
 * shared scripts that wire arrows, round tabs, and click-to-modal.
 */

/** Body-level modal container. Render once per page that uses the ticker. */
export function pickModalContainer(): string {
  return `
  <div id="pick-modal-backdrop"
       class="hidden fixed inset-0 bg-black/70 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
       data-pick-modal-backdrop>
    <div id="pick-modal-content" class="w-full"></div>
  </div>`;
}

/**
 * Pick-modal click handler. Idempotent — guarded by window.__pickModalInstalled.
 * Delegates clicks on .ticker-card-clickable to fetch and render the modal.
 * Year is read from the nearest [data-year] ancestor, falling back to defaultYear.
 */
export function pickModalScript(defaultYear: number): string {
  return `
  <script>
  (function() {
    if (window.__pickModalInstalled) return;
    window.__pickModalInstalled = true;
    var DEFAULT_YEAR = ${defaultYear};

    function openModal(html) {
      var bd = document.getElementById('pick-modal-backdrop');
      var ct = document.getElementById('pick-modal-content');
      if (!bd || !ct) return;
      ct.innerHTML = html;
      bd.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
    function closeModal() {
      var bd = document.getElementById('pick-modal-backdrop');
      var ct = document.getElementById('pick-modal-content');
      if (!bd || !ct) return;
      bd.classList.add('hidden');
      ct.innerHTML = '';
      document.body.style.overflow = '';
    }
    window.__closePickModal = closeModal;

    document.addEventListener('click', function(e) {
      var card = e.target.closest && e.target.closest('.ticker-card-clickable');
      if (card) {
        var pick = card.getAttribute('data-pick');
        if (!pick) return;
        var yearEl = card.closest('[data-year]');
        var year = yearEl ? (yearEl.getAttribute('data-year') || DEFAULT_YEAR) : DEFAULT_YEAR;
        openModal('<div class="max-w-md w-full mx-auto bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 text-center text-slate-300 text-sm">Loading…</div>');
        fetch('/draft/' + year + '/pick/' + encodeURIComponent(pick), {
          headers: {'Authorization': window.__clerkToken ? 'Bearer ' + window.__clerkToken : ''}
        })
        .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status); })
        .then(function(html) { openModal(html); })
        .catch(function() {
          openModal('<div class="max-w-md w-full mx-auto bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 text-center text-slate-300 text-sm">Couldn\\'t load pick detail.</div>');
        });
        return;
      }
      if (e.target.closest && e.target.closest('[data-pick-modal-close]')) { closeModal(); return; }
      var bd = document.getElementById('pick-modal-backdrop');
      if (bd && e.target === bd) { closeModal(); }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });
  })();
  </script>`;
}

/**
 * Ticker behaviour script: arrows, auto-scroll anchored on the latest
 * completed pick, and round-tab switching. Pass the selector for the
 * ticker container.
 */
export function tickerScript(tickerSelector: string): string {
  return `
  <style>.ticker-scroll::-webkit-scrollbar { display: none; }</style>
  <script>
  (function() {
    var SELECTOR = ${JSON.stringify(tickerSelector)};

    function findTicker() {
      var host = document.querySelector(SELECTOR);
      if (!host) return null;
      return {
        host: host,
        scroll: host.querySelector('.ticker-scroll'),
        leftBtn: host.querySelector('.ticker-scroll-left'),
        rightBtn: host.querySelector('.ticker-scroll-right'),
      };
    }
    function updateArrows(t) {
      if (!t || !t.scroll) return;
      if (t.leftBtn) t.leftBtn.style.display = t.scroll.scrollLeft > 10 ? '' : 'none';
      if (t.rightBtn) t.rightBtn.style.display = t.scroll.scrollLeft < t.scroll.scrollWidth - t.scroll.clientWidth - 10 ? '' : 'none';
    }
    function initTicker() {
      var t = findTicker();
      if (!t || !t.scroll) return;
      if (t.leftBtn) t.leftBtn.onclick = function() { t.scroll.scrollBy({left: -240, behavior: 'smooth'}); };
      if (t.rightBtn) t.rightBtn.onclick = function() { t.scroll.scrollBy({left: 240, behavior: 'smooth'}); };
      t.scroll.onscroll = function() { updateArrows(t); };
      var onClock = t.scroll.querySelector('.border-amber-400');
      if (onClock) {
        var anchor = onClock.previousElementSibling || onClock;
        var offset = anchor.offsetLeft - t.scroll.offsetLeft - 8;
        t.scroll.scrollLeft = Math.max(0, offset);
      } else {
        t.scroll.scrollLeft = t.scroll.scrollWidth;
      }
      setTimeout(function() { updateArrows(t); }, 50);
    }
    initTicker();
    document.body.addEventListener('htmx:afterSettle', function(e) {
      if (e.detail.target && e.detail.target.matches && e.detail.target.matches(SELECTOR)) {
        initTicker();
      }
    });
    document.addEventListener('click', function(e) {
      var tab = e.target.closest && e.target.closest('.ticker-round-tab');
      if (!tab) return;
      var host = tab.closest(SELECTOR);
      if (!host) return;
      var round = tab.getAttribute('data-round');
      if (!round) return;
      var baseUrl = (host.getAttribute('hx-get') || '').split('?')[0];
      if (!baseUrl) return;
      var newUrl = baseUrl + '?round=' + round;
      host.setAttribute('hx-get', newUrl);
      if (window.htmx) {
        window.htmx.process(host);
        window.htmx.ajax('GET', newUrl, {target: SELECTOR, swap: 'innerHTML'});
      }
    });
  })();
  </script>`;
}

/**
 * Site-wide ticker block. Self-loads its content via HTMX, then polls.
 * Renders the ticker, the modal container, and the supporting scripts.
 *
 * Embed this between the top bar and the main page content.
 */
export function globalTickerSection(year: number): string {
  return `
  <div class="bg-slate-900/60 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-2">
      <div id="global-ticker"
           class="bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 min-h-[64px]"
           hx-get="/draft/${year}/ticker"
           hx-trigger="load, every 15s"
           hx-swap="innerHTML"
           data-year="${year}">
        <div class="text-[11px] text-slate-500 px-1 py-2">Loading draft ticker…</div>
      </div>
    </div>
  </div>
  ${pickModalContainer()}
  ${tickerScript('#global-ticker')}
  ${pickModalScript(year)}`;
}
