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
    dragState: {
      isDragging: false,
      draggedItem: null,
      draggedType: null,
    },
  };

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
      await chrome.tabs.remove(tabId);
      await reloadTabs();
      window.renderer.render(state, elements);
      window.utils.showToast('Tab closed');
    } catch {
      window.utils.showToast('Failed to close tab');
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
  window.deleteBookmark = deleteBookmark;
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
    
    await window.storage.loadExpandedFolders(state);
    await Promise.all([reloadBookmarks(), reloadTabs()]);
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
      chrome.tabs.onRemoved.addListener(() => {
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