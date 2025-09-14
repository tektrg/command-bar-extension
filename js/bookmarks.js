// Bookmark operations module for the sidepanel extension
const bookmarks = {
  async safeMove(bookmarkId, parentId) {
    try {
      await chrome.bookmarks.move(bookmarkId, { parentId });
      return true;
    } catch (error) {
      console.error('Failed to move bookmark:', error);
      return false;
    }
  },

  async createIfNotDuplicate(parentId, title, url, sourceTabId = null) {
    try {
      // Check if bookmark already exists in parent folder
      const children = await chrome.bookmarks.getChildren(parentId);
      const duplicate = children.find(child => child.url === url);
      
      if (duplicate) {
        console.log('Bookmark already exists:', url);
        // Even if duplicate exists, try to link it to the source tab if provided
        if (sourceTabId && window.handleNewBookmarkCreation) {
          await window.handleNewBookmarkCreation(duplicate, sourceTabId);
        }
        return duplicate;
      }
      
      // Create new bookmark
      const bookmark = await chrome.bookmarks.create({
        parentId,
        title,
        url
      });
      
      // Handle tab-bookmark linking for the newly created bookmark
      if (sourceTabId && window.handleNewBookmarkCreation) {
        await window.handleNewBookmarkCreation(bookmark, sourceTabId);
      }
      
      return bookmark;
    } catch (error) {
      console.error('Failed to create bookmark:', error);
      return null;
    }
  },

  filterTree(node, query) {
    if (!node) return null;
    
    const lowerQuery = query.toLowerCase();
    
    // Check if this node matches (for bookmarks)
    if (node.url) {
      const title = (node.title || '').toLowerCase();
      const url = (node.url || '').toLowerCase();
      return (title.includes(lowerQuery) || url.includes(lowerQuery)) ? node : null;
    }
    
    // For folders, recursively filter children
    if (node.children) {
      const filteredChildren = node.children
        .map(child => bookmarks.filterTree(child, query))
        .filter(Boolean);
      
      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }
      
      // Also check if folder name matches
      const title = (node.title || '').toLowerCase();
      if (title.includes(lowerQuery)) {
        return {
          ...node,
          children: node.children || []
        };
      }
    }
    
    return null;
  },

  nodeMatches(node, query) {
    if (!node || !query) return false;
    
    const lowerQuery = query.toLowerCase();
    
    // Check if bookmark matches
    if (node.url) {
      const title = (node.title || '').toLowerCase();
      const url = (node.url || '').toLowerCase();
      return title.includes(lowerQuery) || url.includes(lowerQuery);
    }
    
    // Check if folder name matches
    const title = (node.title || '').toLowerCase();
    return title.includes(lowerQuery);
  }
};

// Export for use in other modules
window.bookmarks = bookmarks;