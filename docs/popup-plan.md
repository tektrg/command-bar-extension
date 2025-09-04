# Browser Action Popup Plan

## Goals

- Add a browser-action popup (keep existing keyboard overlay unchanged).
- Show a searchable view including:
  - Bookmarks in a filtered tree (full depth), showing only matching items and their ancestor folders.
  - Open tabs list.
  - History list (limit 20), with last access/visit time.
- Search input auto-focused on open; debounce 150–250ms; matching algorithm similar to current (case-insensitive substring on title/url).
- Drag and drop:
  - Reorder bookmarks within a folder and move bookmarks/folders across folders (preserve drop position).
  - Drag open tabs or history entries onto a folder to create a bookmark (detect duplicates by URL within target folder and notify).
- Visual style matches current `style.css` (reuse, with minimal additions).

## Non-Goals (v1)

- Fuzzy ranking beyond substring match.
- Undo operations for moves/creates (may show a transient toast).
- Full virtualization for huge bookmark trees (optimize later if needed).

## Files To Add/Modify

- Add: `popup.html` — Popup page scaffold with search input and sections.
- Add: `popup.js` — Implements data fetching, rendering, search, DnD, and actions.
- Reuse: `style.css` — Shared styling; add small popup-specific hooks if needed.
- Modify: `manifest.json` — Add `action.default_popup: "popup.html"` (keep keyboard command as-is).

## Data Sources & Permissions

- Bookmarks: `chrome.bookmarks.getTree()`, `chrome.bookmarks.getChildren(id)`, `chrome.bookmarks.move(id, { parentId, index })`, `chrome.bookmarks.create({ parentId, title, url })`.
- Tabs: `chrome.tabs.query({})`, activate via `chrome.tabs.update(id, { active: true })` + `chrome.windows.update(windowId, { focused: true })`.
- History: `chrome.history.search({ text: query, maxResults: 20 })`.
- Permissions already present in `manifest.json`: `tabs`, `bookmarks`, `history`, `scripting`.

## UI Structure

- Header: search input (autofocus), shows placeholder “Search bookmarks, tabs, history…”.
- Sections (top→bottom):
  1) Bookmarks — filtered tree (full depth). Only matching leaf items (bookmarks) are shown with their ancestor folders. Folders can be expanded/collapsed. Non-matching branches hidden unless they contain a descendant match.
  2) Open Tabs — flat list, sorted by `lastAccessed` desc; show favicon, title, URL (truncated), and relative last used.
  3) History — flat list (limit 20), sorted by `lastVisitTime` desc; show favicon, title, URL (truncated), and relative last visited.
- Counts per section optional (e.g., “Tabs (7)”).
- Styling: reuse existing classes where feasible; add a root container id `#prd-stv-popup-root` to scope any popup-only tweaks.

## Search Behavior

- Debounce input events (150–250ms) before performing queries.
- Query model:
  - Normalize to lower-case for comparison.
  - Bookmarks: run a single traversal of the tree; a bookmark matches if `title.includes(q) || url.includes(q)`; folders match if any descendant matches.
  - Tabs: filter `tabs` with `title.includes(q) || url.includes(q)`.
  - History: `chrome.history.search({ text: q, maxResults: 20 })` (API already filters); optionally further filter client-side by substring.
- Empty query shows: full bookmarks tree collapsed to top-level (or last persisted expansion), recent tabs sorted by `lastAccessed`, recent history (20).

## Actions & Shortcuts

- Click or Enter on an item:
  - Tab: activate tab and focus its window.
  - Bookmark/History: open in a new tab (default), or open in the current tab when modifier is held.
- Modifier behavior (popup):
  - Plain click/Enter: open in new tab.
  - Ctrl/Cmd + Enter (or click with Ctrl/Cmd): open in current tab (`chrome.tabs.update(currentTabId, { url })`).
  - Optionally, Ctrl/Cmd + Click could open in background tab (future).
- Favicon handling: use tab favicon when available; otherwise Google S2 favicon for URLs; fallback to `link_18dp_E3E3E3.svg`.
- Relative time: same logic as overlay (`timeAgo`).

## Drag & Drop Behavior

- Draggable item types:
  - `bookmark` (leaf), `folder` (container), `tab` (open tab), `history` (history entry).
- Valid drop targets:
  - Folder node header: moving/reparenting into folder (append to end).
  - Between items within a folder: reordering to a specific index (shows insertion indicator line).
- Operations:
  - Bookmark→Folder or Reorder: `chrome.bookmarks.move(bookmarkId, { parentId: folderId, index })`.
  - Folder→Folder: `chrome.bookmarks.move(folderId, { parentId: folderId, index })` (disallow moving into its own descendants; guard by checking ancestry).
  - Tab/History→Folder: create bookmark with `{ parentId: folderId, title, url }`.
    - Duplicate detection: get `chrome.bookmarks.getChildren(folderId)` and check for a child with same normalized URL. If exists, show toast “Already bookmarked in this folder” and do not create.
