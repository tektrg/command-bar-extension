// Core rendering module for DOM generation and updates

// Render lock to prevent race conditions from concurrent render calls
let isRendering = false;
let pendingRender = null;

const rendererRendering = {
  // Main render function
  render: async (state, elements) => {
    // If already rendering, queue this render request and exit
    if (isRendering) {
      pendingRender = { state, elements };
      return;
    }

    isRendering = true;

    try {
      // Preserve scroll position before re-rendering (elements.combined is the scrollable container)
      const scrollTop = elements.combined ? elements.combined.scrollTop : 0;

      await rendererRendering.renderCombined(state, elements);
      if (window.dragDrop && typeof window.dragDrop.refreshSortables === 'function') {
        window.dragDrop.refreshSortables(state, elements);
      }

      // Restore scroll position after re-rendering
      if (elements.combined && scrollTop > 0) {
        elements.combined.scrollTop = scrollTop;
      }
    } finally {
      isRendering = false;

      // If there's a pending render, execute it now
      if (pendingRender) {
        const pending = pendingRender;
        pendingRender = null;
        await rendererRendering.render(pending.state, pending.elements);
      }
    }
  },

  // Animate element removal with fade-out (performance optimized)
  animateRemoval: (element) => {
    if (!element || !element.parentNode) return;

    // Add class on next frame to ensure CSS transition triggers
    requestAnimationFrame(() => {
      element.classList.add('removing');
    });

    // Listen for actual transition completion
    const handleTransitionEnd = (e) => {
      if (e.propertyName !== 'opacity') return; // Only trigger once
      element.removeEventListener('transitionend', handleTransitionEnd);
      if (element.parentNode) {
        element.remove();
      }
    };

    element.addEventListener('transitionend', handleTransitionEnd, { once: true });

    // Fallback timeout only if transition fails
    setTimeout(() => {
      element.removeEventListener('transitionend', handleTransitionEnd);
      if (element.parentNode) {
        element.remove();
      }
    }, 300);
  },

  // Selective DOM update functions
  updateBookmarkItemInDOM: (bookmarkId, bookmark, state, elements) => {
    const existingElement = elements.combined.querySelector(`[data-id="${bookmarkId}"]`);
    if (existingElement && bookmark) {
      // Update existing element in place
      const newElement = rendererRendering.renderBookmarkItem(bookmark, state);
      existingElement.replaceWith(newElement);
    } else if (!bookmark && existingElement) {
      // Remove deleted item with animation
      rendererRendering.animateRemoval(existingElement);
    } else if (bookmark && !existingElement) {
      // Add new item (need to find correct insertion point)
      rendererRendering.insertBookmarkAtCorrectPosition(bookmark, state, elements);
    }
  },

  updateTabItemInDOM: (tabId, tab, state, elements) => {
    const existingElement = elements.combined.querySelector(`[data-id="${tabId}"]`);
    if (existingElement && tab) {
      const newElement = rendererRendering.renderTabItem(tab, state);
      existingElement.replaceWith(newElement);
    } else if (!tab && existingElement) {
      rendererRendering.animateRemoval(existingElement);
    } else if (tab && !existingElement) {
      rendererRendering.insertTabAtCorrectPosition(tab, state, elements);
    }
  },

  insertBookmarkAtCorrectPosition: async (bookmark, state, elements) => {
    try {
      // Find parent folder in DOM
      const parentContainer = rendererRendering.findParentContainer(bookmark.parentId, elements);
      if (!parentContainer) return;

      // Get siblings from Chrome API to determine position
      const siblings = await chrome.bookmarks.getChildren(bookmark.parentId);
      const index = siblings.findIndex(s => s.id === bookmark.id);
      const referenceElement = parentContainer.children[index];
      const newElement = rendererRendering.renderBookmarkItem(bookmark, state);

      if (referenceElement) {
        referenceElement.before(newElement);
      } else {
        parentContainer.appendChild(newElement);
      }
    } catch {
      // Fallback to full render if positioning fails
      rendererRendering.render(state, elements);
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
    const newElement = rendererRendering.renderTabItem(tab, state);
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

  // Dated Items Rendering
  renderDatedItemsSection: async (state, elements) => {
    if (!window.datedLinksModule) return;

    try {
      const datedItems = await window.datedLinksModule.getSortedByDate();

      if (!datedItems || datedItems.length === 0) return;

      // Filter by search query if present
      let filteredItems = datedItems;
      if (state.query && state.query.trim()) {
        const query = state.query.toLowerCase();
        filteredItems = datedItems.filter(item => {
          const hay = ((item.title || '') + ' ' + (item.url || '')).toLowerCase();
          return hay.includes(query);
        });
      }

      if (filteredItems.length === 0) return;

      // Create header
      const header = document.createElement('div');
      header.className = 'prd-stv-window-separator';
      header.innerHTML = `
        <span class="material-icons-round" style="font-size: 12px; margin-right: 6px;">event</span>
        <span>Dated Items</span>
      `;
      elements.combined.appendChild(header);

      // Render each dated item
      filteredItems.forEach(item => {
        const element = rendererRendering.renderDatedItem(item, state);
        elements.combined.appendChild(element);
      });
    } catch (error) {
      console.error('[Renderer] Failed to render dated items:', error);
    }
  },

  renderDatedItem: (item, state) => {
    const isOverdue = window.datedLinksModule.isOverdue(item.date);
    const isFolder = item.itemType === 'folder' || item.url.startsWith('folder://bookmark/');

    // Check if this dated item has an associated open tab
    const relatedTabId = item.itemId ? state.bookmarkTabRelationships[item.itemId] : null;
    const hasOpenTab = !!relatedTabId;
    const relatedTab = hasOpenTab ? state.itemMaps.tabs.get(relatedTabId) : null;
    const isRelatedTabActive = !!(relatedTab && relatedTab.active);

    // Build class name
    const classNames = ['prd-stv-cmd-item', 'dated-item'];
    if (isOverdue) classNames.push('dated-item-overdue');
    if (hasOpenTab) classNames.push('bookmark-highlighted');
    if (isRelatedTabActive) classNames.push('active-tab');

    const formattedDate = window.datedLinksModule.formatDate(item.date);
    const dateClass = isOverdue ? 'dated-item-date overdue' : 'dated-item-date';

    // Button icon and title based on whether tab is open
    const buttonIcon = hasOpenTab ? 'remove' : 'check';
    const buttonTitle = hasOpenTab ? 'Close tab' : 'Remove date';
    const actionClass = hasOpenTab ? 'close-tab-btn' : 'remove-date-btn';

    // Create icon element
    const iconEl = isFolder
      ? h('span', {
          class: 'material-icons-round prd-stv-folder-icon',
          style: { fontSize: '18px', marginRight: '8px', color: '#b9a079' }
        }, 'folder')
      : h('img', {
          class: 'prd-stv-favicon',
          src: window.utils.getFavicon({ type: window.CONSTANTS.ITEM_TYPES.BOOKMARK, url: item.url }),
          onerror: (e) => { e.target.src = window.CONSTANTS.ICONS.FALLBACK; }
        });

    // Create title element (using innerHTML for highlightMatches which returns HTML string)
    const titleEl = h('span', { class: 'prd-stv-title' });
    titleEl.innerHTML = window.utils.highlightMatches(item.title || item.url, state.query || '');

    // Build the element using h()
    const div = h('div', {
      class: classNames.join(' '),
      'data-id': item.id,
      'data-url': item.url,
      'data-itemType': 'dated',
      draggable: 'true',
      title: `${item.title}\n${isFolder ? 'Folder' : item.url}\nDate: ${item.date}`
    }, [
      h('div', { style: { display: 'flex', flex: '1', alignItems: 'center', minWidth: '0' } }, [
        iconEl,
        titleEl,
        h('span', {
          class: dateClass,
          'data-action': 'update-date',
          title: 'Click to update date',
          style: { cursor: 'pointer' }
        }, formattedDate)
      ]),
      h('div', { class: 'prd-stv-item-controls' }, [
        h('button', { class: 'prd-stv-menu-btn', title: 'More options' }, '\u2026'),
        h('button', { class: `prd-stv-close-btn ${actionClass}`, title: buttonTitle }, [
          h('span', { class: 'material-icons-round' }, buttonIcon)
        ])
      ])
    ]);

    // Event handler
    div.addEventListener('click', async (e) => {
      if (e.target.classList.contains('prd-stv-close-btn') || e.target.closest('.prd-stv-close-btn')) {
        e.stopPropagation();
        if (hasOpenTab) {
          window.closeTabFromBookmark(item.itemId);
        } else {
          await window.datedLinksModule.removeDate(item.url);
          window.utils.showToast('Date removed');
          await window.renderer.render(window.state, window.elements);
        }
      } else if (e.target.dataset.action === 'update-date' || e.target.closest('[data-action="update-date"]')) {
        e.stopPropagation();
        const itemData = {
          url: item.url,
          title: item.title,
          favicon: item.favicon,
          itemType: item.itemType,
          itemId: item.itemId
        };
        window.dateModal.show(itemData);
      } else if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        if (isFolder) {
          const fakeFolder = { id: item.itemId, title: item.title, _isDated: true };
          window.rendererUIActions.showFolderContextMenu(e, fakeFolder);
        } else {
          const fakeBookmark = { id: item.itemId, title: item.title, url: item.url, _isDated: true };
          window.rendererUIActions.showContextMenu(e, fakeBookmark, div);
        }
      } else {
        if (isFolder) {
          const folderId = item.itemId;
          if (folderId) {
            // Expand the folder and scroll to it
            await window.folderState.ensureExpanded(folderId, state, window.storage);
            await window.renderer.render(state, window.elements);
            // Find the folder element and scroll to it within the list container
            const folderEl = document.querySelector(`.bm-folder[data-id="${folderId}"]`);
            const listContainer = document.querySelector('.prd-stv-list');
            if (folderEl && listContainer) {
              // Calculate scroll position within the container
              const containerRect = listContainer.getBoundingClientRect();
              const folderRect = folderEl.getBoundingClientRect();
              const scrollOffset = folderRect.top - containerRect.top + listContainer.scrollTop;
              // Scroll to position with some padding from the top
              const paddingTop = 16;
              listContainer.scrollTo({
                top: Math.max(0, scrollOffset - paddingTop),
                behavior: 'smooth'
              });
              // Brief highlight effect
              folderEl.classList.add('scroll-highlight');
              setTimeout(() => folderEl.classList.remove('scroll-highlight'), 1500);
            }
          }
        } else {
          window.openUrl(item.url, e, item.itemId);
        }
      }
    });

    // Add drag and drop handlers
    rendererRendering.addDatedItemDragHandlers(div, item, state);

    return div;
  },

  renderCombined: async (state, elements) => {
    elements.combined.innerHTML = '';

    // Render dated items first (at the top)
    await rendererRendering.renderDatedItemsSection(state, elements);

    // Render bookmarks
    let roots;
    if (state.filteredTree.length || state.query) {
      roots = state.filteredTree;
    } else {
      if (window.bookmarkView) {
        roots = window.bookmarkView.filterBookmarks(state.bookmarksRoots, state);
      } else {
        roots = state.bookmarksRoots;
      }
    }

    // Check if we should show bookmarks header
    const shouldShowBookmarkHeader = !state.query || !state.query.trim();
    const isActiveBookmarkMode = window.bookmarkView && window.bookmarkView.getCurrentMode(state) === 'active';
    const hasBookmarksToShow = roots && roots.length > 0;

    if (shouldShowBookmarkHeader && (hasBookmarksToShow || isActiveBookmarkMode)) {
      const bookmarkHeader = rendererRendering.createBookmarkViewHeader(state, elements);
      elements.combined.appendChild(bookmarkHeader);
    }

    if (hasBookmarksToShow) {
      roots.forEach(root => elements.combined.appendChild(rendererRendering.renderNode(root, 0, state)));
    } else if (isActiveBookmarkMode && shouldShowBookmarkHeader) {
      const emptyState = document.createElement('div');
      emptyState.className = 'prd-stv-empty';
      emptyState.textContent = 'No active bookmarks';
      emptyState.style.cssText = 'padding: 16px; text-align: center; color: #999; font-style: italic;';
      elements.combined.appendChild(emptyState);
    }

    // Render active tabs
    const tabList = state.filteredTabs.length || state.query ? state.filteredTabs : state.tabs;
    if (tabList && tabList.length) {
      const sortMode = window.tabSort ? window.tabSort.getCurrentMode(state) : 'position';
      const sortedTabs = window.tabSort ? window.tabSort.sortTabs(tabList, sortMode) : tabList;

      const tabHeader = rendererRendering.createTabSortHeader(state, elements);
      elements.combined.appendChild(tabHeader);

      const useWindowGrouping = window.tabSort ? window.tabSort.usesWindowGrouping(sortMode) : true;
      const useDomainGrouping = window.tabSort ? window.tabSort.usesDomainGrouping(sortMode) : false;

      if (useWindowGrouping) {
        let currentWindowId = null;
        sortedTabs.forEach(tab => {
          if (tab.windowId !== currentWindowId) {
            const separator = document.createElement('div');
            separator.className = 'prd-stv-window-separator';
            separator.innerHTML = `<span>Window ${tab.windowId}</span>`;
            separator.style.fontSize = '10px';
            separator.style.color = '#777';
            elements.combined.appendChild(separator);
            currentWindowId = tab.windowId;
          }

          elements.combined.appendChild(rendererRendering.renderTabItem(tab, state));
        });
      } else if (useDomainGrouping) {
        const domainGroups = window.tabSort.groupTabsByDomain(sortedTabs);

        domainGroups.forEach((tabs, domain) => {
          const separator = document.createElement('div');
          separator.className = 'prd-stv-window-separator';
          separator.innerHTML = `<span class="material-icons-round" style="font-size: 12px; margin-right: 6px;">public</span><span>${domain}</span>`;
          separator.style.fontSize = '10px';
          separator.style.color = '#777';
          elements.combined.appendChild(separator);

          tabs.forEach(tab => {
            elements.combined.appendChild(rendererRendering.renderTabItem(tab, state));
          });
        });
      } else {
        sortedTabs.forEach(tab => {
          elements.combined.appendChild(rendererRendering.renderTabItem(tab, state));
        });
      }
    }

    // Render inactive tabs section
    rendererRendering.renderInactiveTabsSection(state, elements);

    const inactiveList = (state.filteredInactiveTabs.length || state.query) ? state.filteredInactiveTabs : state.inactiveTabs;
    const hasResults = (roots && roots.length) || (tabList && tabList.length) || (inactiveList && inactiveList.length);

    if (!hasResults) {
      if (state.query && state.query.trim()) {
        try {
          const historyResults = await window.rendererHistory.searchRecentHistory(state.query);
          if (historyResults && historyResults.length) {
            const historyHeader = document.createElement('div');
            historyHeader.className = 'prd-stv-window-separator';
            historyHeader.innerHTML = `<span class="material-icons-round" style="font-size: 12px; margin-right: 6px;">history</span><span>Recent History</span>`;
            historyHeader.style.fontSize = '10px';
            historyHeader.style.color = '#777';
            elements.combined.appendChild(historyHeader);

            historyResults.forEach(historyItem => {
              elements.combined.appendChild(window.rendererHistory.renderHistoryItem(historyItem, state));
            });
          } else {
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

      const button = header.querySelector('.prd-stv-section-btn');
      if (button && buttonConfig.clickHandler) {
        button.addEventListener('click', buttonConfig.clickHandler);
      }
    } else {
      header.innerHTML = `<span>${title}</span>`;
    }

    return header;
  },

  // Create bookmarks section header with icon buttons for view modes
  createBookmarkViewHeader: (state, elements) => {
    const header = document.createElement('div');
    header.className = 'prd-stv-window-separator';

    const currentMode = window.bookmarkView ? window.bookmarkView.getCurrentMode(state) : 'folder';

    header.innerHTML = `
      <span>Bookmarks</span>
      <div class="prd-stv-tab-sort-icons">
        <button class="prd-stv-sort-icon ${currentMode === 'folder' ? 'active' : ''}"
                data-mode="folder"
                title="Show folder tree">
          <span class="material-icons-round">folder</span>
        </button>
        <button class="prd-stv-sort-icon ${currentMode === 'active' ? 'active' : ''}"
                data-mode="active"
                title="Show only open bookmarks">
          <span class="material-icons-round">star</span>
        </button>
        <button class="prd-stv-sort-icon ${currentMode === 'domain' ? 'active' : ''}"
                data-mode="domain"
                title="Group by domain">
          <span class="material-icons-round">public</span>
        </button>
      </div>
    `;

    const iconButtons = header.querySelectorAll('.prd-stv-sort-icon');
    iconButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const mode = button.dataset.mode;
        if (mode && window.bookmarkView) {
          window.bookmarkView.setMode(mode, state, window.storage, window.renderer, elements);
        }
      });
    });

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

    const iconButtons = header.querySelectorAll('.prd-stv-sort-icon');
    iconButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const mode = button.dataset.mode;
        if (mode && window.tabSort) {
          window.tabSort.setMode(mode, state, window.storage, window.renderer, elements);
        }
      });
    });

    return header;
  },

  // Render inactive tabs section
  renderInactiveTabsSection: (state, elements) => {
    const inactiveTabList = state.filteredInactiveTabs.length || state.query ? state.filteredInactiveTabs : state.inactiveTabs;

    if (inactiveTabList && inactiveTabList.length) {
      const inactiveHeader = rendererRendering.createSectionHeader(
        `Inactive tabs (${inactiveTabList.length})`,
        {
          text: 'Clear',
          title: 'Close all inactive tabs',
          clickHandler: () => window.closeAllInactiveTabs()
        }
      );
      elements.combined.appendChild(inactiveHeader);

      inactiveTabList.forEach(tab => {
        const tabElement = rendererRendering.renderTabItem(tab, state, { isInactive: true });
        elements.combined.appendChild(tabElement);
      });
    }
  },

  renderNode: (node, depth, state) => {
    if (node.url) return rendererRendering.renderBookmarkItem(node, state);

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
        <span class="material-icons-round bm-twisty" style="font-size: 16px; margin-right: 4px;">${window.folderState.isExpanded(node.id, state) ? 'folder_open' : 'folder'}</span>
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
        window.rendererUIActions.showFolderContextMenu(e, node);
      } else {
        window.folderState.toggle(node.id, state, window.storage, window.renderer);
      }
    });

    // Add drag and drop handlers
    rendererRendering.addFolderDragHandlers(header, node, state);

    wrapper.appendChild(header);

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'bm-children';
    childrenWrap.dataset.parentId = node.id;
    const shouldExpand = state.query ? true : window.folderState.isExpanded(node.id, state);
    if (shouldExpand && node.children && node.children.length) {
      node.children.forEach(child => childrenWrap.appendChild(rendererRendering.renderNode(child, depth + 1, state)));
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
    const buttonText = hasOpenTab ? 'remove' : 'check';
    const buttonTitle = hasOpenTab ? 'Close tab' : 'Delete bookmark';
    const actionClass = hasOpenTab ? 'close-tab-btn' : 'delete-bookmark-btn';

    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <span class="prd-stv-title">${window.utils.highlightMatches(node.title || node.url, query)}</span>
      </div>
      <div class="prd-stv-item-controls">
        <button class="prd-stv-menu-btn" title="More options" data-bookmark-id="${node.id}">⋯</button>
        <button class="prd-stv-close-btn ${actionClass}" title="${buttonTitle}">
          <span class="material-icons-round">${buttonText}</span>
        </button>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-close-btn') || e.target.closest('.prd-stv-close-btn')) {
        e.stopPropagation();
        if (hasOpenTab) {
          window.closeTabFromBookmark(node.id);
        } else {
          window.deleteBookmark(node.id);
        }
      } else if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        window.rendererUIActions.showContextMenu(e, node, div);
      } else {
        window.openUrl(node.url, e, node.id);
      }
    });

    // Add drag handlers
    rendererRendering.addBookmarkDragHandlers(div, node, state);
    return div;
  },

  renderTabItem: (tab, state, options = {}) => {
    const div = document.createElement('div');
    const isFromBookmark = Object.values(state.bookmarkTabRelationships).includes(tab.id);
    const isInactive = options.isInactive || false;
    let className = 'prd-stv-cmd-item';

    if (tab.active) {
      console.log('Rendering active tab:', tab.title, 'with active-tab class');
      className += ' active-tab';
    }
    if (isFromBookmark) className += ' tab-from-bookmark';
    if (isInactive) className += ' inactive-tab-item';

    div.className = className;
    div.dataset.id = String(tab.id);
    div.setAttribute('draggable', 'true');

    const titleText = isInactive ?
      `${tab.title || 'Untitled'} (${window.tabUtils.formatTimeSinceAccess(tab)})\n${tab.url}` :
      `${tab.title || 'Untitled'}\n${tab.url}`;
    div.setAttribute('title', titleText);

    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.TAB, icon: tab.favIconUrl, url: tab.url });

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
        <button class="prd-stv-close-btn" title="Close tab">
          <span class="material-icons-round">check</span>
        </button>
      </div>
    `;

    if (isFromBookmark) {
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn') || e.target.closest('.prd-stv-close-btn')) {
          e.stopPropagation();
          window.closeTab(tab.id);
        } else if (e.target.classList.contains('prd-stv-menu-btn')) {
          e.stopPropagation();
          window.rendererUIActions.showTabContextMenu(e, tab, div);
        }
      });
    } else {
      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('prd-stv-close-btn') || e.target.closest('.prd-stv-close-btn')) {
          e.stopPropagation();
          window.closeTab(tab.id);
        } else if (e.target.classList.contains('prd-stv-menu-btn')) {
          e.stopPropagation();
          window.rendererUIActions.showTabContextMenu(e, tab, div);
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

  addDatedItemDragHandlers: (div, item, state) => {
    div.addEventListener('dragstart', (e) => {
      const payload = {
        type: 'dated',
        id: item.id,
        url: item.url,
        title: item.title,
        itemType: item.itemType,
        itemId: item.itemId,
        date: item.date
      };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
      state.dragState.isDragging = true;
      state.dragState.draggedItem = payload;
      state.dragState.draggedType = 'dated';
    });

    div.addEventListener('dragend', () => {
      state.dragState.isDragging = false;
      state.dragState.draggedItem = null;
      state.dragState.draggedType = null;
    });
  }
};

// Export for use in other modules
window.rendererRendering = rendererRendering;
