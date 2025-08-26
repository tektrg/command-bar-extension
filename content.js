// content.js
(() => {
  if (window.__cmdBarInjected) return;
  window.__cmdBarInjected = true;

// Constants
const CONSTANTS = {
  MATERIAL_ICONS_URL: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&icon_names=bookmark,history,public',
  CONFIRM_TIMEOUT: 2000,
  MAX_SUBTITLE_LENGTH: 60,
  FALLBACK_ICON: chrome.runtime.getURL('link_18dp_E3E3E3.svg')
};

// Message service to avoid DRY violations
const messageService = {
  send: (type, data = {}) => chrome.runtime.sendMessage({ type, ...data }),
  sendWithCallback: (type, data = {}, callback) => chrome.runtime.sendMessage({ type, ...data }, callback),
  recent: (callback) => messageService.sendWithCallback('RECENT', {}, callback),
  search: (query, callback) => messageService.sendWithCallback('SEARCH', { query }, callback),
  open: (item) => messageService.send('OPEN', { item }),
  delete: (item) => messageService.send('DELETE', { item })
};

// UI State Manager for better organization
const uiState = {
  overlay: null,
  input: null,
  listEl: null,
  confirmEl: null,
  items: [],
  selectedIdx: -1,
  idleTimer: null,
  deleteConfirm: false,
  lastConfirmIdx: -1,
  confirmTimer: null,
  
  reset() {
    this.items = [];
    this.selectedIdx = -1;
    this.deleteConfirm = false;
    this.lastConfirmIdx = -1;
    this.clearTimers();
  },
  
  clearTimers() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
  },
  
  setItems(newItems) {
    this.items = newItems || [];
    this.selectedIdx = -1;
  }
};

// Legacy global variables for backward compatibility
let overlay, input, listEl, confirmEl, items, selectedIdx, idleTimer;
let deleteConfirm, lastConfirmIdx, confirmTimer;

function createOverlay() {
    // Update state references
    overlay = uiState.overlay;
    input = uiState.input;
    listEl = uiState.listEl;
    confirmEl = uiState.confirmEl;
    items = uiState.items;
    selectedIdx = uiState.selectedIdx;
    deleteConfirm = uiState.deleteConfirm;
    lastConfirmIdx = uiState.lastConfirmIdx;
    confirmTimer = uiState.confirmTimer;
    idleTimer = uiState.idleTimer;
    // load material icons once
    if (!document.getElementById('prd-stv-cmd-bar-icons')) {
      const link = document.createElement('link');
      link.id = 'prd-stv-cmd-bar-icons';
      link.rel = 'stylesheet';
      link.href = CONSTANTS.MATERIAL_ICONS_URL;
      document.head.appendChild(link);
    }
    uiState.overlay = document.createElement('div');
    uiState.overlay.id = 'prd-stv-cmd-bar-overlay';

    const container = document.createElement('div');
    container.id = 'prd-stv-cmd-bar-container';

    uiState.input = document.createElement('input');
    uiState.input.id = 'prd-stv-cmd-bar-input';
    uiState.input.type = 'text';
    uiState.input.placeholder = 'Type to search tabs, bookmarks, history...';

    uiState.listEl = document.createElement('div');
    uiState.listEl.id = 'prd-stv-cmd-bar-list';

    uiState.confirmEl = document.createElement('div');
    uiState.confirmEl.id = 'prd-stv-cmd-confirm';
    uiState.confirmEl.style.display = 'none';
    
    // Update legacy references
    overlay = uiState.overlay;
    input = uiState.input;
    listEl = uiState.listEl;
    confirmEl = uiState.confirmEl;

    container.appendChild(uiState.input);
    container.appendChild(uiState.listEl);
    container.appendChild(uiState.confirmEl);
    uiState.overlay.appendChild(container);

    // Close overlay when user clicks outside the container
    uiState.overlay.addEventListener('mousedown', (ev) => {
      if (ev.target === uiState.overlay) {
        destroyOverlay();
      }
    });
    // Prevent clicks inside the container from bubbling to overlay handler
    container.addEventListener('mousedown', (ev) => ev.stopPropagation());

    document.body.appendChild(uiState.overlay);

    // listeners
    uiState.input.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onGlobalKeyDown);
    document.addEventListener('keyup', onGlobalKeyUp);
    uiState.input.addEventListener('input', onInput);
    uiState.input.focus();

    // initial recent
    messageService.recent((res) => {
      uiState.setItems(res);
      items = uiState.items;
      selectedIdx = uiState.selectedIdx;
      renderList();
    });
  }

  function destroyOverlay() {
    cancelAutoOpen();
    document.removeEventListener('keydown', onGlobalKeyDown);
    document.removeEventListener('keyup', onGlobalKeyUp);
    uiState.overlay?.remove();
    uiState.overlay = null;
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
    input.blur();
    selectedIdx = (selectedIdx + 1) % items.length;
    renderList();
  }

