// Folder state management module for the sidepanel extension
const folderState = {
  toggle: async (id, state, storage, renderer) => {
    if (state.expanded.has(id)) {
      state.expanded.delete(id);
    } else {
      state.expanded.add(id);
    }
    await storage.saveExpandedFolders(state);
    renderer.render(state, window.elements);
  },

  ensureExpanded: async (id, state, storage) => {
    if (!state.expanded.has(id)) {
      state.expanded.add(id);
      await storage.saveExpandedFolders(state);
    }
  },

  isExpanded: (id, state) => state.expanded.has(id)
};

// Export for use in other modules
window.folderState = folderState;