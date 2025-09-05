// background.js
// Track tabs where we've already inserted CSS to avoid duplicates
const cssInjectedTabs = new Set();

async function toggleCommandBar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Skip restricted URLs
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('chrome-extension://')) {
    console.warn('Cannot inject into restricted URL:', tab.url);
    return;
  }

  try {
    // Insert CSS once per tab lifecycle
    if (tab.id && !cssInjectedTabs.has(tab.id)) {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["style.css"],
      });
      cssInjectedTabs.add(tab.id);
    }

    // Inject content script (idempotent due to in-script guard)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    // toggle overlay
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE" });
  } catch (error) {
    console.error('Failed to inject content script or CSS:', error);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-command-bar") {
    await toggleCommandBar();
  }
});

// Enable opening side panel on action click with modifier key
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener(async (tab) => {
  // Default behavior: toggle command bar overlay
  await toggleCommandBar();
});

// Listen for tab events to update tab count
chrome.tabs.onCreated.addListener(() => {
  // Send message to all tabs to update their tab count
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(t => {
      if (t.id) {
        chrome.tabs.sendMessage(t.id, { type: "TAB_COUNT_CHANGED" }).catch(() => {});
      }
    });
  });
});

chrome.tabs.onRemoved.addListener(() => {
  // Send message to all tabs to update their tab count
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(t => {
      if (t.id) {
        chrome.tabs.sendMessage(t.id, { type: "TAB_COUNT_CHANGED" }).catch(() => {});
      }
    });
  });
});

// Clear CSS tracking when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  cssInjectedTabs.delete(tabId);
});

// handle search queries from content script
async function getBookmarkPath(node) {
  const parts = [];
  let current = node;
  while (current && current.parentId) {
    current = await chrome.bookmarks.get(current.parentId).then(arr => arr[0]).catch(() => null);
    if (current && current.title) parts.unshift(current.title);
    if (current && (!current.parentId || current.parentId === '0')) break;
  }
  return parts.join(' / ');
}


async function search(query) {
  const [tabs, bookmarkTree, historyItems] = await Promise.all([
    chrome.tabs.query({}),
    chrome.bookmarks.search({ query }),
    chrome.history.search({ text: query, maxResults: 20 })
  ]);

  const tabMatches = tabs.filter(t => (t.title && t.title.toLowerCase().includes(query)) || (t.url && t.url.toLowerCase().includes(query)));
  
  // Sort tabs by windowId first, then by index to maintain proper order
  tabMatches.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });
  
  const tabResults = tabMatches.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url,
    source: "tab",
    icon: t.favIconUrl && !t.favIconUrl.startsWith('chrome://') ? t.favIconUrl : '',
    type: 'tab',
    windowId: t.windowId,
    index: t.index
  }));

  // Resolve bookmark folder paths concurrently
  const bookmarkResults = await Promise.all(bookmarkTree.map(async (b) => {
    const folderPath = await getBookmarkPath(b);
    return { id: b.id, title: b.title, url: b.url, source: "bookmark", icon: '', folder: folderPath, type: 'bookmark' };
  }));

  const historyResults = historyItems.map(h => ({
    id: h.id,
    title: h.title,
    url: h.url,
    source: "history",
    icon: '',
    lastVisitTime: h.lastVisitTime,
    type: 'history'
  }));

  return [...tabResults, ...bookmarkResults, ...historyResults];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEARCH") {
    const activeId = sender.tab?.id;
    search(msg.query.toLowerCase()).then(results => {
      const filtered = activeId ? results.filter(r => !(r.type === 'tab' && r.id === activeId)) : results;
      sendResponse(filtered);
    });
    return true; // async
  } else if (msg.type === "RECENT") {
    chrome.tabs.query({}, (allTabs) => {
      const activeId = sender.tab?.id;
      const filtered = activeId ? allTabs.filter(t => t.id !== activeId) : allTabs;
      
      // Sort tabs by windowId first, then by index to maintain proper order
      filtered.sort((a, b) => {
        if (a.windowId !== b.windowId) {
          return a.windowId - b.windowId;
        }
        return a.index - b.index;
      });
      
      const recent = filtered.map(t => ({ 
        id: t.id, 
        title: t.title, 
        url: t.url, 
        source: "tab", 
        icon: t.favIconUrl && !t.favIconUrl.startsWith('chrome://') ? t.favIconUrl : '', 
        type: 'tab',
        windowId: t.windowId,
        index: t.index
      }));
      sendResponse(recent);
    });
    return true;
  } else if (msg.type === "DELETE") {
    const { item } = msg;
    if (item.type === 'tab') {
      chrome.tabs.remove(item.id);
    } else if (item.type === 'bookmark') {
      chrome.bookmarks.remove(item.id);
    } else if (item.type === 'history') {
      chrome.history.deleteUrl({ url: item.url });
    }
  } else if (msg.type === "OPEN") {
    const { item } = msg;
    if (item.source === "tab") {
      chrome.tabs.update(item.id, { active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab) return;
        chrome.windows.update(tab.windowId, { focused: true });
      });
    } else {
      chrome.tabs.create({ url: item.url });
    }
  } else if (msg.type === "GET_TAB_COUNT") {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({ count: tabs.length });
    });
    return true; // async
  }
});
