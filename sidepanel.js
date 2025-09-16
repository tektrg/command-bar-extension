// sidepanel.js - Main entry point for Side panel functionality
(function () {
  // DOM references
  const elements = {
    input: null,
    combined: null,
    root: null,
  };

  // Application state
  const state = {
    query: '',
    bookmarksRoots: [],
    filteredTree: [],
    expanded: new Set(),
    tabs: [],
    filteredTabs: [],
    bookmarkTabRelationships: {}, // bookmarkId -> tabId mapping
    dragState: {
      isDragging: false,
      draggedItem: null,
      draggedType: null,
    },
    // Item tracking maps for selective updates
    itemMaps: {
      bookmarks: new Map(), // id -> bookmark object
      tabs: new Map(),      // id -> tab object
      history: new Map()    // url -> history object (history uses URL as key)
    }
  };

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
    } catch {}
  }

  async function closeTab(tabId) {
    try {
      // Remove bookmark-tab relationship before closing
      await removeBookmarkTabRelationship(tabId);
      await chrome.tabs.remove(tabId);
      await reloadTabs();
      window.renderer.render(state, elements);
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
        window.renderer.render(state, elements);
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
      window.renderer.render(state, elements);
      window.utils.showToast('Tab duplicated');
    } catch {
      window.utils.showToast('Failed to duplicate tab');
    }
  }

  async function deleteBookmark(bookmarkId) {
    try {
      await chrome.bookmarks.remove(bookmarkId);
      await reloadBookmarks();
      window.renderer.render(state, elements);
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
      window.renderer.render(state, elements);
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
          window.renderer.render(state, elements);
        }
        return;
      }

      // If no source tab specified, check if the bookmark URL matches any open tab
      if (bookmark.url) {
        const matchingTab = state.tabs.find(tab => tab.url === bookmark.url);
        if (matchingTab) {
          await createBookmarkTabRelationship(bookmark.id, matchingTab.id);
          // Update UI to show the highlighted bookmark
          window.renderer.render(state, elements);
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
          window.renderer.render(state, elements);
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
        window.renderer.render(state, elements);
      }
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
    
    state.tabs = filtered;
    
    // Populate tabs itemMap
    state.itemMaps.tabs.clear();
    filtered.forEach(tab => {
      state.itemMaps.tabs.set(tab.id, tab);
    });
    
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

  const onSearch = window.utils.debounce(async () => {
    state.query = (elements.input.value || '').trim();
    applyBookmarkFilter();
    applyTabFilter();
    window.renderer.render(state, elements);
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
  window.elements = elements;
  window.state = state;

  // Init
  document.addEventListener('DOMContentLoaded', async () => {
    elements.root = document.getElementById('prd-stv-sidepanel-root');
    elements.input = document.getElementById('prd-stv-sidepanel-input');
    elements.combined = document.getElementById('combined-list');
    
    // Set focus to input
    elements.input.focus();
    
    await Promise.all([
      window.storage.loadExpandedFolders(state),
      window.storage.loadBookmarkTabLinks(state),
      reloadBookmarks(), 
      reloadTabs()
    ]);
    
    // Clean up any stale bookmark-tab relationships (tabs that no longer exist)
    await cleanupStaleBookmarkTabLinks();
    window.renderer.render(state, elements);

    elements.input.addEventListener('input', onSearch);

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
          window.renderer.render(state, elements);
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
            window.renderer.render(state, elements);
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
          window.renderer.render(state, elements);
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
          applyTabFilter();
          window.renderer.render(state, elements);
        } else {
          // Update tabs array and insert at correct position
          reloadTabs().then(() => {
            window.renderer.insertTabAtCorrectPosition(tab, state, elements);
          });
        }
      });

      chrome.tabs.onRemoved.addListener(async (tabId) => {
        if (state.dragState.isDragging) return;
        
        // Clean up bookmark-tab relationship when tab is closed
        await removeBookmarkTabRelationship(tabId);
        removeSingleItem('tabs', tabId);
        window.renderer.updateTabItemInDOM(tabId, null, state, elements);
        
        // Update the tabs array to maintain consistency
        state.tabs = state.tabs.filter(t => t.id !== tabId);
        state.filteredTabs = state.filteredTabs.filter(t => t.id !== tabId);
      });
      
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (state.dragState.isDragging) return;
        // Only reload on meaningful changes that affect display
        if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl && !changeInfo.active) return;
        
        state.itemMaps.tabs.set(tabId, tab);
        
        // Update the tab in the tabs array
        const tabIndex = state.tabs.findIndex(t => t.id === tabId);
        if (tabIndex !== -1) {
          state.tabs[tabIndex] = tab;
        }
        
        if (state.query) {
          applyTabFilter();
        }
        
        window.renderer.updateTabItemInDOM(tabId, tab, state, elements);
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
            
            // Update the tab in the tabs array
            const tabIndex = state.tabs.findIndex(t => t.id === activeInfo.tabId);
            if (tabIndex !== -1) {
              state.tabs[tabIndex] = activeTab;
            }
            
            // Also need to update the previously active tab to remove its active state
            // First, mark all tabs as inactive in our state
            state.tabs.forEach(tab => {
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
            window.renderer.render(state, elements);
          }
        } catch (error) {
          console.error('Failed to handle tab activation:', error);
        }
      });
    } catch {}
  });

})();