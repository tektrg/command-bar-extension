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
async function search(query) {
  const results = [];
  // open tabs first
  const tabs = await chrome.tabs.query({});
  const tabMatches = tabs.filter(t => (t.title && t.title.toLowerCase().includes(query)) || (t.url && t.url.toLowerCase().includes(query)));
tabMatches.forEach(t => results.push({ id: t.id, title: t.title, url: t.url, source: "tab", icon: t.favIconUrl || `chrome://favicon/${t.url}` }));
  // bookmarks
  const bookmarkTree = await chrome.bookmarks.search({ query });
bookmarkTree.forEach(b => results.push({ id: b.id, title: b.title, url: b.url, source: "bookmark", icon: `chrome://favicon/${b.url}` }));
  // history
  const historyItems = await chrome.history.search({ text: query, maxResults: 20 });
historyItems.forEach(h => results.push({ id: h.id, title: h.title, url: h.url, source: "history", icon: `chrome://favicon/${h.url}` }));
  return results;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEARCH") {
    search(msg.query.toLowerCase()).then(sendResponse);
    return true; // async
  } else if (msg.type === "RECENT") {
    chrome.tabs.query({}, (tabs) => {
      // Sort by most recently accessed
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
const recent = tabs.slice(0, 5).map(t => ({ id: t.id, title: t.title, url: t.url, source: "tab", icon: t.favIconUrl || `chrome://favicon/${t.url}` }));
      sendResponse(recent);
    });
    return true;
  } else if (msg.type === "OPEN") {
    const { item } = msg;
    if (item.source === "tab") {
      chrome.tabs.update(item.id, { active: true });
    } else {
      chrome.tabs.create({ url: item.url });
    }
  }
});
