// UI Actions module for context menus, modals, and rename operations

const rendererUIActions = {
  // Context menu management
  showContextMenu: (event, bookmark, itemElement) => {
    rendererUIActions.closeContextMenu();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'prd-stv-context-menu';
    contextMenu.innerHTML = `
      <div class="prd-stv-context-item" data-action="rename">
        <span>Rename</span>
      </div>
      <div class="prd-stv-context-item" data-action="move">
        <span>Move to...</span>
      </div>
    `;

    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`;
    contextMenu.style.top = `${buttonRect.bottom + 4}px`;
    contextMenu.style.zIndex = '10000';

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'rename') {
        rendererUIActions.startRename(bookmark, itemElement);
      } else if (action === 'move') {
        rendererUIActions.showMoveDialog(bookmark);
      }
      rendererUIActions.closeContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('click', rendererUIActions.closeContextMenu, { once: true });
    }, 10);
  },

  closeContextMenu: () => {
    const existingMenu = document.querySelector('.prd-stv-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  },

  showFolderContextMenu: (event, folder) => {
    rendererUIActions.closeContextMenu();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'prd-stv-context-menu';

    const openCount = window.getOpenBookmarkCountInFolder(folder.id, window.state);
    const closeTabsItem = openCount > 0 ?
      '<div class="prd-stv-context-item" data-action="close-tabs"><span>Close tabs</span></div>' : '';

    contextMenu.innerHTML = `
      <div class="prd-stv-context-item" data-action="save-tab-here">
        <span>Save tab here</span>
      </div>
      ${closeTabsItem}
      <div class="prd-stv-context-item" data-action="new-folder">
        <span>New folder...</span>
      </div>
      <div class="prd-stv-context-item" data-action="rename">
        <span>Rename</span>
      </div>
      <div class="prd-stv-context-item" data-action="move">
        <span>Move to...</span>
      </div>
      <div class="prd-stv-context-item" data-action="delete-folder" style="color: #ff6b6b;">
        <span>Delete folder</span>
      </div>
    `;

    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`;
    contextMenu.style.top = `${buttonRect.bottom + 4}px`;
    contextMenu.style.zIndex = '10000';

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'save-tab-here') {
        window.saveActiveTabToFolder(folder.id);
      } else if (action === 'close-tabs') {
        window.closeTabsInFolder(folder.id);
      } else if (action === 'new-folder') {
        rendererUIActions.showNewFolderModal(folder.id);
      } else if (action === 'rename') {
        rendererUIActions.startFolderRename(folder);
      } else if (action === 'move') {
        rendererUIActions.showMoveDialog(folder);
      } else if (action === 'delete-folder') {
        rendererUIActions.showDeleteFolderModal(folder);
      }
      rendererUIActions.closeContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('click', rendererUIActions.closeContextMenu, { once: true });
    }, 10);
  },

  showTabContextMenu: (event, tab, itemElement) => {
    rendererUIActions.closeContextMenu();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'prd-stv-context-menu';
    contextMenu.innerHTML = `
      <div class="prd-stv-context-item" data-action="move-to-folder">
        <span>Move to...</span>
      </div>
      <div class="prd-stv-context-item" data-action="duplicate">
        <span>Duplicate Tab</span>
      </div>
    `;

    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`;
    contextMenu.style.top = `${buttonRect.bottom + 4}px`;
    contextMenu.style.zIndex = '10000';

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'move-to-folder') {
        const fakeBookmark = {
          id: `tab_${tab.id}`,
          title: tab.title || 'Untitled',
          url: tab.url,
          _isTab: true,
          _tabData: tab
        };
        rendererUIActions.showMoveDialog(fakeBookmark);
      } else if (action === 'duplicate') {
        window.duplicateTab(tab);
      }
      rendererUIActions.closeContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('click', rendererUIActions.closeContextMenu, { once: true });
    }, 10);
  },

  showHistoryContextMenu: (event, historyItem, itemElement) => {
    rendererUIActions.closeContextMenu();

    const contextMenu = document.createElement('div');
    contextMenu.className = 'prd-stv-context-menu';
    contextMenu.innerHTML = `
      <div class="prd-stv-context-item" data-action="open-new-tab">
        <span>Open in New Tab</span>
      </div>
      <div class="prd-stv-context-item" data-action="remove-from-history">
        <span>Remove from History</span>
      </div>
    `;

    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`;
    contextMenu.style.top = `${buttonRect.bottom + 4}px`;
    contextMenu.style.zIndex = '10000';

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'open-new-tab') {
        chrome.tabs.create({ url: historyItem.url });
      } else if (action === 'remove-from-history') {
        chrome.history.deleteUrl({ url: historyItem.url });
        itemElement.remove();
        window.utils.showToast('Removed from history');
      }
      rendererUIActions.closeContextMenu();
    });

    setTimeout(() => {
      document.addEventListener('click', rendererUIActions.closeContextMenu, { once: true });
    }, 10);
  },

  // Rename operations
  startRename: (bookmark, itemElement) => {
    const titleElement = itemElement.querySelector('.prd-stv-title');
    const currentTitle = bookmark.title;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'prd-stv-rename-input';
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:15px;font-size:14px;outline:none;width:100%;';

    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    input.select();

    const finishRename = async (save = false) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== currentTitle) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'RENAME_BOOKMARK',
            bookmarkId: bookmark.id,
            newTitle: newTitle
          });

          if (response && response.success === false) {
            throw new Error(response.error || 'Rename operation failed');
          }

          bookmark.title = newTitle;
          window.utils.showToast('Bookmark renamed');
        } catch (error) {
          console.error('Failed to rename bookmark:', error);
          window.utils.showToast('Failed to rename bookmark');
        }
      }

      titleElement.innerHTML = window.utils.highlightMatches(bookmark.title || bookmark.url, window.state?.query || '');
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishRename(false);
      }
    });

    input.addEventListener('blur', () => finishRename(true));
  },

  startFolderRename: (folder) => {
    const folderHeader = document.querySelector(`.bm-folder-header[data-id="${folder.id}"]`);
    if (!folderHeader) return;

    const titleElement = folderHeader.querySelector('span:last-child');
    const currentTitle = folder.title;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'prd-stv-rename-input';
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:15px;font-size:14px;outline:none;width:100%;';

    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    input.select();

    const finishRename = async (save = false) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== currentTitle) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'RENAME_BOOKMARK',
            bookmarkId: folder.id,
            newTitle: newTitle
          });

          if (response && response.success === false) {
            throw new Error(response.error || 'Rename operation failed');
          }

          folder.title = newTitle;
          window.utils.showToast('Folder renamed');
        } catch (error) {
          console.error('Failed to rename folder:', error);
          window.utils.showToast('Failed to rename folder');
        }
      }

      titleElement.textContent = folder.title || 'Untitled folder';
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRename(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishRename(false);
      }
    });

    input.addEventListener('blur', () => finishRename(true));
  },

  // Move dialog
  showMoveDialog: (bookmark) => {
    const existingDialog = document.querySelector('.prd-stv-move-dialog');
    if (existingDialog) existingDialog.remove();

    const overlay = document.createElement('div');
    overlay.className = 'prd-stv-move-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.className = 'prd-stv-move-dialog';
    dialog.style.cssText = 'background:#2b2b2b;border-radius:15px;padding:20px;width:400px;max-width:90%;max-height:80%;color:#f5f5f5;';

    const isTab = bookmark._isTab;
    const isFolder = !bookmark.url && !bookmark._isTab;
    const actionText = isTab ? 'Save' : 'Move';
    const itemType = isFolder ? 'folder' : (isTab ? 'bookmark' : 'bookmark');
    const titleText = isTab ? `Save as bookmark` : `Move "${bookmark.title}" to ${itemType === 'folder' ? 'parent folder' : 'folder'}`;

    const titleInputHTML = isTab ? `
      <input type="text" class="prd-stv-title-input" placeholder="Bookmark title"
        value="${window.utils.escapeHtml(bookmark.title || '')}"
        style="width:100%;padding:8px;background:#3a3a3a;border:1px solid #555;color:#fff;border-radius:15px;margin-bottom:12px;box-sizing:border-box;font-size:14px;">
    ` : '';

    dialog.innerHTML = `
      <h3 style="margin:0 0 16px 0;font-size:16px;">${titleText}</h3>
      ${titleInputHTML}
      <input type="text" class="prd-stv-folder-search" placeholder="Search folders..."
        style="width:100%;padding:8px;background:#3a3a3a;border:1px solid #555;color:#fff;border-radius:15px;margin-bottom:16px;box-sizing:border-box;">
      <div class="prd-stv-folder-list" style="max-height:300px;overflow-y:auto;border:1px solid #555;border-radius:15px;">
        <div style="padding:16px;text-align:center;color:#999;">Loading folders...</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="prd-stv-cancel-btn" style="padding:8px 16px;background:#555;color:#fff;border:none;border-radius:15px;cursor:pointer;">Cancel</button>
        <button class="prd-stv-move-btn" style="padding:8px 16px;background:#b9a079;color:#000;border:none;border-radius:15px;cursor:pointer;" disabled>${actionText}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    rendererUIActions.setupMoveDialog(dialog, bookmark, overlay);

    const titleInput = dialog.querySelector('.prd-stv-title-input');
    const searchInput = dialog.querySelector('.prd-stv-folder-search');
    if (titleInput) {
      setTimeout(() => {
        titleInput.focus();
        titleInput.select();
      }, 100);
    } else if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  },

  setupMoveDialog: async (dialog, bookmark, overlay) => {
    const folderList = dialog.querySelector('.prd-stv-folder-list');
    const titleInput = dialog.querySelector('.prd-stv-title-input');
    const searchInput = dialog.querySelector('.prd-stv-folder-search');
    const moveBtn = dialog.querySelector('.prd-stv-move-btn');
    const cancelBtn = dialog.querySelector('.prd-stv-cancel-btn');
    let selectedFolderId = null;
    let allFolders = [];
    let filteredFolders = [];
    let selectedIndex = -1;

    const updateSelection = (folderId) => {
      selectedFolderId = folderId;
      moveBtn.disabled = false;
      folderList.querySelectorAll('.prd-stv-folder-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.folderId === folderId);
      });
    };

    const selectByIndex = (index) => {
      selectedIndex = index;
      const items = folderList.querySelectorAll('.prd-stv-folder-item');
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
      });

      if (index >= 0 && index < items.length) {
        const selectedItem = items[index];
        selectedFolderId = selectedItem.dataset.folderId;
        moveBtn.disabled = false;
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        selectedFolderId = null;
        moveBtn.disabled = true;
      }
    };

    dialog._selectedIndexSetter = (index) => {
      selectedIndex = index;
    };

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARK_TREE' });

      if (response && response.success === false) {
        throw new Error(response.error || 'Failed to get bookmark tree');
      }

      const bookmarkTree = response;
      allFolders = rendererUIActions.extractFolders(bookmarkTree, bookmark.id);
      filteredFolders = allFolders;
      rendererUIActions.renderFolderList(folderList, filteredFolders, updateSelection);
    } catch (error) {
      folderList.innerHTML = '<div style="padding:16px;text-align:center;color:#ff6666;">Failed to load folders</div>';
    }

    if (titleInput) {
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchInput.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          overlay.remove();
        }
      });
    }

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      filteredFolders = allFolders.filter(folder =>
        folder.title.toLowerCase().includes(query) || folder.path.toLowerCase().includes(query)
      );
      selectedIndex = -1;
      selectedFolderId = null;
      moveBtn.disabled = true;
      rendererUIActions.renderFolderList(folderList, filteredFolders, updateSelection);
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = folderList.querySelectorAll('.prd-stv-folder-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        selectByIndex(selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        selectByIndex(selectedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedFolderId) {
          moveBtn.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        overlay.remove();
      }
    });

    moveBtn.addEventListener('click', async () => {
      if (selectedFolderId) {
        try {
          if (bookmark._isTab) {
            const editedTitle = titleInput ? titleInput.value.trim() : bookmark.title;
            const bookmarkData = {
              parentId: selectedFolderId,
              title: editedTitle || 'Untitled',
              url: bookmark.url
            };

            const response = await chrome.runtime.sendMessage({
              type: 'CREATE_BOOKMARK',
              bookmarkData: bookmarkData
            });

            if (response && response.success === false) {
              throw new Error(response.error || 'Create bookmark operation failed');
            }

            window.utils.showToast('Tab saved as bookmark');
          } else {
            const isFolder = !bookmark.url && !bookmark._isTab;
            const itemType = isFolder ? 'folder' : 'bookmark';
            const response = await chrome.runtime.sendMessage({
              type: 'MOVE_BOOKMARK',
              bookmarkId: bookmark.id,
              destinationId: selectedFolderId
            });

            if (response && response.success === false) {
              throw new Error(response.error || 'Move operation failed');
            }

            window.utils.showToast(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} moved`);
          }
          overlay.remove();
          await window.reloadBookmarks();
          window.renderer.render(window.state, window['elements']);
        } catch (error) {
          console.error('Failed to move item:', error);
          window.utils.showToast('Failed to move item');
        }
      }
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  },

  extractFolders: (bookmarkTree, excludeId = null) => {
    const folders = [];

    const traverse = (nodes, path = '') => {
      if (!nodes) return;

      nodes.forEach(node => {
        if (!node.url && node.id !== excludeId) {
          const currentPath = path ? `${path} > ${node.title}` : node.title;
          folders.push({
            id: node.id,
            title: node.title,
            path: currentPath
          });

          if (node.children) {
            traverse(node.children, currentPath);
          }
        }
      });
    };

    traverse(bookmarkTree);
    return folders;
  },

  renderFolderList: (container, folders, onSelect) => {
    container.innerHTML = folders.map((folder, index) => `
      <div class="prd-stv-folder-item" data-folder-id="${folder.id}" data-index="${index}"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #3a3a3a;display:flex;flex-direction:column;">
        <div style="font-size:14px;color:#f5f5f5;">${window.utils.escapeHtml(folder.title)}</div>
        <div style="font-size:12px;color:#999;margin-top:2px;">${window.utils.escapeHtml(folder.path)}</div>
      </div>
    `).join('') || '<div style="padding:16px;text-align:center;color:#999;">No folders found</div>';

    container.addEventListener('click', (e) => {
      const folderItem = e.target.closest('.prd-stv-folder-item');
      if (folderItem && folderItem.dataset.folderId) {
        const clickedIndex = parseInt(folderItem.dataset.index);
        if (!isNaN(clickedIndex)) {
          const dialog = folderItem.closest('.prd-stv-move-dialog');
          if (dialog && dialog._selectedIndexSetter) {
            dialog._selectedIndexSetter(clickedIndex);
          }
        }
        onSelect(folderItem.dataset.folderId);
      }
    });
  },

  // Modal operations for new folder and delete folder
  showNewFolderModal: (parentFolderId) => {
    const modal = document.getElementById('prd-stv-folder-modal');
    const input = document.getElementById('prd-stv-folder-name-input');
    const saveBtn = document.getElementById('prd-stv-modal-save');
    const cancelBtn = document.getElementById('prd-stv-modal-cancel');
    const closeBtn = document.getElementById('prd-stv-modal-close');

    if (!modal || !input || !saveBtn || !cancelBtn || !closeBtn) {
      console.error('Modal elements not found');
      return;
    }

    input.value = '';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 100);

    const handleSave = async () => {
      const folderName = input.value.trim();
      if (!folderName) {
        window.utils.showToast('Please enter a folder name');
        return;
      }

      try {
        const newFolder = await chrome.bookmarks.create({
          parentId: parentFolderId,
          title: folderName
        });

        window.utils.showToast(`Folder "${folderName}" created`);
        modal.style.display = 'none';

        await window.reloadBookmarks();
        await window.folderState.ensureExpanded(parentFolderId, window.state, window.storage);
        window.renderer.render(window.state, window.elements);
      } catch (error) {
        console.error('Failed to create folder:', error);
        window.utils.showToast('Failed to create folder');
      }
    };

    const handleClose = () => {
      modal.style.display = 'none';
      cleanup();
    };

    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    const cleanup = () => {
      saveBtn.removeEventListener('click', handleSave);
      cancelBtn.removeEventListener('click', handleClose);
      closeBtn.removeEventListener('click', handleClose);
      input.removeEventListener('keydown', handleKeyPress);
      modal.removeEventListener('click', handleModalOverlayClick);
    };

    const handleModalOverlayClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    input.addEventListener('keydown', handleKeyPress);
    modal.addEventListener('click', handleModalOverlayClick);
  },

  showDeleteFolderModal: (folder) => {
    const modal = document.getElementById('prd-stv-confirm-modal');
    const message = document.getElementById('prd-stv-confirm-message');
    const deleteBtn = document.getElementById('prd-stv-confirm-delete');
    const cancelBtn = document.getElementById('prd-stv-confirm-cancel');
    const closeBtn = document.getElementById('prd-stv-confirm-modal-close');

    if (!modal || !message || !deleteBtn || !cancelBtn || !closeBtn) {
      console.error('Confirm modal elements not found');
      return;
    }

    message.textContent = `Are you sure you want to delete "${folder.title}"? All bookmarks and subfolders will be deleted.`;
    modal.style.display = 'flex';

    const handleDelete = async () => {
      try {
        await chrome.bookmarks.removeTree(folder.id);
        window.utils.showToast(`Folder "${folder.title}" deleted`);
        modal.style.display = 'none';

        await window.reloadBookmarks();
        window.renderer.render(window.state, window.elements);
      } catch (error) {
        console.error('Failed to delete folder:', error);
        window.utils.showToast('Failed to delete folder');
      }
    };

    const handleClose = () => {
      modal.style.display = 'none';
      cleanup();
    };

    const cleanup = () => {
      deleteBtn.removeEventListener('click', handleDelete);
      cancelBtn.removeEventListener('click', handleClose);
      closeBtn.removeEventListener('click', handleClose);
      modal.removeEventListener('click', handleModalOverlayClick);
    };

    const handleModalOverlayClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    deleteBtn.addEventListener('click', handleDelete);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    modal.addEventListener('click', handleModalOverlayClick);
  }
};

// Export for use in other modules
window.rendererUIActions = rendererUIActions;
