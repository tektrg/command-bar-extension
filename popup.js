// popup.js
(function () {
  const FALLBACK_ICON = chrome.runtime.getURL('link_18dp_E3E3E3.svg');
  const BOOKMARK_ICON = chrome.runtime.getURL('bookmark_18dp_E3E3E3.svg');
  const HISTORY_ICON = chrome.runtime.getURL('history_18dp_E3E3E3.svg');

  // DOM refs
  const el = {
    input: null,
    tree: null,
    tabs: null,
    history: null,
    root: null,
  };

  // State
  const state = {
    query: '',
    bookmarksRoots: [],
    filteredTree: [],
    expanded: new Set(),
    tabs: [],
    filteredTabs: [],
    history: [],
    dragState: {
      isDragging: false,
      draggedItem: null,
      draggedType: null,
    },
  };

  // Utils
  const debounce = (fn, ms) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  function timeAgo(ms) {
    if (!ms) return '';
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
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return (str || '').toString().replace(/[&<>"']/g, (c) => map[c]);
  }

  function highlightMatches(text, q) {
    if (!q) return escapeHtml(text || '');
    const escaped = escapeHtml(text || '');
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(safe, 'ig');
      return escaped.replace(re, (m) => `<span class="prd-stv-hl">${m}</span>`);
    } catch { return escaped; }
  }

  function truncateMiddle(str, maxLen = 60) {
    if (!str || str.length <= maxLen) return str || '';
    const part = Math.floor((maxLen - 3) / 2);
    return str.slice(0, part) + '...' + str.slice(str.length - part);
  }

  function faviconFor(item) {
    if (item.type === 'tab') return item.icon || FALLBACK_ICON;
    if ((item.type === 'bookmark' || item.type === 'history') && item.url) {
      try {
        const hostname = new URL(item.url).hostname;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
      } catch { return FALLBACK_ICON; }
    }
    return FALLBACK_ICON;
  }

  function typeGlyph(type) {
    if (type === 'bookmark') return `<img src="${BOOKMARK_ICON}" class="prd-stv-type-icon" />`;
    if (type === 'history') return `<img src="${HISTORY_ICON}" class="prd-stv-type-icon" />`;
    return '';
  }

  function showToast(message, duration = 2000) {
    const exist = document.getElementById('prd-stv-toast');
    if (exist) exist.remove();
    const div = document.createElement('div');
    div.id = 'prd-stv-toast';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), duration);
  }

  // Drop zone management
  function createDropZone(parentId, index, targetElement, position) {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.parentId = parentId;
    zone.dataset.index = index;
    
    // Position the drop zone absolutely
    const rect = targetElement.getBoundingClientRect();
    const containerRect = targetElement.closest('.bm-children, #bookmarks-tree').getBoundingClientRect();
    
    let top;
    if (position === 'before') {
      top = targetElement.offsetTop - 2;
    } else { // after
      top = targetElement.offsetTop + targetElement.offsetHeight - 2;
    }
    
    zone.style.top = top + 'px';
    
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('active');
    });
    
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('active');
    });
    
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('active');
      
      const txt = e.dataTransfer.getData('text/plain');
      if (!txt) return;
      
      try {
        const payload = JSON.parse(txt);
        await handleReorder(payload, parentId, parseInt(index));
        await reloadBookmarks();
        renderBookmarks();
      } catch (err) {
        console.error('Drop zone error:', err);
      }
    });
    
    return zone;
  }

  function insertDropZones(container, parentId) {
    if (!state.dragState.isDragging) return;
    
    const children = Array.from(container.children).filter(child => 
      !child.classList.contains('drop-zone')
    );
    
    children.forEach((child, index) => {
      // Insert drop zone before each item
      const zone = createDropZone(parentId, index, child, 'before');
      container.appendChild(zone);
    });
    
    // Insert final drop zone after last item
    if (children.length > 0) {
      const lastChild = children[children.length - 1];
      const finalZone = createDropZone(parentId, children.length, lastChild, 'after');
      container.appendChild(finalZone);
    }
  }

  function removeAllDropZones() {
    document.querySelectorAll('.drop-zone').forEach(zone => zone.remove());
  }

  function findParentContainer(parentId) {
    if (!parentId) {
      // Root level bookmarks
      return document.getElementById('bookmarks-tree');
    }
    
    // Find the folder element with this parent ID
    const folderElement = document.querySelector(`.bm-folder[data-id="${parentId}"]`);
    if (folderElement) {
      const childrenContainer = folderElement.querySelector('.bm-children');
      if (childrenContainer) {
        return childrenContainer;
      }
    }
    
    // If not found, might be in root bookmarks
    return document.getElementById('bookmarks-tree');
  }

  // Storage helpers
  async function loadExpanded() {
    try {
      const { expandedFolders } = await chrome.storage.local.get('expandedFolders');
      if (Array.isArray(expandedFolders)) {
        state.expanded = new Set(expandedFolders);
      }
    } catch {}
  }

  function persistExpanded() {
    try { chrome.storage.local.set({ expandedFolders: Array.from(state.expanded) }); } catch {}
  }

  // Bookmark helpers
  function buildParentMap(nodes, parentId, map) {
    nodes.forEach(n => {
      map.set(n.id, parentId || n.parentId || null);
      if (n.children && n.children.length) buildParentMap(n.children, n.id, map);
    });
    return map;
  }

  async function getAncestors(nodeId) {
    const ancestors = [];
    let id = nodeId;
    while (id) {
      const arr = await chrome.bookmarks.get(id).catch(() => []);
      if (!arr || !arr[0] || !arr[0].parentId) break;
      ancestors.push(arr[0].parentId);
      id = arr[0].parentId;
    }
    return ancestors;
  }

  function nodeMatches(node, q) {
    if (!q) return true;
    if (node.url) {
      const hay = ((node.title || '') + ' ' + (node.url || '')).toLowerCase();
      return hay.includes(q);
    }
    // folders evaluated by children elsewhere
    return false;
  }

  function filterTree(node, q) {
    if (!q) return node; // show full tree (subject to expansion at render)
    if (node.url) return nodeMatches(node, q) ? node : null;
    const kept = (node.children || []).map(ch => filterTree(ch, q)).filter(Boolean);
    if (kept.length) return { ...node, children: kept };
    return null;
  }

  function normalizeUrl(u) {
    try {
      const url = new URL(u);
      // Remove trailing slash only for pathless roots; keep query/hash
      url.pathname = url.pathname.replace(/\/$/, '');
      return url.toString().toLowerCase();
    } catch { return (u || '').replace(/\/$/, '').toLowerCase(); }
  }

  async function createIfNotDuplicate(folderId, title, url) {
    const children = await chrome.bookmarks.getChildren(folderId);
    const norm = normalizeUrl(url);
    if (children.some(c => c.url && normalizeUrl(c.url) === norm)) {
      showToast('Already bookmarked in this folder');
      return null;
    }
    return chrome.bookmarks.create({ parentId: folderId, title, url });
  }

  async function safeMove(nodeId, targetFolderId) {
    if (nodeId === targetFolderId) return; // no-op
    const ancestors = await getAncestors(targetFolderId);
    if (ancestors.includes(nodeId)) {
      showToast('Cannot move a folder into its descendant');
      return;
    }
    await chrome.bookmarks.move(nodeId, { parentId: targetFolderId });
  }

  // Rendering
  function render() {
    renderBookmarks();
    renderTabs();
    renderHistory();
  }

  function renderBookmarks() {
    el.tree.innerHTML = '';
    const roots = state.filteredTree.length ? state.filteredTree : state.bookmarksRoots;
    if (!roots || !roots.length) {
      const empty = document.createElement('div');
      empty.className = 'prd-stv-empty';
      empty.textContent = 'No bookmarks';
      el.tree.appendChild(empty);
      return;
    }
    roots.forEach(root => el.tree.appendChild(renderNode(root, 0)));
  }

  function renderNode(node, depth) {
    if (node.url) return renderBookmarkItem(node);
    // folder
    const wrapper = document.createElement('div');
    wrapper.className = 'bm-folder';
    wrapper.dataset.id = node.id;

    const header = document.createElement('div');
    header.className = 'bm-folder-header';
    header.dataset.id = node.id;
    header.setAttribute('draggable', 'true');
    header.innerHTML = `
      <span class="bm-twisty">${state.expanded.has(node.id) ? '▾' : '▸'}</span>
      <span>${escapeHtml(node.title || 'Untitled folder')}</span>
    `;
    header.addEventListener('click', (e) => {
      // toggle only if click not coming from drag
      if (e.defaultPrevented) return;
      toggleFolder(node.id);
    });
    // DnD targets
    header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drag-over'); });
    header.addEventListener('dragleave', () => header.classList.remove('drag-over'));
    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');
      // Prefer our structured payload first
      const txt = e.dataTransfer.getData('text/plain');
      let handled = false;
      if (txt) {
        try {
          const payload = JSON.parse(txt || '{}');
          await handleDrop(payload, node.id);
          handled = true;
        } catch {/* not JSON */}
      }
      // Fallback: support dropping raw URLs/text from the page/address bar
      if (!handled) {
        const uri = e.dataTransfer.getData('text/uri-list') || '';
        const raw = uri || txt || '';
        if (raw) {
          const urlStr = raw.trim();
          try {
            // Validate URL (accept without protocol by trying to prepend https)
            let urlObj;
            try { urlObj = new URL(urlStr); }
            catch { urlObj = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`); }
            const finalUrl = urlObj.toString();
            await createIfNotDuplicate(node.id, urlObj.hostname || finalUrl, finalUrl);
            showToast('Bookmarked link');
          } catch { /* ignore invalid drops */ }
        }
      }
      await reloadBookmarks();
      ensureExpanded(node.id);
      renderBookmarks();
    });
    header.addEventListener('dragstart', (e) => {
      const payload = { type: 'folder', id: node.id, parentId: node.parentId };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      header.classList.add('dragging');
      
      // Update drag state
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'folder';
      
      // Insert drop zones after a small delay to allow render
      setTimeout(() => {
        // Insert drop zones in current parent
        const parentContainer = findParentContainer(node.parentId);
        if (parentContainer) {
          insertDropZones(parentContainer, node.parentId);
        }
        
        // Also insert drop zones in all expanded folders for cross-folder moves
        document.querySelectorAll('.bm-folder').forEach(folder => {
          const folderId = folder.dataset.id;
          if (state.expanded.has(folderId)) {
            const childrenContainer = folder.querySelector('.bm-children');
            if (childrenContainer && folderId !== node.id) { // Don't add to self
              insertDropZones(childrenContainer, folderId);
            }
          }
        });
      }, 10);
    });

    header.addEventListener('dragend', () => {
      // Remove visual feedback
      header.classList.remove('dragging');
      
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
      removeAllDropZones();
      
      // Re-render to catch any missed updates during drag
      render();
    });

    wrapper.appendChild(header);

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'bm-children';
    const shouldExpand = state.query ? true : state.expanded.has(node.id);
    if (shouldExpand && node.children && node.children.length) {
      node.children.forEach(ch => childrenWrap.appendChild(renderNode(ch, depth + 1)));
    }
    wrapper.appendChild(childrenWrap);
    return wrapper;
  }

  function renderBookmarkItem(node) {
    const div = document.createElement('div');
    div.className = 'prd-stv-cmd-item bm-bookmark';
    div.dataset.id = node.id;
    div.setAttribute('draggable', 'true');
    const fav = faviconFor({ type: 'bookmark', url: node.url });
    const q = state.query;
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;">
        <img class="prd-stv-favicon" src="${fav}" onerror="this.src='${FALLBACK_ICON}'" />
        <span class="prd-stv-title">${highlightMatches(node.title || node.url, q)}</span>
      </div>
      <button class="prd-stv-close-btn" title="Delete bookmark">×</button>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-close-btn')) {
        e.stopPropagation();
        deleteBookmark(node.id);
      } else {
        openUrl(node.url, e);
      }
    });
    div.addEventListener('dragstart', (e) => {
      const payload = { type: 'bookmark', id: node.id, parentId: node.parentId };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      div.classList.add('dragging');
      
      // Update drag state
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'bookmark';
      
      // Insert drop zones after a small delay to allow render
      setTimeout(() => {
        // Insert drop zones in current parent
        const parentContainer = findParentContainer(node.parentId);
        if (parentContainer) {
          insertDropZones(parentContainer, node.parentId);
        }
        
        // Also insert drop zones in all expanded folders for cross-folder moves
        document.querySelectorAll('.bm-folder').forEach(folder => {
          const folderId = folder.dataset.id;
          if (state.expanded.has(folderId)) {
            const childrenContainer = folder.querySelector('.bm-children');
            if (childrenContainer) {
              insertDropZones(childrenContainer, folderId);
            }
          }
        });
      }, 10);
    });

    div.addEventListener('dragend', () => {
      // Remove visual feedback
      div.classList.remove('dragging');
      
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
      removeAllDropZones();
      
      // Re-render to catch any missed updates during drag
      render();
    });
    return div;
  }

  function renderTabs() {
    el.tabs.innerHTML = '';
    const list = state.filteredTabs.length || state.query ? state.filteredTabs : state.tabs;
    if (!list || !list.length) {
      const empty = document.createElement('div');
      empty.className = 'prd-stv-empty';
      empty.textContent = 'No open tabs';
      el.tabs.appendChild(empty);
      return;
    }
    list.forEach(t => {
      const div = document.createElement('div');
      div.className = 'prd-stv-cmd-item';
      div.dataset.id = String(t.id);
      div.setAttribute('draggable', 'true');
      const fav = faviconFor({ type: 'tab', icon: t.favIconUrl, url: t.url });
      div.innerHTML = `
        <div style="display:flex;flex:1;align-items:center;">
          <img class="prd-stv-favicon" src="${fav}" onerror="this.src='${FALLBACK_ICON}'" />
          <span class="prd-stv-title">${highlightMatches(t.title || t.url || '', state.query)}</span>
        </div>
        <button class="prd-stv-close-btn" title="Close tab">×</button>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn')) {
          e.stopPropagation();
          closeTab(t.id);
        } else {
          activateTab(t);
        }
      });
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'tab', id: t.id, title: t.title, url: t.url }));
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.tabs.appendChild(div);
    });
  }

  function renderHistory() {
    el.history.innerHTML = '';
    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'prd-stv-empty';
      empty.textContent = 'No history';
      el.history.appendChild(empty);
      return;
    }
    state.history.forEach(h => {
      const div = document.createElement('div');
      div.className = 'prd-stv-cmd-item';
      div.dataset.id = String(h.id || '');
      div.setAttribute('draggable', 'true');
      const fav = faviconFor({ type: 'history', url: h.url });
      div.innerHTML = `
        <div style="display:flex;flex:1;align-items:center;">
          <img class="prd-stv-favicon" src="${fav}" onerror="this.src='${FALLBACK_ICON}'" />
          <span class="prd-stv-title">${highlightMatches(h.title || h.url || '', state.query)}</span>
        </div>
        <button class="prd-stv-close-btn" title="Delete from history">×</button>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn')) {
          e.stopPropagation();
          deleteHistoryItem(h.url);
        } else {
          openUrl(h.url || '', e);
        }
      });
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'history', url: h.url, title: h.title }));
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.history.appendChild(div);
    });
  }

  // Event handlers
  function toggleFolder(id) {
    if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
    persistExpanded();
    renderBookmarks();
  }

  function ensureExpanded(id) {
    state.expanded.add(id);
    persistExpanded();
  }

  async function handleDrop(payload, folderId) {
    if (!payload || !folderId) return;
    if (payload.type === 'bookmark') {
      await safeMove(payload.id, folderId);
      showToast('Bookmark moved');
    } else if (payload.type === 'folder') {
      await safeMove(payload.id, folderId);
      showToast('Folder moved');
    } else if (payload.type === 'tab') {
      if (!payload.url) return;
      await createIfNotDuplicate(folderId, payload.title || payload.url, payload.url);
      showToast('Bookmarked tab');
    } else if (payload.type === 'history') {
      if (!payload.url) return;
      await createIfNotDuplicate(folderId, payload.title || payload.url, payload.url);
      showToast('Bookmarked page');
    }
  }

  async function handleReorder(payload, targetParentId, targetIndex) {
    if (!payload || !payload.id) return;
    
    try {
      // Get current bookmark info to check current position
      const bookmarkInfo = await chrome.bookmarks.get(payload.id);
      if (!bookmarkInfo || !bookmarkInfo[0]) return;
      
      const currentItem = bookmarkInfo[0];
      const currentParentId = currentItem.parentId;
      
      // Chrome API removes the item first, then inserts at new position
      // We need to adjust based on whether we're moving up or down
      let adjustedIndex = targetIndex;
      
      if (currentParentId === targetParentId) {
        // Get all children to find current position
        const siblings = await chrome.bookmarks.getChildren(currentParentId);
        const currentIndex = siblings.findIndex(sibling => sibling.id === payload.id);
        
        // When moving within the same parent:
        // - Moving up (to lower index): use target index as-is
        // - Moving down (to higher index): no adjustment needed, Chrome handles it
        // The issue was we were always subtracting 1 when moving down
        adjustedIndex = targetIndex;
      }
      
      // Perform the move
      await chrome.bookmarks.move(payload.id, {
        parentId: targetParentId,
        index: adjustedIndex
      });
      
      if (payload.type === 'bookmark') {
        showToast('Bookmark reordered');
      } else if (payload.type === 'folder') {
        showToast('Folder reordered');
      }
    } catch (error) {
      console.error('Reorder error:', error);
      showToast('Failed to reorder item');
    }
  }

  async function activateTab(tab) {
    try {
      const updated = await chrome.tabs.update(tab.id, { active: true });
      if (updated && updated.windowId != null) {
        await chrome.windows.update(updated.windowId, { focused: true });
      }
      window.close();
    } catch {}
  }

  async function closeTab(tabId) {
    try {
      await chrome.tabs.remove(tabId);
      await reloadTabs();
      render();
      showToast('Tab closed');
    } catch {
      showToast('Failed to close tab');
    }
  }

  async function deleteBookmark(bookmarkId) {
    try {
      await chrome.bookmarks.remove(bookmarkId);
      await reloadBookmarks();
      render();
      showToast('Bookmark deleted');
    } catch {
      showToast('Failed to delete bookmark');
    }
  }

  async function deleteHistoryItem(url) {
    try {
      await chrome.history.deleteUrl({ url });
      await reloadHistory();
      render();
      showToast('Removed from history');
    } catch {
      showToast('Failed to remove from history');
    }
  }

  async function openUrl(url, mouseEvent) {
    if (!url) return;
    try {
      if (mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey)) {
        // Open in current tab
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active && active.id) {
          await chrome.tabs.update(active.id, { url });
        } else {
          await chrome.tabs.create({ url });
        }
      } else {
        // Open in new tab
        await chrome.tabs.create({ url });
      }
      window.close();
    } catch {}
  }

  // Data loading
  async function reloadBookmarks() {
    const roots = await chrome.bookmarks.getTree();
    // Flatten: use root[0].children which include bookmark bar/other/mobile
    state.bookmarksRoots = roots && roots[0] && roots[0].children ? roots[0].children : roots;
    applyBookmarkFilter();
  }

  function applyBookmarkFilter() {
    const q = state.query;
    if (!q) {
      state.filteredTree = [];
      return;
    }
    const lower = q.toLowerCase();
    state.filteredTree = state.bookmarksRoots
      .map(root => filterTree(root, lower))
      .filter(Boolean);
  }

  async function reloadTabs() {
    const all = await chrome.tabs.query({});
    const filtered = all.filter(t => t.url && !t.url.startsWith('chrome://'));
    filtered.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    state.tabs = filtered;
    applyTabFilter();
  }

  function applyTabFilter() {
    const q = state.query.toLowerCase();
    if (!q) { state.filteredTabs = []; return; }
    state.filteredTabs = state.tabs.filter(t => {
      const hay = ((t.title || '') + ' ' + (t.url || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  async function reloadHistory() {
    const text = state.query || '';
    const items = await chrome.history.search({ text, maxResults: 20 });
    items.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
    state.history = items;
  }

  const onSearch = debounce(async () => {
    state.query = (el.input.value || '').trim();
    applyBookmarkFilter();
    applyTabFilter();
    await reloadHistory();
    render();
  }, 200);

  // Init
  document.addEventListener('DOMContentLoaded', async () => {
    el.root = document.getElementById('prd-stv-popup-root');
    el.input = document.getElementById('prd-stv-popup-input');
    el.tree = document.getElementById('bookmarks-tree');
    el.tabs = document.getElementById('tabs-list');
    el.history = document.getElementById('history-list');
    el.input.focus();
    await loadExpanded();
    await Promise.all([reloadBookmarks(), reloadTabs(), reloadHistory()]);
    render();

    el.input.addEventListener('input', onSearch);

    // Live-update UI on external bookmark changes
    try {
      chrome.bookmarks.onCreated.addListener((id, bm) => {
        reloadBookmarks().then(() => { 
          if (bm && bm.parentId) ensureExpanded(bm.parentId); 
          if (!state.dragState.isDragging) renderBookmarks(); 
        });
      });
      chrome.bookmarks.onMoved.addListener((id, info) => {
        reloadBookmarks().then(() => { 
          if (info && info.parentId) ensureExpanded(info.parentId); 
          if (!state.dragState.isDragging) renderBookmarks(); 
        });
      });
      chrome.bookmarks.onChanged.addListener(() => {
        reloadBookmarks().then(() => {
          if (!state.dragState.isDragging) renderBookmarks();
        });
      });
      chrome.bookmarks.onRemoved.addListener(() => {
        reloadBookmarks().then(() => {
          if (!state.dragState.isDragging) renderBookmarks();
        });
      });
      
      // Add debounced tab update handler for popup too
      const debouncedTabUpdate = debounce(() => {
        reloadTabs().then(() => {
          if (!state.dragState.isDragging) renderTabs();
        });
      }, 500);
      
      chrome.tabs.onCreated.addListener(debouncedTabUpdate);
      chrome.tabs.onRemoved.addListener(debouncedTabUpdate);
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
          debouncedTabUpdate();
        }
      });
    } catch {}
  });
})();
