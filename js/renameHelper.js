// renameHelper.js - Shared helper module for rename operations across all item types

const renameHelper = {
  // Standard input styling for rename fields
  inputStyle: 'width:100%;padding:2px 4px;font:inherit;border:1px solid #007aff;border-radius:3px;outline:none;',

  /**
   * Create an inline rename input element
   * @param {string} currentTitle - The current title to display in the input
   * @returns {HTMLInputElement} The configured input element
   */
  createRenameInput(currentTitle) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.style.cssText = this.inputStyle;
    return input;
  },

  /**
   * Setup keyboard handlers for rename input (Enter to save, Escape to cancel)
   * @param {HTMLInputElement} input - The input element
   * @param {Function} finishRename - Callback function(shouldSave: boolean)
   */
  setupKeyboardHandlers(input, finishRename) {
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

  /**
   * Get custom title from customTitles storage
   * @param {string} url - The URL to look up
   * @returns {Promise<string|null>} The custom title or null if not found
   */
  async getCustomTitle(url) {
    if (!window.customTitlesModule) return null;
    return await window.customTitlesModule.getTitle(url);
  },

  /**
   * Save custom title to customTitles storage
   * @param {string} url - The URL to save title for
   * @param {string} newTitle - The new title to save
   * @returns {Promise<boolean>} Whether the save was successful
   */
  async saveCustomTitle(url, newTitle) {
    if (!window.customTitlesModule) {
      console.error('[RenameHelper] customTitlesModule not available');
      return false;
    }
    return await window.customTitlesModule.setTitle(url, newTitle);
  },

  /**
   * Remove custom title from storage
   * @param {string} url - The URL to remove title for
   * @returns {Promise<boolean>} Whether the removal was successful
   */
  async removeCustomTitle(url) {
    if (!window.customTitlesModule) return false;
    return await window.customTitlesModule.removeTitle(url);
  }
};

// Export for use in other modules
window.renameHelper = renameHelper;
