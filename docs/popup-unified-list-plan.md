# Popup Unified List Plan

## Overview

- Replace three separate sections with a single scrollable list.
- Rows cover: bookmark folders (expandable), bookmark items, open tabs, and history items.
- Keep ordering: Bookmarks tree first → Tabs → History (limit 20).
- Preserve existing styling by reusing `.prd-stv-cmd-item` and icons.

## Item Model

- type: `folder | bookmark | tab | history`
- id: string (or number for tab id)
- title: string
- url: string | undefined
- depth: number (indent level for bookmark tree)
- iconUrl: string (computed; uses favicon or fallback)
- meta: `{ lastAccessed?: number, lastVisitTime?: number }`
- flags: `{ expanded?: boolean, draggable: boolean }`

## UI & Rendering

- Single container `#unified-list` holding all rows.
- Optional thin headers as rows (non-focusable) for Bookmarks/Tabs/History.
- Indentation via `padding-left` based on `depth` for folders/bookmarks.
- Folders render with a twisty (▸/▾) and toggle on click.
- With a query present, automatically show ancestors of matching bookmarks; folders containing matches render as expanded.

## Search & Ordering

- Debounce input 200ms.
- Case-insensitive substring matching on `title` or `url`.
- Bookmarks: leaf-only matching; include ancestors to preserve tree path.
- Tabs: filter by `title/url`; sort by `lastAccessed` desc.
- History: `chrome.history.search({ text, maxResults: 20 })`; sort by `lastVisitTime` desc.
- Unified list = [bookmark rows…] + [tab rows…] + [history rows…].

## Actions & Shortcuts

- Click/Enter:
  - Tab → activate and focus window.
  - Bookmark/History → open in new tab; Ctrl/Cmd+Enter opens in current tab.
- Favicons: tab favicon or Google S2 for URLs; fallback to `link_18dp_E3E3E3.svg`.
- Show relative time for tabs/history using existing `timeAgo` logic.

## Drag & Drop

- Draggable items: bookmark, folder, tab, history.
- Drop targets:
  - Folder row (drop “into”):
    - Bookmark/Folder → `chrome.bookmarks.move(id, { parentId })` (with ancestry guard).
    - Tab/History → create bookmark in target folder with duplicate-by-URL detection.
  - Between bookmark rows within the same folder (insertion indicator): compute `index` and call `chrome.bookmarks.move(id, { parentId, index })`.
- Guards & Feedback:
  - Prevent moving a folder into its descendant (ancestry check).
  - Detect duplicates on create; toast and skip create.
  - Highlight folder row on valid hover; show insertion line for reorders.

## Keyboard Navigation

- Up/Down to move selection across the unified list.
- Enter to activate/open per item type.
- Esc closes popup window (Chrome default).

## State & Data Flow

- query: string
- expanded: Set<string> (persist via `chrome.storage.local`)
- bookmarksTree: raw from `chrome.bookmarks.getTree()`
- unifiedRows: derived array = flatten(bookmarks, expanded, query) + filtered tabs + history
- selectionIndex: number (for keyboard navigation)

## Implementation Steps

1) HTML Refactor
- Replace three lists with one container: `#unified-list`.
- Keep search input and minimal header styles.

2) Data Shaping
- Implement `flattenBookmarks(tree, expanded, query)` to produce folder/bookmark rows with depth.
- Build `unifiedRows = [...bookmarkRows, ...tabRows, ...historyRows]`.

3) Rendering
- Render all rows into `#unified-list` using a single renderer with branches on `row.type`.
- Apply indentation and glyphs; reuse `.prd-stv-cmd-item`.

4) Interaction
- Click handlers per type (activate/open); Ctrl/Cmd to open in current tab.
- Toggle folder expanded on header click; persist expanded set.
- Keyboard selection over `unifiedRows`.

5) Drag & Drop
- Implement folder drop handling (move/create with duplicate detection).
- Implement between-row reordering (index calculation + visual insertion indicator).
- Prevent invalid moves (descendant checks).

6) Polish
- Auto-expand ancestors for matching bookmarks in query mode.
- Optional inline section headers as rows for readability.
- Toast notifications for moved/created/duplicates/errors.

## Pseudocode

Flatten bookmarks tree into rows:

```js
function flattenBookmarks(nodes, expanded, q, depth = 0) {
  const rows = [];
  for (const node of nodes) {
    if (node.url) {
      const hay = ((node.title || '') + ' ' + (node.url || '')).toLowerCase();
      const match = !q || hay.includes(q);
      if (match) rows.push({ type: 'bookmark', id: node.id, title: node.title, url: node.url, depth });
      continue;
    }
    // folder
    const childRows = flattenBookmarks(node.children || [], expanded, q, depth + 1);
    if (!q) {
      rows.push({ type: 'folder', id: node.id, title: node.title, depth, expanded: expanded.has(node.id) });
      if (expanded.has(node.id)) rows.push(...childRows);
    } else if (childRows.length) {
      // show folder when any descendants match; force expanded to reveal matches
      rows.push({ type: 'folder', id: node.id, title: node.title, depth, expanded: true });
      rows.push(...childRows);
    }
  }
  return rows;
}
```

Build unified rows:

```js
const q = (state.query || '').toLowerCase();
const bookmarkRows = flattenBookmarks(state.bookmarksRoots, state.expanded, q);
const tabRows = state.tabs
  .filter(t => !q || (((t.title||'') + ' ' + (t.url||'')).toLowerCase().includes(q)))
  .map(t => ({ type: 'tab', id: String(t.id), title: t.title, url: t.url, meta: { lastAccessed: t.lastAccessed } }));
const historyRows = state.history
  .map(h => ({ type: 'history', id: h.id || h.url, title: h.title, url: h.url, meta: { lastVisitTime: h.lastVisitTime } }));
state.unifiedRows = [...bookmarkRows, ...tabRows, ...historyRows];
```

Index calculation for reordering within a folder (conceptual):

```js
function computeDropIndex(targetFolderId, clientY, listEl) {
  const children = Array.from(listEl.querySelectorAll(`[data-parent="${targetFolderId}"]`));
  for (let i = 0; i < children.length; i++) {
    const rect = children[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i; // insert before i
  }
  return children.length; // append
}
```

---

This plan replaces the multi-section popup with a single, consistent list while keeping all behaviors (search, actions, DnD) and matching the current style.
