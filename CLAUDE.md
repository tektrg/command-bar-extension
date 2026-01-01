# CLAUDE.md

This file provides guidance to Claude Code and order AI code agents when working with code in this repository.

## How to proceed:
 You must follow this step to acquire needed contexts for the task. This document is a map to the other detailed documents via markdown link.
- Step 1: Skim this document to decide which linked documents (in markdown link) are necessary. Prioritize the minimal set needed to fulfill the task.
- Step 2: For each needed link, read and synthesize the information across documents to produce the final deliverable accurately specified by the task.
- Step 3: Flag any missing info, conflicts, or assumptions needed.
REMEMBER: Start with this document and consult linked detailed documents only as needed for the task to understand and fulfill the instructions.

## Operation Modes

You have various specific operation modes:
**Spin an agent** for each of below mode when it match the user's request, **or** if you cannot spin an agent, **read the doc and follow the specific instruction** for the mode:
- [feature-planner](docs/commands/feature-planner.md): trigger when user ask for planing a task.
- [search internet] Use gemini to search content on the internet, how to use: gemini -p "Search google for [query] and summarize  results". Note make sure set timeout long enough for the search, for complex query it could take few minutes
## Build Commands

## Project Overview

This is a Chrome browser extension that provides a minimal command bar interface similar to Arc browser's Cmd+P functionality. The extension allows users to quickly search and navigate between open tabs, bookmarks, and browser history using a keyboard-triggered overlay.

## Architecture

The extension follows Chrome Extension Manifest V3 architecture with three main components:

### Core Files
- **manifest.json**: Extension configuration with permissions for tabs, bookmarks, history, and scripting
- **background.js**: Service worker that handles command registration, search operations, and message routing
- **content.js**: Content script injected into web pages that manages the overlay UI and user interactions
- **style.css**: Styling for the command bar overlay interface

### Key Architecture Patterns

**Message Passing**: The extension uses Chrome's message passing API for communication between content scripts and the background service worker. Messages are typed with specific actions:
- `TOGGLE`: Show/hide the command bar overlay
- `SEARCH`: Perform search across tabs, bookmarks, and history
- `RECENT`: Get recently active tabs
- `OPEN`: Navigate to or activate a selected item

**Search Implementation**: The background script aggregates results from three sources:
1. **Open Tabs**: Searches tab titles and URLs
2. **Bookmarks**: Uses Chrome bookmarks API search
3. **History**: Searches browser history (limited to 20 results)

**UI State Management**: The content script manages overlay state with keyboard navigation:
- Arrow keys for item selection
- Enter to open selected item
- Escape to close overlay
- Automatic focus management

**Injection Strategy**: Content script uses injection guards (`window.__cmdBarInjected`) to prevent multiple injections and dynamically injects itself when the keyboard command is triggered.

**Modular Architecture**: The codebase follows KISS (Keep It Simple, Stupid) and DRY (Don't Repeat Yourself) principles with a modular approach:
- **Separation of Concerns**: Each module has a single responsibility (e.g., `sidepanel.js` handles main logic, separate modules for rendering, storage, utilities)
- **Global Module Pattern**: Modules expose functions to `window` object for cross-module communication (e.g., `window.renderer`, `window.utils`, `window.storage`)
- **State Management**: Centralized state object with clear data structures and relationships
- **Function Modularity**: Small, focused functions that do one thing well
- **Debounced Operations**: Performance optimization for frequent operations like search and tab updates
- **Event-Driven Updates**: Chrome API listeners trigger state updates and UI re-renders
- **Error Handling**: Graceful error handling with user feedback via toast notifications

**DOM Rendering Pattern**: Use the `h()` helper function from `js/dom.js` for creating DOM elements declaratively instead of innerHTML with template literals.

```javascript
// Preferred: Use h() helper for type-safe, XSS-safe element creation
h('div', { class: 'prd-stv-cmd-item', 'data-id': item.id }, [
  h('img', { class: 'prd-stv-favicon', src: favicon, onerror: handleError }),
  h('span', { class: 'prd-stv-title' }, item.title),
  h('button', { class: 'prd-stv-menu-btn', onclick: () => showMenu() }, '...')
])

// Avoid: innerHTML with template literals (XSS risk, no type safety)
div.innerHTML = `<div class="item"><span>${title}</span></div>`
```

Key features of `h()`:
- **Event handlers**: `onclick`, `onerror`, etc. attached as functions
- **Style objects**: `style: { display: 'flex', gap: '8px' }`
- **Data attributes**: `'data-id': item.id`
- **Conditional children**: `showBtn && h('button', {}, 'Click')`
- **Auto text escaping**: Strings passed as children are safely escaped

## Development Commands

Since this is a vanilla JavaScript Chrome extension without build tools, there are no npm/build commands. Development involves:

1. **Loading Extension**: Load unpacked extension in Chrome Developer Mode pointing to the repository directory
2. **Testing**: Use Cmd+P (Mac) or Ctrl+P (Windows/Linux) to trigger the command bar
3. **Debugging**: Use Chrome DevTools for content script debugging and chrome://extensions for background script inspection

## Key Keyboard Shortcuts

- **Cmd+P** (Mac) / **Ctrl+P** (Windows/Linux): Toggle command bar
- **Arrow Up/Down**: Navigate search results
- **Enter**: Open selected item
- **Escape**: Close command bar

## Extension Permissions

The extension requires these permissions:
- `tabs`: Access to open tabs for search and navigation
- `bookmarks`: Search bookmark data
- `history`: Access browser history
- `scripting`: Inject content scripts dynamically

## Development workflow
- Do not git commit unless user explicitly request.