function onGlobalKeyDown(e) {
    if (e.target === input) return; // already handled by onKeyDown
    handleKey(e);
  }

  function onGlobalKeyUp(e) {
    if (e.target === input) return;
    handleKeyUp(e);
  }

  function onKeyDown(e) {
    handleKey(e);
  }

  // Key handler functions - Split for better SRP compliance
  const keyHandlers = {
    escape: () => {
      destroyOverlay();
    },
    
    navigation: (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false;
      
      e.preventDefault();
      hideDeleteConfirm();
      removeProgressBars();

      const dir = e.key === 'ArrowDown' ? 1 : -1;
      selectedIdx = (selectedIdx + dir + items.length) % items.length;
      renderList();
      cancelAutoOpen();

      // Blur input so backspace won't edit text
      if (document.activeElement === input) input.blur();
      return true;
    },
    
    metaNavigation: (e) => {
      if (!e.metaKey) return false;
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        input.focus();
        return true;
      }
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) {
          selectedIdx = items.length - 1;
          renderList();
          cancelAutoOpen();
          input.blur();
        }
        return true;
      }
      
      return false;
    },
    
    deletion: (e) => {
      if (e.key !== 'Backspace' || (document.activeElement === input && input.value !== '')) {
        return false;
      }
      
      e.preventDefault();
      const item = items[selectedIdx];
      if (!item) return true;

      if (!deleteConfirm || lastConfirmIdx !== selectedIdx) {
        // First press shows confirmation + bounce
        deleteConfirm = true;
        lastConfirmIdx = selectedIdx;
        showDeleteConfirm();
      } else {
        // Second press performs deletion
        messageService.delete(item);
        hideDeleteConfirm();
        performItemDeletion();
      }
      return true;
    },
    
    activation: (e) => {
      if (e.key !== 'Enter') return false;
      
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) {
        messageService.open(item);
        destroyOverlay();
      }
      return true;
    }
  };
  
  // Extracted deletion animation logic
  function performItemDeletion() {
    const el = listEl.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) {
      el.classList.add('prd-stv-remove');
      el.addEventListener('animationend', () => {
        removeItemFromList();
      }, { once: true });
    } else {
      removeItemFromList();
    }
  }
  
  function removeItemFromList() {
    items.splice(selectedIdx, 1);
    if (selectedIdx >= items.length) selectedIdx = items.length - 1;
    renderList();
  }

  // Simplified and centralized key handling
  function handleKey(e) {
    // Always allow Esc to close the palette
    if (e.key === 'Escape') {
      keyHandlers.escape();
      return;
    }

    // Ignore all other keys if the palette isn't open
    if (!overlay) return;

    // Try each handler in order
    if (keyHandlers.navigation(e)) return;
    if (keyHandlers.metaNavigation(e)) return;
    if (keyHandlers.deletion(e)) return;
    if (keyHandlers.activation(e)) return;
  }

  function handleKeyUp(e) {
    // Open tab when the modifier/shortcut key is released (e.g., Meta, Alt, Control)
    if (!overlay) return;
    if (['Meta', 'Alt', 'Control'].includes(e.key)) {
      const item = items[selectedIdx];
      if (item) {
        messageService.open(item);
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
      messageService.recent((res) => {
        uiState.setItems(res);
        items = uiState.items;
        selectedIdx = uiState.selectedIdx;
        renderList();
      });
      return;
    }
    messageService.search(q, (res) => {
      uiState.setItems(res);
      items = uiState.items;
      selectedIdx = uiState.selectedIdx;
      renderList();
    });
  }

function hideDeleteConfirm() {
    uiState.deleteConfirm = false;
    deleteConfirm = false;
    if (uiState.confirmTimer) {
      clearTimeout(uiState.confirmTimer);
      uiState.confirmTimer = null;
      confirmTimer = null;
    }
    if (uiState.confirmEl) {
      uiState.confirmEl.style.display = 'none';
      uiState.confirmEl.textContent = '';
    }
  }

function removeProgressBars() {
    uiState.listEl?.querySelectorAll('.prd-stv-prog').forEach(el => el.remove());
  }

  function cancelAutoOpen() {
    if (uiState.idleTimer) {
      clearTimeout(uiState.idleTimer);
      uiState.idleTimer = null;
      idleTimer = null;
    }
    removeProgressBars();
  }

function showDeleteConfirm() {
    if (!uiState.confirmEl) return;
    uiState.confirmEl.textContent = 'Press backspace again to confirm';
    uiState.confirmEl.style.display = 'block';

    // Bounce animation on the currently selected item
    const activeEl = uiState.listEl?.querySelector('.prd-stv-cmd-item.prd-stv-active');
    if (activeEl) {
      activeEl.classList.add('prd-stv-bounce');
      activeEl.addEventListener('animationend', () => {
        activeEl.classList.remove('prd-stv-bounce');
      }, { once: true });
    }

    uiState.confirmTimer = setTimeout(() => hideDeleteConfirm(), CONSTANTS.CONFIRM_TIMEOUT);
    confirmTimer = uiState.confirmTimer;
  }




  // Extracted item rendering logic for better modularity
  function createItemElement(item, index) {
    const div = document.createElement('div');
    div.className = 'prd-stv-cmd-item' + (index === selectedIdx ? ' prd-stv-active' : '');
    div.dataset.idx = index;
    
    const iconHtml = getIconHtml(item);
    div.innerHTML = `
      <div style="display:flex;">
        ${iconHtml}
        <div style="display:flex;flex-direction:column;">
          <span>${highlightMatches(item.title || item.url, input?.value.trim())}</span>
          <span class="prd-stv-url">${getSubtitle(item)}</span>
        </div>
      </div>
    `;
    
    // Add error handling for favicon images
    const favicon = div.querySelector('.prd-stv-favicon');
    if (favicon) {
      favicon.addEventListener('error', () => {
        // Stop further reload attempts and display fallback once
        favicon.removeAttribute('data-src');
        favicon.src = CONSTANTS.FALLBACK_ICON;
      }, { once: true });
    }
    
    // Add click handler
    div.addEventListener('click', () => {
      messageService.open(item);
      destroyOverlay();
    });
    
    return div;
  }
  
  function scrollToActiveItem() {
    const activeEl = listEl.querySelector('.prd-stv-cmd-item.prd-stv-active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    
    items.forEach((item, index) => {
      const itemElement = createItemElement(item, index);
      listEl.appendChild(itemElement);
    });

    // Ensure the selected item is visible within the scroll container
    scrollToActiveItem();

    // Lazily load any favicons that have data-src
    lazyLoadFavicons();
  }

function getIconHtml(it) {
    const actual = it.icon || '';
    if (actual) {
      // Render placeholder immediately; real favicon swapped lazily
return `<img class="prd-stv-favicon" src="${CONSTANTS.FALLBACK_ICON}" data-src="${actual}" />`;
    }
    // No favicon available → just placeholder
return `<img class="prd-stv-favicon" src="${CONSTANTS.FALLBACK_ICON}" />`;
  }

  // Swap in real favicons after initial render without blocking first paint
  function lazyLoadFavicons() {
    const imgs = listEl?.querySelectorAll('img.prd-stv-favicon[data-src]');
    if (!imgs || imgs.length === 0) return;

    const load = () => {
      imgs.forEach(img => {
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 1000 });
    } else {
      setTimeout(load, 0);
    }
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
      return escaped.replace(regex, (m) => `<span class="prd-stv-hl">${m}</span>`);
    } catch (e) {
      return escaped;
    }
  }
  // Truncate long strings in the middle so they fit on a single line
  // Example: "https://verylongdomain.com/path/to/resource" (maxLen 40)
  // becomes "https://verylo.../path/to/resource"
  function truncateMiddle(str, maxLen = CONSTANTS.MAX_SUBTITLE_LENGTH) {
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

