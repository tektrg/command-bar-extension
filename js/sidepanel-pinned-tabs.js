// sidepanel-pinned-tabs.js - Pinned tabs UI for sidepanel
// Enhanced with debouncing and improved race condition prevention
(function () {
  let container = null;
  let isInitialized = false;
  let renderDebounceTimer = null;

  /**
   * Debounced render to prevent rapid successive renders
   */
  function debouncedRender() {
    if (renderDebounceTimer) {
      clearTimeout(renderDebounceTimer);
    }

    renderDebounceTimer = setTimeout(() => {
      renderPinnedTabs();
    }, 100); // 100ms debounce
  }

  /**
   * Wait for pinnedTabsModule to be available
   */
  function waitForModule(callback, maxAttempts = 50) {
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.pinnedTabsModule) {
        clearInterval(checkInterval);
        callback();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('[SidepanelPinnedTabs] pinnedTabsModule not available after max attempts');
      }
    }, 100);
  }

  /**
   * Initialize pinned tabs in sidepanel with improved race condition prevention
   */
  function initPinnedTabs() {
    if (isInitialized) {
      console.log('[SidepanelPinnedTabs] Already initialized, skipping...');
      return;
    }

    console.log('[SidepanelPinnedTabs] Initializing pinned tabs...');

    // Wait for pinnedTabsModule to be loaded
    waitForModule(() => {
      console.log('[SidepanelPinnedTabs] pinnedTabsModule available');

      // Wait for the root element to be rendered
      const checkRoot = setInterval(() => {
        const root = document.getElementById('prd-stv-sidepanel-root');
        if (root) {
          clearInterval(checkRoot);
          container = root.querySelector('#pinned-tabs-container');
          if (container) {
            console.log('[SidepanelPinnedTabs] Container found, initializing');
            isInitialized = true;
            setupMessageListener();

            // Initial render with a small delay to ensure everything is loaded
            setTimeout(() => {
              debouncedRender();
            }, 200);

            // NOTE: Removed REQUEST_PINNED_TABS_SYNC to prevent race conditions
            // The autoPinSync module is already initialized in background and runs periodically
            // Manual sync requests were causing duplicate pinned tabs to be added
            console.log('[SidepanelPinnedTabs] Initialization complete - auto-sync will handle browser pinned tabs');
          } else {
            console.warn('[SidepanelPinnedTabs] Pinned tabs container not found in DOM');
          }
        }
      }, 100);
    });
  }

  /**
   * Render pinned tabs
   */
  async function renderPinnedTabs() {
    if (!container || !window.pinnedTabsModule) {
      console.log('[SidepanelPinnedTabs] Cannot render: container or module not available', {
        container: !!container,
        module: !!window.pinnedTabsModule
      });
      return;
    }

    try {
      const pinnedTabs = await window.pinnedTabsModule.getPinnedTabsWithStatus();
      console.log('[SidepanelPinnedTabs] Rendering pinned tabs:', pinnedTabs.length, pinnedTabs);

      if (pinnedTabs.length === 0) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'grid';
      container.innerHTML = '';

      pinnedTabs.forEach((tab) => {
        const iconEl = createPinnedTabIcon(tab);
        container.appendChild(iconEl);
      });

      console.log('[SidepanelPinnedTabs] Rendered', pinnedTabs.length, 'pinned tabs');
    } catch (error) {
      console.error('[SidepanelPinnedTabs] Failed to render pinned tabs:', error);
    }
  }

  /**
   * Create a pinned tab icon element
   */
  function createPinnedTabIcon(tab) {
    const iconEl = document.createElement('div');
    iconEl.className = 'pinned-tab-icon';
    iconEl.dataset.url = tab.url;
    iconEl.title = tab.title;

    // Add active/inactive state - but always show the icon
    if (tab.isActive) {
      iconEl.classList.add('pinned-tab-active');
    } else {
      iconEl.classList.add('pinned-tab-inactive');
    }

    // Favicon
    const favicon = document.createElement('img');
    favicon.className = 'pinned-tab-favicon';
    favicon.src = tab.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    favicon.alt = tab.title;
    
    // Handle favicon load error
    favicon.onerror = () => {
      favicon.src = chrome.runtime.getURL('link_18dp_E3E3E3.svg');
    };
    
    iconEl.appendChild(favicon);

    // Close/Remove button
    const btn = document.createElement('button');
    btn.className = 'pinned-tab-action';
    btn.innerHTML = tab.isActive ? '−' : '×';
    btn.title = tab.isActive ? 'Close tab' : 'Remove from pinned';

    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        if (tab.isActive && tab.tabId) {
          await window.pinnedTabsModule.closeActiveTab(tab.tabId);
          // Re-render after closing to show the tab as inactive but still pinned
          setTimeout(() => renderPinnedTabs(), 100);
        } else {
          await window.pinnedTabsModule.removePinnedTab(tab.url);
          await renderPinnedTabs();
        }
      } catch (error) {
        console.error('Failed to handle pinned tab action:', error);
      }
    };
    iconEl.appendChild(btn);

    // Click on icon to open/activate
    iconEl.onclick = async (e) => {
      if (e.target === btn) return; // Don't trigger when clicking button
      
      try {
        if (tab.isActive && tab.tabId) {
          // Activate existing tab
          await chrome.tabs.update(tab.tabId, { active: true });
          const tabInfo = await chrome.tabs.get(tab.tabId);
          if (tabInfo.windowId) {
            await chrome.windows.update(tabInfo.windowId, { focused: true });
          }
        } else {
          // Open new pinned tab
          await chrome.tabs.create({ url: tab.url, active: true, pinned: true });
        }
      } catch (error) {
        console.error('Failed to open pinned tab:', error);
      }
    };

    return iconEl;
  }

  /**
   * Setup message listener for updates with debounced rendering
   */
  function setupMessageListener() {
    // Listen for pinned tabs updates from background script and auto-sync
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PINNED_TABS_UPDATED') {
        console.log('[SidepanelPinnedTabs] Received PINNED_TABS_UPDATED message');
        // Use debounced render to prevent rapid successive renders
        debouncedRender();
      }
    });

    // Listen for tab updates to refresh active/inactive state
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned !== undefined) {
        console.log('[SidepanelPinnedTabs] Tab updated:', tabId, changeInfo);
        // Use debounced render to prevent rapid successive renders
        debouncedRender();
      }
    });

    // Listen for tab removal - update UI but keep pinned icons
    chrome.tabs.onRemoved.addListener((tabId) => {
      console.log('[SidepanelPinnedTabs] Tab removed:', tabId);
      // Use debounced render to prevent rapid successive renders
      debouncedRender();
    });

    // Listen for tab activation changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      console.log('[SidepanelPinnedTabs] Tab activated:', activeInfo.tabId);
      // Use debounced render to prevent rapid successive renders
      debouncedRender();
    });

    // Listen for storage changes for cross-window sync
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pinnedTabs) {
        console.log('[SidepanelPinnedTabs] Storage changed:', changes.pinnedTabs);
        // Use debounced render to prevent rapid successive renders
        debouncedRender();
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPinnedTabs);
  } else {
    initPinnedTabs();
  }

  // Export for debugging
  window.sidepanelPinnedTabs = {
    render: renderPinnedTabs,
    debouncedRender: debouncedRender,
    init: initPinnedTabs
  };
})();
