// ──────────────────────────────────────────────────────────────────────────
// src/ui/pages/file-manager.ts — Halaman File Manager HuggingStudio
// Penjelajah berkas ala Google Drive + Git, drag-and-drop universal, staged commit.
// Desain modern berstandar developer tool dengan ikon SVG penuh.
// ──────────────────────────────────────────────────────────────────────────

import type { FileEntry } from '../../api/tree';
import type { RepoType, RepoInfo } from '../../api/types';
import type { NameConflictResolution } from '../components/dialogs';

import { navigate } from '../../router';
import {
  fetchDirectoryContents,
  fetchFullRepoTree,
  getRepoHeadCommit,
  downloadFolderAsZip,
  triggerFileDownload,
} from '../../api/tree';
import { getRepoInfo } from '../../api/repos';
import {
  pendingChanges,
  stageAddFile,
  stageCreateFolder,
  stageDeleteEntry,
  stageMoveEntry,
  stageRenameEntry,
  discardAllChanges,
  generateCommitMessage,
  applyStagedOverlay,
} from '../../state/pending-changes';
import { executeCombinedCommit } from '../../api/commit';
import { appStore } from '../../state/app-state';
import { showToast } from '../components/toast';
import { createSpinner } from '../components/spinner';
import { createEmptyState } from '../components/empty-state';
import {
  showDeleteConfirmDialog,
  showCommitReviewDialog,
  showCommitConflictDialog,
  showCreateFolderDialog,
  showRenameDialog,
  showNameConflictDialog,
  showKeyboardShortcutsDialog,
} from '../components/dialogs';
import { isAnyModalOpen } from '../components/modal';
import { openActionBottomSheet, openMoveToFolderPicker } from '../components/bottom-sheet';
import { openFileViewerModal } from '../viewers/viewer-modal';
import { registerLazyThumbnail } from '../viewers/thumbnail-cache';
import { openRecentlyDeletedModal } from '../components/recently-deleted';
import {
  iconFolder,
  iconFile,
  iconModel,
  iconDataset,
  iconSearch,
  iconGrid,
  iconList,
  iconUpload,
  iconDownload,
  iconTrash,
  iconEdit,
  iconMove,
  iconCheck,
  iconRefresh,
  iconChevronRight,
  iconChevronDown,
  iconArrowLeft,
  iconMore,
  iconPlus,
  iconHome,
  iconClose,
  iconFileText,
  iconFileImage,
  iconFileArchive,
  iconAlertCircle,
  iconEye,
  iconHistory,
  iconRotateCcw,
} from '../components/icons';

// ── Utilitas Bantuan ──────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const EXT_MODEL_RECORD: Record<string, true> = {
  safetensors: true, bin: true, onnx: true, pt: true, pth: true, ckpt: true, h5: true, weights: true, tflite: true,
};
const EXT_DATA_RECORD: Record<string, true> = {
  json: true, yaml: true, yml: true, csv: true, tsv: true, parquet: true, arrow: true, toml: true, xml: true,
};
const EXT_DOC_RECORD: Record<string, true> = {
  md: true, markdown: true, txt: true, rst: true, log: true, doc: true, docx: true,
};
const EXT_MEDIA_RECORD: Record<string, true> = {
  png: true, jpg: true, jpeg: true, gif: true, webp: true, svg: true, mp4: true, webm: true, mov: true, mp3: true, wav: true, ogg: true,
};
const EXT_ARCHIVE_RECORD: Record<string, true> = {
  zip: true, tar: true, gz: true, '7z': true, rar: true, bz2: true,
};

/**
 * Mengembalikan elemen SVG icon bersih dengan palet warna sesuai spesifikasi domain:
 * - Python `.py`: Blue / Yellow accent
 * - Model/Weights `.safetensors`, `.bin`, `.onnx`: Warm Amber
 * - Config/Data `.json`, `.yaml`, `.csv`, `.parquet`: Emerald Green
 * - Dokumen `.md`, `.txt`, `.pdf`: Slate / Crimson
 * - Media `.png`, `.jpg`, `.mp4`: Purple
 * - Folder: Amber folder SVG
 */
function getFileIconSvg(name: string, isDirectory: boolean, size = 20, isOpen = false): string {
  if (isDirectory) {
    if (isOpen) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fm-icon-folder-open"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20l-2 10H4l-2-10Z"/></svg>`;
    }
    return iconFolder(size, 'fm-icon-folder');
  }

  const dotIndex = name.lastIndexOf('.');
  const ext = dotIndex > 0 && dotIndex < name.length - 1 ? name.slice(dotIndex + 1).toLowerCase() : '';

  // Python: Blue / Yellow accent
  if (ext === 'py' || ext === 'pyw' || ext === 'ipynb') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fm-ext-python"><path stroke="#3b82f6" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline stroke="#eab308" points="14 2 14 8 20 8"/><path stroke="#3b82f6" d="m10 13-2 2 2 2"/><path stroke="#eab308" d="m14 17 2-2-2-2"/></svg>`;
  }

  // Model / Weights: Warm Amber (.safetensors, .bin, .onnx, .pt, .ckpt, .h5, etc.)
  if (EXT_MODEL_RECORD[ext]) {
    return iconModel(size, 'fm-ext-model');
  }

  // Config / Data: Emerald Green (.json, .yaml, .yml, .csv, .parquet, .tsv, etc.)
  if (EXT_DATA_RECORD[ext]) {
    return iconDataset(size, 'fm-ext-data');
  }

  // PDF Document: Crimson
  if (ext === 'pdf') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fm-ext-pdf"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`;
  }

  // Text / Markdown Documents: Slate (.md, .txt, .rst, .log)
  if (EXT_DOC_RECORD[ext]) {
    return iconFileText(size, 'fm-ext-doc');
  }

  // Media: Purple (.png, .jpg, .jpeg, .gif, .webp, .svg, .mp4, .webm, .mov, .mp3, etc.)
  if (EXT_MEDIA_RECORD[ext]) {
    return iconFileImage(size, 'fm-ext-media');
  }

  // Archives: Sky (.zip, .tar, .gz, .7z)
  if (EXT_ARCHIVE_RECORD[ext]) {
    return iconFileArchive(size, 'fm-ext-archive');
  }

  // Default: Slate
  return iconFile(size, 'fm-ext-default');
}

let _activeKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
let _activePendingChangesUnsub: (() => void) | null = null;

// ── Komponen Halaman File Manager ─────────────────────────────────────────

