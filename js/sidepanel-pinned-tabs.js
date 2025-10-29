// sidepanel-pinned-tabs.js - Pinned tabs UI for sidepanel
(function () {
  let container = null;
  let isInitialized = false;

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
        console.error('pinnedTabsModule not available after max attempts');
      }
    }, 100);
  }

  /**
   * Initialize pinned tabs in sidepanel
   */
  function initPinnedTabs() {
    if (isInitialized) return;

    // Wait for pinnedTabsModule to be loaded
    waitForModule(() => {
      // Wait for the root element to be rendered
      const checkRoot = setInterval(() => {
        const root = document.getElementById('prd-stv-sidepanel-root');
        if (root) {
          clearInterval(checkRoot);
          container = root.querySelector('#pinned-tabs-container');
          if (container) {
            isInitialized = true;
            renderPinnedTabs();
            setupMessageListener();
          } else {
            console.warn('Pinned tabs container not found in DOM');
          }
        }
      }, 100);
    });
  }

  /**
   * Render pinned tabs
   */
  async function renderPinnedTabs() {
    if (!container || !window.pinnedTabsModule) return;

    try {
      const pinnedTabs = await window.pinnedTabsModule.getPinnedTabsWithStatus();

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
    } catch (error) {
      console.error('Failed to render pinned tabs:', error);
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

    // Add active/inactive state
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
        } else {
          await window.pinnedTabsModule.removePinnedTab(tab.url);
        }
        await renderPinnedTabs();
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
   * Setup message listener for updates
   */
  function setupMessageListener() {
    // Listen for pinned tabs updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'PINNED_TABS_UPDATED') {
        renderPinnedTabs();
      }
    });

    // Listen for tab updates to refresh active/inactive state
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
        renderPinnedTabs();
      }
    });

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener(() => {
      renderPinnedTabs();
    });

    // Listen for tab activation changes
    chrome.tabs.onActivated.addListener(() => {
      renderPinnedTabs();
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
    init: initPinnedTabs
  };
})();
