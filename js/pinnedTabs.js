// pinnedTabs.js - Module for managing pinned tabs functionality

const pinnedTabsModule = {
  MAX_PINNED_TABS: 9,

  // Sync state tracking to prevent concurrent operations
  _isSyncing: false,
  _syncQueue: [],

  /**
   * Normalize URL for consistent comparison
   */
  normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }
    try {
      const urlObj = new URL(url);
      // Remove hash and trailing slash for consistency
      urlObj.hash = '';
      if (urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch (error) {
      console.warn('Failed to normalize URL:', url, error);
      return '';
    }
  },

  /**
   * Centralized storage access with sync coordination
   * Load pinned tabs from storage
   * Returns array of pinned tab objects with structure:
   * { url, title, favicon, isPinned: true, tabId: null }
   */
  async load() {
    try {
      const result = await chrome.storage.local.get('pinnedTabs');
      const pinnedTabs = (result.pinnedTabs || []).filter((tab) => this.normalizeUrl(tab.url));

      // Ensure each pinned tab has required fields
      return pinnedTabs.map(tab => ({
        url: tab.url,
        title: tab.title || 'Untitled',
        favicon: tab.favicon || '',
        isPinned: true,
        tabId: tab.tabId || null,
        pinnedAt: tab.pinnedAt || Date.now()
      }));
    } catch (error) {
      console.error('[PinnedTabsModule] Failed to load pinned tabs:', error);
      return [];
    }
  },

  /**
   * Centralized storage save with broadcast
   */
  async save(pinnedTabs) {
    try {
      // Deduplicate by normalized URL to avoid duplicates from sync races
      const deduped = [];
      const seen = new Set();
      pinnedTabs.forEach((tab) => {
        const norm = this.normalizeUrl(tab.url);
        if (seen.has(norm)) return;
        seen.add(norm);
        deduped.push(tab);
      });

      await chrome.storage.local.set({ pinnedTabs: deduped });

      // Broadcast update to all tabs and runtime
      this.broadcastUpdate();

      return true;
    } catch (error) {
      console.error('[PinnedTabsModule] Failed to save pinned tabs:', error);
      return false;
    }
  },

  /**
   * Centralized update broadcast
   */
  broadcastUpdate() {
    console.log('[PinnedTabsModule] Broadcasting update to all tabs');

    // Send message to all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type: 'PINNED_TABS_UPDATED' }).catch(() => {
            // Ignore errors for tabs that can't receive messages
          });
        }
      });
    });

    // Also send to runtime (for sidepanel contexts)
    chrome.runtime.sendMessage({ type: 'PINNED_TABS_UPDATED' }).catch(() => {
      // Ignore errors if no listeners
    });
  },

  /**
   * Acquire sync lock to prevent concurrent operations
   */
  async acquireSyncLock() {
    if (this._isSyncing) {
      console.log('[PinnedTabsModule] Sync already in progress, queuing...');
      return new Promise((resolve) => {
        this._syncQueue.push(resolve);
      });
    }

    this._isSyncing = true;
    console.log('[PinnedTabsModule] Sync lock acquired');
    return true;
  },

  /**
   * Release sync lock and process next queued operation
   */
  releaseSyncLock() {
    console.log('[PinnedTabsModule] Sync lock released');
    this._isSyncing = false;

    if (this._syncQueue.length > 0) {
      const next = this._syncQueue.shift();
      setTimeout(() => {
        this._isSyncing = true;
        next();
      }, 10);
    }
  },

  /**
   * Atomic pinned tabs operation with sync coordination
   */
  async withSyncLock(operation) {
    await this.acquireSyncLock();
    try {
      return await operation();
    } finally {
      this.releaseSyncLock();
    }
  },

  /**
   * Add a tab to pinned tabs with enhanced duplicate detection and sync coordination
   * @param {Object} tabData - { url, title, favicon }
   * @returns {boolean} Success status
   */
  async addPinnedTab(tabData) {
    return this.withSyncLock(async () => {
      const pinnedTabs = await this.load();
      const normalizedUrl = this.normalizeUrl(tabData.url);

      if (!normalizedUrl) {
        console.warn('[PinnedTabsModule] Cannot pin invalid URL:', tabData.url);
        return false;
      }

      // Enhanced duplicate detection with normalized URLs
      if (pinnedTabs.some(pt => this.normalizeUrl(pt.url) === normalizedUrl)) {
        console.log('[PinnedTabsModule] Tab already pinned (normalized match):', normalizedUrl);
        return false;
      }

      // Check max limit
      if (pinnedTabs.length >= this.MAX_PINNED_TABS) {
        console.warn('[PinnedTabsModule] Maximum pinned tabs reached:', this.MAX_PINNED_TABS);
        return false;
      }

      // Add new pinned tab
      const newPinnedTab = {
        url: tabData.url,
        title: tabData.title || 'Untitled',
        favicon: tabData.favicon || '',
        isPinned: true,
        tabId: null, // Will be set when tab is opened
        pinnedAt: Date.now()
      };

      pinnedTabs.push(newPinnedTab);
      const success = await this.save(pinnedTabs);

      if (success) {
        console.log('[PinnedTabsModule] Successfully added pinned tab:', newPinnedTab.title);
      }

      return success;
    });
  },

  /**
   * Remove a pinned tab by URL with enhanced detection and sync coordination
   */
  async removePinnedTab(url) {
    return this.withSyncLock(async () => {
      const pinnedTabs = await this.load();
      const normalizedUrl = this.normalizeUrl(url);

      if (!normalizedUrl) {
        console.warn('[PinnedTabsModule] Cannot remove invalid URL:', url);
        return false;
      }

      // Enhanced duplicate detection with normalized URLs
      const filtered = pinnedTabs.filter(pt => this.normalizeUrl(pt.url) !== normalizedUrl);

      if (filtered.length === pinnedTabs.length) {
        console.log('[PinnedTabsModule] Tab not found for removal:', normalizedUrl);
        return false; // Not found
      }

      const success = await this.save(filtered);

      if (success) {
        console.log('[PinnedTabsModule] Successfully removed pinned tab:', normalizedUrl);
      }

      return success;
    });
  },

  /**
   * Get pinned tabs with their active status
   * Matches pinned tabs with currently open tabs
   */
  async getPinnedTabsWithStatus() {
    const [pinnedTabs, openTabs] = await Promise.all([
      this.load(),
      chrome.tabs.query({})
    ]);

    return pinnedTabs
      .filter((pinnedTab) => this.normalizeUrl(pinnedTab.url))
      .map(pinnedTab => {
      // Find if this pinned tab is currently open
      const activeTab = openTabs.find(tab => this.normalizeUrl(tab.url) === this.normalizeUrl(pinnedTab.url));
      
      return {
        ...pinnedTab,
        isActive: !!activeTab,
        tabId: activeTab?.id || null,
        favicon: activeTab?.favIconUrl || pinnedTab.favicon
      };
    });
  },

  /**
   * Update a pinned tab's URL (handles cases where a pinned tab navigates to a new URL)
   */
  async updatePinnedTabUrl(previousUrl, newTabData) {
    return this.withSyncLock(async () => {
      const pinnedTabs = await this.load();
      const previousNorm = previousUrl ? this.normalizeUrl(previousUrl) : null;
      const newNorm = this.normalizeUrl(newTabData.url);

      // Deduplicate existing list first
      const deduped = [];
      const seen = new Set();
      pinnedTabs.forEach((tab) => {
        const norm = this.normalizeUrl(tab.url);
        if (seen.has(norm)) return;
        seen.add(norm);
        deduped.push(tab);
      });

      let updated = false;
      const idxByPrev = previousNorm
        ? deduped.findIndex(pt => this.normalizeUrl(pt.url) === previousNorm)
        : -1;
      const idxByNew = deduped.findIndex(pt => this.normalizeUrl(pt.url) === newNorm);
      const targetIdx = idxByPrev !== -1 ? idxByPrev : idxByNew;

      if (targetIdx !== -1) {
        deduped[targetIdx] = {
          ...deduped[targetIdx],
          url: newTabData.url,
          title: newTabData.title || deduped[targetIdx].title,
          favicon: newTabData.favIconUrl || deduped[targetIdx].favicon,
          tabId: newTabData.id || deduped[targetIdx].tabId || null
        };
        updated = true;
      } else if (deduped.length < this.MAX_PINNED_TABS) {
        // Fallback: add if we couldn't find an existing entry (keeps parity with browser pins)
        deduped.push({
          url: newTabData.url,
          title: newTabData.title || 'Untitled',
          favicon: newTabData.favIconUrl || '',
          isPinned: true,
          tabId: newTabData.id || null,
          pinnedAt: Date.now()
        });
        updated = true;
      }

      if (updated) {
        await this.save(deduped);
      }

      return updated;
    });
  },

  /**
   * Close an active pinned tab
   */
  async closeActiveTab(tabId) {
    try {
      await chrome.tabs.remove(tabId);
      return true;
    } catch (error) {
      console.error('Failed to close tab:', error);
      return false;
    }
  },

  /**
   * Open an inactive pinned tab
   */
  async openInactiveTab(url) {
    try {
      await chrome.tabs.create({ url, active: true, pinned: true });
      return true;
    } catch (error) {
      console.error('Failed to open tab:', error);
      return false;
    }
  },

  /**
   * Check if a URL is pinned with enhanced detection using URL normalization
   */
  async isUrlPinned(url) {
    try {
      const pinnedTabs = await this.load();
      const normalizedUrl = this.normalizeUrl(url);
      return pinnedTabs.some(pt => this.normalizeUrl(pt.url) === normalizedUrl);
    } catch (error) {
      console.error('[PinnedTabsModule] Failed to check if URL is pinned:', error);
      return false;
    }
  }
};

// Export for use in other modules (service worker compatible)
if (typeof window !== 'undefined') {
  window.pinnedTabsModule = pinnedTabsModule;
} else {
  self.pinnedTabsModule = pinnedTabsModule;
}
