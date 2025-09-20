// Drag and drop management powered by SortableJS
const dragDrop = {
  sortables: new Map(),

  refreshSortables: (state, elements) => {
    if (typeof Sortable === 'undefined') {
      console.warn('SortableJS not available');
      return;
    }

    dragDrop.cleanupDetachedSortables();

    const containers = dragDrop.collectBookmarkContainers(elements);
    containers.forEach(container => {
      if (!dragDrop.sortables.has(container)) {
        dragDrop.sortables.set(container, dragDrop.createSortable(container, state));
      }
    });
  },

  collectBookmarkContainers: (elements) => {
    const collected = new Set();
    const combined = elements?.combined || document.getElementById('combined-list');
    if (!combined) return collected;

    combined.querySelectorAll('.bm-children').forEach(container => {
      const parentFolder = container.closest('.bm-folder');
      const parentId = container.dataset.parentId || parentFolder?.dataset.id;
      if (!parentId) return;
      container.dataset.parentId = parentId;
      collected.add(container);
    });

    return collected;
  },

  cleanupDetachedSortables: () => {
    dragDrop.sortables.forEach((instance, element) => {
      if (!element.isConnected) {
        instance.destroy();
        dragDrop.sortables.delete(element);
      }
    });
  },

  createSortable: (container, state) => {
    return new Sortable(container, {
      group: { name: 'bookmarks', pull: true, put: true },
      animation: 150,
      direction: 'vertical',
      swapThreshold: 0.65,
      emptyInsertThreshold: 8,
      fallbackOnBody: true,
      draggable: '.bm-folder, .bm-bookmark',
      filter: '.prd-stv-menu-btn, .prd-stv-close-btn',
      preventOnFilter: false,
      ghostClass: 'drag-ghost',
      dragClass: 'dragging',
      onStart: (evt) => dragDrop.onSortStart(evt, state),
      onEnd: (evt) => dragDrop.onSortEnd(evt, state)
    });
  },

  onSortStart: (evt, state) => {
    const payload = dragDrop.extractPayload(evt.item);
    if (!payload) return;
    state.dragState.isDragging = true;
    state.dragState.draggedItem = payload;
    state.dragState.draggedType = payload.type;
    evt.item.classList.add('dragging');
  },

  onSortEnd: async (evt, state) => {
    evt.item.classList.remove('dragging');

    const payload = dragDrop.extractPayload(evt.item);
    state.dragState.isDragging = false;
    state.dragState.draggedItem = null;
    state.dragState.draggedType = null;

    if (!payload) return;

    const targetParentId = evt.to?.dataset?.parentId || payload.parentId;
    const sourceParentId = evt.from?.dataset?.parentId || payload.parentId;
    const newIndex = typeof evt.newIndex === 'number' ? evt.newIndex : parseInt(evt.newIndex, 10);
    const oldIndex = typeof evt.oldIndex === 'number' ? evt.oldIndex : parseInt(evt.oldIndex, 10);

    if (targetParentId === sourceParentId && newIndex === oldIndex) {
      return;
    }

    try {
      await dragDrop.handleReorder(payload, targetParentId, Number.isNaN(newIndex) ? oldIndex : newIndex);
      evt.item.dataset.parentId = targetParentId || '';

      if (window.reloadBookmarks && window.renderer && window.state && window.elements) {
        await window.reloadBookmarks();
        window.renderer.render(window.state, window.elements);
      }
    } catch (error) {
      console.error('Sortable reorder error:', error);
      if (evt.from) {
        const children = Array.from(evt.from.children).filter(child =>
          child.matches('.bm-folder, .bm-bookmark')
        );
        const reference = children[oldIndex] || null;
        evt.from.insertBefore(evt.item, reference);
      }
      window.utils?.showToast?.('Failed to reorder item');
    } finally {
      dragDrop.refreshSortables(state, window.elements);
    }
  },

  extractPayload: (element) => {
    if (!element) return null;
    const id = element.dataset.id;
    const type = element.dataset.itemType;
    const parentId = element.dataset.parentId || null;
    if (!id || !type) return null;
    return { id, type, parentId };
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
        await window.bookmarks.createIfNotDuplicate(folderId, payload.title || payload.url, payload.url, payload.id);
      }
      window.utils.showToast('Bookmarked tab');
    }
  },

  handleReorder: async (payload, targetParentId, targetIndex) => {
    if (!payload || !payload.id) return;

    try {
      const bookmarkInfo = await chrome.bookmarks.get(payload.id);
      if (!bookmarkInfo || !bookmarkInfo[0]) return;

      const currentItem = bookmarkInfo[0];
      const currentParentId = currentItem.parentId;
      const destinationParentId = targetParentId || currentParentId;
      let adjustedIndex = Number.isInteger(targetIndex) ? targetIndex : 0;

      if (currentParentId === destinationParentId) {
        adjustedIndex = Math.max(0, adjustedIndex);
      }

      await chrome.bookmarks.move(payload.id, {
        parentId: destinationParentId,
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
      throw error;
    }
  }
};

// Export for use in other modules
window.dragDrop = dragDrop;
