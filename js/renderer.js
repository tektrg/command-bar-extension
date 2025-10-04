// Facade module that delegates to specialized renderer modules
// This module maintains backward compatibility while organizing code into focused modules:
// - renderer-history.js: History search and rendering
// - renderer-rendering.js: Core DOM generation and updates
// - renderer-ui-actions.js: Context menus, modals, and rename operations

const renderer = {
  // Delegate core rendering functions to rendererRendering
  render: (state, elements) => window.rendererRendering.render(state, elements),
  renderCombined: (state, elements) => window.rendererRendering.renderCombined(state, elements),
  updateBookmarkItemInDOM: (bookmarkId, bookmark, state, elements) =>
    window.rendererRendering.updateBookmarkItemInDOM(bookmarkId, bookmark, state, elements),
  updateTabItemInDOM: (tabId, tab, state, elements) =>
    window.rendererRendering.updateTabItemInDOM(tabId, tab, state, elements),
  insertBookmarkAtCorrectPosition: (bookmark, state, elements) =>
    window.rendererRendering.insertBookmarkAtCorrectPosition(bookmark, state, elements),
  insertTabAtCorrectPosition: (tab, state, elements) =>
    window.rendererRendering.insertTabAtCorrectPosition(tab, state, elements),
  findParentContainer: (parentId, elements) =>
    window.rendererRendering.findParentContainer(parentId, elements),
  createSectionHeader: (title, buttonConfig) =>
    window.rendererRendering.createSectionHeader(title, buttonConfig),
  createBookmarkViewHeader: (state, elements) =>
    window.rendererRendering.createBookmarkViewHeader(state, elements),
  createTabSortHeader: (state, elements) =>
    window.rendererRendering.createTabSortHeader(state, elements),
  renderInactiveTabsSection: (state, elements) =>
    window.rendererRendering.renderInactiveTabsSection(state, elements),
  renderNode: (node, depth, state) =>
    window.rendererRendering.renderNode(node, depth, state),
  renderBookmarkItem: (node, state) =>
    window.rendererRendering.renderBookmarkItem(node, state),
  renderTabItem: (tab, state, options) =>
    window.rendererRendering.renderTabItem(tab, state, options),
  addFolderDragHandlers: (header, node, state) =>
    window.rendererRendering.addFolderDragHandlers(header, node, state),
  addBookmarkDragHandlers: (div, node, state) =>
    window.rendererRendering.addBookmarkDragHandlers(div, node, state),

  // Delegate history functions to rendererHistory
  searchRecentHistory: (query) => window.rendererHistory.searchRecentHistory(query),
  renderHistoryItem: (historyItem, state) =>
    window.rendererHistory.renderHistoryItem(historyItem, state),

  // Delegate UI action functions to rendererUIActions
  showContextMenu: (event, bookmark, itemElement) =>
    window.rendererUIActions.showContextMenu(event, bookmark, itemElement),
  closeContextMenu: () => window.rendererUIActions.closeContextMenu(),
  showFolderContextMenu: (event, folder) =>
    window.rendererUIActions.showFolderContextMenu(event, folder),
  showTabContextMenu: (event, tab, itemElement) =>
    window.rendererUIActions.showTabContextMenu(event, tab, itemElement),
  showHistoryContextMenu: (event, historyItem, itemElement) =>
    window.rendererUIActions.showHistoryContextMenu(event, historyItem, itemElement),
  startRename: (bookmark, itemElement) =>
    window.rendererUIActions.startRename(bookmark, itemElement),
  startFolderRename: (folder) =>
    window.rendererUIActions.startFolderRename(folder),
  showMoveDialog: (bookmark) =>
    window.rendererUIActions.showMoveDialog(bookmark),
  setupMoveDialog: (dialog, bookmark, overlay) =>
    window.rendererUIActions.setupMoveDialog(dialog, bookmark, overlay),
  extractFolders: (bookmarkTree, excludeId) =>
    window.rendererUIActions.extractFolders(bookmarkTree, excludeId),
  renderFolderList: (container, folders, onSelect) =>
    window.rendererUIActions.renderFolderList(container, folders, onSelect),
  showNewFolderModal: (parentFolderId) =>
    window.rendererUIActions.showNewFolderModal(parentFolderId),
  showDeleteFolderModal: (folder) =>
    window.rendererUIActions.showDeleteFolderModal(folder)
};

// Export for use in other modules
window.renderer = renderer;
