(function () {
  const MAIN_SCRIPT_ID = 'prd-stv-main-app';

  function appendMainScript() {
    if (document.getElementById(MAIN_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = MAIN_SCRIPT_ID;
    script.src = 'sidepanel.js';
    document.body.appendChild(script);
  }

  async function loadShellFromTemplate() {
    const templateEl = document.getElementById('prd-stv-shell-template');
    if (!templateEl) {
      appendMainScript();
      return;
    }

    const src = templateEl.getAttribute('src');
    if (!src) {
      console.error('Shared shell template missing src attribute');
      appendMainScript();
      return;
    }

    const surface = templateEl.dataset.surface || 'sidepanel';
    const closeOnOpen = templateEl.dataset.closeOnOpen ?? (surface === 'popup' ? 'true' : 'false');
    const focusInput = templateEl.dataset.focusInput ?? 'true';

    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(src)
      : src;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const templateHtml = await response.text();
      const surfaceHtml = templateHtml
        .replace(/{{surface}}/g, surface)
        .replace(/{{closeOnOpen}}/g, closeOnOpen)
        .replace(/{{focusInput}}/g, focusInput);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = surfaceHtml.trim();
      const fragment = document.createDocumentFragment();
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
      templateEl.replaceWith(fragment);
    } catch (error) {
      console.error('Failed to load shared shell:', error);
    } finally {
      appendMainScript();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadShellFromTemplate, { once: true });
  } else {
    loadShellFromTemplate();
  }
})();