export function renderFileManagerPage(
  container: HTMLElement,
  owner: string,
  repoName: string,
  repoType: RepoType = 'model',
  initialPath: string = ''
): void {
  const repoId = `${owner}/${repoName}`;
  const token = appStore.value.auth.token;

  // State lokal halaman
  let currentPath = initialPath.replace(/^\/+|\/+$/g, '');
  let entries: FileEntry[] = [];
  let fullTree: FileEntry[] = [];
  let repoMetadata: RepoInfo | null = null;
  let headCommitSha = '';
  let isLoading = false;
  let viewMode: 'grid' | 'list' = (sessionStorage.getItem('hs:fm:view') as 'grid' | 'list') ?? 'grid';
  let sortBy: 'name' | 'size' | 'date' = 'name';
  let sortAsc = true;
  let searchQuery = '';
  const selectedPaths = new Set<string>();

  // Root container
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'fm-layout';
  container.appendChild(root);

  // 1. Header & Breadcrumb
  const headerEl = document.createElement('div');
  headerEl.className = 'fm-header';
  root.appendChild(headerEl);

  // 2. Workspace (Sidebar Tree + File Panel)
  const workspaceEl = document.createElement('div');
  workspaceEl.className = 'fm-workspace';
  root.appendChild(workspaceEl);

  // Mobile Tree Backdrop
  const treeBackdropEl = document.createElement('div');
  treeBackdropEl.className = 'fm-tree-backdrop';
  workspaceEl.appendChild(treeBackdropEl);

  // Tree Sidebar
  const treePanelEl = document.createElement('div');
  treePanelEl.className = 'fm-tree-panel';
  workspaceEl.appendChild(treePanelEl);

  // Content Panel
  const contentPanelEl = document.createElement('div');
  contentPanelEl.className = 'fm-content-panel';
  contentPanelEl.setAttribute('role', 'region');
  contentPanelEl.setAttribute('aria-label', 'Penjelajah Berkas Repositori');
  workspaceEl.appendChild(contentPanelEl);
  // OS Dropzone overlay
  const dropOverlayEl = document.createElement('div');
  dropOverlayEl.className = 'fm-drop-overlay';
  dropOverlayEl.innerHTML = `
    <div class="fm-drop-overlay-box">
      <span class="fm-drop-overlay-icon">${iconUpload(30)}</span>
      <span>Lepaskan berkas di sini untuk menambahkan</span>
    </div>
  `;
  contentPanelEl.appendChild(dropOverlayEl);

  // Floating Staged Changes Bar (Glassmorphism dock)
  const stagedBarEl = document.createElement('div');
  stagedBarEl.className = 'fm-staged-bar';
  root.appendChild(stagedBarEl);

  function openMobileTree(): void {
    treePanelEl.classList.add('mobile-open');
    treeBackdropEl.classList.add('open');
  }

  function closeMobileTree(): void {
    treePanelEl.classList.remove('mobile-open');
    treeBackdropEl.classList.remove('open');
  }

  treeBackdropEl.addEventListener('click', closeMobileTree);

  // ── Render Header & Breadcrumb ──────────────────────────────────────────

  function renderHeader(): void {
    const isPrivate = repoMetadata?.isPrivate ?? false;
    const badgeType = repoType.toUpperCase();

    headerEl.innerHTML = `
      <div class="fm-header-top">
        <div class="fm-header-info">
          <a href="/${esc(owner)}" class="btn btn-ghost btn-sm" style="padding:0.35rem 0.5rem;display:inline-flex;align-items:center" title="Kembali ke profil">
            ${iconArrowLeft(16)}
          </a>
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <h1 class="fm-repo-title">
              <span class="fm-repo-owner">${esc(owner)}/</span><span>${esc(repoName)}</span>
            </h1>
            <span class="badge badge-${esc(repoType)}">${badgeType}</span>
            ${isPrivate ? '<span class="badge badge-private">Private</span>' : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <button id="btn-toggle-tree" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:0.35rem" title="Buka panel folder">
            ${iconFolder(15)} <span>Folder</span>
          </button>
          <button id="btn-refresh" class="btn btn-ghost btn-sm" style="padding:0.35rem 0.5rem;display:inline-flex;align-items:center" title="Muat ulang isi folder">
            ${iconRefresh(16)}
          </button>
        </div>
      </div>
      <nav class="fm-breadcrumb" id="fm-breadcrumb-bar" aria-label="Jalur folder"></nav>
      <div class="fm-toolbar" id="fm-toolbar-bar"></div>
      <div class="fm-selection-bar" id="fm-selection-bar" style="display:none"></div>
    `;

    headerEl.querySelector('#btn-refresh')?.addEventListener('click', () => {
      void loadDirectory(currentPath, true);
    });

    headerEl.querySelector('#btn-toggle-tree')?.addEventListener('click', () => {
      openMobileTree();
    });

    renderBreadcrumb();
    renderToolbar();
    renderSelectionBar();
  }

  function renderBreadcrumb(): void {
    const bar = headerEl.querySelector<HTMLElement>('#fm-breadcrumb-bar');
    if (!bar) return;
    bar.innerHTML = '';

    // Root crumb
    const isRoot = currentPath === '';
    const rootCrumb = document.createElement('div');
    rootCrumb.className = `fm-crumb ${isRoot ? 'active' : ''}`;
    rootCrumb.innerHTML = `${iconHome(15)} <span>Akar</span>`;
    rootCrumb.dataset.path = '';
    attachCrumbDropTarget(rootCrumb, '');
    rootCrumb.addEventListener('click', () => {
      if (currentPath !== '') void navigateToFolder('');
    });
    bar.appendChild(rootCrumb);

    if (isRoot) return;

    const parts = currentPath.split('/');
    let accum = '';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      accum = accum ? `${accum}/${p}` : p;
      const targetPath = accum;
      const isLast = i === parts.length - 1;

      const sep = document.createElement('span');
      sep.className = 'fm-crumb-sep';
      sep.innerHTML = iconChevronRight(12);
      bar.appendChild(sep);

      const crumb = document.createElement('div');
      crumb.className = `fm-crumb ${isLast ? 'active' : ''}`;
      crumb.innerHTML = `${iconFolder(14)} <span>${esc(p)}</span>`;
      crumb.dataset.path = targetPath;
      attachCrumbDropTarget(crumb, targetPath);

      if (!isLast) {
        crumb.addEventListener('click', () => void navigateToFolder(targetPath));
      }
      bar.appendChild(crumb);
    }
  }

  function renderToolbar(): void {
    const bar = headerEl.querySelector<HTMLElement>('#fm-toolbar-bar');
    if (!bar) return;

    bar.innerHTML = `
      <div class="fm-toolbar-left">
        <div class="fm-upload-dropdown">
          <button id="btn-upload" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:0.4rem" type="button">
            ${iconUpload(15)} <span>Unggah</span> ${iconChevronDown(13)}
          </button>
          <div id="upload-menu" class="fm-upload-menu">
            <button id="menu-upload-file" class="fm-upload-menu-item" type="button">
              ${iconFile(15)} <span>Unggah Berkas</span>
            </button>
            <button id="menu-upload-folder" class="fm-upload-menu-item" type="button">
              ${iconFolder(15)} <span>Unggah Folder</span>
            </button>
          </div>
        </div>

        <button id="btn-create-folder" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:0.4rem" type="button">
          ${iconPlus(15)} <span>Folder Baru</span>
        </button>

        <button id="btn-repo-history" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:0.4rem" type="button" title="Lihat riwayat commit repositori">
          ${iconHistory(15)} <span>Riwayat</span>
        </button>

        <button id="btn-recently-deleted" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:0.4rem" type="button" title="Lihat dan pulihkan berkas yang baru dihapus">
          ${iconRotateCcw(15)} <span>Baru Dihapus</span>
        </button>
      </div>

      <div class="fm-toolbar-right">
        <div class="fm-search-wrap">
          <span class="fm-search-icon">${iconSearch(15)}</span>
          <input
            id="fm-search-input"
            class="input"
            type="search"
            placeholder="Cari berkas… (/ atau Ctrl+K)"
            aria-label="Cari berkas dalam repositori"
            aria-keyshortcuts="/ Control+K"
            value="${esc(searchQuery)}"
          />
        </div>

        <select id="fm-sort-select" class="select" style="height:36px;font-size:0.85rem">
          <option value="name_asc" ${sortBy === 'name' && sortAsc ? 'selected' : ''}>Nama (A-Z)</option>
          <option value="name_desc" ${sortBy === 'name' && !sortAsc ? 'selected' : ''}>Nama (Z-A)</option>
          <option value="size_desc" ${sortBy === 'size' && !sortAsc ? 'selected' : ''}>Ukuran Terbesar</option>
          <option value="size_asc" ${sortBy === 'size' && sortAsc ? 'selected' : ''}>Ukuran Terkecil</option>
          <option value="date_desc" ${sortBy === 'date' && !sortAsc ? 'selected' : ''}>Terbaru Diubah</option>
        </select>

        <div style="display:flex;border:1px solid var(--hs-border,#e2e8f0);border-radius:var(--hs-radius,6px);overflow:hidden">
          <button id="btn-view-grid" class="btn btn-ghost btn-sm" style="padding:0.35rem 0.6rem;height:36px;background:${viewMode === 'grid' ? 'var(--hs-surface-2,#f1f5f9)' : 'transparent'}" title="Tampilan Kotak" type="button">
            ${iconGrid(16)}
          </button>
          <button id="btn-view-list" class="btn btn-ghost btn-sm" style="padding:0.35rem 0.6rem;height:36px;background:${viewMode === 'list' ? 'var(--hs-surface-2,#f1f5f9)' : 'transparent'}" title="Tampilan Tabel" type="button">
            ${iconList(16)}
          </button>
        </div>
      </div>
    `;

    // Dropdown Unggah toggling
    const uploadBtn = bar.querySelector('#btn-upload');
    const uploadMenu = bar.querySelector<HTMLElement>('#upload-menu');
    uploadBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadMenu?.classList.toggle('open');
    });
    window.addEventListener('click', () => {
      uploadMenu?.classList.remove('open');
    });

    // Hidden file inputs
    bar.querySelector('#menu-upload-file')?.addEventListener('click', () => triggerFileInput(false));
    bar.querySelector('#menu-upload-folder')?.addEventListener('click', () => triggerFileInput(true));

    // Tombol buat folder
    bar.querySelector('#btn-create-folder')?.addEventListener('click', () => {
      showCreateFolderDialog(currentPath, (name) => {
        const newFolderPath = currentPath ? `${currentPath}/${name}` : name;
        stageCreateFolder(newFolderPath);
        showToast(`Folder "${name}" ditambahkan ke perubahan tertunda`, 'success');
        refreshFileList();
      });
    });

    // Tombol riwayat commit repositori
    bar.querySelector('#btn-repo-history')?.addEventListener('click', () => {
      navigate(`/${owner}/${repoName}/${repoType}/history`);
    });

    // Tombol berkas baru dihapus (Recently Deleted)
    bar.querySelector('#btn-recently-deleted')?.addEventListener('click', () => {
      openRecentlyDeletedModal({
        repoType,
        repoId: `${owner}/${repoName}`,
        token,
        onRestored: () => {
          refreshFileList();
        },
        onRestoreAllComplete: () => {
          refreshFileList();
        },
      });
    });

    // Pencarian instan
    const searchInput = bar.querySelector<HTMLInputElement>('#fm-search-input');
    let searchDebounce: number;
    searchInput?.addEventListener('input', () => {
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        refreshFileList();
      }, 200);
    });
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (searchInput.value) {
          searchInput.value = '';
          searchQuery = '';
          refreshFileList();
        }
        searchInput.blur();
      }
    });

    // Pengurutan
    bar.querySelector<HTMLSelectElement>('#fm-sort-select')?.addEventListener('change', (e) => {
      if (e.target instanceof HTMLSelectElement) {
        const val = e.target.value;
        if (val === 'name_asc') { sortBy = 'name'; sortAsc = true; }
        else if (val === 'name_desc') { sortBy = 'name'; sortAsc = false; }
        else if (val === 'size_desc') { sortBy = 'size'; sortAsc = false; }
        else if (val === 'size_asc') { sortBy = 'size'; sortAsc = true; }
        else if (val === 'date_desc') { sortBy = 'date'; sortAsc = false; }
        refreshFileList();
      }
    });

    // Mode Tampilan
    bar.querySelector('#btn-view-grid')?.addEventListener('click', () => {
      viewMode = 'grid';
      sessionStorage.setItem('hs:fm:view', 'grid');
      renderToolbar();
      refreshFileList();
    });
    bar.querySelector('#btn-view-list')?.addEventListener('click', () => {
      viewMode = 'list';
      sessionStorage.setItem('hs:fm:view', 'list');
      renderToolbar();
      refreshFileList();
    });
  }

  function renderSelectionBar(): void {
    const bar = headerEl.querySelector<HTMLElement>('#fm-selection-bar');
    if (!bar) return;

    if (selectedPaths.size === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    const count = selectedPaths.size;
    const singleFile = count === 1 ? entries.find((e) => selectedPaths.has(e.path) && e.type === 'file') : null;

    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.75rem">
        <strong>${count} item terpilih</strong>
        <button id="btn-clear-selection" class="btn btn-ghost btn-sm" style="font-size:0.8rem" type="button">Batal Pilih</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem">
        ${
          singleFile
            ? `
          <button id="btn-select-preview" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:0.35rem" type="button">
            ${iconEye(14)} <span>Pratinjau</span>
          </button>
        `
            : ''
        }
        <button id="btn-select-move" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:0.35rem" type="button">
          ${iconMove(14)} <span>Pindahkan</span>
        </button>
        <button id="btn-select-download" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:0.35rem" type="button">
          ${iconDownload(14)} <span>Unduh</span>
        </button>
        <button id="btn-select-delete" class="btn btn-danger btn-sm" style="display:inline-flex;align-items:center;gap:0.35rem" type="button">
          ${iconTrash(14)} <span>Hapus</span>
        </button>
      </div>
    `;

    if (singleFile) {
      bar.querySelector('#btn-select-preview')?.addEventListener('click', () => {
        openFileViewerModal({
          repoType,
          repoId,
          revision: 'main',
          file: singleFile,
          token,
          allFiles: entries,
        });
      });
    }
    bar.querySelector('#btn-clear-selection')?.addEventListener('click', () => {
      selectedPaths.clear();
      renderSelectionBar();
      refreshFileList();
    });

    bar.querySelector('#btn-select-delete')?.addEventListener('click', () => {
      const toDelete = entries.filter((e) => selectedPaths.has(e.path));
      showDeleteConfirmDialog(toDelete, () => {
        for (const item of toDelete) {
          stageDeleteEntry(item.path, item.type === 'directory');
        }
        selectedPaths.clear();
        showToast(`${toDelete.length} item ditandai untuk dihapus`, 'info');
        renderSelectionBar();
        refreshFileList();
      });
    });

    bar.querySelector('#btn-select-download')?.addEventListener('click', async () => {
      const selectedEntries = entries.filter((e) => selectedPaths.has(e.path));
      if (selectedEntries.length === 1 && selectedEntries[0].type === 'file') {
        await triggerFileDownload(repoType, repoId, selectedEntries[0].path, 'main', token);
      } else {
        showToast('Menyiapkan arsip ZIP…', 'info');
        await downloadFolderAsZip(repoType, repoId, currentPath, selectedEntries, 'main', token);
        showToast('Unduhan ZIP selesai', 'success');
      }
    });

    bar.querySelector('#btn-select-move')?.addEventListener('click', () => {
      const first = entries.find((e) => selectedPaths.has(e.path));
      if (!first) return;
      openMoveToFolderPicker(first, fullTree, (targetFolder) => {
        for (const path of selectedPaths) {
          const item = entries.find((e) => e.path === path);
          if (!item) continue;
          const targetPath = targetFolder ? `${targetFolder}/${item.name}` : item.name;
          stageMoveEntry(item.path, targetPath, item.type === 'directory', item.size);
        }
        selectedPaths.clear();
        showToast('Item berhasil dipindahkan ke perubahan tertunda', 'success');
        renderSelectionBar();
        refreshFileList();
      });
    });
  }

  // ── Render Tree Panel (Sidebar Kiri) ────────────────────────────────────

  function renderTreePanel(): void {
    treePanelEl.innerHTML = `
      <div class="fm-tree-header">
        <span>Folder Repositori</span>
        <button id="btn-close-tree-mobile" class="btn btn-ghost btn-sm" style="display:none;padding:2px 6px" title="Tutup" type="button">
          ${iconClose(14)}
        </button>
      </div>
    `;

    treePanelEl.querySelector('#btn-close-tree-mobile')?.addEventListener('click', () => {
      closeMobileTree();
    });

    const folderSet = new Set<string>();
    folderSet.add(''); // Root

    for (const f of fullTree) {
      if (f.type === 'directory') {
        folderSet.add(f.path);
      } else {
        const parts = f.path.split('/');
        parts.pop();
        let cur = '';
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : p;
          folderSet.add(cur);
        }
      }
    }

    const sortedFolders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

    for (const folder of sortedFolders) {
      const depth = folder === '' ? 0 : folder.split('/').length;
      const isCurrent = folder === currentPath;
      const isExpanded = currentPath === folder || (folder !== '' && currentPath.startsWith(`${folder}/`));
      const name = folder === '' ? 'Akar' : folder.split('/').pop()!;
      const folderIcon = getFileIconSvg('', true, 16, isExpanded || isCurrent);

      const itemEl = document.createElement('div');
      itemEl.className = `fm-tree-item ${isCurrent ? 'active' : ''}`;
      itemEl.style.paddingLeft = `${depth * 14 + 8}px`;
      itemEl.innerHTML = `${folderIcon} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>`;

      // Drag target
      attachCrumbDropTarget(itemEl, folder);

      itemEl.addEventListener('click', () => {
        closeMobileTree();
        if (folder !== currentPath) void navigateToFolder(folder);
      });

      treePanelEl.appendChild(itemEl);
    }
  }

  // ── Render Daftar Berkas (Grid / List) ───────────────────────────────────

  function refreshFileList(): void {
    contentPanelEl.querySelectorAll('.fm-grid, .fm-list, .empty-state').forEach((el) => el.remove());

    // Terapkan overlay perubahan tertunda
    let displayedEntries = applyStagedOverlay(entries, currentPath);

    // Filter pencarian
    if (searchQuery) {
      displayedEntries = displayedEntries.filter((e) =>
        e.name.toLowerCase().includes(searchQuery)
      );
    }

    // Urutkan
    displayedEntries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'size') {
        cmp = a.size - b.size;
      } else if (sortBy === 'date') {
        cmp = (a.lastCommitDate?.getTime() ?? 0) - (b.lastCommitDate?.getTime() ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });

    if (displayedEntries.length === 0) {
      const emptyStateEl = createEmptyState({
        icon: iconFolder(44, 'fm-icon-folder'),
        title: searchQuery ? 'Tidak ada berkas yang cocok' : 'Folder ini kosong',
        description: searchQuery
          ? `Tidak ditemukan berkas dengan kata kunci "${searchQuery}".`
          : 'Unggah berkas atau seret berkas langsung ke area ini.',
      });
      emptyStateEl.style.marginTop = '3rem';
      contentPanelEl.appendChild(emptyStateEl);
      return;
    }

    if (viewMode === 'grid') {
      renderGridView(displayedEntries);
    } else {
      renderListView(displayedEntries);
    }
  }

  function renderGridView(items: FileEntry[]): void {
    const gridEl = document.createElement('div');
    gridEl.className = 'fm-grid';
    gridEl.setAttribute('role', 'grid');
    gridEl.setAttribute('aria-label', 'Kisi Berkas dan Folder');
    gridEl.setAttribute('aria-multiselectable', 'true');

    for (const item of items) {
      const isSelected = selectedPaths.has(item.path);
      const isDir = item.type === 'directory';
      const icon = getFileIconSvg(item.name, isDir, 40);

      const card = document.createElement('div');
      card.className = `fm-card ${isSelected ? 'selected' : ''} ${item.stagedStatus ? `staged-badge-${item.stagedStatus}` : ''}`;
      card.draggable = true;
      card.dataset.path = item.path;
      card.setAttribute('role', 'row');
      card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${isDir ? 'Folder' : 'Berkas'} ${item.name}`);

      card.innerHTML = `
        <div role="gridcell" class="fm-card-cell-select">
          <input type="checkbox" class="fm-card-select-btn" ${isSelected ? 'checked' : ''} aria-label="Pilih ${esc(item.name)}" />
        </div>
        <div role="gridcell" class="fm-card-cell-menu">
          <button class="fm-card-menu-btn" aria-label="Menu opsi" type="button">${iconMore(16)}</button>
        </div>
        <div role="gridcell" class="fm-card-thumb">${icon}</div>
        <div role="gridcell" class="fm-card-name" title="${esc(item.name)}">${esc(item.name)}</div>
        <div role="gridcell" class="fm-card-meta">
          <span>${isDir ? 'Folder' : formatBytes(item.size)}</span>
          ${item.stagedStatus ? `<span class="badge badge-staged-${item.stagedStatus}" style="font-size:0.65rem">${esc(item.stagedStatus)}</span>` : ''}
        </div>
      `;
      // Selection Checkbox
      const chk = card.querySelector<HTMLInputElement>('.fm-card-select-btn');
      chk?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelection(item.path, e.shiftKey);
      });

      // Menu Opsi Tombol
      card.querySelector('.fm-card-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openItemMenu(item);
      });

      // Klik kartu
      card.addEventListener('click', (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          toggleSelection(item.path, e.shiftKey);
        } else if (isDir) {
          void navigateToFolder(item.path);
        } else {
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: items,
          });
        }
      });

      // Keyboard navigation pada kartu
      card.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (isDir) {
            void navigateToFolder(item.path);
          } else {
            openFileViewerModal({
              repoType,
              repoId,
              revision: 'main',
              file: item,
              token,
              allFiles: items,
            });
          }
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleSelection(item.path, e.shiftKey);
        }
      });

      if (!isDir) {
        const thumbEl = card.querySelector<HTMLElement>('.fm-card-thumb');
        if (thumbEl) {
          registerLazyThumbnail(thumbEl, item, repoType, repoId, 'main', token);
        }
        card.addEventListener('dblclick', () => {
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: items,
          });
        });
      }

      // Drag and drop kartu
      attachCardDragAndDrop(card, item);

      gridEl.appendChild(card);
    }

    contentPanelEl.appendChild(gridEl);
  }

  function renderListView(items: FileEntry[]): void {
    const listEl = document.createElement('div');
    listEl.className = 'fm-list';
    listEl.setAttribute('role', 'grid');
    listEl.setAttribute('aria-label', 'Tabel Berkas dan Folder');
    listEl.setAttribute('aria-multiselectable', 'true');

    listEl.innerHTML = `
      <div class="fm-list-header" role="row">
        <div role="columnheader" style="display:flex;align-items:center;justify-content:center"><input type="checkbox" id="chk-select-all" aria-label="Pilih semua berkas" /></div>
        <span role="columnheader">Nama</span>
        <span role="columnheader">Ukuran</span>
        <span role="columnheader">Diubah</span>
        <span role="columnheader"></span>
      </div>
    `;

    const selectAllChk = listEl.querySelector<HTMLInputElement>('#chk-select-all');
    selectAllChk?.addEventListener('change', () => {
      if (selectAllChk.checked) {
        for (const item of items) selectedPaths.add(item.path);
      } else {
        selectedPaths.clear();
      }
      renderSelectionBar();
      refreshFileList();
    });

    for (const item of items) {
      const isSelected = selectedPaths.has(item.path);
      const isDir = item.type === 'directory';
      const icon = getFileIconSvg(item.name, isDir, 18);
      const dateStr = item.lastCommitDate
        ? item.lastCommitDate.toLocaleDateString()
        : '-';

      const row = document.createElement('div');
      row.className = `fm-list-row ${isSelected ? 'selected' : ''} ${item.stagedStatus ? `staged-badge-${item.stagedStatus}` : ''}`;
      row.draggable = true;
      row.dataset.path = item.path;
      row.setAttribute('role', 'row');
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `${isDir ? 'Folder' : 'Berkas'} ${item.name}`);

      row.innerHTML = `
        <div role="gridcell" style="display:flex;align-items:center;justify-content:center">
          <input type="checkbox" class="row-chk" ${isSelected ? 'checked' : ''} aria-label="Pilih ${esc(item.name)}" />
        </div>
        <div class="fm-list-row-name" role="gridcell">
          <span class="fm-list-row-icon">${icon}</span>
          <span style="font-weight:600;color:var(--hs-text)">${esc(item.name)}</span>
          ${item.stagedStatus ? `<span class="badge badge-staged-${item.stagedStatus}" style="font-size:0.65rem">${esc(item.stagedStatus)}</span>` : ''}
        </div>
        <span role="gridcell" style="color:var(--hs-text-muted);font-size:0.8rem">${isDir ? '-' : formatBytes(item.size)}</span>
        <span role="gridcell" style="color:var(--hs-text-muted);font-size:0.8rem">${dateStr}</span>
        <div role="gridcell" style="display:flex;align-items:center;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm row-menu-btn" style="padding:0.25rem 0.4rem" aria-label="Menu opsi" type="button">${iconMore(15)}</button>
        </div>
      `;
      row.querySelector('.row-chk')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelection(item.path, (e as MouseEvent).shiftKey);
      });

      row.querySelector('.row-menu-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openItemMenu(item);
      });

      row.addEventListener('click', (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          toggleSelection(item.path, (e as MouseEvent).shiftKey);
        } else if (isDir) {
          void navigateToFolder(item.path);
        } else {
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: items,
          });
        }
      });

      // Keyboard navigation pada baris
      row.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          if (isDir) {
            void navigateToFolder(item.path);
          } else {
            openFileViewerModal({
              repoType,
              repoId,
              revision: 'main',
              file: item,
              token,
              allFiles: items,
            });
          }
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleSelection(item.path, (e as KeyboardEvent).shiftKey);
        }
      });

      if (!isDir) {
        row.querySelector('.fm-list-row-name')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: items,
          });
        });
        row.addEventListener('dblclick', () => {
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: items,
          });
        });
      }

      attachCardDragAndDrop(row, item);
      listEl.appendChild(row);
    }

    contentPanelEl.appendChild(listEl);
  }

  // ── Drag and Drop Universal & OS Drop ───────────────────────────────────

  function generateUniquePath(targetPath: string): string {
    const lastSlash = targetPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? targetPath.slice(0, lastSlash + 1) : '';
    const fullName = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath;

    const lastDot = fullName.lastIndexOf('.');
    const baseName = lastDot > 0 ? fullName.slice(0, lastDot) : fullName;
    const ext = lastDot > 0 ? fullName.slice(lastDot) : '';

    let counter = 1;
    let candidate = `${dir}${baseName}_${counter}${ext}`;

    while (
      entries.some((e) => e.path === candidate && e.stagedStatus !== 'deleted') ||
      pendingChanges.value.some((c) => (c.path === candidate || c.newPath === candidate) && c.type !== 'delete')
    ) {
      counter++;
      candidate = `${dir}${baseName}_${counter}${ext}`;
    }

    return candidate;
  }

  function attachCardDragAndDrop(el: HTMLElement, item: FileEntry): void {
    el.addEventListener('dragstart', (e) => {
      const isSelected = selectedPaths.has(item.path);
      const itemsToDrag = isSelected && selectedPaths.size > 1
        ? Array.from(selectedPaths).map((p) => {
            const en = entries.find((x) => x.path === p);
            return { path: p, isDir: en?.type === 'directory', size: en?.size };
          })
        : [{ path: item.path, isDir: item.type === 'directory', size: item.size }];

      e.dataTransfer?.setData('application/json', JSON.stringify({ items: itemsToDrag }));
      e.dataTransfer?.setData('text/plain', item.path);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
      el.style.opacity = '0.5';
    });

    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
    });

    // Jika item adalah direktori, jadikan drop target
    if (item.type === 'directory') {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', (e) => {
        if (e.relatedTarget && el.contains(e.relatedTarget as Node)) return;
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
        dropOverlayEl.classList.remove('active');
        dragCounter = 0;
        void handleItemDropOntoFolder(e, item.path);
      });
    }
  }

  function attachCrumbDropTarget(crumbEl: HTMLElement, targetFolder: string): void {
    crumbEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      crumbEl.classList.add('drag-over');
    });
    crumbEl.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && crumbEl.contains(e.relatedTarget as Node)) return;
      crumbEl.classList.remove('drag-over');
    });
    crumbEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      crumbEl.classList.remove('drag-over');
      dropOverlayEl.classList.remove('active');
      dragCounter = 0;
      void handleItemDropOntoFolder(e, targetFolder);
    });
  }

  async function handleItemDropOntoFolder(e: DragEvent, targetFolder: string): Promise<void> {
    const dest = targetFolder.replace(/^\/+|\/+$/g, '');

    // 1. Seret dari desktop OS
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleUploadedFiles(Array.from(files), dest);
      return;
    }

    // 2. Seret item internal
    const rawData = e.dataTransfer?.getData('application/json');
    if (!rawData) return;

    try {
      const parsed: unknown = JSON.parse(rawData);
      interface DragPayloadItem {
        path: string;
        isDir?: boolean;
        size?: number;
      }
      interface DragPayload {
        items?: DragPayloadItem[];
        path?: string;
        isDir?: boolean;
        size?: number;
      }

      let itemsToMove: DragPayloadItem[] = [];
      if (typeof parsed === 'object' && parsed !== null) {
        const payload = parsed as DragPayload;
        if (Array.isArray(payload.items)) {
          itemsToMove = payload.items.filter(
            (it): it is DragPayloadItem => typeof it === 'object' && it !== null && typeof it.path === 'string'
          );
        } else if (typeof payload.path === 'string') {
          itemsToMove = [{ path: payload.path, isDir: Boolean(payload.isDir), size: payload.size }];
        }
      }

      if (itemsToMove.length === 0) return;

      let movedCount = 0;
      let applyAllRes: NameConflictResolution | null = null;

      for (const item of itemsToMove) {
        const path = item.path;
        const isDir = Boolean(item.isDir);

        // Larang memindahkan direktori ke dalam dirinya sendiri atau anak-cucunya
        if (isDir && (dest === path || dest.startsWith(`${path}/`))) {
          showToast(`Tidak dapat memindahkan folder "${path}" ke dalam dirinya sendiri`, 'error');
          continue;
        }

        const fileName = path.split('/').pop()!;
        const targetPath = dest ? `${dest}/${fileName}` : fileName;

        if (path === targetPath) continue;

        const existsInEntries = entries.some((x) => x.path === targetPath && x.stagedStatus !== 'deleted');
        const existsInPending = pendingChanges.value.some(
          (c) => (c.path === targetPath || c.newPath === targetPath) && c.type !== 'delete'
        );
        const exists = existsInEntries || existsInPending;

        let finalTargetPath = targetPath;

        if (exists) {
          let resolution: NameConflictResolution = 'replace';
          if (applyAllRes) {
            resolution = applyAllRes;
          } else {
            const { promise, resolve } = Promise.withResolvers<{ choice: NameConflictResolution; applyAll: boolean }>();
            showNameConflictDialog(fileName, itemsToMove.length > 1, (choice, applyAll) => {
              resolve({ choice, applyAll });
            });
            const res = await promise;
            if (res.applyAll) {
              applyAllRes = res.choice;
            }
            resolution = res.choice;
          }

          if (resolution === 'skip') {
            continue;
          }
          if (resolution === 'keep_both') {
            finalTargetPath = generateUniquePath(targetPath);
          }
        }

        stageMoveEntry(path, finalTargetPath, isDir, item.size);
        movedCount++;
      }

      if (movedCount > 0) {
        selectedPaths.clear();
        showToast(
          movedCount === 1
            ? `1 item dipindahkan ke /${dest || 'akar'}`
            : `${movedCount} item dipindahkan ke /${dest || 'akar'}`,
          'success'
        );
        refreshFileList();
        updateStagedBar();
        renderTreePanel();
      }
    } catch {
      // Abaikan format yang tidak valid
    }
  }

  // Setup OS File Drop ke Workspace dengan counter anti-flicker
  let dragCounter = 0;

  contentPanelEl.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      dragCounter++;
      dropOverlayEl.classList.add('active');
    }
  });

  contentPanelEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  contentPanelEl.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlayEl.classList.remove('active');
    }
  });

  contentPanelEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlayEl.classList.remove('active');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleUploadedFiles(Array.from(files));
    }
  });

  // ── Penanganan Upload File & Folder ──────────────────────────────────────

  function triggerFileInput(isFolder: boolean): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (isFolder) {
      input.webkitdirectory = true;
    }

    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        void handleUploadedFiles(Array.from(input.files));
      }
    });

    input.click();
  }

  async function handleUploadedFiles(files: File[], targetFolder?: string): Promise<void> {
    let applyAllResolution: NameConflictResolution | null = null;
    const destFolder = targetFolder !== undefined ? targetFolder.replace(/^\/+|\/+$/g, '') : currentPath;

    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      const targetPath = destFolder ? `${destFolder}/${relPath}` : relPath;

      const existsInEntries = entries.some((e) => e.path === targetPath && e.stagedStatus !== 'deleted');
      const existsInPending = pendingChanges.value.some(
        (c) => (c.path === targetPath || c.newPath === targetPath) && c.type !== 'delete'
      );
      const exists = existsInEntries || existsInPending;

      let resolution: NameConflictResolution = 'replace';

      if (exists) {
        if (applyAllResolution) {
          resolution = applyAllResolution;
        } else {
          const { promise, resolve } = Promise.withResolvers<{ choice: NameConflictResolution; applyAll: boolean }>();
          showNameConflictDialog(file.name, files.length > 1, (choice, applyAll) => {
            resolve({ choice, applyAll });
          });

          const res = await promise;
          if (res.applyAll) {
            applyAllResolution = res.choice;
          }
          resolution = res.choice;
        }

        if (resolution === 'skip') {
          continue;
        }

        if (resolution === 'keep_both') {
          const finalPath = generateUniquePath(targetPath);
          stageAddFile(finalPath, file);
          continue;
        }

        // resolution === 'replace'
        stageAddFile(targetPath, file);
        continue;
      }

      stageAddFile(targetPath, file);
    }

    showToast(`${files.length} berkas diproses ke perubahan tertunda`, 'success');
    refreshFileList();
    updateStagedBar();
  }

  // ── Pemilihan Berkas (Selection) ─────────────────────────────────────────

  function toggleSelection(path: string, isShift: boolean): void {
    if (isShift && selectedPaths.size > 0) {
      const lastSelected = Array.from(selectedPaths).pop()!;
      const idxA = entries.findIndex((e) => e.path === lastSelected);
      const idxB = entries.findIndex((e) => e.path === path);
      if (idxA >= 0 && idxB >= 0) {
        const start = Math.min(idxA, idxB);
        const end = Math.max(idxA, idxB);
        for (let i = start; i <= end; i++) {
          selectedPaths.add(entries[i].path);
        }
      }
    } else if (selectedPaths.has(path)) {
      selectedPaths.delete(path);
    } else {
      selectedPaths.add(path);
    }

    renderSelectionBar();
    refreshFileList();
  }

  // ── Menu Konteks Berkas / Folder ─────────────────────────────────────────

  function openItemMenu(item: FileEntry): void {
    const isDir = item.type === 'directory';

    const actions = [];
    if (!isDir) {
      actions.push({
        icon: iconEye(18),
        label: 'Lihat Pratinjau',
        onClick: () => {
          openFileViewerModal({
            repoType,
            repoId,
            revision: 'main',
            file: item,
            token,
            allFiles: entries,
          });
        },
      });
    }

    const isSelected = selectedPaths.has(item.path);
    actions.push(
      {
        icon: iconCheck(18),
        label: isSelected ? 'Batal Pilih' : 'Pilih (Select)',
        onClick: () => {
          toggleSelection(item.path, false);
        },
      },
      {
        icon: iconHistory(18),
        label: isDir ? 'Riwayat Folder' : 'Riwayat Berkas',
        onClick: () => {
          navigate(`/${owner}/${repoName}/${repoType}/history/${item.path}`);
        },
      }
    );

    actions.push(
      {
        icon: iconMove(18),
        label: 'Pindahkan ke…',
        onClick: () => {
          openMoveToFolderPicker(item, fullTree, (target) => {
            const newPath = target ? `${target}/${item.name}` : item.name;
            stageMoveEntry(item.path, newPath, isDir, item.size);
            showToast('Item berhasil dipindahkan ke perubahan tertunda', 'success');
            refreshFileList();
          });
        },
      },
      {
        icon: iconEdit(18),
        label: 'Ganti nama',
        onClick: () => {
          showRenameDialog(item.name, isDir, (newName) => {
            stageRenameEntry(item.path, newName, isDir, item.size);
            showToast('Perubahan nama ditambahkan ke stage', 'info');
            refreshFileList();
          });
        },
      },
      {
        icon: iconDownload(18),
        label: 'Unduh',
        onClick: () => {
          if (isDir) {
            showToast('Menyiapkan arsip ZIP…', 'info');
            const folderItems = fullTree.filter((f) => f.path.startsWith(`${item.path}/`));
            void downloadFolderAsZip(repoType, repoId, item.path, folderItems, 'main', token);
          } else {
            void triggerFileDownload(repoType, repoId, item.path, 'main', token);
          }
        },
      },
      {
        icon: iconTrash(18),
        label: 'Hapus',
        danger: true,
        onClick: () => {
          showDeleteConfirmDialog([item], () => {
            stageDeleteEntry(item.path, isDir);
            showToast(`"${item.name}" ditandai untuk dihapus`, 'info');
            refreshFileList();
          });
        },
      }
    );

    openActionBottomSheet(
      item.name,
      isDir ? 'Folder Direktori' : formatBytes(item.size),
      actions
    );
  }

  // ── Floating Staged Changes Bar (Glassmorphism dock) ──────────────────────

  function updateStagedBar(): void {
    const changes = pendingChanges.value;
    if (changes.length === 0) {
      stagedBarEl.classList.remove('visible');
      return;
    }

    stagedBarEl.classList.add('visible');
    const { title, description } = generateCommitMessage();

    stagedBarEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.75rem">
        <span class="fm-staged-badge">${changes.length}</span>
        <span class="fm-staged-title" style="font-weight:600;font-size:0.875rem">Perubahan Belum Disimpan</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem">
        <button id="btn-staged-review" class="fm-staged-btn-review" type="button">
          ${iconEye(14)} <span>Tinjau Perubahan</span>
        </button>
        <button id="btn-staged-discard" class="fm-staged-btn-discard" type="button">
          ${iconTrash(14)} <span>Buang</span>
        </button>
        <button id="btn-staged-commit" class="fm-staged-btn-commit" type="button">
          ${iconCheck(14)} <span>Commit &amp; Push</span>
        </button>
      </div>
    `;

    stagedBarEl.querySelector('#btn-staged-discard')?.addEventListener('click', () => {
      discardAllChanges();
      showToast('Semua perubahan tertunda telah dibuang', 'info');
      refreshFileList();
      updateStagedBar();
    });

    stagedBarEl.querySelector('#btn-staged-review')?.addEventListener('click', () => {
      showCommitReviewDialog(title, description, async (customTitle, customDesc) => {
        await doCommit(customTitle, customDesc);
      });
    });

    stagedBarEl.querySelector('#btn-staged-commit')?.addEventListener('click', () => {
      showCommitReviewDialog(title, description, async (customTitle, customDesc) => {
        await doCommit(customTitle, customDesc);
      });
    });
  }

  async function doCommit(title: string, description: string): Promise<void> {
    if (!token) {
      showToast('Anda harus masuk untuk menyimpan commit.', 'error');
      return;
    }

    try {
      const res = await executeCombinedCommit({
        repoType,
        repoId,
        parentCommit: headCommitSha,
        title,
        description,
        token,
        onProgress: (status) => showToast(status, 'info', 2000),
      });

      showToast(`Commit berhasil disimpan! (${res.oid.slice(0, 7)})`, 'success', 5000);

      // Muat ulang commit HEAD dan berkas
      await loadDirectory(currentPath, true);
      updateStagedBar();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'isConflict' in err && Boolean(err.isConflict)) {
        showCommitConflictDialog(() => {
          void loadDirectory(currentPath, true);
        });
      } else {
        throw err;
      }
    }
  }

  // ── Navigasi Folder & Boot Data ──────────────────────────────────────────

  async function navigateToFolder(path: string): Promise<void> {
    currentPath = path.replace(/^\/+|\/+$/g, '');
    selectedPaths.clear();
    searchQuery = '';
    const encodedSegments = currentPath ? currentPath.split('/').map(encodeURIComponent).join('/') : '';
    const newUrl = encodedSegments
      ? `/${owner}/${repoName}/${repoType}/${encodedSegments}`
      : `/${owner}/${repoName}/${repoType}`;
    if (typeof window !== 'undefined' && window.location.pathname !== newUrl) {
      window.history.pushState(null, '', newUrl);
    }
    renderBreadcrumb();
    renderToolbar();
    renderSelectionBar();
    renderTreePanel();
    await loadDirectory(currentPath);
  }

  async function loadDirectory(path: string, forceRefresh: boolean = false): Promise<void> {
    if (isLoading) return;
    isLoading = true;

    // Tampilkan spinner
    const spinner = createSpinner('md');
    spinner.style.margin = '4rem auto';
    contentPanelEl.innerHTML = '';
    contentPanelEl.appendChild(spinner);

    try {
      // Muat commit HEAD jika belum ada
      if (!headCommitSha || forceRefresh) {
        headCommitSha = await getRepoHeadCommit(repoType, repoId, token);
      }

      // Muat berkas direktori aktif
      entries = await fetchDirectoryContents(repoType, repoId, path, 'main', token, forceRefresh);

      // Muat full tree di latar belakang untuk navigasi tree sidebar
      fetchFullRepoTree(repoType, repoId, 'main', token, forceRefresh)
        .then((tree) => {
          fullTree = tree;
          renderTreePanel();
        })
        .catch(() => {});

      refreshFileList();
      updateStagedBar();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorStateEl = createEmptyState({
        icon: iconAlertCircle(44),
        title: 'Gagal memuat isi folder',
        description: message,
        action: {
          label: 'Coba Lagi',
          onClick: () => {
            void loadDirectory(path, true);
          },
        },
      });
      errorStateEl.style.marginTop = '3rem';
      contentPanelEl.innerHTML = '';
      contentPanelEl.appendChild(errorStateEl);
    } finally {
      isLoading = false;
    }
  }

  // ── Shortcut Keyboard ────────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent): void {
    // Jika modal atau dialog penampil terbuka, biarkan modal menangani keyboard sepenuhnya
    if (isAnyModalOpen()) return;

    const isInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable);

    // 1. Ctrl+K / Cmd+K: Fokus ke input pencarian berkas dari mana saja
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = headerEl.querySelector<HTMLInputElement>('#fm-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 2. Escape: Bersihkan input pencarian, batalkan seleksi, atau bersihkan filter pencarian
    if (e.key === 'Escape') {
      const searchInput = headerEl.querySelector<HTMLInputElement>('#fm-search-input');
      if (isInput && e.target === searchInput) {
        e.preventDefault();
        if (searchInput.value) {
          searchInput.value = '';
          searchQuery = '';
          refreshFileList();
        }
        searchInput.blur();
        return;
      }
      if (selectedPaths.size > 0) {
        e.preventDefault();
        selectedPaths.clear();
        renderSelectionBar();
        refreshFileList();
        return;
      }
      if (searchQuery) {
        e.preventDefault();
        searchQuery = '';
        if (searchInput) searchInput.value = '';
        refreshFileList();
        return;
      }
    }

    // Shortcut di bawah diabaikan jika pengguna sedang mengetik di dalam input/textarea
    if (isInput) return;

    // 3. /: Langsung fokus ke input pencarian berkas
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const searchInput = headerEl.querySelector<HTMLInputElement>('#fm-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 4. ?: Membuka dialog panduan shortcut keyboard
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      showKeyboardShortcutsDialog();
      return;
    }

    // 5. Ctrl+A / Cmd+A: Memilih semua berkas di folder saat ini
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const currentItems = applyStagedOverlay(entries, currentPath);
      for (const item of currentItems) {
        selectedPaths.add(item.path);
      }
      renderSelectionBar();
      refreshFileList();
      return;
    }

    // 6. Delete / Backspace: Memicu dialog konfirmasi hapus untuk item terpilih
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPaths.size > 0) {
      e.preventDefault();
      const toDelete = entries.filter((it) => selectedPaths.has(it.path));
      showDeleteConfirmDialog(toDelete, () => {
        for (const item of toDelete) {
          stageDeleteEntry(item.path, item.type === 'directory');
        }
        selectedPaths.clear();
        showToast(`${toDelete.length} item ditandai untuk dihapus`, 'info');
        renderSelectionBar();
        refreshFileList();
      });
      return;
    }

    // 7. F2: Ganti nama item terpilih
    if (e.key === 'F2' && selectedPaths.size === 1) {
      e.preventDefault();
      const item = entries.find((it) => selectedPaths.has(it.path));
      if (item) {
        showRenameDialog(item.name, item.type === 'directory', (newName) => {
          stageRenameEntry(item.path, newName, item.type === 'directory', item.size);
          refreshFileList();
        });
      }
      return;
    }
  }

  if (_activeKeydownHandler) {
    window.removeEventListener('keydown', _activeKeydownHandler);
    _activeKeydownHandler = null;
  }
  if (_activePendingChangesUnsub) {
    _activePendingChangesUnsub();
    _activePendingChangesUnsub = null;
  }

  _activeKeydownHandler = handleKeydown;
  window.addEventListener('keydown', handleKeydown);

  // Subscribe perubahan staged changes untuk update floating bar (idempoten)
  _activePendingChangesUnsub = pendingChanges.subscribe(() => {
    updateStagedBar();
  });

  // Muat metadata repo
  getRepoInfo(owner, repoName, repoType, token)
    .then((info) => {
      repoMetadata = info;
      renderHeader();
    })
    .catch(() => {
      renderHeader();
    });

  // Muat direktori awal
  renderHeader();
  void loadDirectory(currentPath);
}
