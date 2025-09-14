// Storage management module for the sidepanel extension

const storage = {
  async load(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      console.warn(`Failed to load ${key} from storage:`, error);
      return defaultValue;
    }
  },

  async save(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.warn(`Failed to save ${key} to storage:`, error);
      return false;
    }
  },

  async loadExpandedFolders(state) {
    const { STORAGE_KEYS } = window.CONSTANTS;
    const expandedArray = await this.load(STORAGE_KEYS.EXPANDED_FOLDERS, []);
    if (Array.isArray(expandedArray)) {
      state.expanded = new Set(expandedArray);
    }
  },

  async saveExpandedFolders(state) {
    const { STORAGE_KEYS } = window.CONSTANTS;
    const expandedArray = Array.from(state.expanded);
    return await this.save(STORAGE_KEYS.EXPANDED_FOLDERS, expandedArray);
  },

  async loadBookmarkTabLinks(state) {
    const { STORAGE_KEYS } = window.CONSTANTS;
    const bookmarkTabLinks = await this.load(STORAGE_KEYS.BOOKMARK_TAB_LINKS, {});
    if (bookmarkTabLinks && typeof bookmarkTabLinks === 'object') {
      state.bookmarkTabRelationships = bookmarkTabLinks;
    }
  },

  async saveBookmarkTabLinks(state) {
    const { STORAGE_KEYS } = window.CONSTANTS;
    return await this.save(STORAGE_KEYS.BOOKMARK_TAB_LINKS, state.bookmarkTabRelationships);
  }
};

// Export for use in other modules
window.storage = storage;