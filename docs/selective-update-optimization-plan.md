# Selective Item Update Optimization Plan

## Current Problem

The extension currently refreshes entire lists (bookmarks/tabs/history) on every Chrome API event, causing:
- Unnecessary full DOM re-renders
- Loss of scroll position
- Visual flickering
- Poor performance with large bookmark/tab collections
- Drag-and-drop interference (recently fixed)

## Proposed Solution: Selective Item Updates

Instead of refreshing entire lists, update only the specific items that changed.

## Implementation Plan

### Phase 1: Data Layer Optimization

#### 1.1 Add Item Tracking Maps
```javascript
// Add to state object
const state = {
  // ... existing properties
  itemMaps: {
    bookmarks: new Map(), // id -> bookmark object
    tabs: new Map(),      // id -> tab object
    history: new Map()    // url -> history object (history uses URL as key)
  }
};
```

#### 1.2 Implement Selective Data Updates
```javascript
// New functions to add
async function updateSingleBookmark(bookmarkId) {
  const [bookmark] = await chrome.bookmarks.get(bookmarkId).catch(() => []);
  if (bookmark) {
    state.itemMaps.bookmarks.set(bookmarkId, bookmark);
    return bookmark;
  }
  return null;
}

async function updateSingleTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) {
    state.itemMaps.tabs.set(tabId, tab);
    return tab;
  }
  return null;
}

function removeSingleItem(type, id) {
  state.itemMaps[type].delete(id);
}
```

### Phase 2: DOM Update Optimization

#### 2.1 Selective DOM Updates
```javascript
// New rendering functions
function updateBookmarkItemInDOM(bookmarkId, bookmark) {
  const existingElement = document.querySelector(`[data-id="${bookmarkId}"]`);
  if (existingElement && bookmark) {
    // Update existing element in place
    const newElement = renderBookmarkItem(bookmark);
    existingElement.replaceWith(newElement);
  } else if (!bookmark) {
    // Remove deleted item
    existingElement?.remove();
  } else {
    // Add new item (need to find correct insertion point)
    insertBookmarkAtCorrectPosition(bookmark);
  }
}

function updateTabItemInDOM(tabId, tab) {
  const existingElement = document.querySelector(`[data-id="${tabId}"]`);
  if (existingElement && tab) {
    const newElement = renderTabItem(tab);
    existingElement.replaceWith(newElement);
  } else if (!tab) {
    existingElement?.remove();
  } else {
    insertTabAtCorrectPosition(tab);
  }
}
```

#### 2.2 Smart Insertion Logic
```javascript
function insertBookmarkAtCorrectPosition(bookmark) {
  // Find parent folder in DOM
  const parentContainer = findParentContainer(bookmark.parentId);
  if (!parentContainer) return;
  
  // Get siblings from Chrome API to determine position
  chrome.bookmarks.getChildren(bookmark.parentId).then(siblings => {
    const index = siblings.findIndex(s => s.id === bookmark.id);
    const referenceElement = parentContainer.children[index];
    const newElement = renderBookmarkItem(bookmark);
    
    if (referenceElement) {
      referenceElement.before(newElement);
    } else {
      parentContainer.appendChild(newElement);
    }
  });
}
```

### Phase 3: Event Handler Optimization

#### 3.1 Replace Full Refresh Handlers
```javascript
// BEFORE (current - full refresh)
chrome.bookmarks.onChanged.addListener(() => {
  reloadBookmarks().then(() => {
    if (!state.dragState.isDragging) render();
  });
});

// AFTER (selective update)
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (state.dragState.isDragging) return;
  
  const updatedBookmark = await updateSingleBookmark(id);
  updateBookmarkItemInDOM(id, updatedBookmark);
  
  // Only trigger filter/search re-application if query exists
  if (state.query) {
    applyBookmarkFilter();
    renderBookmarks(); // Only for filtered results
  }
});
```

