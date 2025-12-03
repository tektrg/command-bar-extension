// autoPinSync.js - Always-on auto-sync for Manifest V3 Service Workers
// Automatically sync Chrome's native pinned tabs with our pinned tabs
// Always enabled, no settings UI needed
// Refactored to use centralized storage from pinnedTabsModule

/**
 * Auto-Pin Sync Module for Service Workers (Always Enabled)
 * Uses centralized storage from pinnedTabsModule to prevent race conditions
 */
const autoPinSync = {
  syncInterval: null,
  isInitialized: false,
  tabUrlCache: {},

  /**
   * Initialize auto-pin sync (always enabled)
   */
  async init() {
    if (this.isInitialized) {
      console.log('[AutoPinSync] Already initialized, skipping...');
      return;
    }

    console.log('[AutoPinSync] Initializing (always enabled)...');

    // Initial sync with debouncing to prevent race conditions
    await this.debouncedSync();

    // Start periodic sync
    this.startPeriodicSync();

    // Setup event listeners
    this.setupListeners();

    this.isInitialized = true;
    console.log('[AutoPinSync] Ready');
  },

  /**
   * Start periodic sync (every 15 seconds - increased from 10s to reduce race conditions)
   */
  startPeriodicSync() {
    if (this.syncInterval) return;

    console.log('[AutoPinSync] Starting periodic sync (15s interval)');
    this.syncInterval = setInterval(() => {
      this.debouncedSync();
    }, 15000); // Check every 15 seconds (reduced frequency)
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
   * Debounced sync to prevent rapid successive calls
   */
  syncDebounceTimer: null,
  async debouncedSync() {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(async () => {
      await this.syncNow();
    }, 100); // 100ms debounce
  },

  /**
   * Add a tab to pinned tabs using centralized storage
   */
  async addPinnedTab(tabData) {
    try {
      // Check if pinnedTabsModule is available
      if (typeof pinnedTabsModule !== 'undefined') {
        console.log('[AutoPinSync] Adding pinned tab via centralized storage:', tabData.title);
        return await pinnedTabsModule.addPinnedTab(tabData);
      } else {
        console.warn('[AutoPinSync] pinnedTabsModule not available, using fallback');
        // Fallback for backward compatibility (should not happen in normal operation)
        return await this.fallbackAddPinnedTab(tabData);
      }
    } catch (error) {
      console.error('[AutoPinSync] Failed to add pinned tab:', error);
      return false;
    }
  },

  /**
   * Remove a pinned tab using centralized storage
   */
  async removePinnedTab(url) {
    try {
      // Check if pinnedTabsModule is available
      if (typeof pinnedTabsModule !== 'undefined') {
        console.log('[AutoPinSync] Removing pinned tab via centralized storage:', url);
        return await pinnedTabsModule.removePinnedTab(url);
      } else {
        console.warn('[AutoPinSync] pinnedTabsModule not available, using fallback');
        // Fallback for backward compatibility
        return await this.fallbackRemovePinnedTab(url);
      }
    } catch (error) {
      console.error('[AutoPinSync] Failed to remove pinned tab:', error);
      return false;
    }
  },

  /**
   * Fallback methods for backward compatibility (should rarely be used)
   */
  async fallbackAddPinnedTab(tabData) {
    console.warn('[AutoPinSync] Using fallback addPinnedTab - this should not happen');
    // Implementation for emergency fallback only
    return false;
  },

  async fallbackRemovePinnedTab(url) {
    console.warn('[AutoPinSync] Using fallback removePinnedTab - this should not happen');
    // Implementation for emergency fallback only
    return false;
  },

  /**
   * Sync browser-pinned tabs with our pinned tabs using centralized storage
   * Enhanced with URL normalization and improved race condition prevention
   */
  async syncNow() {
    // Prevent concurrent sync operations
    if (this._isSyncing) {
      console.log('[AutoPinSync] Sync already in progress, skipping...');
      return;
    }

    this._isSyncing = true;

    try {
      console.log('[AutoPinSync] Syncing now...');

      // Check if pinnedTabsModule is available
      if (typeof pinnedTabsModule === 'undefined') {
        console.warn('[AutoPinSync] pinnedTabsModule not available, aborting sync');
        return;
      }

      // Get all browser-pinned tabs
      const browserPinnedTabs = await chrome.tabs.query({ pinned: true });
      console.log('[AutoPinSync] Browser pinned tabs:', browserPinnedTabs.length);

      // Get our pinned tabs using centralized storage
      const ourPinnedTabs = await pinnedTabsModule.load();
      console.log('[AutoPinSync] Our pinned tabs:', ourPinnedTabs.length);

      // Create normalized URL sets for comparison
      const browserPinnedUrls = new Set(
        browserPinnedTabs.map(t => pinnedTabsModule.normalizeUrl(t.url))
      );
      const ourPinnedUrls = new Set(
        ourPinnedTabs.map(pt => pinnedTabsModule.normalizeUrl(pt.url))
      );

      // Refresh cache of tabId -> normalized URL
      browserPinnedTabs.forEach((tab) => {
        this.tabUrlCache[tab.id] = pinnedTabsModule.normalizeUrl(tab.url);
      });

      // Check max limit for additions
      const remainingSlots = pinnedTabsModule.MAX_PINNED_TABS - ourPinnedTabs.length;
      let addedCount = 0;

      // Add browser-pinned tabs that aren't in our list (using normalized URLs)
      for (const tab of browserPinnedTabs) {
        if (addedCount >= remainingSlots) {
          console.log('[AutoPinSync] No more slots available');
          break;
        }

        const normalizedUrl = pinnedTabsModule.normalizeUrl(tab.url);
        if (!ourPinnedUrls.has(normalizedUrl)) {
          console.log('[AutoPinSync] Adding browser-pinned tab:', tab.title, normalizedUrl);
          const added = await this.addPinnedTab({
            url: tab.url,
            title: tab.title,
            favicon: tab.favIconUrl || '',
          });

          if (added) {
            addedCount++;
            console.log('[AutoPinSync] Successfully added:', tab.title);
          } else {
            console.log('[AutoPinSync] Failed to add (likely duplicate):', tab.title);
          }
        } else {
          console.log('[AutoPinSync] Tab already in our list (normalized match):', tab.title);
        }
      }

      // Important: Only remove tabs from our list if they were explicitly unpinned in browser
      // We track this through the onUpdated listener with pinned: false
      // This prevents removing pinned tabs when they're just closed as regular tabs

      if (addedCount > 0) {
        console.log(`[AutoPinSync] Sync complete: Added ${addedCount} tabs`);
      } else {
        console.log('[AutoPinSync] Sync complete: No changes needed');
      }
    } catch (error) {
      console.error('[AutoPinSync] Sync failed:', error);
    } finally {
      this._isSyncing = false;
    }
  },

  /**
   * Setup listeners for tab pin/unpin events with debouncing
   */
  setupListeners() {
    console.log('[AutoPinSync] Setting up listeners...');

    // Listen for tab updates (pin/unpin)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // If a tab was just pinned
      if (changeInfo.pinned === true) {
        console.log('[AutoPinSync] Tab pinned in browser:', tab.title);
        // Use debounced sync to prevent race conditions
        await this.debouncedSync();
      }

      // If a tab was unpinned - always remove from our list
      if (changeInfo.pinned === false) {
        console.log('[AutoPinSync] Tab unpinned in browser:', tab.title);
        const removed = await this.removePinnedTab(tab.url);
        if (removed) {
          console.log('[AutoPinSync] Auto-removed unpinned tab:', tab.title);
        }
      }

      // If URL changed for a pinned tab, update our stored entry to avoid duplicates
      if (tab.pinned && changeInfo.url) {
        const previousNorm = this.tabUrlCache[tabId];
        const newNorm = pinnedTabsModule.normalizeUrl(tab.url);
        if (previousNorm !== newNorm) {
          console.log('[AutoPinSync] Pinned tab URL changed, updating stored entry:', {
            tabId,
            previousNorm,
            newNorm
          });
          await pinnedTabsModule.updatePinnedTabUrl(previousNorm, tab);
        }
        this.tabUrlCache[tabId] = newNorm;
      }
    });

    // Listen for new tabs
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (tab.pinned) {
        console.log('[AutoPinSync] New pinned tab created:', tab.title);
        // Use debounced sync to prevent race conditions
        await this.debouncedSync();
      }
    });

    // Clean cache on tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.tabUrlCache[tabId]) {
        delete this.tabUrlCache[tabId];
      }
    });
  }
};

// Export for use in background script
if (typeof self !== 'undefined') {
  self.autoPinSync = autoPinSync;
}
