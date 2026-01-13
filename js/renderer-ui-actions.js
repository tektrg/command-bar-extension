// UI Actions module for context menus, modals, and rename operations

const rendererUIActions = {
  // Quick date calculation helpers
  getQuickDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Next week (same weekday)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Someday (random date within next 30 days)
    const someday = new Date(today);
    const randomDays = Math.floor(Math.random() * 30) + 1;
    someday.setDate(someday.getDate() + randomDays);

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      tomorrow: formatDate(tomorrow),
      nextWeek: formatDate(nextWeek),
      someday: formatDate(someday)
    };
  },

  // Create date icon row for context menus (4 icons: tomorrow, next week, someday, custom)
  createDateIconRow(hasDate, handleDateAction) {
    // SVG icons for date options
    const icons = {
      // Tomorrow: sun rising icon
      tomorrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v2M12 18v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M18 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        <circle cx="12" cy="12" r="4"/>
      </svg>`,
      // Next week: calendar with arrow
      nextWeek: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M12 14l3 3-3 3"/>
      </svg>`,
      // Someday: question mark calendar
      someday: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M12 14c.5-1 1.5-1.5 2-1.5.8 0 1.5.7 1.5 1.5 0 1.5-2 2-2 3"/>
        <circle cx="12" cy="19" r="0.5" fill="currentColor"/>
      </svg>`,
      // Custom: calendar with pencil
      custom: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M15 14l2 2-4 4h-2v-2l4-4z"/>
      </svg>`,
      // Remove: X icon
      remove: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`
    };

    const createIconButton = (action, icon, title) => {
      const btn = h('button', {
        class: 'prd-stv-date-icon-btn',
        'data-action': action,
        title: title
      });
      btn.innerHTML = icon;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleDateAction(action);
        rendererUIActions.closeContextMenu();
      });
      return btn;
    };

    if (hasDate) {
      // Show remove button when date exists
      return h('div', { class: 'prd-stv-date-icon-row' }, [
        createIconButton('remove-date', icons.remove, 'Remove date')
      ]);
    }

    // Show 4 date option buttons
    return h('div', { class: 'prd-stv-date-icon-row' }, [
      createIconButton('add-date-tomorrow', icons.tomorrow, 'Tomorrow'),
      createIconButton('add-date-next-week', icons.nextWeek, 'Next week'),
      createIconButton('add-date-someday', icons.someday, 'Someday'),
      createIconButton('add-date-custom', icons.custom, 'Custom date')
    ]);
  },
  // Context menu management
  showContextMenu: async (event, bookmark, itemElement) => {
    rendererUIActions.closeContextMenu();

    // Check if bookmark has a date
    let hasDate = false;
    try {
      if (window.datedLinksModule) {
        hasDate = await window.datedLinksModule.hasDate(bookmark.url);
      }
    } catch (error) {
      console.warn('Failed to check dated status:', error);
    }

    const buttonRect = event.target.getBoundingClientRect();

    const handleDateAction = async (action) => {
      const itemData = {
        url: bookmark.url,
        title: bookmark.title || 'Untitled',
        favicon: bookmark.favicon || '',
        itemType: 'bookmark',
        itemId: bookmark.id
      };

      if (action === 'add-date-tomorrow') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.tomorrow);
        window.utils.showToast('Date set to tomorrow');
      } else if (action === 'add-date-next-week') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.nextWeek);
        window.utils.showToast('Date set to next week');
      } else if (action === 'add-date-someday') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.someday);
        window.utils.showToast('Date set to someday');
      } else if (action === 'add-date-custom') {
        window.dateModal.show(itemData);
        return; // Don't close menu yet, modal will handle it
      } else if (action === 'remove-date') {
        await window.datedLinksModule.removeDate(bookmark.url);
        window.utils.showToast('Date removed');
      }

      if (window.state && window.elements) {
        await window.renderer.render(window.state, window.elements);
      }
    };

    // Create date icon row
    const dateIconRow = rendererUIActions.createDateIconRow(hasDate, handleDateAction);

    const contextMenu = h('div', {
      class: 'prd-stv-context-menu',
      style: {
        position: 'fixed',
        left: `${buttonRect.left - 120}px`,
        top: `${buttonRect.bottom + 4}px`,
        zIndex: '10000'
      }
    }, [
      dateIconRow,
      h('div', { class: 'prd-stv-context-item', 'data-action': 'rename' },
        h('span', {}, 'Rename')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'move' },
        h('span', {}, 'Move to...'))
    ]);

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', async (e) => {
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
    const existingMenus = document.querySelectorAll('.prd-stv-context-menu');
    existingMenus.forEach(menu => menu.remove());
  },

  showFolderContextMenu: async (event, folder) => {
    rendererUIActions.closeContextMenu();

    // Check if folder has a date (use synthetic URL for folders)
    let hasDate = false;
    const folderUrl = `folder://bookmark/${folder.id}`;
    try {
      if (window.datedLinksModule) {
        hasDate = await window.datedLinksModule.hasDate(folderUrl);
      }
    } catch (error) {
      console.warn('Failed to check dated status:', error);
    }

    const buttonRect = event.target.getBoundingClientRect();

    const handleDateAction = async (action) => {
      const itemData = {
        url: folderUrl,
        title: folder.title || 'Untitled Folder',
        favicon: '',
        itemType: 'folder',
        itemId: folder.id
      };

      if (action === 'add-date-tomorrow') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.tomorrow);
        window.utils.showToast('Date set to tomorrow');
      } else if (action === 'add-date-next-week') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.nextWeek);
        window.utils.showToast('Date set to next week');
      } else if (action === 'add-date-someday') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.someday);
        window.utils.showToast('Date set to someday');
      } else if (action === 'add-date-custom') {
        window.dateModal.show(itemData);
        return; // Don't close menu yet, modal will handle it
      } else if (action === 'remove-date') {
        await window.datedLinksModule.removeDate(folderUrl);
        window.utils.showToast('Date removed');
      }

      if (window.state && window.elements) {
        await window.renderer.render(window.state, window.elements);
      }
    };

    // Create date icon row
    const dateIconRow = rendererUIActions.createDateIconRow(hasDate, handleDateAction);

    const openCount = window.getOpenBookmarkCountInFolder(folder.id, window.state);
    const closeTabsEl = openCount > 0 ?
      h('div', { class: 'prd-stv-context-item', 'data-action': 'close-tabs' },
        h('span', {}, 'Close tabs')) : null;

    const contextMenu = h('div', {
      class: 'prd-stv-context-menu',
      style: {
        position: 'fixed',
        left: `${buttonRect.left - 120}px`,
        top: `${buttonRect.bottom + 4}px`,
        zIndex: '10000'
      }
    }, [
      dateIconRow,
      h('div', { class: 'prd-stv-context-item', 'data-action': 'save-tab-here' },
        h('span', {}, 'Save tab here')),
      closeTabsEl,
      h('div', { class: 'prd-stv-context-item', 'data-action': 'new-folder' },
        h('span', {}, 'New folder...')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'rename' },
        h('span', {}, 'Rename')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'move' },
        h('span', {}, 'Move to...')),
      h('div', {
        class: 'prd-stv-context-item',
        'data-action': 'delete-folder',
        style: { color: '#ff6b6b' }
      }, h('span', {}, 'Delete folder'))
    ]);

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', async (e) => {
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

  showTabContextMenu: async (event, tab, itemElement) => {
    rendererUIActions.closeContextMenu();

    // Check if tab is already pinned using the pinned tabs module
    let isPinned = false;
    try {
      if (window.pinnedTabsModule && window.pinnedTabsModule.isUrlPinned) {
        isPinned = await window.pinnedTabsModule.isUrlPinned(tab.url);
      }
    } catch (error) {
      console.warn('Failed to check pinned status:', error);
    }

    // Check if tab has a date
    let hasDate = false;
    try {
      if (window.datedLinksModule) {
        hasDate = await window.datedLinksModule.hasDate(tab.url);
      }
    } catch (error) {
      console.warn('Failed to check dated status:', error);
    }

    const buttonRect = event.target.getBoundingClientRect();

    const handleDateAction = async (action) => {
      const itemData = {
        url: tab.url,
        title: tab.title || 'Untitled',
        favicon: tab.favIconUrl || '',
        itemType: 'tab',
        itemId: tab.id
      };

      if (action === 'add-date-tomorrow') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.tomorrow);
        window.utils.showToast('Date set to tomorrow');
      } else if (action === 'add-date-next-week') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.nextWeek);
        window.utils.showToast('Date set to next week');
      } else if (action === 'add-date-someday') {
        const dates = rendererUIActions.getQuickDates();
        await window.datedLinksModule.addDate(itemData, dates.someday);
        window.utils.showToast('Date set to someday');
      } else if (action === 'add-date-custom') {
        window.dateModal.show(itemData);
        return; // Don't close menu yet, modal will handle it
      } else if (action === 'remove-date') {
        await window.datedLinksModule.removeDate(tab.url);
        window.utils.showToast('Date removed');
      }

      if (window.state && window.elements) {
        await window.renderer.render(window.state, window.elements);
      }
    };

    // Create date icon row
    const dateIconRow = rendererUIActions.createDateIconRow(hasDate, handleDateAction);

    const contextMenu = h('div', {
      class: 'prd-stv-context-menu',
      style: {
        position: 'fixed',
        left: `${buttonRect.left - 120}px`,
        top: `${buttonRect.bottom + 4}px`,
        zIndex: '10000'
      }
    }, [
      dateIconRow,
      h('div', { class: 'prd-stv-context-item', 'data-action': 'rename' },
        h('span', {}, 'Rename')),
      h('div', {
        class: 'prd-stv-context-item',
        'data-action': isPinned ? 'unpin' : 'pin'
      }, h('span', {}, isPinned ? 'Unpin Tab' : 'Pin Tab')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'move-to-folder' },
        h('span', {}, 'Move to...')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'duplicate' },
        h('span', {}, 'Duplicate Tab'))
    ]);

    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', async (e) => {
      const action = e.target.closest('.prd-stv-context-item')?.dataset.action;

      if (action === 'rename') {
        rendererUIActions.startTabRename(tab, itemElement);
      } else if (action === 'pin') {
        try {
          const tabData = {
            url: tab.url,
            title: tab.title || 'Untitled',
            favicon: tab.favIconUrl || ''
          };
          const response = await chrome.runtime.sendMessage({
            type: 'ADD_PINNED_TAB',
            tabData
          });
          if (response && response.success) {
            window.utils.showToast('Tab pinned');
            // Trigger a render update to show pinned status
            if (window.state && window.elements) {
              await window.renderer.render(window.state, window.elements);
            }
          } else {
            throw new Error(response?.error || 'Failed to pin tab');
          }
        } catch (error) {
          console.error('Failed to pin tab:', error);
          window.utils.showToast(error.message || 'Failed to pin tab');
        }
      } else if (action === 'unpin') {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'REMOVE_PINNED_TAB',
            url: tab.url
          });
          if (response && response.success) {
            window.utils.showToast('Tab unpinned');
            // Trigger a render update to show unpinned status
            if (window.state && window.elements) {
              await window.renderer.render(window.state, window.elements);
            }
          } else {
            throw new Error(response?.error || 'Failed to unpin tab');
          }
        } catch (error) {
          console.error('Failed to unpin tab:', error);
          window.utils.showToast(error.message || 'Failed to unpin tab');
        }
      } else if (action === 'move-to-folder') {
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

    const buttonRect = event.target.getBoundingClientRect();
    const contextMenu = h('div', {
      class: 'prd-stv-context-menu',
      style: {
        position: 'fixed',
        left: `${buttonRect.left - 120}px`,
        top: `${buttonRect.bottom + 4}px`,
        zIndex: '10000'
      }
    }, [
      h('div', { class: 'prd-stv-context-item', 'data-action': 'open-new-tab' },
        h('span', {}, 'Open in New Tab')),
      h('div', { class: 'prd-stv-context-item', 'data-action': 'remove-from-history' },
        h('span', {}, 'Remove from History'))
    ]);

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
  startRename: async (bookmark, itemElement) => {
    const titleElement = itemElement.querySelector('.prd-stv-title');

    // Get custom title or fall back to bookmark title
    const customTitle = await window.renameHelper.getCustomTitle(bookmark.url);
    const currentTitle = customTitle || bookmark.title;

    const input = window.renameHelper.createRenameInput(currentTitle);
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

          // Save custom title to storage (works for both dated and non-dated items)
          if (bookmark.url) {
            await window.renameHelper.saveCustomTitle(bookmark.url, newTitle);
          }

          // If this is a dated item, update the title in datedLinks storage
          if (bookmark._isDated && bookmark.url && window.datedLinksModule) {
            const datedItem = await window.datedLinksModule.getByUrl(bookmark.url);
            if (datedItem) {
              datedItem.title = newTitle;
              const allDatedLinks = await window.datedLinksModule.load();
              const updatedLinks = allDatedLinks.map(item =>
                window.datedLinksModule.normalizeUrl(item.url) === window.datedLinksModule.normalizeUrl(bookmark.url)
                  ? { ...item, title: newTitle }
                  : item
              );
              await window.datedLinksModule.save(updatedLinks);
            }
          }

          window.utils.showToast('Bookmark renamed');
        } catch (error) {
          console.error('Failed to rename bookmark:', error);
          window.utils.showToast('Failed to rename bookmark');
        }
      }

      titleElement.innerHTML = window.utils.highlightMatches(bookmark.title || bookmark.url, window.state?.query || '');
    };

    window.renameHelper.setupKeyboardHandlers(input, finishRename);
  },

  startFolderRename: async (folder) => {
    const folderHeader = document.querySelector(`.bm-folder-header[data-id="${folder.id}"]`);
    if (!folderHeader) return;

    const titleElement = folderHeader.querySelector('span:last-child');

    // Get custom title or fall back to folder title (use synthetic URL for folders)
    const folderUrl = `folder://bookmark/${folder.id}`;
    const customTitle = await window.renameHelper.getCustomTitle(folderUrl);
    const currentTitle = customTitle || folder.title;

    const input = window.renameHelper.createRenameInput(currentTitle);
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

          // Save custom title to storage (works for both dated and non-dated folders)
          await window.renameHelper.saveCustomTitle(folderUrl, newTitle);

          // If this is a dated folder, update the title in datedLinks storage
          if (folder._isDated && window.datedLinksModule) {
            const datedItem = await window.datedLinksModule.getByUrl(folderUrl);
            if (datedItem) {
              datedItem.title = newTitle;
              const allDatedLinks = await window.datedLinksModule.load();
              const updatedLinks = allDatedLinks.map(item =>
                window.datedLinksModule.normalizeUrl(item.url) === window.datedLinksModule.normalizeUrl(folderUrl)
                  ? { ...item, title: newTitle }
                  : item
              );
              await window.datedLinksModule.save(updatedLinks);
            }
          }

          window.utils.showToast('Folder renamed');
        } catch (error) {
          console.error('Failed to rename folder:', error);
          window.utils.showToast('Failed to rename folder');
        }
      }

      titleElement.textContent = folder.title || 'Untitled folder';
    };

    window.renameHelper.setupKeyboardHandlers(input, finishRename);
  },

  // Rename tab (saves custom title to customTitles storage)
  startTabRename: async (tab, itemElement) => {
    const titleElement = itemElement.querySelector('.prd-stv-title');

    // Get custom title or fall back to tab title
    const customTitle = await window.renameHelper.getCustomTitle(tab.url);
    const currentTitle = customTitle || tab.title;

    const input = window.renameHelper.createRenameInput(currentTitle);
    input.style.cssText = 'background:#3a3a3a;border:1px solid #b9a079;color:#fff;padding:2px 4px;border-radius:15px;font-size:14px;outline:none;width:100%;';

    titleElement.textContent = '';
    titleElement.appendChild(input);
    input.focus();
    input.select();

    const finishRename = async (save = false) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== currentTitle) {
        try {
          // Save custom title to storage (tabs don't have a Chrome API for renaming)
          if (tab.url) {
            await window.renameHelper.saveCustomTitle(tab.url, newTitle);
          }

          tab.customTitle = newTitle;
          window.utils.showToast('Tab renamed');

          // Re-render to show the updated title
          if (window.state && window.elements) {
            await window.renderer.render(window.state, window.elements);
          }
        } catch (error) {
          console.error('Failed to rename tab:', error);
          window.utils.showToast('Failed to rename tab');
        }
      }

      titleElement.textContent = tab.customTitle || tab.title || 'Untitled';
    };

    window.renameHelper.setupKeyboardHandlers(input, finishRename);
  },

  // Move dialog
  showMoveDialog: (bookmark) => {
    const existingDialog = document.querySelector('.prd-stv-move-dialog');
    if (existingDialog) existingDialog.remove();

    const isTab = bookmark._isTab;
    const isFolder = !bookmark.url && !bookmark._isTab;
    const actionText = isTab ? 'Save' : 'Move';
    const itemType = isFolder ? 'folder' : (isTab ? 'bookmark' : 'bookmark');
    const titleText = isTab ? `Save as bookmark` : `Move "${bookmark.title}" to ${itemType === 'folder' ? 'parent folder' : 'folder'}`;

    const titleInputEl = isTab ?
      h('input', {
        type: 'text',
        class: 'prd-stv-title-input',
        placeholder: 'Bookmark title',
        value: bookmark.title || '',
        style: {
          width: '100%',
          padding: '8px',
          background: '#3a3a3a',
          border: '1px solid #555',
          color: '#fff',
          borderRadius: '15px',
          marginBottom: '12px',
          boxSizing: 'border-box',
          fontSize: '14px'
        }
      }) : null;

    const dialog = h('div', {
      class: 'prd-stv-move-dialog',
      style: {
        background: '#2b2b2b',
        borderRadius: '15px',
        padding: '20px',
        width: '400px',
        maxWidth: '90%',
        maxHeight: '80%',
        color: '#f5f5f5'
      }
    }, [
      h('h3', { style: { margin: '0 0 16px 0', fontSize: '16px' } }, titleText),
      titleInputEl,
      h('input', {
        type: 'text',
        class: 'prd-stv-folder-search',
        placeholder: 'Search folders...',
        style: {
          width: '100%',
          padding: '8px',
          background: '#3a3a3a',
          border: '1px solid #555',
          color: '#fff',
          borderRadius: '15px',
          marginBottom: '16px',
          boxSizing: 'border-box'
        }
      }),
      h('div', {
        class: 'prd-stv-folder-list',
        style: {
          maxHeight: '300px',
          overflowY: 'auto',
          border: '1px solid #555',
          borderRadius: '15px'
        }
      }, h('div', {
        style: { padding: '16px', textAlign: 'center', color: '#999' }
      }, 'Loading folders...')),
      h('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          marginTop: '16px'
        }
      }, [
        h('button', {
          class: 'prd-stv-cancel-btn',
          style: {
            padding: '8px 16px',
            background: '#555',
            color: '#fff',
            border: 'none',
            borderRadius: '15px',
            cursor: 'pointer'
          }
        }, 'Cancel'),
        h('button', {
          class: 'prd-stv-move-btn',
          disabled: true,
          style: {
            padding: '8px 16px',
            background: '#b9a079',
            color: '#000',
            border: 'none',
            borderRadius: '15px',
            cursor: 'pointer'
          }
        }, actionText)
      ])
    ]);

    const overlay = h('div', {
      class: 'prd-stv-move-overlay',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.5)',
        zIndex: '20000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, dialog);

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

      if (!response) {
        throw new Error('No response from background script');
      }

      if (response.success === false) {
        throw new Error(response.error || 'Failed to get bookmark tree');
      }

      const bookmarkTree = response;
      allFolders = rendererUIActions.extractFolders(bookmarkTree, bookmark.id);
      filteredFolders = allFolders;
      rendererUIActions.renderFolderList(folderList, filteredFolders, updateSelection);
    } catch (error) {
      console.error('Failed to load folders:', error);
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
    // Clear existing content
    container.innerHTML = '';

    if (folders.length === 0) {
      container.appendChild(
        h('div', {
          style: { padding: '16px', textAlign: 'center', color: '#999' }
        }, 'No folders found')
      );
    } else {
      folders.forEach((folder, index) => {
        const folderItem = h('div', {
          class: 'prd-stv-folder-item',
          'data-folder-id': folder.id,
          'data-index': index,
          style: {
            padding: '8px 12px',
            cursor: 'pointer',
            borderBottom: '1px solid #3a3a3a',
            display: 'flex',
            flexDirection: 'column'
          }
        }, [
          h('div', {
            style: { fontSize: '14px', color: '#f5f5f5' }
          }, folder.title),
          h('div', {
            style: { fontSize: '12px', color: '#999', marginTop: '2px' }
          }, folder.path)
        ]);
        container.appendChild(folderItem);
      });
    }

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
