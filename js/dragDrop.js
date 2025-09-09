// Drag and drop functionality for the sidepanel extension
const dragDrop = {
  // Drop zone management
  createDropZone: (parentId, index, targetElement, position) => {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.parentId = parentId;
    zone.dataset.index = index;
    
    // Position the drop zone absolutely
    let top;
    if (position === 'before') {
      top = targetElement.offsetTop - 2;
    } else { // after
      top = targetElement.offsetTop + targetElement.offsetHeight - 2;
    }
    
    zone.style.top = top + 'px';
    
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('active');
    });
    
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('active');
    });
    
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('active');
      
      const txt = e.dataTransfer.getData('text/plain');
      if (!txt) return;
      
      try {
        const payload = JSON.parse(txt);
        await dragDrop.handleReorder(payload, parentId, parseInt(index));
        // Reload and render will be called by the main module
        if (window.reloadBookmarks && window.renderer) {
          await window.reloadBookmarks();
          window.renderer.render();
        }
      } catch (err) {
        console.error('Drop zone error:', err);
      }
    });
    
    return zone;
  },

  insertDropZones: (container, parentId, state) => {
    if (!state.dragState.isDragging) return;
    
    const children = Array.from(container.children).filter(child => 
      !child.classList.contains('drop-zone') && 
      !child.classList.contains('prd-stv-window-separator')
    );
    
    children.forEach((child, index) => {
      // Insert drop zone before each item
      const zone = dragDrop.createDropZone(parentId, index, child, 'before');
      container.appendChild(zone);
    });
    
    // Insert final drop zone after last item
    if (children.length > 0) {
      const lastChild = children[children.length - 1];
      const finalZone = dragDrop.createDropZone(parentId, children.length, lastChild, 'after');
      container.appendChild(finalZone);
    }
  },

  removeAllDropZones: () => {
    document.querySelectorAll('.drop-zone').forEach(zone => zone.remove());
  },

  findParentContainer: (parentId) => {
    if (!parentId) {
      // Root level bookmarks
      return document.getElementById('combined-list');
    }
    
    // Find the folder element with this parent ID
    const folderElement = document.querySelector(`.bm-folder[data-id="${parentId}"]`);
    if (folderElement) {
      const childrenContainer = folderElement.querySelector('.bm-children');
      if (childrenContainer) {
        return childrenContainer;
      }
    }
    
    // If not found, might be in root bookmarks
    return document.getElementById('combined-list');
  },

  handleDrop: async (payload, folderId) => {
    if (!payload || !folderId) return;
    if (payload.type === 'bookmark') {
      if (window.bookmarks && window.bookmarks.safeMove) {
        await window.bookmarks.safeMove(payload.id, folderId);
      }
      window.utils.showToast('Bookmark moved');
    } else if (payload.type === 'folder') {
      if (window.bookmarks && window.bookmarks.safeMove) {
        await window.bookmarks.safeMove(payload.id, folderId);
      }
      window.utils.showToast('Folder moved');
    } else if (payload.type === 'tab') {
      if (!payload.url) return;
      if (window.bookmarks && window.bookmarks.createIfNotDuplicate) {
        await window.bookmarks.createIfNotDuplicate(folderId, payload.title || payload.url, payload.url);
      }
      window.utils.showToast('Bookmarked tab');
    }
  },

  handleReorder: async (payload, targetParentId, targetIndex) => {
    if (!payload || !payload.id) return;
    
    try {
      // Get current bookmark info to check current position
      const bookmarkInfo = await chrome.bookmarks.get(payload.id);
      if (!bookmarkInfo || !bookmarkInfo[0]) return;
      
      const currentItem = bookmarkInfo[0];
      const currentParentId = currentItem.parentId;
      
      // Chrome API removes the item first, then inserts at new position
      // We need to adjust based on whether we're moving up or down
      let adjustedIndex = targetIndex;
      
      if (currentParentId === targetParentId) {
        // Get all children to find current position
        const siblings = await chrome.bookmarks.getChildren(currentParentId);
        const currentIndex = siblings.findIndex(sibling => sibling.id === payload.id);
        
        // When moving within the same parent:
        // - Moving up (to lower index): use target index as-is
        // - Moving down (to higher index): no adjustment needed, Chrome handles it
        // The issue was we were always subtracting 1 when moving down
        adjustedIndex = targetIndex;
      }
      
      // Perform the move
      await chrome.bookmarks.move(payload.id, {
        parentId: targetParentId,
        index: adjustedIndex
      });
      
      if (payload.type === 'bookmark') {
        window.utils.showToast('Bookmark reordered');
      } else if (payload.type === 'folder') {
        window.utils.showToast('Folder reordered');
      }
    } catch (error) {
      console.error('Reorder error:', error);
      window.utils.showToast('Failed to reorder item');
    }
  }
};

// Export for use in other modules
window.dragDrop = dragDrop;