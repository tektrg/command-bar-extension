// pinnedTabs.js - Module for managing pinned tabs functionality

const pinnedTabsModule = {
  MAX_PINNED_TABS: 9,

  /**
   * Load pinned tabs from storage
   * Returns array of pinned tab objects with structure:
   * { url, title, favicon, isPinned: true, tabId: null }
   */
  async load() {
    try {
      const result = await chrome.storage.local.get('pinnedTabs');
      return result.pinnedTabs || [];
    } catch (error) {
      console.error('Failed to load pinned tabs:', error);
      return [];
    }
  },

  /**
   * Save pinned tabs to storage
   */
  async save(pinnedTabs) {
    try {
      await chrome.storage.local.set({ pinnedTabs });
      return true;
    } catch (error) {
      console.error('Failed to save pinned tabs:', error);
      return false;
    }
  },

  /**
   * Add a tab to pinned tabs
   * @param {Object} tabData - { url, title, favicon }
   * @returns {boolean} Success status
   */
  async addPinnedTab(tabData) {
    const pinnedTabs = await this.load();
    
    // Check if already pinned
    if (pinnedTabs.some(pt => pt.url === tabData.url)) {
      return false;
    }

    // Check max limit
    if (pinnedTabs.length >= this.MAX_PINNED_TABS) {
      console.warn('Maximum pinned tabs reached');
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
    await this.save(pinnedTabs);
    
    // Notify all tabs about the update
    chrome.runtime.sendMessage({ type: 'PINNED_TABS_UPDATED' });
    
    return true;
  },

  /**
   * Remove a pinned tab by URL
   */
  async removePinnedTab(url) {
    const pinnedTabs = await this.load();
    const filtered = pinnedTabs.filter(pt => pt.url !== url);
    
    if (filtered.length === pinnedTabs.length) {
      return false; // Not found
    }

    await this.save(filtered);
    
    // Notify all tabs about the update
    chrome.runtime.sendMessage({ type: 'PINNED_TABS_UPDATED' });
    
    return true;
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

    return pinnedTabs.map(pinnedTab => {
      // Find if this pinned tab is currently open
      const activeTab = openTabs.find(tab => tab.url === pinnedTab.url);
      
      return {
        ...pinnedTab,
        isActive: !!activeTab,
        tabId: activeTab?.id || null,
        favicon: activeTab?.favIconUrl || pinnedTab.favicon
      };
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
  }
};

// Export for use in other modules
window.pinnedTabsModule = pinnedTabsModule;
