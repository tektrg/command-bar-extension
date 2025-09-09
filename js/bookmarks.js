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

  async createIfNotDuplicate(parentId, title, url) {
    try {
      // Check if bookmark already exists in parent folder
      const children = await chrome.bookmarks.getChildren(parentId);
      const duplicate = children.find(child => child.url === url);
      
      if (duplicate) {
        console.log('Bookmark already exists:', url);
        return duplicate;
      }
      
      // Create new bookmark
      const bookmark = await chrome.bookmarks.create({
        parentId,
        title,
        url
      });
      
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
  }
};

// Export for use in other modules
window.bookmarks = bookmarks;