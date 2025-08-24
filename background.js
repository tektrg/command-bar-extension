// background.js
async function toggleCommandBar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  // Skip restricted URLs
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('chrome-extension://')) {
    console.warn('Cannot inject into restricted URL:', tab.url);
    return;
  }
  
  try {
    // inject content script if not yet injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    // toggle overlay
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE" });
  } catch (error) {
    console.error('Failed to inject content script:', error);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-command-bar") {
    await toggleCommandBar();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await toggleCommandBar();
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

function getFavicon(pageUrl) {
  try {
    const { hostname } = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return '';
  }
}

async function search(query) {
  const results = [];
  // open tabs first
  const tabs = await chrome.tabs.query({});
  const tabMatches = tabs.filter(t => (t.title && t.title.toLowerCase().includes(query)) || (t.url && t.url.toLowerCase().includes(query)));
tabMatches.forEach(t => results.push({ id: t.id, title: t.title, url: t.url, source: "tab", icon: t.favIconUrl && !t.favIconUrl.startsWith('chrome://') ? t.favIconUrl : getFavicon(t.url), type: 'tab' }));
// bookmarks
  const bookmarkTree = await chrome.bookmarks.search({ query });
  for (const b of bookmarkTree) {
    const folderPath = await getBookmarkPath(b);
results.push({ id: b.id, title: b.title, url: b.url, source: "bookmark", icon: getFavicon(b.url), folder: folderPath, type: 'bookmark' });
  }
// history
  const historyItems = await chrome.history.search({ text: query, maxResults: 20 });
historyItems.forEach(h => results.push({ id: h.id, title: h.title, url: h.url, source: "history", icon: getFavicon(h.url), lastVisitTime: h.lastVisitTime, type: 'history' }));
  return results;
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
chrome.tabs.query({}, (tabs) => {
      const activeId = sender.tab?.id;
      if (activeId) {
        tabs = tabs.filter(t => t.id !== activeId);
      }
      // Sort by most recently accessed
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      const recent = tabs.slice(0, 5).map(t => ({ id: t.id, title: t.title, url: t.url, source: "tab", icon: t.favIconUrl && !t.favIconUrl.startsWith('chrome://') ? t.favIconUrl : getFavicon(t.url), type: 'tab' }));
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
  }
});
