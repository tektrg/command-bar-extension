// content.js
(() => {
  if (window.__cmdBarInjected) return;
  window.__cmdBarInjected = true;

// Constants
const CONSTANTS = {
  CONFIRM_TIMEOUT: 2000,
  MAX_SUBTITLE_LENGTH: 60,
  FALLBACK_ICON: chrome.runtime.getURL('link_18dp_E3E3E3.svg'),
  BOOKMARK_ICON: chrome.runtime.getURL('bookmark_18dp_E3E3E3.svg'),
  HISTORY_ICON: chrome.runtime.getURL('history_18dp_E3E3E3.svg'),
  DEFAULT_STATUS_MSG: '↑ / ↓ navigate • ⌫ close/delete • c copy link'
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
  statusBar: null,
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
    this.items = this.sortItemsByLastVisited(newItems || []);
    this.selectedIdx = -1;
  },
  
  sortItemsByLastVisited(items) {
    return items.sort((a, b) => {
      // Get last visited time for each item
      const getLastVisited = (item) => {
        if (item.lastAccessed) return item.lastAccessed; // tabs
        if (item.lastVisitTime) return item.lastVisitTime; // history
        if (item.dateAdded) return item.dateAdded; // bookmarks fallback
        return 0; // fallback for items without time data
      };
      
      const aTime = getLastVisited(a);
      const bTime = getLastVisited(b);
      
      // Debug logging - remove after testing
      if (console && console.log) {
        console.log(`Sorting: ${a.title} (${aTime}) vs ${b.title} (${bTime})`);
      }
      
      // Sort in descending order (most recent first)
      return bTime - aTime;
    });
  }
};

// Legacy global variables for backward compatibility
let overlay, input, listEl, statusBar, items, selectedIdx, idleTimer;
let deleteConfirm, lastConfirmIdx, confirmTimer;

function createOverlay() {
    // Update state references
    overlay = uiState.overlay;
    input = uiState.input;
    listEl = uiState.listEl;
    statusBar = uiState.statusBar;
    items = uiState.items;
    selectedIdx = uiState.selectedIdx;
    deleteConfirm = uiState.deleteConfirm;
    lastConfirmIdx = uiState.lastConfirmIdx;
    confirmTimer = uiState.confirmTimer;
    idleTimer = uiState.idleTimer;
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

    uiState.statusBar = document.createElement('div');
    uiState.statusBar.id = 'prd-stv-status-bar';
    
    // Create tab counter container
    const tabCounterContainer = document.createElement('div');
    tabCounterContainer.style.display = 'flex';
    tabCounterContainer.style.alignItems = 'center';
    tabCounterContainer.style.marginRight = '8px';
    
    // Create tab counter element
    const tabCounter = document.createElement('span');
    tabCounter.id = 'prd-stv-tab-counter';
    tabCounter.textContent = '0';
    
    tabCounterContainer.appendChild(tabCounter);
    tabCounterContainer.appendChild(document.createTextNode(' tabs'));
    
    // Create status message element
    const statusMessage = document.createElement('span');
    statusMessage.id = 'prd-stv-status-message';
    statusMessage.textContent = CONSTANTS.DEFAULT_STATUS_MSG;
    
    uiState.statusBar.appendChild(tabCounterContainer);
    uiState.statusBar.appendChild(statusMessage);
    uiState.statusBar.style.display = 'flex';
    uiState.statusBar.style.alignItems = 'center';
    
    // Update legacy references
    overlay = uiState.overlay;
    input = uiState.input;
    listEl = uiState.listEl;
    statusBar = uiState.statusBar;

    container.appendChild(uiState.input);
    container.appendChild(uiState.listEl);
    container.appendChild(uiState.statusBar);
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
    
    // Get initial tab count
    updateTabCount();
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
      
      // Handle boundary cases - focus input when at edges
      if (e.key === 'ArrowUp' && selectedIdx === 0) {
        selectedIdx = -1;
        renderList();
        input.focus();
        return true;
      }
      
      if (e.key === 'ArrowDown' && selectedIdx === items.length - 1) {
        selectedIdx = -1;
        renderList();
        input.focus();
        return true;
      }
      
      // Handle navigation from input (selectedIdx === -1)
      if (selectedIdx === -1) {
        selectedIdx = e.key === 'ArrowDown' ? 0 : items.length - 1;
      } else {
        selectedIdx = (selectedIdx + dir + items.length) % items.length;
      }
      
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
    
    copy: (e) => {
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return false;
      const item = items[selectedIdx];
      if (!item) return false;
      e.preventDefault();
      copyLinkToClipboard(item);
      destroyOverlay();
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
    // Update tab count after removing an item
    updateTabCount();
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
    if (keyHandlers.copy(e)) return;
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
    const statusMessage = document.getElementById('prd-stv-status-message');
    if (statusMessage) {
      statusMessage.textContent = CONSTANTS.DEFAULT_STATUS_MSG;
      statusMessage.classList.remove('confirm');
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
    const statusMessage = document.getElementById('prd-stv-status-message');
    if (!statusMessage) return;
    
    statusMessage.textContent = 'Press backspace again to confirm';
    statusMessage.classList.add('confirm');

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
    
    // // Add error handling for favicon images
    // const favicon = div.querySelector('.prd-stv-favicon');
    // if (favicon) {
    //   favicon.addEventListener('error', () => {
    //     favicon.src = CONSTANTS.FALLBACK_ICON;
    //   }, { once: true });
    // }
    
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
  }

function getIconHtml(it) {
    // For bookmarks and history, use Google's favicon service
    if ((it.type === 'bookmark' || it.type === 'history') && it.url) {
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(it.url).hostname)}&sz=32`;
      return `<img class="prd-stv-favicon" src="${faviconUrl}" onerror="this.src='${CONSTANTS.FALLBACK_ICON}'" />`;
    }
    
    // For tabs, use the favicon if available
    const actual = it.icon || '';
    if (actual) {
      return `<img class="prd-stv-favicon" src="${actual}" />`;
    }
    // No favicon available → fallback icon
    return `<img class="prd-stv-favicon" src="${CONSTANTS.FALLBACK_ICON}" />`;
  }


  function typeGlyph(it) {
    if (it.type === 'bookmark') return `<img src="${CONSTANTS.BOOKMARK_ICON}" class="prd-stv-type-icon" />`;
    if (it.type === 'history') return `<img src="${CONSTANTS.HISTORY_ICON}" class="prd-stv-type-icon" />`;
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

function showToast(message, duration = 2000) {
    const existing = document.getElementById('prd-stv-toast');
    existing?.remove();
    const div = document.createElement('div');
    div.id = 'prd-stv-toast';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), duration);
  }

  async function copyLinkToClipboard(item) {
    try {
      await navigator.clipboard.writeText(item.url || '');
      showToast('Link copied!');
    } catch (e) {
      // Fallback: create temp textarea
      const ta = document.createElement('textarea');
      ta.value = item.url || '';
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove();
      showToast('Link copied!');
    }
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

  // Update the tab counter in the status bar
  function updateTabCount() {
    // Request tab count from background script
    chrome.runtime.sendMessage({ type: "GET_TAB_COUNT" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab count:', chrome.runtime.lastError);
        return;
      }
      
      const tabCounter = document.getElementById('prd-stv-tab-counter');
      if (tabCounter && response && response.count !== undefined) {
        const oldCount = parseInt(tabCounter.textContent) || 0;
        const newCount = response.count;
        
        // Update the counter with animation if the count changed
        if (oldCount !== newCount) {
          tabCounter.textContent = newCount;
          tabCounter.classList.remove('prd-stv-tab-count-update');
          // Trigger reflow to restart animation
          void tabCounter.offsetWidth;
          tabCounter.classList.add('prd-stv-tab-count-update');
        }
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      toggleOverlay();
    } else if (msg.type === 'TAB_COUNT_CHANGED') {
      updateTabCount();
    }
  });
})();

