// Tab utility functions for categorizing and managing tabs
const tabUtils = {
  // Check if a tab is inactive based on last accessed time
  isTabInactive: (tab, thresholdHours = 24) => {
    if (!tab.lastAccessed) return false;
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    return (Date.now() - tab.lastAccessed) > thresholdMs;
  },

  // Split tabs into active and inactive arrays
  categorizeTabsByActivity: (tabs, thresholdHours = 24) => {
    const active = [];
    const inactive = [];
    
    tabs.forEach(tab => {
      if (tabUtils.isTabInactive(tab, thresholdHours)) {
        inactive.push(tab);
      } else {
        active.push(tab);
      }
    });
    
    return { active, inactive };
  },

  // Get count of inactive tabs
  getInactiveTabCount: (tabs, thresholdHours = 24) => {
    return tabs.filter(tab => tabUtils.isTabInactive(tab, thresholdHours)).length;
  },

  // Format time since last access for display
  formatTimeSinceAccess: (tab) => {
    if (!tab.lastAccessed) return 'Unknown';
    
    const hoursAgo = Math.floor((Date.now() - tab.lastAccessed) / (60 * 60 * 1000));
    
    if (hoursAgo < 24) {
      return `${hoursAgo}h ago`;
    } else {
      const daysAgo = Math.floor(hoursAgo / 24);
      return `${daysAgo}d ago`;
    }
  }
};

// Export for use in other modules
window.tabUtils = tabUtils;