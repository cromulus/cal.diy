export const navigateInTopWindow = (url: string) => {
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // Cross-origin parents can block top-window navigation in some embed contexts.
  }

  window.location.href = url;
};
