// ──────────────────────────────────────────────────────────────
// Command Palette — HuggingStudio (⌘K / Ctrl+K)
// Satu surface untuk lompat cepat: perintah global, riwayat repo
// aktif, dan quick-switch seluruh repositori pengguna.
// ──────────────────────────────────────────────────────────────

import { repoStore } from '../../state/repo-store';
import { navigate } from '../../router';
import { t } from '../../i18n';
import { toggleTheme } from './theme';
import {
  iconSearch,
  iconHome,
  iconModel,
  iconDataset,
  iconSpace,
  iconMoon,
  iconHistory,
} from './icons';

// ── Kontrak Item Palette ─────────────────────────────────────

interface PaletteItem {
  /** Label grup (badge seksi) tempat item ini berada */
  group: string;
  /** Markup SVG ikon */
  icon: string;
  /** Class warna kategorikal: palette-icon-c1..c6 */
  iconClass: string;
  /** Judul item */
  label: string;
  /** Meta mono di kanan label (owner, dsb) */
  hint?: string;
  /** Aksi saat item dipilih */
  run: () => void;
}

// ── Referensi DOM ────────────────────────────────────────────

let _overlay: HTMLElement | null = null;
let _input: HTMLInputElement | null = null;
let _list: HTMLElement | null = null;
let _items: PaletteItem[] = [];
let _filtered: PaletteItem[] = [];
let _active = 0;
let _restoreFocus: HTMLElement | null = null;
let _legendOverlay: HTMLElement | null = null;
let _keyHandlerBound = false;

/** Escape string agar aman disisipkan ke HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Konteks Halaman Aktif ────────────────────────────────────

/** Ekstrak repo aktif dari URL untuk item "Riwayat" kontekstual. */
function resolveCurrentRepoContext(): { historyHref: string; repoLabel: string } | null {
  const parts = window.location.pathname.split('/').filter(Boolean);

  // Pola /:owner/:repo/:type[/history]
  if (parts.length >= 3 && ['model', 'dataset', 'space'].includes(parts[2])) {
    return {
      historyHref: `/${parts[0]}/${parts[1]}/${parts[2]}/history`,
      repoLabel: `${parts[1]}`,
    };
  }

  // Pola /browse/:owner/:repo/:type
  if (parts[0] === 'browse' && parts.length >= 4) {
    return {
      historyHref: `/${parts[1]}/${parts[2]}/${parts[3]}/history`,
      repoLabel: `${parts[2]}`,
    };
  }

  return null;
}

// ── Bahan Item ───────────────────────────────────────────────

function buildItems(): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Item kontekstual: riwayat commit repo yang sedang dibuka
  const repoCtx = resolveCurrentRepoContext();
  if (repoCtx) {
    items.push({
      group: t('palette.groupContext', 'Konteks halaman'),
      icon: iconHistory(16),
      iconClass: 'palette-icon-c5',
      label: t('palette.openHistory', 'Buka riwayat commit'),
      hint: repoCtx.repoLabel,
      run: () => navigate(repoCtx.historyHref),
    });
  }

  // Perintah global
  items.push(
    {
      group: t('palette.groupCommands', 'Perintah'),
      icon: iconHome(16),
      iconClass: 'palette-icon-muted',
      label: t('palette.goHome', 'Beranda — daftar repositori'),
      run: () => navigate('/'),
    },
    {
      group: t('palette.groupCommands', 'Perintah'),
      icon: iconSearch(16),
      iconClass: 'palette-icon-muted',
      label: t('palette.goExplore', 'Jelajahi publik'),
      run: () => navigate('/explore'),
    },
    {
      group: t('palette.groupCommands', 'Perintah'),
      icon: iconMoon(16),
      iconClass: 'palette-icon-muted',
      label: t('palette.toggleTheme', 'Ganti tema gelap/terang'),
      run: () => {
        closePalette();
        toggleTheme();
      },
    },
    {
      group: t('palette.groupCommands', 'Perintah'),
      icon: iconSearch(16),
      iconClass: 'palette-icon-muted',
      label: t('palette.openShortcuts', 'Pintasan keyboard'),
      run: () => {
        closePalette();
        openShortcutLegend();
      },
    }
  );

  // Quick-switch repositori (mirror urutan rail: Datasets → Models → Spaces)
  const { models, datasets, spaces } = repoStore.value;

  for (const d of datasets) {
    items.push({
      group: t('palette.groupDatasets', 'Datasets'),
      icon: iconDataset(16),
      iconClass: 'palette-icon-c2',
      label: d.name,
      hint: d.owner + (d.isPrivate ? ' · private' : ''),
      run: () => navigate(`/${d.owner}/${d.name}/dataset`),
    });
  }
  for (const m of models) {
    items.push({
      group: t('palette.groupModels', 'Models'),
      icon: iconModel(16),
      iconClass: 'palette-icon-c1',
      label: m.name,
      hint: m.owner + (m.isPrivate ? ' · private' : ''),
      run: () => navigate(`/${m.owner}/${m.name}/model`),
    });
  }
  for (const s of spaces) {
    items.push({
      group: t('palette.groupSpaces', 'Spaces'),
      icon: iconSpace(16),
      iconClass: 'palette-icon-c3',
      label: s.name,
      hint: s.owner + (s.isPrivate ? ' · private' : ''),
      run: () => navigate(`/${s.owner}/${s.name}/space`),
    });
  }

  return items;
}

