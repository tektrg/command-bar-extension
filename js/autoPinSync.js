// autoPinSync.js - Always-on auto-sync for Manifest V3 Service Workers
// Automatically sync Chrome's native pinned tabs with our pinned tabs
// Always enabled, no settings UI needed

// Storage key constants
const STORAGE_KEYS = {
  PINNED_TABS: 'pinnedTabs'
};

// Configuration
const MAX_PINNED_TABS = 9;

/**
 * Auto-Pin Sync Module for Service Workers (Always Enabled)
 */
const autoPinSync = {
  syncInterval: null,

  /**
   * Initialize auto-pin sync (always enabled)
   */
  async init() {
    console.log('[AutoPinSync] Initializing (always enabled)...');
    
    // Initial sync
    await this.syncNow();
    
    // Start periodic sync
    this.startPeriodicSync();
    
    // Setup event listeners
    this.setupListeners();
    
    console.log('[AutoPinSync] Ready');
  },

  /**
   * Start periodic sync (every 10 seconds)
   */
  startPeriodicSync() {
    if (this.syncInterval) return;
    
    console.log('[AutoPinSync] Starting periodic sync (10s interval)');
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, 10000); // Check every 10 seconds
  },

  /**
   * Stop periodic sync (for cleanup if needed)
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      console.log('[AutoPinSync] Stopping periodic sync');
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  },

  /**
   * Get pinned tabs from storage
   */
  async getPinnedTabs() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PINNED_TABS);
    return result[STORAGE_KEYS.PINNED_TABS] || [];
  },

  /**
   * Save pinned tabs to storage
   */
  async savePinnedTabs(pinnedTabs) {
    await chrome.storage.local.set({ [STORAGE_KEYS.PINNED_TABS]: pinnedTabs });
  },

  /**
   * Add a tab to pinned tabs
   */
  async addPinnedTab(tabData) {
    const pinnedTabs = await this.getPinnedTabs();
    
    // Check if already pinned
    if (pinnedTabs.some(pt => pt.url === tabData.url)) {
      return false;
    }

    // Check max limit
    if (pinnedTabs.length >= MAX_PINNED_TABS) {
      console.warn('[AutoPinSync] Max pinned tabs reached:', MAX_PINNED_TABS);
      return false;
    }

    // Add new pinned tab
    const newPinnedTab = {
      url: tabData.url,
      title: tabData.title || 'Untitled',
      favicon: tabData.favicon || '',
      isPinned: true,
      pinnedAt: Date.now()
    };

    pinnedTabs.push(newPinnedTab);
    await this.savePinnedTabs(pinnedTabs);
    
    // Notify all tabs about the update
    this.broadcastUpdate();
    
    return true;
  },

  /**
   * Remove a pinned tab by URL
   */
  async removePinnedTab(url) {
    const pinnedTabs = await this.getPinnedTabs();
    const filtered = pinnedTabs.filter(pt => pt.url !== url);
    
    if (filtered.length === pinnedTabs.length) {
      return false; // Not found
    }

    await this.savePinnedTabs(filtered);
    
    // Notify all tabs about the update
    this.broadcastUpdate();
    
    return true;
  },

  /**
   * Broadcast pinned tabs update to all tabs
   */
  broadcastUpdate() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type: 'PINNED_TABS_UPDATED' }).catch(() => {
            // Ignore errors for tabs that can't receive messages
          });
        }
      });
    });
  },

  /**
   * Sync browser-pinned tabs with our pinned tabs
   * Always bidirectional: Chrome pins → Our list, Chrome unpins → Remove from list
   */
  async syncNow() {
    try {
      console.log('[AutoPinSync] Syncing now...');
      
      // Get all browser-pinned tabs
      const browserPinnedTabs = await chrome.tabs.query({ pinned: true });
      const browserPinnedUrls = new Set(browserPinnedTabs.map(t => t.url));
      console.log('[AutoPinSync] Browser pinned tabs:', browserPinnedTabs.length);
      
      // Get our pinned tabs
      const ourPinnedTabs = await this.getPinnedTabs();
      const ourPinnedUrls = new Set(ourPinnedTabs.map(pt => pt.url));
      console.log('[AutoPinSync] Our pinned tabs:', ourPinnedTabs.length);

      // Check max limit for additions
      const remainingSlots = MAX_PINNED_TABS - ourPinnedTabs.length;
      let addedCount = 0;
      let removedCount = 0;

      // Add browser-pinned tabs that aren't in our list
      for (const tab of browserPinnedTabs) {
        if (addedCount >= remainingSlots) {
          console.log('[AutoPinSync] No more slots available');
          break;
        }
        
        if (!ourPinnedUrls.has(tab.url)) {
          const added = await this.addPinnedTab({
            url: tab.url,
            title: tab.title,
            favicon: tab.favIconUrl || '',
          });
          
          if (added) {
            addedCount++;
            console.log('[AutoPinSync] Added:', tab.title);
          }
        }
      }

      // Remove tabs from our list that are no longer pinned in browser
      for (const pinnedTab of ourPinnedTabs) {
        if (!browserPinnedUrls.has(pinnedTab.url)) {
          const removed = await this.removePinnedTab(pinnedTab.url);
          if (removed) {
            removedCount++;
            console.log('[AutoPinSync] Removed:', pinnedTab.title);
          }
        }
      }

      if (addedCount > 0 || removedCount > 0) {
        console.log(`[AutoPinSync] Sync complete: Added ${addedCount}, Removed ${removedCount}`);
      } else {
        console.log('[AutoPinSync] Sync complete: No changes');
      }
    } catch (error) {
      console.error('[AutoPinSync] Sync failed:', error);
    }
  },

  /**
   * Setup listeners for tab pin/unpin events
   */
  setupListeners() {
    console.log('[AutoPinSync] Setting up listeners...');
    
    // Listen for tab updates (pin/unpin)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // If a tab was just pinned
      if (changeInfo.pinned === true) {
        console.log('[AutoPinSync] Tab pinned in browser:', tab.title);
        await this.syncNow();
      }
      
      // If a tab was unpinned - always remove from our list
      if (changeInfo.pinned === false) {
        console.log('[AutoPinSync] Tab unpinned in browser:', tab.title);
        const removed = await this.removePinnedTab(tab.url);
        if (removed) {
          console.log('[AutoPinSync] Auto-removed unpinned tab:', tab.title);
        }
      }
    });

    // Listen for new tabs
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (tab.pinned) {
        console.log('[AutoPinSync] New pinned tab created:', tab.title);
        await this.syncNow();
      }
    });
  }
};

// Export for use in background script
if (typeof self !== 'undefined') {
  self.autoPinSync = autoPinSync;
}
