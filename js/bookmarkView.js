// Bookmark view module for the sidepanel extension

const bookmarkView = {
  // View mode constants
  MODES: {
    FOLDER: 'folder',      // Current tree hierarchy view (folder icon)
    ACTIVE: 'active',      // Only show open bookmarks (star icon)
    DOMAIN: 'domain'       // Group by domain (globe icon)
  },

  // Set view mode and trigger updates
  async setMode(mode, state, storage, renderer, elements) {
    if (!mode || !Object.values(this.MODES).includes(mode)) {
      console.warn('Invalid bookmark view mode:', mode);
      return;
    }

    const oldMode = state.bookmarkViewMode;
    if (oldMode === mode) return; // No change needed

    state.bookmarkViewMode = mode;
    
    // Save to storage
    try {
      await storage.saveBookmarkViewMode(state);
      
      // Show user feedback
      const modeLabel = this.getModeLabel(mode);
      window.utils.showToast(`Viewing bookmarks by ${modeLabel}`);
      
      // Trigger re-render
      renderer.render(state, elements);
    } catch (error) {
      console.error('Failed to save bookmark view mode:', error);
      // Revert state on error
      state.bookmarkViewMode = oldMode;
      window.utils.showToast('Failed to save view preference');
    }
  },

  // Get current view mode from state
  getCurrentMode(state) {
    return state.bookmarkViewMode || this.MODES.FOLDER;
  },

  // Get display label for mode
  getModeLabel(mode) {
    switch (mode) {
      case this.MODES.ACTIVE:
        return 'Open Bookmarks';
      case this.MODES.DOMAIN:
        return 'Domain';
      case this.MODES.FOLDER:
      default:
        return 'Folder Tree';
    }
  },

  // Get icon name for mode
  getModeIcon(mode) {
    switch (mode) {
      case this.MODES.ACTIVE:
        return 'star'; // or 'bookmark' for active/highlighted bookmarks
      case this.MODES.DOMAIN:
        return 'public';
      case this.MODES.FOLDER:
      default:
        return 'folder';
    }
  },

  // Filter bookmarks based on view mode
  filterBookmarks(bookmarksRoots, state) {
    const mode = this.getCurrentMode(state);
    
    switch (mode) {
      case this.MODES.ACTIVE:
        return this.getActiveBookmarks(bookmarksRoots, state);
      case this.MODES.DOMAIN:
        return this.getBookmarksByDomain(bookmarksRoots, state);
      case this.MODES.FOLDER:
      default:
        return bookmarksRoots; // Return original tree structure
    }
  },

  // Get only bookmarks that have open tabs
  getActiveBookmarks(bookmarksRoots, state) {
    const activeBookmarks = [];
    
    const traverse = (nodes) => {
      if (!nodes) return;
      
      nodes.forEach(node => {
        if (node.url) {
          // It's a bookmark - check if it has an open tab
          const relatedTabId = state.bookmarkTabRelationships && state.bookmarkTabRelationships[node.id];
          if (relatedTabId && state.itemMaps && state.itemMaps.tabs && state.itemMaps.tabs.has(relatedTabId)) {
            activeBookmarks.push(node);
          }
        } else if (node.children) {
          // It's a folder - recurse through children
          traverse(node.children);
        }
      });
    };
    
    traverse(bookmarksRoots);
    return activeBookmarks.length > 0 ? this.wrapInFakeRoot(activeBookmarks, 'Active Bookmarks') : [];
  },

  // Group bookmarks by domain (flatten hierarchy)
  getBookmarksByDomain(bookmarksRoots, state) {
    const bookmarksByDomain = new Map();
    
    const traverse = (nodes) => {
      if (!nodes) return;
      
      nodes.forEach(node => {
        if (node.url) {
          // It's a bookmark
          const domain = this.extractDomain(node.url);
          if (!bookmarksByDomain.has(domain)) {
            bookmarksByDomain.set(domain, []);
          }
          bookmarksByDomain.get(domain).push(node);
        } else if (node.children) {
          // It's a folder - recurse through children
          traverse(node.children);
        }
      });
    };
    
    traverse(bookmarksRoots);
    
    // Convert to fake folder structure
    const domainFolders = [];
    bookmarksByDomain.forEach((bookmarks, domain) => {
      domainFolders.push({
        id: `domain_${domain}`,
        title: domain,
        parentId: 'domain_root',
        children: bookmarks.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      });
    });
    
    // Sort domain folders alphabetically
    domainFolders.sort((a, b) => a.title.localeCompare(b.title));
    
    return domainFolders.length > 0 ? domainFolders : [];
  },

  // Extract domain from URL
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

  // Create a fake root to wrap bookmarks for non-tree views
  wrapInFakeRoot(bookmarks, title) {
    if (!bookmarks || bookmarks.length === 0) return [];
    
    return [{
      id: 'fake_root',
      title: title,
      parentId: null,
      children: bookmarks.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }];
  },

  // Check if we should show folder structure (folder mode only)
  shouldShowFolderStructure(state) {
    return this.getCurrentMode(state) === this.MODES.FOLDER;
  },

  // Check if we should flatten bookmarks (active and domain modes)
  shouldFlattenBookmarks(state) {
    const mode = this.getCurrentMode(state);
    return mode === this.MODES.ACTIVE || mode === this.MODES.DOMAIN;
  }
};

// Export for use in other modules
window.bookmarkView = bookmarkView;