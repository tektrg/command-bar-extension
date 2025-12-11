// pinned-tabs-content.js - Pinned tabs UI for content.js overlay
// This file contains functions to render and manage pinned tabs in the command bar

// Add to uiState object:
// pinnedTabsEl: null,
// pinnedTabs: [],

/**
 * Load and render pinned tabs
 */
async function loadPinnedTabs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PINNED_TABS' });
    if (response && response.pinnedTabs) {
      uiState.pinnedTabs = response.pinnedTabs;
      renderPinnedTabs();
    }
  } catch (error) {
    console.error('Failed to load pinned tabs:', error);
  }
}

/**
 * Render pinned tabs in the command bar
 */
function renderPinnedTabs() {
  if (!uiState.pinnedTabsEl) return;
  
  const pinnedTabs = uiState.pinnedTabs || [];
  
  // Hide if no pinned tabs
  if (pinnedTabs.length === 0) {
    uiState.pinnedTabsEl.style.display = 'none';
    return;
  }
  
  uiState.pinnedTabsEl.style.display = 'grid';
  uiState.pinnedTabsEl.innerHTML = '';
  
  pinnedTabs.forEach(pinnedTab => {
    const tabIcon = createPinnedTabIcon(pinnedTab);
    uiState.pinnedTabsEl.appendChild(tabIcon);
  });
}

/**
 * Create a pinned tab icon element
 */
function createPinnedTabIcon(pinnedTab) {
  const icon = document.createElement('div');
  icon.className = 'prd-stv-pinned-tab' + (pinnedTab.isActive ? ' active' : ' inactive');
  icon.title = pinnedTab.title || pinnedTab.url;
  icon.dataset.url = pinnedTab.url;
  
  // Create favicon container
  const faviconContainer = document.createElement('div');
  faviconContainer.className = 'prd-stv-pinned-favicon';
  
  const favicon = document.createElement('img');
  if (pinnedTab.favicon) {
    favicon.src = pinnedTab.favicon;
  } else if (pinnedTab.url) {
    // Use Google favicon service as fallback
    const hostname = new URL(pinnedTab.url).hostname;
    favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } else {
    favicon.src = CONSTANTS.FALLBACK_ICON;
  }
  
  favicon.onerror = () => {
    favicon.src = CONSTANTS.FALLBACK_ICON;
  };
  
  faviconContainer.appendChild(favicon);
  icon.appendChild(faviconContainer);
  
  // Create action button (close or remove)
  const actionBtn = document.createElement('button');
  actionBtn.className = 'prd-stv-pinned-action';
  
  if (pinnedTab.isActive) {
    // Active tab - show close button (-)
    actionBtn.textContent = '−';
    actionBtn.title = 'Close tab';
    actionBtn.onclick = async (e) => {
      e.stopPropagation();
      await handleClosePinnedTab(pinnedTab);
    };
  } else {
    // Inactive tab - show remove button (×)
    actionBtn.textContent = '×';
    actionBtn.title = 'Remove from pinned';
    actionBtn.onclick = async (e) => {
      e.stopPropagation();
      await handleRemovePinnedTab(pinnedTab);
    };
  }
  
  icon.appendChild(actionBtn);
  
  // Click on icon opens/activates the tab
  icon.onclick = async (e) => {
    if (e.target === actionBtn) return; // Don't trigger if clicking action button
    
    if (pinnedTab.isActive && pinnedTab.tabId) {
      // Activate existing tab
      await chrome.tabs.update(pinnedTab.tabId, { active: true });
      const tab = await chrome.tabs.get(pinnedTab.tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
    } else {
      // Open new tab
      await chrome.tabs.create({ url: pinnedTab.url, active: true });
    }
    
    destroyOverlay();
  };
  
  return icon;
}

/**
 * Handle closing an active pinned tab
 */
async function handleClosePinnedTab(pinnedTab) {
  try {
    if (pinnedTab.tabId) {
      await chrome.tabs.remove(pinnedTab.tabId);
    }
    // Reload pinned tabs to update status
    await loadPinnedTabs();
  } catch (error) {
    console.error('Failed to close pinned tab:', error);
    showToast('Failed to close tab');
  }
}

/**
 * Handle removing a pinned tab
 */
async function handleRemovePinnedTab(pinnedTab) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_PINNED_TAB',
      url: pinnedTab.url
    });
    
    if (response && response.success) {
      await loadPinnedTabs();
      showToast('Removed from pinned tabs');
    } else {
      throw new Error('Failed to remove pinned tab');
    }
  } catch (error) {
    console.error('Failed to remove pinned tab:', error);
    showToast('Failed to remove pinned tab');
  }
}

// Listen for pinned tabs updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PINNED_TABS_UPDATED' && overlay) {
    loadPinnedTabs();
  }
});
