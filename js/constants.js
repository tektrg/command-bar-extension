// Constants for the sidepanel extension
const ICONS = {
  FALLBACK: chrome.runtime.getURL('link_18dp_E3E3E3.svg'),
  BOOKMARK: chrome.runtime.getURL('bookmark_18dp_E3E3E3.svg'),
  HISTORY: chrome.runtime.getURL('history_18dp_E3E3E3.svg')
};

const STORAGE_KEYS = {
  EXPANDED_FOLDERS: 'expandedFolders',
  BOOKMARK_TAB_LINKS: 'bookmarkTabLinks',
  TAB_SORT_MODE: 'tabSortMode',
  BOOKMARK_VIEW_MODE: 'bookmarkViewMode',
  SEARCH_QUERY: 'searchQuery',
  DATED_LINKS: 'datedLinks'
};

const ITEM_TYPES = {
  TAB: 'tab',
  BOOKMARK: 'bookmark',
  FOLDER: 'folder',
  HISTORY: 'history'
};

// Export for use in other modules
window.CONSTANTS = { ICONS, STORAGE_KEYS, ITEM_TYPES };