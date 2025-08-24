// content.js
(() => {
  if (window.__cmdBarInjected) return;
  window.__cmdBarInjected = true;

  let overlay, input, listEl, items = [], selectedIdx = 0;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'cmd-bar-overlay';

    const container = document.createElement('div');
    container.id = 'cmd-bar-container';

    input = document.createElement('input');
    input.id = 'cmd-bar-input';
    input.type = 'text';
    input.placeholder = 'Type to search tabs, bookmarks, history...';

    listEl = document.createElement('div');
    listEl.id = 'cmd-bar-list';

    container.appendChild(input);
    container.appendChild(listEl);
    overlay.appendChild(container);

    document.body.appendChild(overlay);

    // listeners
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', onInput);
    input.focus();

    // initial recent
    chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
      items = res || [];
      selectedIdx = 0;
      renderList();
    });
  }

  function destroyOverlay() {
    overlay?.remove();
    overlay = null;
  }

  function toggleOverlay() {
    if (overlay) {
      destroyOverlay();
    } else {
      createOverlay();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      destroyOverlay();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % items.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + items.length) % items.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) {
        chrome.runtime.sendMessage({ type: 'OPEN', item });
        destroyOverlay();
      }
    }
  }

  function onInput(e) {
    const q = input.value.trim();
    if (!q) {
      chrome.runtime.sendMessage({ type: 'RECENT' }, (res) => {
        items = res || [];
        selectedIdx = 0;
        renderList();
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'SEARCH', query: q }, (res) => {
      items = res || [];
      selectedIdx = 0;
      renderList();
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'cmd-item' + (idx === selectedIdx ? ' active' : '');
      div.innerHTML = `
        <div style="display:flex;align-items:center;">
          <img class="favicon" src="${it.icon || 'chrome://favicon'}" onerror="this.style.visibility='hidden'" />
          <div style="display:flex;flex-direction:column;">
            <span>${escapeHtml(it.title || it.url)}</span>
            <span class="url">${escapeHtml(it.url)}</span>
          </div>
        </div>
      `;
      div.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN', item: it });
        destroyOverlay();
      });
      listEl.appendChild(div);
    });
  }

  function escapeHtml(str) {
    return str?.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])) || '';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE') {
      toggleOverlay();
    }
  });
})();

