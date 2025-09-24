/**
 * appBootstrap.js - Shared bootstrap for command surfaces (popup and sidepanel)
 */
(function () {
  const DEFAULT_CONFIG = {
    surface: 'sidepanel',
    rootId: 'prd-stv-sidepanel-root',
    inputId: 'prd-stv-sidepanel-input',
    listId: 'combined-list',
    shouldFocusInput: true,
    shouldCloseOnOpen: false,
  };

  function appBootstrapInit(userConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };

    appBootstrapInit.instances = appBootstrapInit.instances || new Map();
    const instanceKey = config.instanceKey || `${config.surface}:${config.rootId}`;
    if (config.forceReinitialize) {
      appBootstrapInit.instances.delete(instanceKey);
    } else if (appBootstrapInit.instances.has(instanceKey)) {
      return appBootstrapInit.instances.get(instanceKey);
    }

    // DOM references
    const elements = {
      input: null,
      combined: null,
      root: null,
    };

    // Application state
    const state = {
      query: '',
      // Keyboard navigation selected index for sidepanel list
      selectedIndex: -1,
      bookmarksRoots: [],
      filteredTree: [],
      expanded: new Set(),
      tabs: [],
      filteredTabs: [],
      inactiveTabs: [],
      filteredInactiveTabs: [],
      bookmarkTabRelationships: {}, // bookmarkId -> tabId mapping
      tabSortMode: 'position', // Default tab sort mode
      dragState: {
        isDragging: false,
        draggedItem: null,
        draggedType: null,
      },
      // Item tracking maps for selective updates
      itemMaps: {
        bookmarks: new Map(), // id -> bookmark object
        tabs: new Map(),      // id -> tab object
        history: new Map(),   // url -> history object (history uses URL as key)
      },
    };

  const isPopupSurface = config.surface === 'popup';
  const shouldCloseOnOpen = config.shouldCloseOnOpen ?? isPopupSurface;

  const maybeCloseSurface = () => {
    if (!shouldCloseOnOpen) return;
    try {
      window.close();
    } catch {}
  };

  const instance = { config, state, elements };
  appBootstrapInit.instances.set(instanceKey, instance);

  // Bookmark-tab relationship management
  async function createBookmarkTabRelationship(bookmarkId, tabId) {
    state.bookmarkTabRelationships[bookmarkId] = tabId;
    await window.storage.saveBookmarkTabLinks(state);
  }

  async function removeBookmarkTabRelationship(tabId) {
    // Remove relationship when tab is closed
    for (const [bookmarkId, relatedTabId] of Object.entries(state.bookmarkTabRelationships)) {
      if (relatedTabId === tabId) {
        delete state.bookmarkTabRelationships[bookmarkId];
        break;
      }
    }
    await window.storage.saveBookmarkTabLinks(state);
  }

  function getBookmarkForTab(tabId) {
    for (const [bookmarkId, relatedTabId] of Object.entries(state.bookmarkTabRelationships)) {
      if (relatedTabId === tabId) {
        return bookmarkId;
      }
    }
    return null;
  }

  async function cleanupStaleBookmarkTabLinks() {
    let needsCleanup = false;
    const currentTabIds = new Set(state.tabs.map(tab => tab.id));
    
    // Check each bookmark-tab relationship
    for (const [bookmarkId, tabId] of Object.entries(state.bookmarkTabRelationships)) {
      if (!currentTabIds.has(tabId)) {
        // Tab no longer exists, remove the relationship
        delete state.bookmarkTabRelationships[bookmarkId];
        needsCleanup = true;
      }
    }
    
    // Save cleaned up relationships if any were removed
    if (needsCleanup) {
      await window.storage.saveBookmarkTabLinks(state);
    }
  }

  // Selective data update functions
  async function updateSingleBookmark(bookmarkId) {
    try {
      const [bookmark] = await chrome.bookmarks.get(bookmarkId).catch(() => []);
      if (bookmark) {
        state.itemMaps.bookmarks.set(bookmarkId, bookmark);
        return bookmark;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function updateSingleTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        state.itemMaps.tabs.set(tabId, tab);
        return tab;
      }
      return null;
    } catch {
      return null;
    }
  }

  function removeSingleItem(type, id) {
    state.itemMaps[type].delete(id);
  }

  // Incremental filter update functions
  function addItemToFilteredResults(item, type) {
    const query = state.query.toLowerCase();
    if (!query) return;
    
    if (type === 'bookmark' && window.bookmarks.nodeMatches && window.bookmarks.nodeMatches(item, query)) {
      // Add to filtered tree maintaining structure
      addToFilteredTree(item);
    } else if (type === 'tab') {
      const hay = ((item.title || '') + ' ' + (item.url || '')).toLowerCase();
      if (hay.includes(query)) {
        state.filteredTabs.push(item);
      }
    }
  }

  function removeItemFromFilteredResults(itemId, type) {
    if (!state.query) return;
    
    if (type === 'bookmark') {
      removeFromFilteredTree(itemId);
    } else if (type === 'tab') {
      state.filteredTabs = state.filteredTabs.filter(t => t.id !== itemId);
    }
  }

  function addToFilteredTree(bookmark) {
    // This is a simplified implementation - in a full implementation,
    // you would need to reconstruct the tree structure while maintaining parent-child relationships
    if (!state.filteredTree.some(root => containsBookmark(root, bookmark.id))) {
      // For now, we'll trigger a full filter re-application
      // A full implementation would maintain the tree structure incrementally
      applyBookmarkFilter();
    }
  }

  function removeFromFilteredTree(bookmarkId) {
    // Remove from filtered tree
    state.filteredTree = state.filteredTree.map(root => removeBookmarkFromTree(root, bookmarkId)).filter(Boolean);
  }

  function containsBookmark(node, bookmarkId) {
    if (node.id === bookmarkId) return true;
    if (node.children) {
      return node.children.some(child => containsBookmark(child, bookmarkId));
    }
    return false;
  }

  function removeBookmarkFromTree(node, bookmarkId) {
    if (node.id === bookmarkId) return null;
    
    if (node.children) {
      node.children = node.children.map(child => removeBookmarkFromTree(child, bookmarkId)).filter(Boolean);
      // If folder has no children after removal and doesn't match query itself, remove it
      if (node.children.length === 0 && !node.url) {
        const query = state.query.toLowerCase();
        if (!node.title || !node.title.toLowerCase().includes(query)) {
          return null;
        }
      }
    }
    
    return node;
  }

  // Tab and bookmark operations
  async function activateTab(tab) {
    try {
      const updated = await chrome.tabs.update(tab.id, { active: true });
      if (updated && updated.windowId != null) {
        await chrome.windows.update(updated.windowId, { focused: true });
      }
      maybeCloseSurface();
    } catch {}
  }

  async function closeTab(tabId) {
    try {
      // Remove bookmark-tab relationship before closing
      await removeBookmarkTabRelationship(tabId);
      await chrome.tabs.remove(tabId);
      await reloadTabs();
      await window.renderer.render(state, elements);
      window.utils.showToast('Tab closed');
    } catch {
      window.utils.showToast('Failed to close tab');
    }
  }

  async function closeTabFromBookmark(bookmarkId) {
    try {
      const tabId = state.bookmarkTabRelationships[bookmarkId];
      if (tabId) {
        await removeBookmarkTabRelationship(tabId);
        await chrome.tabs.remove(tabId);
        await reloadTabs();
        await window.renderer.render(state, elements);
        window.utils.showToast('Tab closed');
      }
    } catch {
      window.utils.showToast('Failed to close tab');
    }
  }

  async function duplicateTab(tab) {
    try {
      await chrome.tabs.create({ 
        url: tab.url,
        windowId: tab.windowId,
        index: tab.index + 1
      });
      await reloadTabs();
      await window.renderer.render(state, elements);
      window.utils.showToast('Tab duplicated');
    } catch {
      window.utils.showToast('Failed to duplicate tab');
    }
  }

  async function deleteBookmark(bookmarkId) {
    try {
      await chrome.bookmarks.remove(bookmarkId);
      await reloadBookmarks();
      await window.renderer.render(state, elements);
      window.utils.showToast('Bookmark deleted');
    } catch {
      window.utils.showToast('Failed to delete bookmark');
    }
  }

  async function saveActiveTabToFolder(folderId) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://')) {
        window.utils.showToast('Cannot save this tab');
        return;
      }

      const bookmark = await chrome.bookmarks.create({
        parentId: folderId,
        title: activeTab.title || 'Untitled',
        url: activeTab.url
      });

      // Create the tab-bookmark relationship for the active tab
      await handleNewBookmarkCreation(bookmark, activeTab.id);

      await reloadBookmarks();
      await window.renderer.render(state, elements);
      window.utils.showToast('Tab saved to folder');
    } catch {
      window.utils.showToast('Failed to save tab');
    }
  }

  async function handleNewBookmarkCreation(bookmark, sourceTabId = null) {
    try {
      // If a specific source tab is provided, create the relationship
      if (sourceTabId && bookmark.id) {
        // Verify the tab still exists and is open
        const tab = state.tabs.find(t => t.id === sourceTabId);
        if (tab) {
          await createBookmarkTabRelationship(bookmark.id, sourceTabId);
          // Update UI to show the highlighted bookmark
          await window.renderer.render(state, elements);
        }
        return;
      }

      // If no source tab specified, check if the bookmark URL matches any open tab
      if (bookmark.url) {
        const matchingTab = state.tabs.find(tab => tab.url === bookmark.url);
        if (matchingTab) {
          await createBookmarkTabRelationship(bookmark.id, matchingTab.id);
          // Update UI to show the highlighted bookmark
          await window.renderer.render(state, elements);
        }
      }
    } catch (error) {
      console.warn('Failed to handle new bookmark creation:', error);
    }
  }

  async function openUrl(url, mouseEvent, bookmarkId = null) {
    if (!url) return;
    try {
      // If this is a bookmark that already has an associated tab, switch to that tab
      if (bookmarkId && state.bookmarkTabRelationships[bookmarkId]) {
        const existingTabId = state.bookmarkTabRelationships[bookmarkId];
        const existingTab = state.tabs.find(tab => tab.id === existingTabId);
        
        if (existingTab) {
          // Switch to the existing tab
          await activateTab(existingTab);
          return;
        } else {
          // Tab no longer exists, remove the relationship and save to persistent storage
          delete state.bookmarkTabRelationships[bookmarkId];
          await window.storage.saveBookmarkTabLinks(state);
        }
      }
      
      // Check if there's already an open tab with this URL
      const matchingTab = state.tabs.find(tab => tab.url === url);
      if (matchingTab) {
        // Switch to the existing tab
        await activateTab(matchingTab);
        
        // If this was a bookmark click, create the relationship
        if (bookmarkId) {
          await createBookmarkTabRelationship(bookmarkId, matchingTab.id);
          await window.renderer.render(state, elements);
        }
        return;
      }
      
      let targetTab;
      if (mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey)) {
        // Open in current tab
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active && active.id) {
          targetTab = await chrome.tabs.update(active.id, { url });
        } else {
          targetTab = await chrome.tabs.create({ url });
        }
      } else {
        // Create new tab
        targetTab = await chrome.tabs.create({ url });
      }
      
      // Create bookmark-tab relationship if this was opened from a bookmark
      if (bookmarkId && targetTab && targetTab.id) {
        await createBookmarkTabRelationship(bookmarkId, targetTab.id);
        // Re-render to show the updated relationship
        await window.renderer.render(state, elements);
      }

      maybeCloseSurface();
    } catch {}
  }

  // Data loading
  async function reloadBookmarks() {
    const roots = await chrome.bookmarks.getTree();
    state.bookmarksRoots = roots && roots[0] && roots[0].children ? roots[0].children : roots;
    
    // Populate bookmarks itemMap
    state.itemMaps.bookmarks.clear();
    function populateBookmarkMap(nodes) {
      if (!nodes) return;
      nodes.forEach(node => {
        state.itemMaps.bookmarks.set(node.id, node);
        if (node.children) {
          populateBookmarkMap(node.children);
        }
      });
    }
    populateBookmarkMap(state.bookmarksRoots);
    
    applyBookmarkFilter();
  }

  // ----- Keyboard navigation helpers (sidepanel) -----
  function getLinearItems() {
    return Array.from(elements.combined.querySelectorAll('.prd-stv-cmd-item'));
  }

  function clearSelectionHighlight() {
    elements.combined
      .querySelectorAll('.prd-stv-cmd-item.prd-stv-active')
      .forEach(el => el.classList.remove('prd-stv-active'));
  }

  function ensureIndexInRange(index, items) {
    if (!items.length) return -1;
    if (index < -1) return -1;
    if (index >= items.length) return items.length - 1;
    return index;
  }

  function updateSelection(newIndex) {
    const items = getLinearItems();
    newIndex = ensureIndexInRange(newIndex, items);
    clearSelectionHighlight();
    state.selectedIndex = newIndex;
    if (newIndex >= 0 && items[newIndex]) {
      const el = items[newIndex];
      el.classList.add('prd-stv-active');
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function resetSelection() {
    state.selectedIndex = -1;
    clearSelectionHighlight();
  }

  function handleNavigationKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false;
    const items = getLinearItems();
    if (!items.length) return true;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (state.selectedIndex === -1) {
      updateSelection(e.key === 'ArrowDown' ? 0 : items.length - 1);
    } else {
      updateSelection(state.selectedIndex + dir);
    }
    return true;
  }

  function handleActivationKey(e) {
    if (e.key !== 'Enter') return false;
    const items = getLinearItems();
    const idx = state.selectedIndex;
    if (idx < 0 || !items[idx]) return true;
    e.preventDefault();
    const el = items[idx];
    const itemType = el.dataset.itemType || '';
    if (el.classList.contains('tab-from-bookmark') && itemType !== 'bookmark') {
      // Do not activate dimmed tabs opened from bookmarks
      return true;
    }
    if (itemType === 'bookmark') {
      const bookmarkId = el.dataset.id;
      const bookmark = state.itemMaps.bookmarks.get(bookmarkId);
      if (bookmark) openUrl(bookmark.url, null, bookmarkId);
    } else {
      const tabId = Number(el.dataset.id);
      const tab = state.itemMaps.tabs.get(tabId) || state.tabs.find(t => t.id === tabId);
      if (tab) activateTab(tab);
    }
    return true;
  }

  function attachKeyboardHandlers() {
    // Input-focused navigation
    elements.input.addEventListener('keydown', (e) => {
      if (handleNavigationKey(e)) return;
      if (handleActivationKey(e)) return;
    });

    // Allow navigation when focus is within the list
    elements.combined.addEventListener('keydown', (e) => {
      if (handleNavigationKey(e)) return;
      if (handleActivationKey(e)) return;
    });

    // Keep selection in sync when clicking with mouse
    elements.combined.addEventListener('click', (e) => {
      const item = e.target.closest('.prd-stv-cmd-item');
      if (!item) return;
      const items = getLinearItems();
      const idx = items.indexOf(item);
      if (idx !== -1) updateSelection(idx);
    });
  }

  function applyBookmarkFilter() {
    const query = state.query;
    if (!query) {
      state.filteredTree = [];
      return;
    }
    const lowerQuery = query.toLowerCase();
    state.filteredTree = state.bookmarksRoots
      .map(root => window.bookmarks.filterTree(root, lowerQuery))
      .filter(Boolean);
  }

  async function reloadTabs() {
    const all = await chrome.tabs.query({});
    const filtered = all.filter(t => t.url && !t.url.startsWith('chrome://'));
    
    // Debug: log active tabs
    const activeTabs = filtered.filter(t => t.active);
    console.log('Active tabs found:', activeTabs.length, activeTabs.map(t => `${t.title} (${t.id})`));
    
    // Sort tabs by windowId first, then by index to maintain proper order
    filtered.sort((a, b) => {
      if (a.windowId !== b.windowId) {
        return a.windowId - b.windowId;
      }
      return a.index - b.index;
    });
    
    // Categorize tabs into active and inactive using tabUtils
    const { active, inactive } = window.tabUtils.categorizeTabsByActivity(filtered);
    state.tabs = active;
    state.inactiveTabs = inactive;
    
    // Populate tabs itemMap for both active and inactive tabs
    state.itemMaps.tabs.clear();
    [...active, ...inactive].forEach(tab => {
      state.itemMaps.tabs.set(tab.id, tab);
    });
    
    applyTabFilter();
  }

  function applyTabFilter() {
    const q = state.query.toLowerCase();
    if (!q) { 
      state.filteredTabs = []; 
      state.filteredInactiveTabs = [];
      return; 
    }
    
    // Filter both active and inactive tabs
    state.filteredTabs = state.tabs.filter(t => {
      const hay = ((t.title || '') + ' ' + (t.url || '')).toLowerCase();
      return hay.includes(q);
    });
    
    state.filteredInactiveTabs = state.inactiveTabs.filter(t => {
      const hay = ((t.title || '') + ' ' + (t.url || '')).toLowerCase();
      return hay.includes(q);
    });
  }

  const onSearch = window.utils.debounce(async () => {
    state.query = (elements.input.value || '').trim();
    applyBookmarkFilter();
    applyTabFilter();
    await window.renderer.render(state, elements);
    // Reset selection for new result set
    resetSelection();
  }, 200);

  // Utility function to count open bookmarks in a folder (one level only)
  function getOpenBookmarkCountInFolder(folderId, state) {
    const folder = state.itemMaps.bookmarks.get(folderId);
    if (!folder?.children) return 0;
    
    return folder.children.filter(child => 
      child.url && state.bookmarkTabRelationships[child.id]
    ).length;
  }

  // Close all tabs associated with bookmarks in a folder (one level only)
  async function closeTabsInFolder(folderId) {
    const folder = state.itemMaps.bookmarks.get(folderId);
    if (!folder?.children) return;
    
    const bookmarksWithTabs = folder.children.filter(child => 
      child.url && state.bookmarkTabRelationships[child.id]
    );
    
    if (bookmarksWithTabs.length === 0) return;
    
    // Close tabs using existing function
    const promises = bookmarksWithTabs.map(bookmark => closeTabFromBookmark(bookmark.id));
    await Promise.all(promises);
    
    window.utils.showToast(`Closed ${bookmarksWithTabs.length} tabs`);
  }

  // Close all inactive tabs
  async function closeAllInactiveTabs() {
    if (state.inactiveTabs.length === 0) {
      window.utils.showToast('No inactive tabs to close');
      return;
    }
    
    const tabCount = state.inactiveTabs.length;
    
    try {
      // Close all inactive tabs using existing closeTab function
      const promises = state.inactiveTabs.map(tab => chrome.tabs.remove(tab.id));
      await Promise.all(promises);
      
      // Reload tabs to update state
      await reloadTabs();
      await window.renderer.render(state, elements);
      window.utils.showToast(`Closed ${tabCount} inactive tabs`);
    } catch (error) {
      console.error('Failed to close inactive tabs:', error);
      window.utils.showToast('Failed to close some inactive tabs');
    }
  }

  // Expose necessary functions and state to global scope for other modules
  window.activateTab = activateTab;
  window.closeTab = closeTab;
  window.closeTabFromBookmark = closeTabFromBookmark;
  window.duplicateTab = duplicateTab;
  window.deleteBookmark = deleteBookmark;
  window.saveActiveTabToFolder = saveActiveTabToFolder;
  window.handleNewBookmarkCreation = handleNewBookmarkCreation;
  window.openUrl = openUrl;
  window.reloadBookmarks = reloadBookmarks;
  window.reloadTabs = reloadTabs;
  window.getOpenBookmarkCountInFolder = getOpenBookmarkCountInFolder;
  window.closeTabsInFolder = closeTabsInFolder;
  window.closeAllInactiveTabs = closeAllInactiveTabs;
  window.elements = elements;
  window.state = state;

  // Init
  const boot = async () => {
    const resolveElement = (id) => {
      if (!id) return null;
      return document.getElementById(id) || elements.root?.querySelector(`#${id}`);
    };

    elements.root = document.getElementById(config.rootId) || document.querySelector(config.rootSelector || `#${config.rootId}`);
    if (!elements.root) {
      console.warn('Command bar bootstrap: root element not found', config);
      return;
    }

    elements.input = resolveElement(config.inputId);
    elements.combined = resolveElement(config.listId);

    if (!elements.input || !elements.combined) {
      console.warn('Command bar bootstrap: missing input or list element', config);
      return;
    }

    if (config.shouldFocusInput && typeof elements.input.focus === 'function') {
      elements.input.focus();
    }

    await Promise.all([
      window.storage.loadExpandedFolders(state),
      window.storage.loadBookmarkTabLinks(state),
      window.storage.loadTabSortMode(state),
      window.storage.loadBookmarkViewMode(state),
      reloadBookmarks(), 
      reloadTabs()
    ]);
    
    // Clean up any stale bookmark-tab relationships (tabs that no longer exist)
    await cleanupStaleBookmarkTabLinks();
    await window.renderer.render(state, elements);
    // Re-apply selection highlight after render
    updateSelection(state.selectedIndex);

    elements.input.addEventListener('input', onSearch);
    // Reset selection when typing a new query
    elements.input.addEventListener('input', () => { resetSelection(); });

    // Keyboard navigation bindings
    attachKeyboardHandlers();

    // Listen for storage changes to sync between windows
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      if (namespace === 'local' && changes[window.CONSTANTS.STORAGE_KEYS.BOOKMARK_TAB_LINKS]) {
        // Another window updated bookmark-tab relationships
        const newRelationships = changes[window.CONSTANTS.STORAGE_KEYS.BOOKMARK_TAB_LINKS].newValue;
        if (newRelationships && typeof newRelationships === 'object') {
          state.bookmarkTabRelationships = newRelationships;
          // Re-render to update bookmark highlighting across windows
          await window.renderer.render(state, elements);
        }
      }
    });

    // Live-update UI on external changes with selective updates
    try {
      chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
        if (state.dragState.isDragging) return;
        
        state.itemMaps.bookmarks.set(id, bookmark);
        if (bookmark.parentId) window.folderState.ensureExpanded(bookmark.parentId, state, window.storage);
        
        // Handle automatic tab-bookmark linking for new bookmarks
        await handleNewBookmarkCreation(bookmark);
        
        if (state.query) {
          // Re-render filtered results
          applyBookmarkFilter();
          await window.renderer.render(state, elements);
        } else {
          // Insert single item
          await window.renderer.insertBookmarkAtCorrectPosition(bookmark, state, elements);
        }
      });

      chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
        if (state.dragState.isDragging) return;
        
        const bookmark = await updateSingleBookmark(id);
        
        // Remove from old position
        const existingElement = elements.combined.querySelector(`[data-id="${id}"]`);
        if (existingElement) existingElement.remove();
        
        // Insert at new position
        if (bookmark) {
          if (moveInfo.parentId) window.folderState.ensureExpanded(moveInfo.parentId, state, window.storage);
          if (state.query) {
            applyBookmarkFilter();
            await window.renderer.render(state, elements);
          } else {
            await window.renderer.insertBookmarkAtCorrectPosition(bookmark, state, elements);
          }
        }
      });

      chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
        if (state.dragState.isDragging) return;
        
        const updatedBookmark = await updateSingleBookmark(id);
        window.renderer.updateBookmarkItemInDOM(id, updatedBookmark, state, elements);
        
        // Only trigger filter/search re-application if query exists
        if (state.query) {
          applyBookmarkFilter();
          await window.renderer.render(state, elements);
        }
      });

      chrome.bookmarks.onRemoved.addListener((id) => {
        if (state.dragState.isDragging) return;
        
        removeSingleItem('bookmarks', id);
        window.renderer.updateBookmarkItemInDOM(id, null, state, elements);
      });
      
      // Listen for tab changes with selective updates
      chrome.tabs.onCreated.addListener((tab) => {
        if (state.dragState.isDragging) return;
        
        state.itemMaps.tabs.set(tab.id, tab);
        if (state.query) {
          // Re-categorize and re-render when searching
          reloadTabs().then(async () => {
            await window.renderer.render(state, elements);
          });
        } else {
          // Update tabs array and insert at correct position
          reloadTabs().then(async () => {
            await window.renderer.render(state, elements);
          });
        }
      });

      chrome.tabs.onRemoved.addListener(async (tabId) => {
        if (state.dragState.isDragging) return;
        
        // Clean up bookmark-tab relationship when tab is closed
        await removeBookmarkTabRelationship(tabId);
        removeSingleItem('tabs', tabId);
        window.renderer.updateTabItemInDOM(tabId, null, state, elements);
        
        // Update both active and inactive tabs arrays to maintain consistency
        state.tabs = state.tabs.filter(t => t.id !== tabId);
        state.inactiveTabs = state.inactiveTabs.filter(t => t.id !== tabId);
        state.filteredTabs = state.filteredTabs.filter(t => t.id !== tabId);
        state.filteredInactiveTabs = state.filteredInactiveTabs.filter(t => t.id !== tabId);
      });
      
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (state.dragState.isDragging) return;
        // Only reload on meaningful changes that affect display
        if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl && !changeInfo.active) return;
        
        state.itemMaps.tabs.set(tabId, tab);
        
        // Tab might have moved between active/inactive, so re-categorize
        const wasInActive = state.tabs.findIndex(t => t.id === tabId) !== -1;
        const wasInInactive = state.inactiveTabs.findIndex(t => t.id === tabId) !== -1;
        const isNowInactive = window.tabUtils.isTabInactive(tab);
        
        // If activity status changed, do a full reload to re-categorize
        if ((wasInActive && isNowInactive) || (wasInInactive && !isNowInactive)) {
          await reloadTabs();
          await window.renderer.render(state, elements);
        } else {
          // Update the tab in the appropriate array
          const activeIndex = state.tabs.findIndex(t => t.id === tabId);
          if (activeIndex !== -1) {
            state.tabs[activeIndex] = tab;
          }
          
          const inactiveIndex = state.inactiveTabs.findIndex(t => t.id === tabId);
          if (inactiveIndex !== -1) {
            state.inactiveTabs[inactiveIndex] = tab;
          }
          
          if (state.query) {
            applyTabFilter();
          }
          
          window.renderer.updateTabItemInDOM(tabId, tab, state, elements);
        }
      });
      
      // Listen for tab activation changes - this is the primary event for active tab switching
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        console.log('Tab activated:', activeInfo.tabId);
        if (state.dragState.isDragging) return;
        
        // Get the newly activated tab and update it
        try {
          const activeTab = await chrome.tabs.get(activeInfo.tabId);
          if (activeTab) {
            state.itemMaps.tabs.set(activeInfo.tabId, activeTab);
            
            // Update the tab in the appropriate array (active or inactive)
            const activeIndex = state.tabs.findIndex(t => t.id === activeInfo.tabId);
            const inactiveIndex = state.inactiveTabs.findIndex(t => t.id === activeInfo.tabId);
            
            if (activeIndex !== -1) {
              state.tabs[activeIndex] = activeTab;
            }
            if (inactiveIndex !== -1) {
              state.inactiveTabs[inactiveIndex] = activeTab;
            }
            
            // Also need to update the previously active tab to remove its active state
            // Mark all tabs as inactive in our state
            [...state.tabs, ...state.inactiveTabs].forEach(tab => {
              if (tab.id !== activeInfo.tabId) {
                tab.active = false;
                state.itemMaps.tabs.set(tab.id, tab);
              }
            });
            
            // Update the filtered tabs if there's a query
            if (state.query) {
              applyTabFilter();
            }
            
            // Force a full re-render to update all tab highlight states
            await window.renderer.render(state, elements);
          }
        } catch (error) {
          console.error('Failed to handle tab activation:', error);
        }
      });
    } catch {}
  };

    const bootPromise = new Promise((resolve) => {
      const run = async () => {
        try {
          await boot();
        } finally {
          resolve();
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
      } else {
        run();
      }
    });

    instance.ready = bootPromise;
    return instance;
  }

  window.appBootstrap = window.appBootstrap || {};
  window.appBootstrap.init = appBootstrapInit;
})();
