// Rendering module for the sidepanel extension

const renderer = {
  render: (state, elements) => {
    renderer.renderCombined(state, elements);
  },

  renderCombined: (state, elements) => {
    elements.combined.innerHTML = '';
    
    // Render bookmarks first
    const roots = state.filteredTree.length ? state.filteredTree : state.bookmarksRoots;
    if (roots && roots.length) {
      // Add bookmarks section header if there are items
      const bookmarkHeader = document.createElement('div');
      bookmarkHeader.className = 'prd-stv-window-separator';
      bookmarkHeader.innerHTML = '<span>Bookmarks</span>';
      elements.combined.appendChild(bookmarkHeader);
      
      roots.forEach(root => elements.combined.appendChild(renderer.renderNode(root, 0, state)));
    }
    
    // Render tabs
    const tabList = state.filteredTabs.length || state.query ? state.filteredTabs : state.tabs;
    if (tabList && tabList.length) {
      // Add tabs section header if there are items
      const tabHeader = document.createElement('div');
      tabHeader.className = 'prd-stv-window-separator';
      tabHeader.innerHTML = '<span>Open Tabs</span>';
      elements.combined.appendChild(tabHeader);
      
      let currentWindowId = null;
      tabList.forEach(tab => {
        // Add window separator if we're switching to a new window
        if (tab.windowId !== currentWindowId) {
          const separator = document.createElement('div');
          separator.className = 'prd-stv-window-separator';
          separator.innerHTML = `<span>Window ${tab.windowId}</span>`;
          separator.style.fontSize = '10px';
          separator.style.color = '#777';
          elements.combined.appendChild(separator);
          currentWindowId = tab.windowId;
        }
        
        elements.combined.appendChild(renderer.renderTabItem(tab, state));
      });
    }
    
    // Show empty state if no items
    if ((!roots || !roots.length) && (!tabList || !tabList.length)) {
      const empty = document.createElement('div');
      empty.className = 'prd-stv-empty';
      empty.textContent = 'No items found';
      elements.combined.appendChild(empty);
    }
  },

  renderNode: (node, depth, state) => {
    if (node.url) return renderer.renderBookmarkItem(node, state);
    
    // Render folder
    const wrapper = document.createElement('div');
    wrapper.className = 'bm-folder';
    wrapper.dataset.id = node.id;

    const header = document.createElement('div');
    header.className = 'bm-folder-header';
    header.dataset.id = node.id;
    header.setAttribute('draggable', 'true');
    header.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <span class="bm-twisty">${window.folderState.isExpanded(node.id, state) ? '▾' : '▸'}</span>
        <span style="flex:1;">${window.utils.escapeHtml(node.title || 'Untitled folder')}</span>
      </div>
      <div class="prd-stv-item-controls" style="opacity:0;transition:opacity 0.2s;">
        <button class="prd-stv-menu-btn" title="More options" data-folder-id="${node.id}">⋯</button>
      </div>
    `;
    
    header.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        renderer.showFolderContextMenu(e, node);
      } else {
        window.folderState.toggle(node.id, state, window.storage, window.renderer);
      }
    });
    
    // Add drag and drop handlers
    renderer.addFolderDragHandlers(header, node, state);
    
    wrapper.appendChild(header);

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'bm-children';
    const shouldExpand = state.query ? true : window.folderState.isExpanded(node.id, state);
    if (shouldExpand && node.children && node.children.length) {
      node.children.forEach(child => childrenWrap.appendChild(renderer.renderNode(child, depth + 1, state)));
    }
    wrapper.appendChild(childrenWrap);
    return wrapper;
  },

  renderBookmarkItem: (node, state) => {
    const div = document.createElement('div');
    const hasOpenTab = state.bookmarkTabRelationships[node.id];
    div.className = hasOpenTab ? 'prd-stv-cmd-item bm-bookmark bookmark-highlighted' : 'prd-stv-cmd-item bm-bookmark';
    div.dataset.id = node.id;
    div.setAttribute('draggable', 'true');
    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.BOOKMARK, url: node.url });
    const query = state.query;
    const buttonText = hasOpenTab ? '−' : '×';
    const buttonTitle = hasOpenTab ? 'Close tab' : 'Delete bookmark';
    
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <span class="prd-stv-title">${window.utils.highlightMatches(node.title || node.url, query)}</span>
      </div>
      <div class="prd-stv-item-controls">
        <button class="prd-stv-menu-btn" title="More options" data-bookmark-id="${node.id}">⋯</button>
        <button class="prd-stv-close-btn ${hasOpenTab ? 'close-tab-btn' : ''}" title="${buttonTitle}">${buttonText}</button>
      </div>
    `;
    
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-close-btn')) {
        e.stopPropagation();
        if (hasOpenTab) {
          window.closeTabFromBookmark(node.id);
        } else {
          window.deleteBookmark(node.id);
        }
      } else if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        renderer.showContextMenu(e, node, div);
      } else {
        window.openUrl(node.url, e, node.id);
      }
    });
    
    // Add drag handlers
    renderer.addBookmarkDragHandlers(div, node, state);
    return div;
  },

  renderTabItem: (tab, state) => {
    const div = document.createElement('div');
    const isFromBookmark = Object.values(state.bookmarkTabRelationships).includes(tab.id);
    let className = 'prd-stv-cmd-item';
    if (tab.active) className += ' active-tab';
    if (isFromBookmark) className += ' tab-from-bookmark';
    
    div.className = className;
    div.dataset.id = String(tab.id);
    div.setAttribute('draggable', 'true');
    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.TAB, icon: tab.favIconUrl, url: tab.url });
    
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <span class="prd-stv-title">${window.utils.highlightMatches(tab.title || tab.url || '', state.query)}</span>
        ${tab.active ? '<span class="active-indicator">●</span>' : ''}
      </div>
      <div class="prd-stv-item-controls">
        <button class="prd-stv-menu-btn" title="More options" data-tab-id="${tab.id}">⋯</button>
        <button class="prd-stv-close-btn" title="Close tab">×</button>
      </div>
    `;
    
    // Make bookmark-opened tabs less interactive (dimmed)
    if (isFromBookmark) {
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn')) {
          e.stopPropagation();
          window.closeTab(tab.id);
        } else if (e.target.classList.contains('prd-stv-menu-btn')) {
          e.stopPropagation();
          renderer.showTabContextMenu(e, tab, div);
        }
        // Don't allow activation of dimmed tabs - they should be controlled via bookmarks
      });
    } else {
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn')) {
          e.stopPropagation();
          window.closeTab(tab.id);
        } else if (e.target.classList.contains('prd-stv-menu-btn')) {
          e.stopPropagation();
          renderer.showTabContextMenu(e, tab, div);
        } else {
          window.activateTab(tab);
        }
      });
    }
    
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'tab', id: tab.id, title: tab.title, url: tab.url }));
      e.dataTransfer.effectAllowed = 'copy';
    });
    
    return div;
  },

  addFolderDragHandlers: (header, node, state) => {
    // DnD targets
    header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drag-over'); });
    header.addEventListener('dragleave', () => header.classList.remove('drag-over'));
    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');
      const txt = e.dataTransfer.getData('text/plain');
      let handled = false;
      if (txt) {
        try {
          const payload = JSON.parse(txt || '{}');
          await window.dragDrop.handleDrop(payload, node.id);
          handled = true;
        } catch {/* not JSON */}
      }
      if (!handled) {
        const uri = e.dataTransfer.getData('text/uri-list') || '';
        const raw = uri || txt || '';
        if (raw) {
          const urlStr = raw.trim();
          try {
            let urlObj;
            try { urlObj = new URL(urlStr); }
            catch { urlObj = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`); }
            const finalUrl = urlObj.toString();
            await window.bookmarks.createIfNotDuplicate(node.id, urlObj.hostname || finalUrl, finalUrl);
            window.utils.showToast('Bookmarked link');
          } catch { /* ignore invalid drops */ }
        }
      }
      await window.reloadBookmarks();
      await window.folderState.ensureExpanded(node.id, window.state, window.storage);
      window.renderer.render(window.state, window.elements);
    });
    header.addEventListener('dragstart', (e) => {
      const payload = { type: 'folder', id: node.id, parentId: node.parentId };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      header.style.opacity = '0.5';
      header.style.transform = 'rotate(2deg)';
      
      // Update drag state
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'folder';
      
      // Insert drop zones after a small delay to allow render
      setTimeout(() => {
        // Insert drop zones in current parent
        const parentContainer = window.dragDrop.findParentContainer(node.parentId);
        if (parentContainer) {
          window.dragDrop.insertDropZones(parentContainer, node.parentId, state);
        }
        
        // Also insert drop zones in all expanded folders for cross-folder moves
        document.querySelectorAll('.bm-folder').forEach(folder => {
          const folderId = folder.dataset.id;
          if (window.folderState.isExpanded(folderId, state)) {
            const childrenContainer = folder.querySelector('.bm-children');
            if (childrenContainer && folderId !== node.id) { // Don't add to self
              window.dragDrop.insertDropZones(childrenContainer, folderId, state);
            }
          }
        });
      }, 10);
    });

    header.addEventListener('dragend', () => {
      // Remove visual feedback
      header.style.opacity = '';
      header.style.transform = '';
      
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
      window.dragDrop.removeAllDropZones();
      
      // Re-render to catch any missed updates during drag
      window.renderer.render(state, window.elements);
    });
  },

  addBookmarkDragHandlers: (div, node, state) => {
    div.addEventListener('dragstart', (e) => {
      const payload = { type: 'bookmark', id: node.id, parentId: node.parentId };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      div.style.opacity = '0.5';
      div.style.transform = 'rotate(2deg)';
      
      // Update drag state
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'bookmark';
      
      // Insert drop zones after a small delay to allow render
      setTimeout(() => {
        // Insert drop zones in current parent
        const parentContainer = window.dragDrop.findParentContainer(node.parentId);
        if (parentContainer) {
          window.dragDrop.insertDropZones(parentContainer, node.parentId, state);
        }
        
        // Also insert drop zones in all expanded folders for cross-folder moves
        document.querySelectorAll('.bm-folder').forEach(folder => {
          const folderId = folder.dataset.id;
          if (window.folderState.isExpanded(folderId, state)) {
            const childrenContainer = folder.querySelector('.bm-children');
            if (childrenContainer) {
              window.dragDrop.insertDropZones(childrenContainer, folderId, state);
            }
          }
        });
      }, 10);
    });

    div.addEventListener('dragend', () => {
      // Remove visual feedback
      div.style.opacity = '';
      div.style.transform = '';
      
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
      window.dragDrop.removeAllDropZones();
      
      // Re-render to catch any missed updates during drag
      window.renderer.render(state, window.elements);
    });
  },

  showContextMenu: (event, bookmark, itemElement) => {
    // Remove any existing context menu
    renderer.closeContextMenu();
    
    // Create context menu
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
    
    // Position the menu relative to the clicked button
    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`; // Position to the left of button
    contextMenu.style.top = `${buttonRect.bottom + 4}px`; // Below the button
    contextMenu.style.zIndex = '10000';
    
    // Add to document
    document.body.appendChild(contextMenu);
    
    // Handle menu item clicks
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'rename') {
        renderer.startRename(bookmark, itemElement);
      } else if (action === 'move') {
        renderer.showMoveDialog(bookmark);
      }
      renderer.closeContextMenu();
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', renderer.closeContextMenu, { once: true });
    }, 10);
  },

  closeContextMenu: () => {
    const existingMenu = document.querySelector('.prd-stv-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  },

  showFolderContextMenu: (event, folder) => {
    // Remove any existing context menu
    renderer.closeContextMenu();
    
    // Create context menu for folders
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
    
    // Position the menu relative to the clicked button
    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`; // Position to the left of button
    contextMenu.style.top = `${buttonRect.bottom + 4}px`; // Below the button
    contextMenu.style.zIndex = '10000';
    
    // Add to document
    document.body.appendChild(contextMenu);
    
    // Handle menu item clicks
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'rename') {
        renderer.startFolderRename(folder);
      } else if (action === 'move') {
        renderer.showMoveDialog(folder);
      }
      renderer.closeContextMenu();
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', renderer.closeContextMenu, { once: true });
    }, 10);
  },

  showTabContextMenu: (event, tab, itemElement) => {
    // Remove any existing context menu
    renderer.closeContextMenu();
    
    // Create context menu for tabs
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
    
    // Position the menu relative to the clicked button
    const buttonRect = event.target.getBoundingClientRect();
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${buttonRect.left - 120}px`; // Position to the left of button
    contextMenu.style.top = `${buttonRect.bottom + 4}px`; // Below the button
    contextMenu.style.zIndex = '10000';
    
    // Add to document
    document.body.appendChild(contextMenu);
    
    // Handle menu item clicks
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;
      if (action === 'move-to-folder') {
        // Create a fake bookmark object to reuse the existing move dialog
        const fakeBookmark = {
          id: `tab_${tab.id}`,
          title: tab.title || 'Untitled',
          url: tab.url,
          _isTab: true,
          _tabData: tab
        };
        renderer.showMoveDialog(fakeBookmark);
      } else if (action === 'duplicate') {
        window.duplicateTab(tab);
      }
      renderer.closeContextMenu();
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', renderer.closeContextMenu, { once: true });
    }, 10);
  },

  startRename: (bookmark, itemElement) => {
    const titleElement = itemElement.querySelector('.prd-stv-title');
    const currentTitle = bookmark.title;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'prd-stv-rename-input';
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:2px;font-size:14px;outline:none;width:100%;';
    
    // Replace title with input
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
          
          bookmark.title = newTitle; // Update local state
          window.utils.showToast('Bookmark renamed');
        } catch (error) {
          console.error('Failed to rename bookmark:', error);
          window.utils.showToast('Failed to rename bookmark');
        }
      }
      
      // Restore original title display
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
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'prd-stv-rename-input';
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:2px;font-size:14px;outline:none;width:100%;';
    
    // Replace title with input
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
          
          folder.title = newTitle; // Update local state
          window.utils.showToast('Folder renamed');
        } catch (error) {
          console.error('Failed to rename folder:', error);
          window.utils.showToast('Failed to rename folder');
        }
      }
      
      // Restore original title display
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

  showMoveDialog: (bookmark) => {
    // Remove any existing move dialog
    const existingDialog = document.querySelector('.prd-stv-move-dialog');
    if (existingDialog) existingDialog.remove();
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'prd-stv-move-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;';
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'prd-stv-move-dialog';
    dialog.style.cssText = 'background:#2b2b2b;border-radius:8px;padding:20px;width:400px;max-width:90%;max-height:80%;color:#f5f5f5;';
    
    const isTab = bookmark._isTab;
    const isFolder = !bookmark.url && !bookmark._isTab; // Folder if no URL and not a tab
    const actionText = isTab ? 'Save' : 'Move';
    const itemType = isFolder ? 'folder' : (isTab ? 'bookmark' : 'bookmark');
    const titleText = isTab ? `Save "${bookmark.title}" as bookmark` : `Move "${bookmark.title}" to ${itemType === 'folder' ? 'parent folder' : 'folder'}`;
    
    dialog.innerHTML = `
      <h3 style="margin:0 0 16px 0;font-size:16px;">${titleText}</h3>
      <input type="text" class="prd-stv-folder-search" placeholder="Search folders..." 
        style="width:100%;padding:8px;background:#3a3a3a;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:16px;box-sizing:border-box;">
      <div class="prd-stv-folder-list" style="max-height:300px;overflow-y:auto;border:1px solid #555;border-radius:4px;">
        <div style="padding:16px;text-align:center;color:#999;">Loading folders...</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="prd-stv-cancel-btn" style="padding:8px 16px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
        <button class="prd-stv-move-btn" style="padding:8px 16px;background:#b9a079;color:#000;border:none;border-radius:4px;cursor:pointer;" disabled>${actionText}</button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Load folder tree and setup interactions
    renderer.setupMoveDialog(dialog, bookmark, overlay);
    
    // Auto-focus the search input
    const searchInput = dialog.querySelector('.prd-stv-folder-search');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100); // Small delay to ensure modal is fully rendered
    }
  },

  setupMoveDialog: async (dialog, bookmark, overlay) => {
    const folderList = dialog.querySelector('.prd-stv-folder-list');
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
      // Update selection styling
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
        
        // Scroll item into view
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        selectedFolderId = null;
        moveBtn.disabled = true;
      }
    };
    
    // Add selectedIndex setter to dialog for click handling
    dialog._selectedIndexSetter = (index) => {
      selectedIndex = index;
    };
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARK_TREE' });
      
      if (response && response.success === false) {
        throw new Error(response.error || 'Failed to get bookmark tree');
      }
      
      // GET_BOOKMARK_TREE returns tree directly on success, or {success: false, error} on failure
      const bookmarkTree = response;
      allFolders = renderer.extractFolders(bookmarkTree, bookmark.id);
      filteredFolders = allFolders;
      renderer.renderFolderList(folderList, filteredFolders, updateSelection);
    } catch (error) {
      folderList.innerHTML = '<div style="padding:16px;text-align:center;color:#ff6666;">Failed to load folders</div>';
    }
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      filteredFolders = allFolders.filter(folder => 
        folder.title.toLowerCase().includes(query) || folder.path.toLowerCase().includes(query)
      );
      selectedIndex = -1; // Reset selection when searching
      selectedFolderId = null;
      moveBtn.disabled = true;
      renderer.renderFolderList(folderList, filteredFolders, updateSelection);
    });
    
    // Keyboard navigation
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
          // Trigger move action
          moveBtn.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        overlay.remove();
      }
    });
    
    // Move button
    moveBtn.addEventListener('click', async () => {
      if (selectedFolderId) {
        try {
          if (bookmark._isTab) {
            // Handle tab -> bookmark creation
            const bookmarkData = {
              parentId: selectedFolderId,
              title: bookmark.title || 'Untitled',
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
            // Handle normal bookmark/folder move
            const isFolder = !bookmark.url && !bookmark._isTab; // Folder if no URL and not a tab
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
          // Reload bookmarks to reflect changes
          await window.reloadBookmarks();
          window.renderer.render(window.state, window['elements']);
        } catch (error) {
          console.error('Failed to move item:', error);
          window.utils.showToast('Failed to move item');
        }
      }
    });
    
    // Cancel button and overlay click
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
        if (!node.url && node.id !== excludeId) { // It's a folder and not the bookmark being moved
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
        // Update the selectedIndex when clicking
        const clickedIndex = parseInt(folderItem.dataset.index);
        if (!isNaN(clickedIndex)) {
          // Find the dialog to update its selectedIndex
          const dialog = folderItem.closest('.prd-stv-move-dialog');
          if (dialog && dialog._selectedIndexSetter) {
            dialog._selectedIndexSetter(clickedIndex);
          }
        }
        onSelect(folderItem.dataset.folderId);
      }
    });
  },


};

// Export for use in other modules
window.renderer = renderer;