#### 3.2 Event-Specific Handlers
```javascript
// Bookmark Events
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (state.dragState.isDragging) return;
  
  state.itemMaps.bookmarks.set(id, bookmark);
  if (bookmark.parentId) ensureExpanded(bookmark.parentId);
  
  if (state.query) {
    // Re-render filtered results
    applyBookmarkFilter();
    renderBookmarks();
  } else {
    // Insert single item
    insertBookmarkAtCorrectPosition(bookmark);
  }
});

chrome.bookmarks.onRemoved.addListener((id) => {
  if (state.dragState.isDragging) return;
  
  removeSingleItem('bookmarks', id);
  updateBookmarkItemInDOM(id, null); // null = remove
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (state.dragState.isDragging) return;
  
  const bookmark = await updateSingleBookmark(id);
  
  // Remove from old position
  document.querySelector(`[data-id="${id}"]`)?.remove();
  
  // Insert at new position
  if (bookmark) {
    if (moveInfo.parentId) ensureExpanded(moveInfo.parentId);
    insertBookmarkAtCorrectPosition(bookmark);
  }
});

// Tab Events
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (state.dragState.isDragging) return;
  if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl) return;
  
  state.itemMaps.tabs.set(tabId, tab);
  updateTabItemInDOM(tabId, tab);
});

chrome.tabs.onCreated.addListener((tab) => {
  if (state.dragState.isDragging) return;
  
  state.itemMaps.tabs.set(tab.id, tab);
  insertTabAtCorrectPosition(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.dragState.isDragging) return;
  
  removeSingleItem('tabs', tabId);
  updateTabItemInDOM(tabId, null);
});
```

### Phase 4: Filter/Search Optimization

#### 4.1 Incremental Filter Updates
```javascript
function addItemToFilteredResults(item, type) {
  const query = state.query.toLowerCase();
  if (!query) return;
  
  if (type === 'bookmark' && nodeMatches(item, query)) {
    // Add to filtered tree maintaining structure
    addToFilteredTree(item);
    renderSingleFilteredItem(item);
  } else if (type === 'tab') {
    const hay = ((item.title || '') + ' ' + (item.url || '')).toLowerCase();
    if (hay.includes(query)) {
      state.filteredTabs.push(item);
      renderSingleFilteredTab(item);
    }
  }
}

function removeItemFromFilteredResults(itemId, type) {
  if (!state.query) return;
  
  if (type === 'bookmark') {
    removeFromFilteredTree(itemId);
  } else if (type === 'tab') {
    state.filteredTabs = state.filteredTabs.filter(t => t.id !== itemId);
  }
}
```

### Phase 5: Performance Monitoring

#### 5.1 Add Performance Metrics
```javascript
// Optional: Add performance tracking
const perf = {
  fullRenders: 0,
  partialUpdates: 0,
  lastFullRender: 0,
  
  trackFullRender() {
    this.fullRenders++;
    this.lastFullRender = Date.now();
  },
  
  trackPartialUpdate() {
    this.partialUpdates++;
  }
};
```

## Implementation Priority

### High Priority (Immediate Impact)
1. Tab updates (`onUpdated` - most frequent)
2. Bookmark changes (`onChanged` - user-visible)
3. Single item additions/removals

### Medium Priority
1. Bookmark moves (drag-and-drop already optimized)
2. Filter result updates
3. History updates

### Low Priority
1. Performance metrics
2. Advanced insertion optimizations
3. Animation/transition improvements

## Expected Benefits

### Performance Gains
- **90% reduction** in DOM operations for single item changes
- **Preserved scroll position** during updates
- **No visual flickering** from full re-renders
- **Faster response times** for large bookmark collections

### User Experience
- Smooth real-time updates
- Maintained selection states
- Preserved expand/collapse states
- Better drag-and-drop stability

## Migration Strategy

1. **Implement alongside existing system** - Keep full refresh as fallback
2. **Feature flag controlled rollout** - Enable selective updates gradually
3. **A/B testing** - Compare performance metrics
4. **Graceful degradation** - Fall back to full refresh on errors

## Files to Modify

- `sidepanel.js` - Primary implementation
- `popup.js` - Mirror changes for popup interface
- `docs/selective-update-optimization-plan.md` - This plan document

## Testing Checklist

- [ ] Single bookmark creation/deletion/modification
- [ ] Multiple rapid tab updates (onUpdated spam)
- [ ] Bookmark folder operations
- [ ] Search/filter during live updates
- [ ] Drag-and-drop during background updates
- [ ] Large bookmark collections (1000+ items)
- [ ] Multiple browser windows
- [ ] Extension sync scenarios

## Rollback Plan

If selective updates cause issues:
1. Feature flag to disable selective updates
2. Revert to full refresh behavior
3. Collect error logs and user feedback
4. Fix issues and re-enable gradually