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
  };

  // Bookmark-tab relationship management
  function createBookmarkTabRelationship(bookmarkId, tabId) {
    state.bookmarkTabRelationships[bookmarkId] = tabId;
  }

  function removeBookmarkTabRelationship(tabId) {
    // Remove relationship when tab is closed
    for (const [bookmarkId, relatedTabId] of Object.entries(state.bookmarkTabRelationships)) {
      if (relatedTabId === tabId) {
        delete state.bookmarkTabRelationships[bookmarkId];
        break;
      }
    }
  }

  function getBookmarkForTab(tabId) {
    for (const [bookmarkId, relatedTabId] of Object.entries(state.bookmarkTabRelationships)) {
      if (relatedTabId === tabId) {
        return bookmarkId;
      }
    }
    return null;
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
      removeBookmarkTabRelationship(tabId);
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
        removeBookmarkTabRelationship(tabId);
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

      await chrome.bookmarks.create({
        parentId: folderId,
        title: activeTab.title || 'Untitled',
        url: activeTab.url
      });

      await reloadBookmarks();
      window.renderer.render(state, elements);
      window.utils.showToast('Tab saved to folder');
    } catch {
      window.utils.showToast('Failed to save tab');
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
          // Tab no longer exists, remove the relationship
          delete state.bookmarkTabRelationships[bookmarkId];
        }
      }
      
      // Check if there's already an open tab with this URL
      const existingTabByUrl = state.tabs.find(tab => tab.url === url);
      if (existingTabByUrl) {
        // Switch to the existing tab
        await activateTab(existingTabByUrl);
        // Create bookmark-tab relationship if this was opened from a bookmark
        if (bookmarkId) {
          createBookmarkTabRelationship(bookmarkId, existingTabByUrl.id);
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
        // Open in new tab
        targetTab = await chrome.tabs.create({ url });
      }
      
      // Create bookmark-tab relationship if this was opened from a bookmark
      if (bookmarkId && targetTab && targetTab.id) {
        createBookmarkTabRelationship(bookmarkId, targetTab.id);
        // Re-render to show the updated relationship
        window.renderer.render(state, elements);
      }
    } catch {}
  }

  // Data loading
  async function reloadBookmarks() {
    const roots = await chrome.bookmarks.getTree();
    state.bookmarksRoots = roots && roots[0] && roots[0].children ? roots[0].children : roots;
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
    
    // Sort tabs by windowId first, then by index to maintain proper order
    filtered.sort((a, b) => {
      if (a.windowId !== b.windowId) {
        return a.windowId - b.windowId;
      }
      return a.index - b.index;
    });
    
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

  const onSearch = window.utils.debounce(async () => {
    state.query = (elements.input.value || '').trim();
    applyBookmarkFilter();
    applyTabFilter();
    window.renderer.render(state, elements);
  }, 200);

  // Expose necessary functions and state to global scope for other modules
  window.activateTab = activateTab;
  window.closeTab = closeTab;
  window.closeTabFromBookmark = closeTabFromBookmark;
  window.duplicateTab = duplicateTab;
  window.deleteBookmark = deleteBookmark;
  window.saveActiveTabToFolder = saveActiveTabToFolder;
  window.openUrl = openUrl;
  window.reloadBookmarks = reloadBookmarks;
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
      reloadBookmarks(), 
      reloadTabs()
    ]);
    window.renderer.render(state, elements);

    elements.input.addEventListener('input', onSearch);

    // Live-update UI on external changes
    try {
      chrome.bookmarks.onCreated.addListener((id, bm) => {
        reloadBookmarks().then(() => { 
          if (bm && bm.parentId) window.folderState.ensureExpanded(bm.parentId, state, window.storage); 
          if (!state.dragState.isDragging) window.renderer.render(state, elements); 
        });
      });
      chrome.bookmarks.onMoved.addListener((id, info) => {
        reloadBookmarks().then(() => { 
          if (info && info.parentId) window.folderState.ensureExpanded(info.parentId, state, window.storage); 
          if (!state.dragState.isDragging) window.renderer.render(state, elements); 
        });
      });
      chrome.bookmarks.onChanged.addListener(() => {
        reloadBookmarks().then(() => {
          if (!state.dragState.isDragging) window.renderer.render(state, elements);
        });
      });
      chrome.bookmarks.onRemoved.addListener(() => {
        reloadBookmarks().then(() => {
          if (!state.dragState.isDragging) window.renderer.render(state, elements);
        });
      });
      
      // Listen for tab changes to update the tabs list
      chrome.tabs.onCreated.addListener(() => {
        reloadTabs().then(() => {
          if (!state.dragState.isDragging) window.renderer.render(state, elements);
        });
      });
      chrome.tabs.onRemoved.addListener((tabId) => {
        // Clean up bookmark-tab relationship when tab is closed
        removeBookmarkTabRelationship(tabId);
        reloadTabs().then(() => {
          if (!state.dragState.isDragging) window.renderer.render(state, elements);
        });
      });
      
      const debouncedTabUpdate = window.utils.debounce(() => {
        reloadTabs().then(() => {
          if (!state.dragState.isDragging) window.renderer.render(state, elements);
        });
      }, 500); // Only update tabs every 500ms
      
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // Only reload on meaningful changes that affect display
        if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
          debouncedTabUpdate();
        }
      });
    } catch {}
  });

})();