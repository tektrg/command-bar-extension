// sidepanel.js - shared entry point for popup and sidepanel surfaces
(function () {
  const runBootstrap = () => {
    const root = document.querySelector('[data-surface]') || document.getElementById('prd-stv-sidepanel-root');
    const surface = root?.dataset.surface || 'sidepanel';

    const config = {
      surface,
      rootId: root?.id || 'prd-stv-sidepanel-root',
      inputId: root?.dataset.inputId || 'prd-stv-sidepanel-input',
      listId: root?.dataset.listId || 'combined-list',
      shouldFocusInput: root?.dataset.focusInput ? root.dataset.focusInput === 'true' : true,
      shouldCloseOnOpen: root?.dataset.closeOnOpen ? root.dataset.closeOnOpen === 'true' : surface === 'popup',
      forceReinitialize: surface === 'popup',
    };

    const checkAndInitBootstrap = () => {
      if (!window.appBootstrap || typeof window.appBootstrap.init !== 'function') {
        // Wait for appBootstrap to be available
        setTimeout(checkAndInitBootstrap, 10);
        return;
      }
      window.appBootstrap.init(config);
    };

    checkAndInitBootstrap();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runBootstrap, { once: true });
  } else {
    runBootstrap();
  }
})();
