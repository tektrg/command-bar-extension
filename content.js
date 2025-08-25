// content.js
(() => {
  if (window.__cmdBarInjected) return;
  window.__cmdBarInjected = true;

let overlay, input, listEl, timerEl, confirmEl, items = [], selectedIdx = -1, idleTimer = null;
// Deletion confirmation state
let deleteConfirm = false;
let lastConfirmIdx = -1;
let confirmTimer = null;

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

    confirmEl = document.createElement('div');
    confirmEl.id = 'cmd-confirm';
    confirmEl.style.display = 'none';

    container.appendChild(input);
    container.appendChild(listEl);
container.appendChild(timerEl);
    container.appendChild(confirmEl);
    overlay.appendChild(container);

    // Close overlay when user clicks outside the container
    overlay.addEventListener('mousedown', (ev) => {
      if (ev.target === overlay) {
        destroyOverlay();
      }
    });
    // Prevent clicks inside the container from bubbling to overlay handler
    container.addEventListener('mousedown', (ev) => ev.stopPropagation());

    document.body.appendChild(overlay);

    // listeners
    input.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onGlobalKeyDown);
    input.addEventListener('input', onInput);
    input.focus();

    // initial recent
    chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
      items = res || [];
      selectedIdx = -1;
      renderList();
    });
  }

  function destroyOverlay() {
    if (timerEl) {
      timerEl.classList.remove('run');
    }
    cancelAutoOpen();
    document.removeEventListener('keydown', onGlobalKeyDown);
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

function onGlobalKeyDown(e) {
    if (e.target === input) return; // already handled by onKeyDown
    handleKey(e);
  }

  function onKeyDown(e) {
    handleKey(e);
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      destroyOverlay();
      return;
    }

// If user navigates with arrows, blur input so backspace won't edit text
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement === input) {
      input.blur();
    }

// Mac Cmd+Up focuses input
    if (e.metaKey && e.key === 'ArrowUp') {
      e.preventDefault();
      input.focus();
      return;
    }

    // Mac Cmd+Down selects last item
    if (e.metaKey && e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) {
        selectedIdx = items.length - 1;
        renderList();
        cancelAutoOpen();
        input.blur();
      }
      return;
    }

// Reset delete confirmation on navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
hideDeleteConfirm();
      selectedIdx = (selectedIdx + 1) % items.length;
      renderList();
      cancelAutoOpen();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
hideDeleteConfirm();
      selectedIdx = (selectedIdx - 1 + items.length) % items.length;
      renderList();
      cancelAutoOpen();
      return;
    }

// Handle deletion via Backspace when input field is empty OR not focused
    if (e.key === 'Backspace' && (document.activeElement !== input || input.value === '')) {
      e.preventDefault();
      const item = items[selectedIdx];
      if (!item) return;
      // First press -> show confirm message
      if (!deleteConfirm || lastConfirmIdx !== selectedIdx) {
        deleteConfirm = true;
        lastConfirmIdx = selectedIdx;
        showDeleteConfirm();
      } else {
        // Second press -> perform deletion
        chrome.runtime.sendMessage({ type: 'DELETE', item });
        hideDeleteConfirm();
        // Optionally remove from list locally for immediate feedback
        items.splice(selectedIdx, 1);
        if (selectedIdx >= items.length) selectedIdx = items.length - 1;
        renderList();
      }
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
    hideDeleteConfirm();
    // User is typing -> cancel pending auto open
    cancelAutoOpen();
    const q = input.value.trim();
    if (!q) {
      chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
        items = res || [];
        selectedIdx = -1;
        renderList();
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'SEARCH', query: q }, (res) => {
      items = res || [];
      selectedIdx = -1;
      renderList();
    });
  }

function hideDeleteConfirm() {
    deleteConfirm = false;
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
    if (confirmEl) {
      confirmEl.style.display = 'none';
      confirmEl.textContent = '';
    }
  }

  function hideVisualTimer() {
    if (timerEl) {
      timerEl.classList.remove('run');
      timerEl.style.display = 'none';
    }
  }

  function cancelAutoOpen() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    hideVisualTimer();
  }

  function showDeleteConfirm() {
    if (!confirmEl) return;
    confirmEl.textContent = 'Press backspace again to confirm';
    confirmEl.style.display = 'block';
    confirmTimer = setTimeout(() => hideDeleteConfirm(), 2000);
  }

  function startTimerAnimation() {
    if (!timerEl) return;
    timerEl.style.display = 'block';
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
    }, 1000);
  }

  function renderList() {
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'cmd-item' + (idx === selectedIdx ? ' active' : '');
      const iconHtml = getIconHtml(it);
      div.innerHTML = `
        <div style="display:flex;">
          ${iconHtml}
          <div style="display:flex;flex-direction:column;">
            <span>${highlightMatches(it.title || it.url, input?.value.trim())}</span>
            <span class="url">${getSubtitle(it)}</span>
          </div>
        </div>
      `;
      
      // Add error handling for favicon images
      const favicon = div.querySelector('.favicon');
      if (favicon) {
        favicon.addEventListener('error', () => {
          favicon.style.display = 'none';
        });
      }
      
      div.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN', item: it });
        destroyOverlay();
      });
      listEl.appendChild(div);
    });

    // Ensure the selected item is visible within the scroll container
    const activeEl = listEl.querySelector('.cmd-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

function getIconHtml(it) {
    const src = it.icon || '';
    if (src) {
      return `<img class="favicon" src="${src}" />`;
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
    return highlightMatches(truncateMiddle(it.url), input?.value.trim());
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
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str?.replace(/[&<>"']/g, (c) => map[c]) || '';
  }

  // Highlight occurrences of the current query within text
  function highlightMatches(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text || '');
    // Escape regex special chars in query
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(safeQuery, 'ig');
      return escaped.replace(regex, (m) => `<span class="hl">${m}</span>`);
    } catch (e) {
      return escaped;
    }
  }
  // Truncate long strings in the middle so they fit on a single line
  // Example: "https://verylongdomain.com/path/to/resource" (maxLen 40)
  // becomes "https://verylo.../path/to/resource"
  function truncateMiddle(str, maxLen = 60) {
    if (!str || str.length <= maxLen) return str || '';
    const part = Math.floor((maxLen - 3) / 2);
    return str.slice(0, part) + '...' + str.slice(str.length - part);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      toggleOverlay();
    }
  });
})();

