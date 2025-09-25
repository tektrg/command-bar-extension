# Command Bar Extension

A minimal command bar browser extension, inspired by the Arc browser's Cmd+P functionality. This extension provides quick access to your tabs, bookmarks, and browsing history through a convenient command interface.

## Features

*   **Quick Navigation:** Easily search and switch between open tabs, bookmarks, and browsing history.
*   **Keyboard-Driven:** Designed for efficiency with intuitive keyboard shortcuts.
*   **Side Panel Integration:** Access additional functionality or information via the integrated side panel.
*   **Minimalist Design:** A clean and unobtrusive user interface.

## Installation

To install this extension:

1.  **Download the code:**
    *   **Option A: Clone the repository (recommended for developers):**
        ```bash
        git clone <repository_url>
        ```
        (Replace `<repository_url>` with the actual URL of the Git repository.)
    *   **Option B: Download as ZIP:**
        Download the latest release or the source code as a `.zip` file from the project's repository page (e.g., GitHub, GitLab). Unzip the file to a local directory.
2.  **Open your browser's extension management page:**
    *   **Chrome:** Go to `chrome://extensions`
    *   **Edge:** Go to `edge://extensions`
    *   **Brave:** Go to `brave://extensions`
    *   **Firefox:** Go to `about:addons` (then click the gear icon and "Install Add-on From File..." for a `.zip` or "Debug Add-ons" for unpacked)
3.  **Enable Developer Mode:** Toggle on "Developer mode" (usually in the top right corner).
4.  **Load Unpacked:** Click on "Load unpacked" (or "Load temporary add-on" for Firefox) and select the cloned/downloaded `command-bar-extension` directory.

The extension should now be installed and active in your browser.

## Usage

### Toggling the Command Bar

*   **Windows/Linux:** Press `Ctrl+P`
*   **macOS:** Press `Cmd+P`

Once the command bar is open, you can start typing to search through your open tabs, bookmarks, and history. Use the arrow keys to navigate through results and `Enter` to select an item.

### Opening the Extension Popup

*   **Windows/Linux:** Press `Ctrl+Shift+P`
*   **macOS:** Press `Cmd+Shift+P`

This will open the traditional browser extension popup, which may contain additional settings or quick actions.

### Using the Side Panel

Click on the extension icon in your browser's toolbar and select "Open Side Panel" (if available) or use the browser's built-in side panel functionality to access the extension's side panel. The side panel provides a persistent view for certain features.

## Development

If you're interested in contributing or modifying the extension:

1.  Follow the installation steps above to load the unpacked extension.
2.  Make your changes to the source code.
3.  Reload the extension on the browser's extension management page (click the refresh icon on the extension card) to see your changes.