- Visual feedback:
  - Highlight folder on hover when it is a valid drop target.
  - Show insertion line for index-based reordering inside a folder.
  - Auto-expand folder on hover (e.g., 400–600ms delay) to allow dropping into deeper levels.

## State & Rendering

- State shape (in `popup.js`):
  - `query`: string
  - `bookmarksTree`: raw tree (first load via `getTree`) + derived `filteredTree`
  - `expandedFolders`: Set<string> persisted with `chrome.storage.local`
  - `tabs`: Tab[] (full) + derived `filteredTabs`
  - `history`: HistoryItem[] (derived)
  - `drag`: { type, id/url, sourceParentId?, sourceIndex? }
  - `busy`: boolean (for async feedback)
- Rendering:
  - Efficiently update sections; avoid full re-rendering of the entire tree when not necessary.
  - For large trees, consider lazy rendering children only when folder is expanded.

## Error Handling & Edge Cases

- Prevent moving a folder into its own descendant (check ancestry chain before `move`).
- Some bookmark nodes have no `url` (folders) — only bookmarks (leaves) are draggable as “links”.
- Tabs may lack `favIconUrl` or be restricted pages; fallback icon.
- History items without titles — fall back to URL.
- Gracefully handle permission errors (unlikely given current manifest).
- Service worker lifetime unaffected; popup uses APIs directly.

## Implementation Steps

1) Scaffolding
   - Add `popup.html` with root container and include `style.css` + `popup.js`.
   - Update `manifest.json` with `action.default_popup`.

2) Data Fetching
   - On load: fetch bookmarks tree, tabs, and history (20 items), then render.
   - Wire up search with debounce; re-filter tree and lists on query changes.

3) Bookmarks Tree Rendering
   - Build a DOM tree with expand/collapse controls.
   - Filtering: DFS over tree; include a folder if any descendant bookmark matches; include only matching bookmarks.

4) Tabs & History Lists
   - Tabs sorted by `lastAccessed` desc; show relative time (if available) and URL subtitle.
   - History sorted by `lastVisitTime` desc; limit 20.

5) Actions
   - Click/Enter to open: tabs activate; bookmarks/history open in new tab; Ctrl/Cmd+Enter opens in current tab.

6) Drag & Drop
   - Implement HTML5 DnD across items and folders.
   - Compute `index` for drops between items within a folder.
   - Implement duplicate detection on create; show toast on duplicate.
   - Auto-expand folder on hover.

7) Polish & Styling
   - Reuse `style.css`; add minimal popup-specific tweaks under `#prd-stv-popup-root` if needed.
   - Toast notifications for operations (moved, created, duplicate, errors).
   - Persist `expandedFolders` via `chrome.storage.local`.

## Pseudocode Highlights

Filtering bookmarks tree:

```js
function filterTree(node, q) {
  if (!q) return node; // render per expandedFolders
  if (node.url) {
    const hay = ((node.title || '') + ' ' + (node.url || '')).toLowerCase();
    return hay.includes(q) ? node : null;
  }
  // folder: include only if any child matches
  const keptChildren = (node.children || [])
    .map(child => filterTree(child, q))
    .filter(Boolean);
  if (keptChildren.length) return { ...node, children: keptChildren };
  return null;
}
```

Duplicate detection on create:

```js
async function createIfNotDuplicate(folderId, title, url) {
  const children = await chrome.bookmarks.getChildren(folderId);
  const norm = (u) => u.replace(/\/$/, '').toLowerCase();
  if (children.some(c => c.url && norm(c.url) === norm(url))) {
    showToast('Already bookmarked in this folder');
    return null;
  }
  return chrome.bookmarks.create({ parentId: folderId, title, url });
}
```

Move folder/bookmark, with ancestry guard:

```js
async function safeMove(nodeId, targetFolderId, index) {
  const ancestors = await getAncestors(targetFolderId);
  if (ancestors.includes(nodeId)) {
    showToast('Cannot move a folder into its descendant');
    return;
  }
  await chrome.bookmarks.move(nodeId, { parentId: targetFolderId, index });
}
```

## Testing Checklist

- Popup opens; input autofocuses.
- Empty query: shows top-level bookmarks (collapsed or last state), tabs (most recent first), history (20).
- Typing filters all three sources; bookmarks tree shows only matches and ancestors.
- Clicking:
  - Tab activates and focuses window.
  - Bookmark/History opens in a new tab; Ctrl/Cmd+Enter opens in current tab.
- Drag & Drop:
  - Reorder bookmarks within folder (spot-check positions).
  - Move bookmark/folder across folders.
  - Drag tab/history to folder creates a bookmark.
  - Duplicate URL in folder is detected and blocked with toast.
- Styling matches overlay look-and-feel; favicons and times display correctly.

## Future Enhancements

- Fuzzy match/ranking; highlight matched substrings like overlay’s `highlightMatches`.
- Virtualized rendering for very large bookmark trees.
- Context menu for open-in-new-tab/open-in-current, rename/delete, etc.
- Undo for move/create actions.
