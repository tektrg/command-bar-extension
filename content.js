// content.js
(() => {
  if (window.__cmdBarInjected) return;
  window.__cmdBarInjected = true;

let overlay, input, listEl, timerEl, items = [], selectedIdx = 0, idleTimer = null;

function createOverlay() {
    // load material icons once
    if (!document.getElementById('cmd-bar-icons')) {
      const link = document.createElement('link');
      link.id = 'cmd-bar-icons';
      link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&icon_names=bookmark,history,public';
      document.head.appendChild(link);
    }
    overlay = document.createElement('div');
    overlay.id = 'cmd-bar-overlay';

    const container = document.createElement('div');
    container.id = 'cmd-bar-container';

    input = document.createElement('input');
    input.id = 'cmd-bar-input';
    input.type = 'text';
    input.placeholder = 'Type to search tabs, bookmarks, history...';

    listEl = document.createElement('div');
    listEl.id = 'cmd-bar-list';

    timerEl = document.createElement('div');
    timerEl.id = 'cmd-timer';

    container.appendChild(input);
    container.appendChild(listEl);
    container.appendChild(timerEl);
    overlay.appendChild(container);

    document.body.appendChild(overlay);

    // listeners
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', onInput);
    input.focus();

    // initial recent
    chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
      items = res || [];
      selectedIdx = 0;
      renderList();
    });
  }

  function destroyOverlay() {
    if (timerEl) {
      timerEl.classList.remove('run');
    }
    cancelAutoOpen();
    overlay?.remove();
    overlay = null;
  }

function toggleOverlay() {
    // First invocation opens the overlay
    if (!overlay) {
      createOverlay();
      return;
    }
    // Overlay already visible -> move selection down and schedule auto-open
    if (items.length === 0) return;
    selectedIdx = (selectedIdx + 1) % items.length;
    renderList();
    scheduleAutoOpen();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      destroyOverlay();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % items.length;
      renderList();
      cancelAutoOpen();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + items.length) % items.length;
      renderList();
      cancelAutoOpen();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) {
        chrome.runtime.sendMessage({ type: 'OPEN', item });
        destroyOverlay();
      }
    }
  }

  function onInput(e) {
    // User is typing -> cancel pending auto open
    cancelAutoOpen();
    const q = input.value.trim();
    if (!q) {
      chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
        items = res || [];
        selectedIdx = 0;
        renderList();
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'SEARCH', query: q }, (res) => {
      items = res || [];
      selectedIdx = 0;
      renderList();
    });
  }

  function cancelAutoOpen() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (timerEl) timerEl.classList.remove('run');
  }

  function startTimerAnimation() {
    if (!timerEl) return;
    timerEl.classList.remove('run');
    void timerEl.offsetWidth; // force reflow to restart animation
    timerEl.classList.add('run');
  }

  function scheduleAutoOpen() {
    clearTimeout(idleTimer);
    startTimerAnimation();
    idleTimer = setTimeout(() => {
      const item = items[selectedIdx];
      if (item) {
        chrome.runtime.sendMessage({ type: 'OPEN', item });
        destroyOverlay();
      }
    }, 3000);
  }

  function renderList() {
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'cmd-item' + (idx === selectedIdx ? ' active' : '');
      const iconHtml = getIconHtml(it);
      div.innerHTML = `
        <div style="display:flex;align-items:center;">
          ${iconHtml}
          <div style="display:flex;flex-direction:column;">
            <span>${escapeHtml(it.title || it.url)}</span>
            <span class="url">${getSubtitle(it)}</span>
          </div>
        </div>
      `;
      div.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN', item: it });
        destroyOverlay();
      });
      listEl.appendChild(div);
    });
  }

function getIconHtml(it) {
    const src = it.icon || '';
    if (src) {
      return `<img class="favicon" src="${src}" onerror="this.style.display='none'" />`;
    }
    return '<span class="material-symbols-outlined icon">public</span>';
  }

  function typeGlyph(it) {
    if (it.type === 'bookmark') return '<span class="material-symbols-outlined">bookmark</span>';
    if (it.type === 'history') return '<span class="material-symbols-outlined">history</span>';
    return '';
  }

  function getSubtitle(it) {
    if (it.source === 'history' && it.lastVisitTime) {
      const rel = escapeHtml(timeAgo(it.lastVisitTime));
      const glyph = typeGlyph(it);
      return glyph ? `${glyph} ${rel}` : rel;
    }
    if (it.source === 'bookmark' && it.folder) {
      const glyph = typeGlyph(it);
      return glyph ? `${glyph} ${escapeHtml(it.folder)}` : escapeHtml(it.folder);
    }
    return escapeHtml(it.url);
  }

  function timeAgo(ms) {
    const diff = Date.now() - ms;
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return `${s}s ago`;
  }

  function escapeHtml(str) {
    return str?.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])) || '';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      toggleOverlay();
    }
  });
})();

