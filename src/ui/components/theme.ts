// ──────────────────────────────────────────────────────────────
// Theme — light / dark toggle
// Obsidian Dark adalah default produk; preferensi disimpan di
// sessionStorage dengan key 'hs-theme'.
// ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'hs-theme';

/** Baca preferensi dari sessionStorage; default produk = dark. */
export function getCurrentTheme(): 'light' | 'dark' {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

/** Terapkan tema ke <html data-theme="..."> dan simpan. */
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
  sessionStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Inisialisasi tema saat app boot.
 * Baca dari sessionStorage / system preference dan terapkan ke <html>.
 */
export function initTheme(): void {
  applyTheme(getCurrentTheme());
}

/**
 * Toggle antara light dan dark, simpan ke sessionStorage.
 * Dispatch CustomEvent 'themechange' agar komponen lain bisa update ikon.
 */
export function toggleTheme(): void {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
}