// ── Render Daftar ────────────────────────────────────────────

function filterItems(query: string): void {
  const q = query.trim().toLowerCase();
  _filtered = q
    ? _items.filter((it) =>
        `${it.label} ${it.hint ?? ''}`.toLowerCase().includes(q)
      )
    : [..._items];
  _active = 0;
  renderList();
}

function renderList(): void {
  if (!_list) return;

  if (_filtered.length === 0) {
    _list.innerHTML = `<div class="palette-empty">${esc(t('palette.noResults', 'Tidak ada hasil'))}</div>`;
    return;
  }

  const html: string[] = [];
  let lastGroup = '';

  _filtered.forEach((item, idx) => {
    if (item.group !== lastGroup) {
      html.push(`<div class="palette-group">${esc(item.group)}</div>`);
      lastGroup = item.group;
    }
    html.push(`
      <button
        type="button"
        class="palette-item${idx === _active ? ' active' : ''}"
        role="option"
        aria-selected="${idx === _active}"
        data-index="${idx}"
      >
        <span class="palette-item-icon ${item.iconClass}" aria-hidden="true">${item.icon}</span>
        <span class="palette-item-main">
          <span class="palette-item-label">${esc(item.label)}</span>
          ${item.hint ? `<span class="palette-item-hint">${esc(item.hint)}</span>` : ''}
        </span>
      </button>
    `);
  });

  _list.innerHTML = html.join('');
  _list.setAttribute('aria-activedescendant', `palette-item-${_active}`);
}

// ── Interaksi ────────────────────────────────────────────────

function moveActive(delta: number): void {
  if (_filtered.length === 0) return;
  const next = (_active + delta + _filtered.length) % _filtered.length;
  _active = next;
  renderList();
  const el = _list?.querySelector<HTMLElement>(`.palette-item[data-index="${_active}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}

function runActive(): void {
  const item = _filtered[_active];
  if (!item) return;
  closePalette();
  item.run();
}

// ── Siklus Hidup Overlay ─────────────────────────────────────

function ensurePaletteDom(): void {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.className = 'palette-overlay';
  _overlay.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="${esc(t('palette.ariaLabel', 'Palette perintah'))}">
      <div class="palette-input-row">
        <span class="palette-input-icon" aria-hidden="true">${iconSearch(16)}</span>
        <input
          class="palette-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-listbox"
          aria-autocomplete="list"
          placeholder="${esc(t('palette.placeholder', 'Ketik perintah atau nama repo…'))}"
        />
        <kbd class="palette-esc kbd" aria-hidden="true">esc</kbd>
      </div>
      <div class="palette-list" id="palette-listbox" role="listbox"></div>
      <div class="palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> ${esc(t('palette.navigate', 'navigasi'))}</span>
        <span><kbd>↵</kbd> ${esc(t('palette.select', 'terapkan'))}</span>
      </div>
    </div>
  `;

  _input = _overlay.querySelector('.palette-input');
  _list = _overlay.querySelector('.palette-list');

  _input?.addEventListener('input', () => filterItems(_input?.value ?? ''));
  _input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });

  _list?.addEventListener('click', (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const btn = target?.closest<HTMLElement>('.palette-item');
    if (!btn) return;
    const idx = Number(btn.dataset.index ?? '-1');
    if (Number.isNaN(idx)) return;
    _active = idx;
    runActive();
  });

  // Tutup bila klik di luar panel
  _overlay.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.target === _overlay) {
      closePalette();
    }
  });

  document.body.appendChild(_overlay);
}

