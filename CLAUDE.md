# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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