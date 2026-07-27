(function initializeTheme() {
  const storageKey = 'heys:genda-tests:v1:theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const validPreferences = new Set(['light', 'dark']);

  function readPreference() {
    try {
      const saved = localStorage.getItem(storageKey);
      return validPreferences.has(saved) ? saved : (media.matches ? 'dark' : 'light');
    } catch {
      return media.matches ? 'dark' : 'light';
    }
  }

  function apply(preference) {
    const resolved = validPreferences.has(preference) ? preference : (media.matches ? 'dark' : 'light');
    document.documentElement.dataset.themePreference = resolved;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#11131D' : '#434587');
    window.dispatchEvent(new CustomEvent('genda-theme-change', { detail: { preference: resolved, resolved } }));
  }

  function setPreference(preference) {
    const normalized = validPreferences.has(preference) ? preference : (media.matches ? 'dark' : 'light');
    try {
      localStorage.setItem(storageKey, normalized);
    } catch {
      // The theme still works for this page when storage is unavailable.
    }
    apply(normalized);
  }

  window.GenDATheme = { apply, readPreference, setPreference, storageKey };
  apply(readPreference());
}());
