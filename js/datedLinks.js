// datedLinks.js - Module for managing dated links functionality

const datedLinksModule = {
  /**
   * Generate unique ID for dated link entries
   */
  generateId() {
    return 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

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
      console.warn('[DatedLinks] Failed to normalize URL:', url);
      return '';
    }
  },

  /**
   * Load dated links from storage
   */
  async load() {
    try {
      const result = await chrome.storage.local.get('datedLinks');
      const datedLinks = (result.datedLinks || []).filter(item =>
        this.normalizeUrl(item.url) && item.date
      );
      return datedLinks.map(item => ({
        id: item.id || this.generateId(),
        url: item.url,
        title: item.title || 'Untitled',
        favicon: item.favicon || '',
        date: item.date,
        itemType: item.itemType || 'bookmark',
        itemId: item.itemId || null,
        createdAt: item.createdAt || Date.now()
      }));
    } catch (error) {
      console.error('[DatedLinks] Failed to load:', error);
      return [];
    }
  },

  /**
   * Save dated links to storage
   */
  async save(datedLinks) {
    try {
      // Deduplicate by normalized URL
      const deduped = [];
      const seen = new Set();
      datedLinks.forEach(item => {
        const norm = this.normalizeUrl(item.url);
        if (seen.has(norm)) return;
        seen.add(norm);
        deduped.push(item);
      });
      await chrome.storage.local.set({ datedLinks: deduped });
      return true;
    } catch (error) {
      console.error('[DatedLinks] Failed to save:', error);
      return false;
    }
  },

  /**
   * Add a date to an item
   * @param {Object} itemData - { url, title, favicon, itemType, itemId }
   * @param {string} date - ISO date string (YYYY-MM-DD)
   */
  async addDate(itemData, date) {
    const datedLinks = await this.load();
    const normalizedUrl = this.normalizeUrl(itemData.url);

    if (!normalizedUrl || !date) {
      console.warn('[DatedLinks] Invalid URL or date');
      return false;
    }

    // Check if already dated (update if exists)
    const existingIndex = datedLinks.findIndex(
      item => this.normalizeUrl(item.url) === normalizedUrl
    );

    const newEntry = {
      id: existingIndex >= 0 ? datedLinks[existingIndex].id : this.generateId(),
      url: itemData.url,
      title: itemData.title || 'Untitled',
      favicon: itemData.favicon || '',
      date: date,
      itemType: itemData.itemType || 'bookmark',
      itemId: itemData.itemId || null,
      createdAt: existingIndex >= 0 ? datedLinks[existingIndex].createdAt : Date.now()
    };

    if (existingIndex >= 0) {
      datedLinks[existingIndex] = newEntry;
    } else {
      datedLinks.push(newEntry);
    }

    return await this.save(datedLinks);
  },

  /**
   * Remove date from an item by URL
   */
  async removeDate(url) {
    const datedLinks = await this.load();
    const normalizedUrl = this.normalizeUrl(url);
    const filtered = datedLinks.filter(
      item => this.normalizeUrl(item.url) !== normalizedUrl
    );

    if (filtered.length === datedLinks.length) {
      return false; // Not found
    }

    return await this.save(filtered);
  },

  /**
   * Get dated link by URL
   */
  async getByUrl(url) {
    const datedLinks = await this.load();
    const normalizedUrl = this.normalizeUrl(url);
    return datedLinks.find(item => this.normalizeUrl(item.url) === normalizedUrl);
  },

  /**
   * Check if URL has a date
   */
  async hasDate(url) {
    const item = await this.getByUrl(url);
    return !!item;
  },

  /**
   * Get all dated links sorted by date (earliest first)
   */
  async getSortedByDate() {
    const datedLinks = await this.load();
    return datedLinks.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });
  },

  /**
   * Check if a date is in the past (overdue)
   */
  isOverdue(dateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemDate = new Date(dateString);
    return itemDate < today;
  },

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) {
      return 'Today';
    } else if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  }
};

// Export for use in other modules
// Use self for service workers, window for regular scripts
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.datedLinksModule = datedLinksModule;
} else if (typeof window !== 'undefined') {
  window.datedLinksModule = datedLinksModule;
}