export function openPalette(): void {
  ensurePaletteDom();
  if (!_overlay || !_input) return;

  _restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  _items = buildItems();
  _overlay.classList.add('open');
  document.body.classList.add('palette-open');
  filterItems('');
  _input.value = '';
  _input.focus();
}

export function closePalette(): void {
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
    _input = null;
    _list = null;
  }
  document.body.classList.remove('palette-open');
  if (_restoreFocus && document.contains(_restoreFocus)) {
    _restoreFocus.focus();
  }
  _restoreFocus = null;
}

export function togglePalette(): void {
  document.body.classList.contains('palette-open') ? closePalette() : openPalette();
}

export function isPaletteOpen(): boolean {
  return document.body.classList.contains('palette-open');
}

// ── Global Keybinding ────────────────────────────────────────

/** Daftarkan listener global Ctrl/⌘+K sekali di lifecycle app. */
export function initCommandPalette(): void {
  if (_keyHandlerBound) return;
  _keyHandlerBound = true;

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      togglePalette();
      return;
    }
    if (e.key === 'Escape' && isPaletteOpen()) {
      e.preventDefault();
      closePalette();
    }
  });
}

// ── Shortcut Legend (momen discoverability "?") ──────────────

interface ShortcutRow {
  action: string;
  keys: string[];
}

/** Baris legenda pintasan — dihasilkan saat render agar ikut locale aktif. */
function shortcutRows(): ShortcutRow[] {
  return [
    { action: t('shortcuts.openPalette', 'Buka / tutup palette'), keys: ['Ctrl', 'K'] },
    { action: t('shortcuts.navigateItems', 'Navigasi item palette'), keys: ['↑', '↓'] },
    { action: t('shortcuts.applyItem', 'Terapkan item'), keys: ['↵'] },
    { action: t('shortcuts.closeOverlay', 'Tutup overlay'), keys: ['Esc'] },
  ];
}

export function openShortcutLegend(): void {
  if (_legendOverlay) return;

  _legendOverlay = document.createElement('div');
  _legendOverlay.className = 'shortcut-overlay';
  _legendOverlay.innerHTML = `
    <div class="shortcut-sheet" role="dialog" aria-modal="true" aria-label="${esc(t('shortcuts.ariaLabel', 'Pintasan keyboard'))}">
      <h2 class="shortcut-sheet-title">${esc(t('shortcuts.title', 'Pintasan Keyboard'))}</h2>
      <div class="shortcut-grid">
        ${shortcutRows().map(
          (row) => `
          <div class="shortcut-row">
            <span>${esc(row.action)}</span>
            <span class="shortcut-keys">${row.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>
          </div>
        `
        ).join('')}
      </div>
    </div>
  `;

  _legendOverlay.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.target === _legendOverlay) {
      closeShortcutLegend();
    }
  });

  document.body.appendChild(_legendOverlay);
  const sheet = _legendOverlay.querySelector<HTMLElement>('.shortcut-sheet');
  sheet?.focus();
  sheet?.setAttribute('tabindex', '-1');
  sheet?.focus();
}

export function closeShortcutLegend(): void {
  _legendOverlay?.remove();
  _legendOverlay = null;
}
