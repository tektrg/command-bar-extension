// History search and rendering module

const rendererHistory = {
  // Search recent history (last 30 days) with distinct URLs
  searchRecentHistory: async (query) => {
    if (!query || !query.trim()) return [];

    try {
      // Calculate date 30 days ago
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      // Search history with query
      const historyItems = await chrome.history.search({
        text: query.toLowerCase(),
        startTime: thirtyDaysAgo,
        maxResults: 100
      });

      if (!historyItems || historyItems.length === 0) return [];

      // Filter and deduplicate by URL, keeping the most recent visit
      const urlMap = new Map();

      historyItems.forEach(item => {
        if (item.url && item.title) {
          const existing = urlMap.get(item.url);
          if (!existing || (item.lastVisitTime && item.lastVisitTime > existing.lastVisitTime)) {
            urlMap.set(item.url, {
              id: item.id,
              title: item.title || 'Untitled',
              url: item.url,
              lastVisitTime: item.lastVisitTime || 0,
              visitCount: item.visitCount || 0,
              source: 'history',
              type: 'history'
            });
          }
        }
      });

      // Convert to array and sort by last visit time (most recent first)
      const distinctResults = Array.from(urlMap.values())
        .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
        .slice(0, 20); // Limit to top 20 results

      return distinctResults;
    } catch (error) {
      console.error('Failed to search history:', error);
      return [];
    }
  },

  // Render a history item
  renderHistoryItem: (historyItem, state) => {
    const div = document.createElement('div');
    div.className = 'prd-stv-cmd-item history-item';
    div.dataset.id = historyItem.id || historyItem.url;
    div.dataset.itemType = 'history';
    div.setAttribute('title', `${historyItem.title || 'Untitled'}\n${historyItem.url}`);

    const { ITEM_TYPES } = window.CONSTANTS;
    const favicon = window.utils.getFavicon({ type: ITEM_TYPES.HISTORY, url: historyItem.url });
    const query = state.query;

    // Format last visit time
    const timeAgo = historyItem.lastVisitTime ?
      window.utils.timeAgo(historyItem.lastVisitTime) : '';

    div.innerHTML = `
      <div style="display:flex;flex:1;align-items:center;min-width:0;">
        <img class="prd-stv-favicon" src="${favicon}" onerror="this.src='${window.CONSTANTS.ICONS.FALLBACK}'" />
        <div style="flex:1;min-width:0;">
          <span class="prd-stv-title">${window.utils.highlightMatches(historyItem.title || historyItem.url, query)}</span>
          ${timeAgo ? `<div style="font-size:11px;color:#888;margin-top:1px;">${timeAgo}</div>` : ''}
        </div>
      </div>
      <div class="prd-stv-item-controls">
        <button class="prd-stv-menu-btn" title="More options" data-history-url="${historyItem.url}">⋯</button>
      </div>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('prd-stv-menu-btn')) {
        e.stopPropagation();
        window.rendererUIActions.showHistoryContextMenu(e, historyItem, div);
      } else {
        window.openUrl(historyItem.url, e);
      }
    });

    return div;
  }
};

// Export for use in other modules
window.rendererHistory = rendererHistory;
