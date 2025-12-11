// Utility functions for the sidepanel extension

const utils = {
  debounce: (fn, ms) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  timeAgo: (ms) => {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const units = [
      { label: 'd', value: Math.floor(diff / (1000 * 60 * 60 * 24)) },
      { label: 'h', value: Math.floor(diff / (1000 * 60 * 60)) },
      { label: 'm', value: Math.floor(diff / (1000 * 60)) },
      { label: 's', value: Math.floor(diff / 1000) }
    ];
    const unit = units.find(u => u.value > 0);
    return unit ? `${unit.value}${unit.label} ago` : '';
  },

  escapeHtml: (str) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return (str || '').toString().replace(/[&<>"']/g, (c) => map[c]);
  },

  highlightMatches: (text, query) => {
    if (!query) return utils.escapeHtml(text);
    const escaped = utils.escapeHtml(text);
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(safeQuery, 'ig');
      return escaped.replace(regex, (match) => `<span class="prd-stv-hl">${match}</span>`);
    } catch { 
      return escaped; 
    }
  },

  truncateMiddle: (str, maxLen = 60) => {
    if (!str || str.length <= maxLen) return str || '';
    const part = Math.floor((maxLen - 3) / 2);
    return str.slice(0, part) + '...' + str.slice(-part);
  },

  getFavicon: (item) => {
    const { ICONS, ITEM_TYPES } = window.CONSTANTS;
    if (item.type === ITEM_TYPES.TAB) return item.icon || ICONS.FALLBACK;
    if ((item.type === ITEM_TYPES.BOOKMARK || item.type === ITEM_TYPES.HISTORY) && item.url) {
      try {
        const hostname = new URL(item.url).hostname;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
      } catch { 
        return ICONS.FALLBACK; 
      }
    }
    return ICONS.FALLBACK;
  },

  getTypeIcon: (type) => {
    const { ICONS, ITEM_TYPES } = window.CONSTANTS;
    const iconMap = {
      [ITEM_TYPES.BOOKMARK]: `<img src="${ICONS.BOOKMARK}" class="prd-stv-type-icon" />`,
      [ITEM_TYPES.HISTORY]: `<img src="${ICONS.HISTORY}" class="prd-stv-type-icon" />`
    };
    return iconMap[type] || '';
  },

  showToast: (message, duration = 2000) => {
    const existingToast = document.getElementById('prd-stv-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'prd-stv-toast';
    toast.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #333; color: #fff; padding: 8px 16px; border-radius: 15px;
      font-size: 14px; z-index: 10000; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
};

// Export for use in other modules
window.utils = utils;
