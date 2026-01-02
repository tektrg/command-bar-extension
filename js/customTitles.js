// customTitles.js - Module for managing custom titles for tabs and other items

const customTitlesModule = {
  /**
   * Normalize URL for consistent comparison
   */
  normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    // Handle synthetic folder URLs (folder://bookmark/123)
    if (url.startsWith('folder://')) return url;
    try {
      const urlObj = new URL(url);
      urlObj.hash = '';
      if (urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch (error) {
      console.warn('[CustomTitles] Failed to normalize URL:', url);
      return '';
    }
  },

  /**
   * Load custom titles from storage
   */
  async load() {
    try {
      const result = await chrome.storage.local.get('customTitles');
      return result.customTitles || {};
    } catch (error) {
      console.error('[CustomTitles] Failed to load:', error);
      return {};
    }
  },

  /**
   * Save custom titles to storage
   */
  async save(customTitles) {
    try {
      await chrome.storage.local.set({ customTitles });
      return true;
    } catch (error) {
      console.error('[CustomTitles] Failed to save:', error);
      return false;
    }
  },

  /**
   * Set a custom title for a URL
   * @param {string} url - The URL
   * @param {string} title - The custom title
   */
  async setTitle(url, title) {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl || !title) {
      console.warn('[CustomTitles] Invalid URL or title');
      return false;
    }

    const customTitles = await this.load();
    customTitles[normalizedUrl] = title;
    return await this.save(customTitles);
  },

  /**
   * Get custom title for a URL
   * @param {string} url - The URL
   * @returns {string|null} - The custom title or null if not found
   */
  async getTitle(url) {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return null;

    const customTitles = await this.load();
    return customTitles[normalizedUrl] || null;
  },

  /**
   * Remove custom title for a URL
   * @param {string} url - The URL
   */
  async removeTitle(url) {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return false;

    const customTitles = await this.load();
    if (!(normalizedUrl in customTitles)) {
      return false; // Not found
    }

    delete customTitles[normalizedUrl];
    return await this.save(customTitles);
  }
};

// Export for use in other modules
// Use self for service workers, window for regular scripts
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.customTitlesModule = customTitlesModule;
} else if (typeof window !== 'undefined') {
  window.customTitlesModule = customTitlesModule;
}
