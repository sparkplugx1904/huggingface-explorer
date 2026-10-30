// ──────────────────────────────────────────────────────────────────────────
// src/ui/components/bottom-sheet.ts — Bottom Sheet Komponen Khusus Ponsel
// Menu aksi dan pemilih folder "Pindahkan ke..." yang nyaman untuk layar sentuh.
// ──────────────────────────────────────────────────────────────────────────

import type { FileEntry } from '../../api/tree';
import { createFocusTrap } from './modal';
import { iconFolder } from './icons';
export interface BottomSheetAction {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

/** Sanitasi string */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Membuka bottom sheet aksi untuk berkas atau folder di layar sentuh ponsel.
 */
export function openActionBottomSheet(
  title: string,
  subtitle: string,
  actions: BottomSheetAction[]
): () => void {
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'hs-bottom-sheet-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
    z-index: var(--hs-z-modal, 300); display: flex; flex-direction: column;
    justify-content: flex-end; opacity: 0; transition: opacity 0.2s ease;
  `;

  const sheet = document.createElement('div');
  sheet.className = 'hs-bottom-sheet';
  sheet.tabIndex = -1;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.style.cssText = `
    background: var(--hs-surface, #fff); border-radius: 16px 16px 0 0;
    max-height: 80vh; overflow-y: auto; padding: 1rem 1.25rem 1.75rem;
    box-shadow: var(--hs-shadow-lg); transform: translateY(100%);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  // Handle bar kecil di atas
  const handleBar = `
    <div style="width: 36px; height: 4px; background: var(--hs-border, #e5e5e5);
                border-radius: 2px; margin: 0 auto 1rem;"></div>
  `;

  const headerHtml = `
    ${handleBar}
    <div style="margin-bottom: 1rem; border-bottom: 1px solid var(--hs-border, #eee); padding-bottom: 0.75rem;">
      <h3 style="font-size: 1rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${esc(title)}
      </h3>
      <p style="font-size: 0.8rem; color: var(--hs-text-muted, #777); margin-top: 0.15rem; font-family: monospace;">
        ${esc(subtitle)}
      </p>
    </div>
  `;

  sheet.innerHTML = headerHtml;

  const actionsList = document.createElement('div');
  actionsList.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

  const trap = createFocusTrap({
    container: sheet,
    returnFocus: triggerEl,
    onEscape: () => close(),
  });

  function close(): void {
    trap.deactivate();
    overlay.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => overlay.remove(), 250);
  }

  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.style.cssText = `
      display: flex; align-items: center; gap: 0.875rem; width: 100%;
      min-height: 48px; padding: 0.625rem 1rem; border: none; background: var(--hs-surface-2, #f9f9f9);
      border-radius: var(--hs-radius, 8px); font-size: 0.95rem; text-align: left; cursor: pointer;
      color: ${act.danger ? 'var(--hs-error, #ef4444)' : 'var(--hs-text, #111)'};
      font-weight: ${act.danger ? '600' : '400'};
    `;
    btn.innerHTML = `<span style="font-size: 1.25rem">${act.icon}</span> <span>${esc(act.label)}</span>`;

    btn.addEventListener('click', () => {
      close();
      act.onClick();
    });

    actionsList.appendChild(btn);
  }

  sheet.appendChild(actionsList);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Animasi masuk
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
  });

  // Tutup jika klik backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  return close;
}

// ── Pemilih Folder "Pindahkan ke..." ───────────────────────────────────────

/**
 * Membuka dialog pemilih folder untuk memindahkan berkas/folder.
 * Tersedia di desktop maupun mobile.
 */
export function openMoveToFolderPicker(
  sourceItem: FileEntry,
  allTreeFiles: FileEntry[],
  onMoveTo: (targetFolder: string) => void
): void {
  // Kumpulkan semua direktori unik dalam repo
  const folderSet = new Set<string>();
  folderSet.add(''); // Root folder

  for (const item of allTreeFiles) {
    if (item.type === 'directory') {
      folderSet.add(item.path);
    } else {
      const parts = item.path.split('/');
      parts.pop(); // buang nama berkas
      let current = '';
      for (const p of parts) {
        current = current ? `${current}/${p}` : p;
        folderSet.add(current);
      }
    }
  }

  // Buang direktori asal jika yang dipindah adalah direktori (tidak bisa pindah ke dalam diri sendiri)
  const validFolders = Array.from(folderSet).filter((f) => {
    if (sourceItem.type === 'directory') {
      if (f === sourceItem.path || f.startsWith(`${sourceItem.path}/`)) {
        return false;
      }
    }
    return true;
  });

  validFolders.sort((a, b) => a.localeCompare(b));

  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'hs-folder-picker-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
    z-index: var(--hs-z-modal, 300); display: flex; align-items: center;
    justify-content: center; padding: 1rem;
  `;

  const card = document.createElement('div');
  card.className = 'card';
  card.tabIndex = -1;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Pindahkan ke Folder');
  card.style.cssText = `
    width: 100%; max-width: 440px; background: var(--hs-surface, #fff);
    border-radius: var(--hs-radius-lg, 12px); padding: 1.25rem;
    box-shadow: var(--hs-shadow-lg); display: flex; flex-direction: column; max-height: 80vh;
  `;
  let selectedFolder = '';

  const headerHtml = `
    <div style="margin-bottom: 1rem;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem;">Pindahkan ke Folder</h3>
      <p style="font-size: 0.85rem; color: var(--hs-text-muted);">
        Item: <strong style="font-family: monospace;">${esc(sourceItem.name)}</strong>
      </p>
    </div>
  `;

  card.innerHTML = headerHtml;

  const folderList = document.createElement('div');
  folderList.style.cssText = `
    flex: 1; overflow-y: auto; border: 1px solid var(--hs-border, #eee);
    border-radius: var(--hs-radius, 8px); padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;
    margin-bottom: 1.25rem; min-height: 180px;
  `;

  function renderList(): void {
    folderList.innerHTML = '';
    for (const folder of validFolders) {
      const isSelected = folder === selectedFolder;
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
        border-radius: var(--hs-radius, 6px); cursor: pointer; font-size: 0.9rem;
        background: ${isSelected ? 'var(--hs-surface-2, #1e293b)' : 'transparent'};
        color: ${isSelected ? 'var(--hs-primary, #f59e0b)' : 'var(--hs-text, inherit)'};
        font-weight: ${isSelected ? '600' : '400'};
      `;
      row.innerHTML = `
        <span style="display:flex;align-items:center">${iconFolder(16)}</span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${folder === '' ? '/ (Akar repositori)' : `/${esc(folder)}`}
        </span>
      `;
      row.addEventListener('click', () => {
        selectedFolder = folder;
        renderList();
      });
      folderList.appendChild(row);
    }
  }

  renderList();
  card.appendChild(folderList);

  const footer = document.createElement('div');
  footer.style.cssText = 'display: flex; justify-content: flex-end; gap: 0.75rem;';

  const trap = createFocusTrap({
    container: card,
    returnFocus: triggerEl,
    onEscape: () => close(),
  });

  function close(): void {
    trap.deactivate();
    overlay.remove();
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Batal';
  cancelBtn.addEventListener('click', close);

  const moveBtn = document.createElement('button');
  moveBtn.type = 'button';
  moveBtn.className = 'btn btn-primary';
  moveBtn.textContent = 'Pindahkan ke Sini';
  moveBtn.addEventListener('click', () => {
    close();
    onMoveTo(selectedFolder);
  });

  footer.append(cancelBtn, moveBtn);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
