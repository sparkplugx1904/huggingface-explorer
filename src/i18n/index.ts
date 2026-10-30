// ──────────────────────────────────────────────────────────────────────────
// src/i18n/index.ts — Modul i18n & Terjemahan HuggingStudio
// Deteksi bahasa, persistensi sessionStorage, event reaktif 'localechange',
// dan fungsi t(key, fallback, vars) dengan traversal aman dot-notation.
// ──────────────────────────────────────────────────────────────────────────

import { id, type Translations } from './id';
import { en } from './en';

// Kunci penyimpanan preferensi bahasa di sessionStorage
const STORAGE_KEY = 'hs-locale';

// Peta seluruh terjemahan bahasa yang didukung
export const locales: Record<'id' | 'en', Translations> = { id, en };

// Locale aktif saat ini
let _currentLocale: 'id' | 'en' = detectLocale();
let _translations: Translations = locales[_currentLocale] ?? locales.id;

// ──────────────────────────────────────────────────────────────────────────
// detectLocale
// ──────────────────────────────────────────────────────────────────────────
/**
 * Mendeteksi locale pengguna:
 * 1. Prioritas utama: preferensi tersimpan di sessionStorage ('hs-locale').
 * 2. Prioritas kedua: navigator.language ('id' atau awalan 'id-*' → 'id', lainnya 'en').
 * 3. Fallback: 'en' untuk lingkungan non-browser (SSR/testing).
 */
export function detectLocale(): 'id' | 'en' {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === 'id' || stored === 'en') {
        return stored;
      }
    } catch {
      // sessionStorage mungkin diblokir oleh setelan privasi
    }
  }

  if (typeof navigator === 'undefined' || typeof navigator.language !== 'string') {
    return 'en';
  }

  const lang = navigator.language.toLowerCase();
  return lang === 'id' || lang.startsWith('id-') ? 'id' : 'en';
}

// ──────────────────────────────────────────────────────────────────────────
// setLocale
// ──────────────────────────────────────────────────────────────────────────
/**
 * Mengubah bahasa aktif, memperbarui kamus terjemahan, menyimpan preferensi
 * ke sessionStorage, dan memancarkan CustomEvent 'localechange'.
 */
export function setLocale(locale: 'id' | 'en'): void {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Abaikan error penyimpanan
    }
  }

  if (locale === _currentLocale && _translations) return;

  _currentLocale = locale;
  _translations = locales[locale] ?? locales.id;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('localechange', { detail: { locale } })
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// toggleLocale
// ──────────────────────────────────────────────────────────────────────────
/**
 * Berganti secara instan antara bahasa 'id' dan 'en'.
 */
export function toggleLocale(): 'id' | 'en' {
  const next: 'id' | 'en' = _currentLocale === 'id' ? 'en' : 'id';
  setLocale(next);
  return next;
}

// ──────────────────────────────────────────────────────────────────────────
// currentLocale
// ──────────────────────────────────────────────────────────────────────────
/**
 * Mengembalikan kode locale yang sedang aktif ('id' | 'en').
 */
export function currentLocale(): 'id' | 'en' {
  return _currentLocale;
}

// ──────────────────────────────────────────────────────────────────────────
// Helper: Traversal Objek Dot-Notation
// ──────────────────────────────────────────────────────────────────────────
function getNestedValue(obj: unknown, path: string): string | undefined {
  if (obj === null || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// t (translate)
// ──────────────────────────────────────────────────────────────────────────
/**
 * Mengakses nilai terjemahan via dot-notation dengan dukungan fallback dan interpolasi variabel.
 *
 * Pola Penggunaan:
 * - `t('viewer.rows')` → 'Baris' (id) / 'Rows' (en)
 * - `t('viewer.rows', 'Baris')` → Menggunakan terjemahan resmi, fallback jika kunci tidak ada
 * - `t('viewer.truncatedBanner', 'Dipotong...', { size: '10 MB', previewSize: '1 MB' })`
 *
 * Alur Resolusi:
 * 1. Ambil dari kamus locale aktif (`_translations`).
 * 2. Jika tidak ditemukan dan pemanggil menyediakan `fallback`, gunakan `fallback`.
 * 3. Jika `fallback` tidak diberikan, coba cari di kamus bahasa alternatif untuk
 *    menghindari UI menampilkan dot-notation mentah (`viewer.rows`).
 * 4. Jika masih tidak ditemukan di mana pun, kembalikan `key`.
 * 5. Substitusi seluruh placeholder `{varName}` dengan nilai dari objek `vars`.
 */
export function t(
  key: string,
  fallback?: string,
  vars?: Record<string, string | number>
): string {
  // 1. Coba ambil dari kamus locale aktif
  let val = getNestedValue(_translations, key);

  // 2. Jika tidak ditemukan pada locale aktif dan fallback disediakan, pakai fallback
  if (val === undefined && fallback !== undefined) {
    val = fallback;
  }

  // 3. Jika fallback tidak disediakan, cari di kamus bahasa alternatif (en <-> id)
  if (val === undefined) {
    const altLocale: 'id' | 'en' = _currentLocale === 'id' ? 'en' : 'id';
    val = getNestedValue(locales[altLocale], key);
  }

  // 4. Resolusi akhir: nilai yang ditemukan, atau fallback, atau key
  const result = val !== undefined ? val : (fallback ?? key);

  // 5. Substitusi token interpolasi {namaVariabel}
  if (vars && Object.keys(vars).length > 0) {
    return result.replace(/\{(\w+)\}/g, (match, varName) => {
      return varName in vars ? String(vars[varName]) : match;
    });
  }

  return result;
}

export { id, en };
export type { Translations } from './id';
