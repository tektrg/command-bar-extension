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
      <span class="bm-twisty">${window.folderState.isExpanded(node.id, state) ? '▾' : '▸'}</span>
      <span>${window.utils.escapeHtml(node.title || 'Untitled folder')}</span>
    `;
    
    header.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      window.folderState.toggle(node.id, state, window.storage, window.renderer);
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
    div.className = 'prd-stv-cmd-item bm-bookmark';
    div.dataset.id = node.id;
    div.setAttribute('draggable', 'true');
    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.BOOKMARK, url: node.url });
    const query = state.query;
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <span class="prd-stv-title">${window.utils.highlightMatches(node.title || node.url, query)}</span>
      </div>
      <button class="prd-stv-close-btn" title="Delete bookmark">×</button>
    `;
    
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-close-btn')) {
        e.stopPropagation();
        window.deleteBookmark(node.id);
      } else {
        window.openUrl(node.url, e);
      }
    });
    
    // Add drag handlers
    renderer.addBookmarkDragHandlers(div, node, state);
    return div;
  },

  renderTabItem: (tab, state) => {
    const div = document.createElement('div');
    div.className = tab.active ? 'prd-stv-cmd-item active-tab' : 'prd-stv-cmd-item';
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
      <button class="prd-stv-close-btn" title="Close tab">×</button>
    `;
    
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-close-btn')) {
        e.stopPropagation();
        window.closeTab(tab.id);
      } else {
        window.activateTab(tab);
      }
    });
    
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
  }
};

// Export for use in other modules
window.renderer = renderer;