// Tab sorting module for the sidepanel extension

const tabSort = {
  // Sort mode constants
  MODES: {
    POSITION: 'position',
    LAST_VISIT: 'lastVisit',
    DOMAIN: 'domain'
  },

  // Set sort mode and trigger updates
  async setMode(mode, state, storage, renderer, elements) {
    if (!mode || !Object.values(this.MODES).includes(mode)) {
      console.warn('Invalid sort mode:', mode);
      return;
    }

    const oldMode = state.tabSortMode;
    if (oldMode === mode) return; // No change needed

    state.tabSortMode = mode;
    
    // Save to storage
    try {
      await storage.saveTabSortMode(state);
      
      // Show user feedback
      const modeLabel = this.getModeLabel(mode);
      window.utils.showToast(`Sorting tabs by ${modeLabel}`);
      
      // Trigger re-render
      renderer.render(state, elements);
    } catch (error) {
      console.error('Failed to save tab sort mode:', error);
      // Revert state on error
      state.tabSortMode = oldMode;
      window.utils.showToast('Failed to save sort preference');
    }
  },

  // Sort tabs based on mode
  sortTabs(tabs, mode) {
    if (!tabs || !Array.isArray(tabs)) return [];
    
    switch (mode) {
      case this.MODES.LAST_VISIT:
        // Sort by lastAccessed timestamp, most recent first
        // Remove window grouping for this mode
        return [...tabs].sort((a, b) => {
          const aTime = a.lastAccessed || 0;
          const bTime = b.lastAccessed || 0;
          return bTime - aTime; // Descending order (most recent first)
        });
        
      case this.MODES.DOMAIN:
        // Sort by domain, then by title
        // Remove window grouping for this mode
        return [...tabs].sort((a, b) => {
          const aDomain = this.extractDomain(a.url);
          const bDomain = this.extractDomain(b.url);
          
          if (aDomain !== bDomain) {
            return aDomain.localeCompare(bDomain);
          }
          
          // Same domain, sort by title
          return (a.title || '').localeCompare(b.title || '');
        });
        
      case this.MODES.POSITION:
      default:
        // Default behavior: sort by windowId first, then by index
        // This maintains the existing window grouping
        return [...tabs].sort((a, b) => {
          if (a.windowId !== b.windowId) {
            return a.windowId - b.windowId;
          }
          return a.index - b.index;
        });
    }
  },

  // Extract domain from URL for grouping
  extractDomain(url) {
    if (!url) return 'Unknown';
    
    try {
      // Handle chrome:// and other special URLs
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        return 'Chrome';
      }
      if (url.startsWith('moz-extension://') || url.startsWith('about:')) {
        return 'Browser';
      }
      
      const urlObj = new URL(url);
      return urlObj.hostname || 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  },

  // Get current sort mode from state
  getCurrentMode(state) {
    return state.tabSortMode || this.MODES.POSITION;
  },

  // Get display label for mode
  getModeLabel(mode) {
    switch (mode) {
      case this.MODES.LAST_VISIT:
        return 'Last Visit';
      case this.MODES.DOMAIN:
        return 'Domain';
      case this.MODES.POSITION:
      default:
        return 'Tab Position';
    }
  },

  // Get icon name for mode
  getModeIcon(mode) {
    switch (mode) {
      case this.MODES.LAST_VISIT:
        return 'hourglass_empty';
      case this.MODES.DOMAIN:
        return 'public';
      case this.MODES.POSITION:
      default:
        return 'tab';
    }
  },

  // Check if mode uses window grouping
  usesWindowGrouping(mode) {
    return mode === this.MODES.POSITION;
  },

  // Check if mode uses domain grouping
  usesDomainGrouping(mode) {
    return mode === this.MODES.DOMAIN;
  },

  // Group tabs by domain for domain mode
  groupTabsByDomain(tabs) {
    const domainGroups = new Map();
    
    tabs.forEach(tab => {
      const domain = this.extractDomain(tab.url);
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain).push(tab);
    });
    
    return domainGroups;
  }
};

// Export for use in other modules
window.tabSort = tabSort;