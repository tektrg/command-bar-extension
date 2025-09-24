// Rendering module for the sidepanel extension

const renderer = {
  render: async (state, elements) => {
    await renderer.renderCombined(state, elements);
    if (window.dragDrop && typeof window.dragDrop.refreshSortables === 'function') {
      window.dragDrop.refreshSortables(state, elements);
    }
  },

  // Selective DOM update functions
  updateBookmarkItemInDOM: (bookmarkId, bookmark, state, elements) => {
    const existingElement = elements.combined.querySelector(`[data-id="${bookmarkId}"]`);
    if (existingElement && bookmark) {
      // Update existing element in place
      const newElement = renderer.renderBookmarkItem(bookmark, state);
      existingElement.replaceWith(newElement);
    } else if (!bookmark && existingElement) {
      // Remove deleted item
      existingElement.remove();
    } else if (bookmark && !existingElement) {
      // Add new item (need to find correct insertion point)
      renderer.insertBookmarkAtCorrectPosition(bookmark, state, elements);
    }
  },

  updateTabItemInDOM: (tabId, tab, state, elements) => {
    const existingElement = elements.combined.querySelector(`[data-id="${tabId}"]`);
    if (existingElement && tab) {
      const newElement = renderer.renderTabItem(tab, state);
      existingElement.replaceWith(newElement);
    } else if (!tab && existingElement) {
      existingElement.remove();
    } else if (tab && !existingElement) {
      renderer.insertTabAtCorrectPosition(tab, state, elements);
    }
  },

  insertBookmarkAtCorrectPosition: async (bookmark, state, elements) => {
    try {
      // Find parent folder in DOM
      const parentContainer = renderer.findParentContainer(bookmark.parentId, elements);
      if (!parentContainer) return;
      
      // Get siblings from Chrome API to determine position
      const siblings = await chrome.bookmarks.getChildren(bookmark.parentId);
      const index = siblings.findIndex(s => s.id === bookmark.id);
      const referenceElement = parentContainer.children[index];
      const newElement = renderer.renderBookmarkItem(bookmark, state);
      
      if (referenceElement) {
        referenceElement.before(newElement);
      } else {
        parentContainer.appendChild(newElement);
      }
    } catch {
      // Fallback to full render if positioning fails
      renderer.render(state, elements);
    }
  },

  insertTabAtCorrectPosition: (tab, state, elements) => {
    // For tabs, we can insert based on the current tab order in state.tabs
    const tabList = state.filteredTabs.length || state.query ? state.filteredTabs : state.tabs;
    const tabIndex = tabList.findIndex(t => t.id === tab.id);
    
    // Find the tabs section in the DOM
    const tabHeaders = elements.combined.querySelectorAll('.prd-stv-window-separator');
    let tabSection = null;
    for (const header of tabHeaders) {
      if (header.textContent.includes('Open Tabs')) {
        tabSection = header;
        break;
      }
    }
    
    if (!tabSection) return;
    
    // Find the correct position to insert
    const newElement = renderer.renderTabItem(tab, state);
    let insertBefore = null;
    let current = tabSection.nextElementSibling;
    let currentIndex = 0;
    
    while (current && currentIndex < tabIndex) {
      if (current.dataset.id && tabList[currentIndex] && current.dataset.id === String(tabList[currentIndex].id)) {
        currentIndex++;
      }
      if (currentIndex === tabIndex) {
        insertBefore = current;
        break;
      }
      current = current.nextElementSibling;
    }
    
    if (insertBefore) {
      insertBefore.before(newElement);
    } else {
      // Insert after the last tab or after tab section header
      let lastTab = tabSection;
      let sibling = tabSection.nextElementSibling;
      while (sibling && sibling.dataset.id) {
        lastTab = sibling;
        sibling = sibling.nextElementSibling;
      }
      lastTab.after(newElement);
    }
  },

  findParentContainer: (parentId, elements) => {
    // Find the parent folder container
    const parentFolder = elements.combined.querySelector(`[data-id="${parentId}"]`);
    if (!parentFolder) return null;
    
    // Find the children container within the parent folder
    return parentFolder.querySelector('.bm-children');
  },

  renderCombined: async (state, elements) => {
    elements.combined.innerHTML = '';
    
    // Render bookmarks first
    // If there's an active query, use filtered results (even if empty)
    // Otherwise, show the full bookmarks tree
    const roots = (state.filteredTree.length || state.query) ? state.filteredTree : state.bookmarksRoots;
    if (roots && roots.length) {
      roots.forEach(root => elements.combined.appendChild(renderer.renderNode(root, 0, state)));
    }
    
    // Render active tabs
    const tabList = state.filteredTabs.length || state.query ? state.filteredTabs : state.tabs;
    if (tabList && tabList.length) {
      // Sort tabs based on current sort mode
      const sortMode = window.tabSort ? window.tabSort.getCurrentMode(state) : 'position';
      const sortedTabs = window.tabSort ? window.tabSort.sortTabs(tabList, sortMode) : tabList;
      
      // Create tabs section header with icon buttons
      const tabHeader = renderer.createTabSortHeader(state, elements);
      elements.combined.appendChild(tabHeader);
      
      // Render tabs with grouping based on sort mode
      const useWindowGrouping = window.tabSort ? window.tabSort.usesWindowGrouping(sortMode) : true;
      const useDomainGrouping = window.tabSort ? window.tabSort.usesDomainGrouping(sortMode) : false;
      
      if (useWindowGrouping) {
        // Group by window (position mode)
        let currentWindowId = null;
        sortedTabs.forEach(tab => {
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
      } else if (useDomainGrouping) {
        // Group by domain (domain mode)
        const domainGroups = window.tabSort.groupTabsByDomain(sortedTabs);
        
        domainGroups.forEach((tabs, domain) => {
          // Add domain separator
          const separator = document.createElement('div');
          separator.className = 'prd-stv-window-separator';
          separator.innerHTML = `<span class="material-icons-round" style="font-size: 12px; margin-right: 6px;">public</span><span>${domain}</span>`;
          separator.style.fontSize = '10px';
          separator.style.color = '#777';
          elements.combined.appendChild(separator);
          
          // Render tabs in this domain
          tabs.forEach(tab => {
            elements.combined.appendChild(renderer.renderTabItem(tab, state));
          });
        });
      } else {
        // No grouping (last visit mode)
        sortedTabs.forEach(tab => {
          elements.combined.appendChild(renderer.renderTabItem(tab, state));
        });
      }
    }
    
    // Render inactive tabs section
    renderer.renderInactiveTabsSection(state, elements);

    // Determine which inactive tab list is actually rendered
    const inactiveList = (state.filteredInactiveTabs.length || state.query) ? state.filteredInactiveTabs : state.inactiveTabs;

    // Check if results are empty and search history if needed
    const hasResults = (roots && roots.length) || (tabList && tabList.length) || (inactiveList && inactiveList.length);
    
    if (!hasResults) {
      if (state.query && state.query.trim()) {
        // Search results are empty, try to load history
        try {
          const historyResults = await renderer.searchRecentHistory(state.query);
          if (historyResults && historyResults.length) {
            // Create history section header
            const historyHeader = document.createElement('div');
            historyHeader.className = 'prd-stv-window-separator';
            historyHeader.innerHTML = `<span class="material-icons-round" style="font-size: 12px; margin-right: 6px;">history</span><span>Recent History</span>`;
            historyHeader.style.fontSize = '10px';
            historyHeader.style.color = '#777';
            elements.combined.appendChild(historyHeader);
            
            // Render history items
            historyResults.forEach(historyItem => {
              elements.combined.appendChild(renderer.renderHistoryItem(historyItem, state));
            });
          } else {
            // Show empty state
            const empty = document.createElement('div');
            empty.className = 'prd-stv-empty';
            empty.textContent = 'No items found';
            elements.combined.appendChild(empty);
          }
        } catch (error) {
          console.error('Failed to search history:', error);
          const empty = document.createElement('div');
          empty.className = 'prd-stv-empty';
          empty.textContent = 'No items found';
          elements.combined.appendChild(empty);
        }
      } else {
        // No query, show normal empty state
        const empty = document.createElement('div');
        empty.className = 'prd-stv-empty';
        empty.textContent = 'No items found';
        elements.combined.appendChild(empty);
      }
    }
  },

  // Create section header with optional button
  createSectionHeader: (title, buttonConfig = null) => {
    const header = document.createElement('div');
    header.className = 'prd-stv-window-separator';
    
    if (buttonConfig) {
      header.innerHTML = `
        <span>${title}</span>
        <button class="prd-stv-section-btn" 
                title="${buttonConfig.title}"
                style="background:#ff4444;color:white;border:none;border-radius:15px;padding:2px 8px;font-size:10px;cursor:pointer;margin-left:8px;">
          ${buttonConfig.text}
        </button>
      `;
      
      // Add event listener properly instead of inline onclick
      const button = header.querySelector('.prd-stv-section-btn');
      if (button && buttonConfig.clickHandler) {
        button.addEventListener('click', buttonConfig.clickHandler);
      }
    } else {
      header.innerHTML = `<span>${title}</span>`;
    }
    
    return header;
  },

  // Create tabs section header with icon buttons for sorting
  createTabSortHeader: (state, elements) => {
    const header = document.createElement('div');
    header.className = 'prd-stv-window-separator';
    
    const currentMode = window.tabSort ? window.tabSort.getCurrentMode(state) : 'position';
    
    header.innerHTML = `
      <span>Open Tabs</span>
      <div class="prd-stv-tab-sort-icons">
        <button class="prd-stv-sort-icon ${currentMode === 'position' ? 'active' : ''}" 
                data-mode="position" 
                title="Sort by tab position">
          <span class="material-icons-round">tab</span>
        </button>
        <button class="prd-stv-sort-icon ${currentMode === 'lastVisit' ? 'active' : ''}" 
                data-mode="lastVisit" 
                title="Sort by last visit">
          <span class="material-icons-round">hourglass_empty</span>
        </button>
        <button class="prd-stv-sort-icon ${currentMode === 'domain' ? 'active' : ''}" 
                data-mode="domain" 
                title="Sort by domain">
          <span class="material-icons-round">public</span>
        </button>
      </div>
    `;
    
    // Add event listeners to icon buttons
    const iconButtons = header.querySelectorAll('.prd-stv-sort-icon');
    iconButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const mode = button.dataset.mode;
        if (mode && window.tabSort) {
          window.tabSort.setMode(mode, state, window.storage, renderer, elements);
        }
      });
    });
    
    return header;
  },

  // Render inactive tabs section
  renderInactiveTabsSection: (state, elements) => {
    const inactiveTabList = state.filteredInactiveTabs.length || state.query ? state.filteredInactiveTabs : state.inactiveTabs;
    
    if (inactiveTabList && inactiveTabList.length) {
      // Create section header with Clear button
      const inactiveHeader = renderer.createSectionHeader(
        `Inactive tabs (${inactiveTabList.length})`,
        {
          text: 'Clear',
          title: 'Close all inactive tabs',
          clickHandler: () => window.closeAllInactiveTabs()
        }
      );
      elements.combined.appendChild(inactiveHeader);
      
      // Render inactive tabs (no window grouping needed)
      inactiveTabList.forEach(tab => {
        const tabElement = renderer.renderTabItem(tab, state, { isInactive: true });
        elements.combined.appendChild(tabElement);
      });
    }
  },

  renderNode: (node, depth, state) => {
    if (node.url) return renderer.renderBookmarkItem(node, state);
    
    // Render folder
    const wrapper = document.createElement('div');
    wrapper.className = 'bm-folder';
    wrapper.dataset.id = node.id;
    wrapper.dataset.itemType = 'folder';
    if (typeof node.parentId !== 'undefined') {
      wrapper.dataset.parentId = node.parentId;
    }

    const header = document.createElement('div');
    header.className = 'bm-folder-header';
    header.dataset.id = node.id;
    header.setAttribute('draggable', 'true');
    const openCount = window.getOpenBookmarkCountInFolder(node.id, state);
    const countDisplay = openCount > 0 ? ` <span style="color:#777;">(${openCount})</span>` : '';
    
    header.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <span class="bm-twisty">${window.folderState.isExpanded(node.id, state) ? '▾' : '▸'}</span>
        <span style="flex:1;">${window.utils.escapeHtml(node.title || 'Untitled folder')}${countDisplay}</span>
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
    childrenWrap.dataset.parentId = node.id;
    const shouldExpand = state.query ? true : window.folderState.isExpanded(node.id, state);
    if (shouldExpand && node.children && node.children.length) {
      node.children.forEach(child => childrenWrap.appendChild(renderer.renderNode(child, depth + 1, state)));
    }
    wrapper.appendChild(childrenWrap);
    return wrapper;
  },

  renderBookmarkItem: (node, state) => {
    const div = document.createElement('div');
    const relatedTabId = state.bookmarkTabRelationships[node.id];
    const hasOpenTab = !!relatedTabId;
    const relatedTab = hasOpenTab ? state.itemMaps.tabs.get(relatedTabId) : null;
    const isRelatedTabActive = !!(relatedTab && relatedTab.active);

    // Build class list: always base classes, add bookmark-highlighted if linked,
    // and add active-tab if the linked tab is currently active
    let className = 'prd-stv-cmd-item bm-bookmark';
    if (hasOpenTab) className += ' bookmark-highlighted';
    if (isRelatedTabActive) className += ' active-tab';
    div.className = className;
    div.dataset.id = node.id;
    div.dataset.itemType = 'bookmark';
    if (typeof node.parentId !== 'undefined') {
      div.dataset.parentId = node.parentId;
    }
    div.setAttribute('draggable', 'true');
    div.setAttribute('title', `${node.title || 'Untitled'}\n${node.url}`);
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

  renderTabItem: (tab, state, options = {}) => {
    const div = document.createElement('div');
    const isFromBookmark = Object.values(state.bookmarkTabRelationships).includes(tab.id);
    const isInactive = options.isInactive || false;
    let className = 'prd-stv-cmd-item';
    
    // Debug log to verify active state
    if (tab.active) {
      console.log('Rendering active tab:', tab.title, 'with active-tab class');
      className += ' active-tab';
    }
    if (isFromBookmark) className += ' tab-from-bookmark';
    if (isInactive) className += ' inactive-tab-item';
    
    div.className = className;
    div.dataset.id = String(tab.id);
    div.setAttribute('draggable', 'true');
    
    // Add time since last access for inactive tabs
    const titleText = isInactive ? 
      `${tab.title || 'Untitled'} (${window.tabUtils.formatTimeSinceAccess(tab)})\n${tab.url}` :
      `${tab.title || 'Untitled'}\n${tab.url}`;
    div.setAttribute('title', titleText);
    
    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.TAB, icon: tab.favIconUrl, url: tab.url });
    
    // Add time info for inactive tabs
    const timeInfo = isInactive ? 
      `<span style="font-size:11px;color:#666;margin-left:4px;">(${window.tabUtils.formatTimeSinceAccess(tab)})</span>` : 
      '';
    
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <span class="prd-stv-title">${window.utils.highlightMatches(tab.title || tab.url || '', state.query)}${timeInfo}</span>
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

      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'folder';
    });

    header.addEventListener('dragend', () => {
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
    });
  },

  addBookmarkDragHandlers: (div, node, state) => {
    div.addEventListener('dragstart', (e) => {
      const payload = { type: 'bookmark', id: node.id, parentId: node.parentId };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'bookmark';
    });

    div.addEventListener('dragend', () => {
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
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
    
    const openCount = window.getOpenBookmarkCountInFolder(folder.id, window.state);
    const closeTabsItem = openCount > 0 ? 
      '<div class="prd-stv-context-item" data-action="close-tabs"><span>Close tabs</span></div>' : '';
    
    contextMenu.innerHTML = `
      <div class="prd-stv-context-item" data-action="save-tab-here">
        <span>Save tab here</span>
      </div>
      ${closeTabsItem}
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
      if (action === 'save-tab-here') {
        window.saveActiveTabToFolder(folder.id);
      } else if (action === 'close-tabs') {
        window.closeTabsInFolder(folder.id);
      } else if (action === 'rename') {
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
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:15px;font-size:14px;outline:none;width:100%;';
    
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
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:15px;font-size:14px;outline:none;width:100%;';
    
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
    dialog.style.cssText = 'background:#2b2b2b;border-radius:15px;padding:20px;width:400px;max-width:90%;max-height:80%;color:#f5f5f5;';
    
    const isTab = bookmark._isTab;
    const isFolder = !bookmark.url && !bookmark._isTab; // Folder if no URL and not a tab
    const actionText = isTab ? 'Save' : 'Move';
    const itemType = isFolder ? 'folder' : (isTab ? 'bookmark' : 'bookmark');
    const titleText = isTab ? `Save "${bookmark.title}" as bookmark` : `Move "${bookmark.title}" to ${itemType === 'folder' ? 'parent folder' : 'folder'}`;
    
    dialog.innerHTML = `
      <h3 style="margin:0 0 16px 0;font-size:16px;">${titleText}</h3>
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

  // Search recent history (last 30 days) with distinct URLs
  searchRecentHistory: async (query) => {
    if (!query || !query.trim()) return [];
    
    try {
      // Calculate date 30 days ago
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      // Search history with query
      const historyItems = await chrome.history.search({
        text: query.toLowerCase(),
        startTime: thirtyDaysAgo,
        maxResults: 100
      });
      
      if (!historyItems || historyItems.length === 0) return [];
      
      // Filter and deduplicate by URL, keeping the most recent visit
      const urlMap = new Map();
      
      historyItems.forEach(item => {
        if (item.url && item.title) {
          const existing = urlMap.get(item.url);
          if (!existing || (item.lastVisitTime && item.lastVisitTime > existing.lastVisitTime)) {
            urlMap.set(item.url, {
              id: item.id,
              title: item.title || 'Untitled',
              url: item.url,
              lastVisitTime: item.lastVisitTime || 0,
              visitCount: item.visitCount || 0,
              source: 'history',
              type: 'history'
            });
          }
        }
      });
      
      // Convert to array and sort by last visit time (most recent first)
      const distinctResults = Array.from(urlMap.values())
        .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
        .slice(0, 20); // Limit to top 20 results
      
      return distinctResults;
    } catch (error) {
      console.error('Failed to search history:', error);
      return [];
    }
  },

  // Render a history item
  renderHistoryItem: (historyItem, state) => {
    const div = document.createElement('div');
    div.className = 'prd-stv-cmd-item history-item';
    div.dataset.id = historyItem.id || historyItem.url;
    div.dataset.itemType = 'history';
    div.setAttribute('title', `${historyItem.title || 'Untitled'}\n${historyItem.url}`);
    
    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.HISTORY, url: historyItem.url });
    const query = state.query;
    
    // Format last visit time
    const timeAgo = historyItem.lastVisitTime ? 
      window.utils.timeAgo(historyItem.lastVisitTime) : '';
    
    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <div style="flex:1;min-width:0;">
          <span class="prd-stv-title">${window.utils.highlightMatches(historyItem.title || historyItem.url, query)}</span>
          ${timeAgo ? `<div style="font-size:11px;color:#888;margin-top:1px;">${timeAgo}</div>` : ''}
        </div>
      </div>
      <div class="prd-stv-item-controls">
        <button class="prd-stv-menu-btn" title="More options" data-history-url="${historyItem.url}">⋯</button>
      </div>
    `;
    
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        renderer.showHistoryContextMenu(e, historyItem, div);
      } else {
        window.openUrl(historyItem.url, e);
      }
    });
    
    return div;
  },

  // Show context menu for history items
  showHistoryContextMenu: (event, historyItem, itemElement) => {
    // Remove any existing context menu
    renderer.closeContextMenu();
    
    // Create context menu for history
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
      if (action === 'open-new-tab') {
        chrome.tabs.create({ url: historyItem.url });
      } else if (action === 'remove-from-history') {
        chrome.history.deleteUrl({ url: historyItem.url });
        itemElement.remove();
        window.utils.showToast('Removed from history');
      }
      renderer.closeContextMenu();
    });
    
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', renderer.closeContextMenu, { once: true });
    }, 10);
  },



};

// Export for use in other modules
window.renderer = renderer;
