// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/viewer-modal.ts — Orkestrator Dialog Penampil Berkas HuggingStudio
// Lazy-import per viewer, navigasi keyboard panah kiri/kanan, unduh, salin tautan.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import type { FileEntry } from '../../api/tree';
import { detectViewerCategory, MAX_PREVIEW_HARD_LIMIT } from './types';
import { buildHfRawUrl, triggerFileDownload } from '../../api/tree';
import { createSpinner } from '../components/spinner';
import { showToast } from '../components/toast';
import {
  iconDownload,
  iconExternalLink,
  iconClose,
  iconFile,
} from '../components/icons';
import { createFocusTrap } from '../components/modal';
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

export function openFileViewerModal(ctx: ViewerContext): () => void {
  let currentFile = ctx.file;
  let currentCategory = detectViewerCategory(currentFile.name);
  let cleanupFn: (() => void) | void = undefined;
  let isClosed = false;
  let activeLoadId = 0;

  // Daftar berkas untuk navigasi panah kiri/kanan
  const fileList = (ctx.allFiles || []).filter((f) => f.type === 'file');
  let currentIdx = fileList.findIndex((f) => f.path === currentFile.path);

  // Buat DOM Modal
  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay hs-viewer-overlay';
  overlay.style.zIndex = '400';

  const modal = document.createElement('div');
  modal.className = 'modal modal-full hs-viewer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `Pratinjau ${currentFile.name}`);
  modal.tabIndex = -1;
  modal.innerHTML = `
    <div class="hs-viewer-header">
      <div class="hs-viewer-header-left">
        <span class="hs-viewer-file-icon">${iconFile(18)}</span>
        <span id="hs-viewer-file-name" class="hs-viewer-file-name" title="${esc(currentFile.name)}">${esc(currentFile.name)}</span>
        <span id="hs-viewer-file-size" class="badge font-mono">${formatBytes(currentFile.size)}</span>
        <span id="hs-viewer-cat-badge" class="badge badge-warning">${currentCategory.toUpperCase()}</span>
        ${currentFile.isLfs ? '<span class="badge badge-warning">LFS</span>' : ''}
      </div>

      <div class="hs-viewer-header-center">
        ${
          fileList.length > 1
            ? `
          <button id="btn-viewer-prev" class="btn btn-secondary btn-sm" type="button" title="Berkas Sebelumnya (Panah Kiri)">‹</button>
          <span id="hs-viewer-index-info" class="text-xs text-muted font-mono">${currentIdx + 1} / ${fileList.length}</span>
          <button id="btn-viewer-next" class="btn btn-secondary btn-sm" type="button" title="Berkas Berikutnya (Panah Kanan)">›</button>
        `
            : ''
        }
      </div>

      <div class="hs-viewer-header-right">
        <button id="btn-viewer-copy-url" class="btn btn-secondary btn-sm" type="button" title="Salin Tautan Langsung">
          ${iconExternalLink(14)}
          <span>Salin Tautan</span>
        </button>

        <button id="btn-viewer-download" class="btn btn-primary btn-sm" type="button" title="Unduh Berkas">
          ${iconDownload(14)}
          <span>Unduh</span>
        </button>

        <button id="btn-viewer-close" class="btn btn-ghost btn-sm" type="button" aria-label="Tutup Dialog (Esc)">
          ${iconClose(16)}
        </button>
      </div>
    </div>

    <div id="hs-viewer-viewport" class="hs-viewer-viewport"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const trap = createFocusTrap({
    container: modal,
    returnFocus: triggerEl,
    onEscape: () => closeModal(),
  });
  const viewport = modal.querySelector<HTMLElement>('#hs-viewer-viewport')!;
  const fileNameEl = modal.querySelector<HTMLElement>('#hs-viewer-file-name')!;
  const fileSizeEl = modal.querySelector<HTMLElement>('#hs-viewer-file-size')!;
  const catBadgeEl = modal.querySelector<HTMLElement>('#hs-viewer-cat-badge')!;
  const indexInfoEl = modal.querySelector<HTMLElement>('#hs-viewer-index-info');
  const btnPrev = modal.querySelector<HTMLButtonElement>('#btn-viewer-prev');
  const btnNext = modal.querySelector<HTMLButtonElement>('#btn-viewer-next');

  async function loadViewerForFile(file: FileEntry, forcePreview = false): Promise<void> {
    if (isClosed) return;
    const thisLoadId = ++activeLoadId;
    currentFile = file;
    currentCategory = detectViewerCategory(file.name);

    // Bersihkan cleanup sebelumnya
    if (typeof cleanupFn === 'function') {
      try {
        cleanupFn();
      } catch {
        // Abaikan error cleanup lama
      }
      cleanupFn = undefined;
    }

    fileNameEl.textContent = file.name;
    fileNameEl.title = file.name;
    modal.setAttribute('aria-label', `Pratinjau ${file.name}`);
    fileSizeEl.textContent = formatBytes(file.size);
    catBadgeEl.textContent = currentCategory.toUpperCase();
    if (fileList.length > 1 && indexInfoEl) {
      currentIdx = fileList.findIndex((f) => f.path === file.path);
      indexInfoEl.textContent = `${currentIdx + 1} / ${fileList.length}`;
      if (btnPrev) btnPrev.disabled = currentIdx <= 0;
      if (btnNext) btnNext.disabled = currentIdx >= fileList.length - 1;
    }

    viewport.innerHTML = '';
    const spinnerWrap = document.createElement('div');
    spinnerWrap.className = 'hs-viewer-spinner-wrap';
    spinnerWrap.appendChild(createSpinner('md'));
    const spinnerText = document.createElement('span');
    spinnerText.className = 'text-xs text-muted';
    spinnerText.textContent = 'Memuat pratinjau…';
    spinnerWrap.appendChild(spinnerText);
    viewport.appendChild(spinnerWrap);

    const activeCtx: ViewerContext = {
      ...ctx,
      file,
      forcePreview,
    };

    let newCleanup: (() => void) | void = undefined;
    try {
      // Periksa batas 1 GB
      if (file.size >= MAX_PREVIEW_HARD_LIMIT) {
        // Dynamic import dikecualikan: lazy-loading viewer besar agar bundle awal tetap ramping
        const { renderInfoCard } = await import('./info-card');
        if (isClosed || thisLoadId !== activeLoadId) return;
        renderInfoCard(viewport, activeCtx, 'Berkas berukuran >= 1 GB. Memuat ke memori browser dilarang untuk mencegah kehabisan memori.');
        return;
      }

      // Lazy-loading per viewer modul dinamis sesuai arsitektur (Tahap c)
      switch (currentCategory) {
        case 'code': {
          const { renderTextCodeViewer } = await import('./text-code-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderTextCodeViewer(viewport, activeCtx);
          break;
        }

        case 'markdown': {
          const { renderMarkdownViewer } = await import('./markdown-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderMarkdownViewer(viewport, activeCtx);
          break;
        }

        case 'json': {
          const { renderJsonViewer } = await import('./json-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderJsonViewer(viewport, activeCtx);
          break;
        }

        case 'csv': {
          const { renderCsvViewer } = await import('./csv-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderCsvViewer(viewport, activeCtx);
          break;
        }

        case 'image': {
          const { renderImageViewer } = await import('./image-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderImageViewer(viewport, activeCtx);
          break;
        }

        case 'media': {
          const { renderMediaViewer } = await import('./media-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderMediaViewer(viewport, activeCtx);
          break;
        }

        case 'pdf': {
          const { renderPdfViewer } = await import('./pdf-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderPdfViewer(viewport, activeCtx);
          break;
        }

        case 'docx': {
          const { renderDocxViewer } = await import('./office-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderDocxViewer(viewport, activeCtx);
          break;
        }

        case 'spreadsheet': {
          const { renderSpreadsheetViewer } = await import('./office-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderSpreadsheetViewer(viewport, activeCtx);
          break;
        }

        case 'pptx': {
          const { renderPptxViewer } = await import('./pptx-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderPptxViewer(viewport, activeCtx);
          break;
        }

        case 'notebook': {
          const { renderNotebookViewer } = await import('./notebook-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderNotebookViewer(viewport, activeCtx);
          break;
        }

        case 'safetensors': {
          const { renderSafetensorsViewer } = await import('./safetensors-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderSafetensorsViewer(viewport, activeCtx);
          break;
        }

        case 'zip': {
          const { renderZipViewer } = await import('./zip-viewer');
          if (isClosed || thisLoadId !== activeLoadId) return;
          newCleanup = await renderZipViewer(viewport, activeCtx);
          break;
        }

        case 'info':
        default: {
          const { renderInfoCard } = await import('./info-card');
          if (isClosed || thisLoadId !== activeLoadId) return;
          renderInfoCard(viewport, activeCtx);
          break;
        }
      }

      // Pastikan dialog masih aktif dan berkas masih yang terbaru sebelum simpan cleanup
      if (isClosed || thisLoadId !== activeLoadId) {
        if (typeof newCleanup === 'function') {
          try {
            newCleanup();
          } catch {
            // Abaikan error cleanup
          }
        }
        return;
      }

      cleanupFn = newCleanup;
    } catch (err) {
      if (isClosed || thisLoadId !== activeLoadId) {
        if (typeof newCleanup === 'function') {
          try {
            newCleanup();
          } catch {
            // Abaikan
          }
        }
        return;
      }
      const { renderInfoCard } = await import('./info-card');
      if (isClosed || thisLoadId !== activeLoadId) return;
      const msg = err instanceof Error ? err.message : 'Gagal memuat pratinjau';
      renderInfoCard(viewport, activeCtx, msg);
    }
  }

  // Tangani event 'hs-force-preview' dari info-card
  viewport.addEventListener('hs-force-preview', () => {
    void loadViewerForFile(currentFile, true);
  });

  void loadViewerForFile(currentFile);

  function closeModal(): void {
    isClosed = true;
    activeLoadId++;
    if (typeof cleanupFn === 'function') {
      try {
        cleanupFn();
      } catch {
        // Abaikan error cleanup
      }
      cleanupFn = undefined;
    }
    trap.deactivate();
    overlay.remove();
    document.removeEventListener('keydown', handleKeyDown);
    ctx.onClose?.();
  }

  // Navigasi Prev/Next
  function navigatePrev(): void {
    if (currentIdx > 0) {
      currentIdx--;
      const target = fileList[currentIdx];
      void loadViewerForFile(target);
      ctx.onNavigateFile?.(target);
    }
  }

  function navigateNext(): void {
    if (currentIdx < fileList.length - 1) {
      currentIdx++;
      const target = fileList[currentIdx];
      void loadViewerForFile(target);
      ctx.onNavigateFile?.(target);
    }
  }

  btnPrev?.addEventListener('click', navigatePrev);
  btnNext?.addEventListener('click', navigateNext);

  // Keyboard shortcut listener
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      navigatePrev();
    } else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      navigateNext();
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  // Tombol Salin URL
  modal.querySelector('#btn-viewer-copy-url')?.addEventListener('click', () => {
    const rawUrl = buildHfRawUrl(ctx.repoType, ctx.repoId, currentFile.path, ctx.revision, 'raw');
    void navigator.clipboard.writeText(rawUrl);
    showToast('Tautan langsung disalin!', 'success');
  });

  // Tombol Unduh
  modal.querySelector('#btn-viewer-download')?.addEventListener('click', () => {
    void triggerFileDownload(ctx.repoType, ctx.repoId, currentFile.path, ctx.revision, ctx.token);
    showToast(`Mengunduh ${currentFile.name}…`, 'info');
  });

  // Tombol Tutup
  modal.querySelector('#btn-viewer-close')?.addEventListener('click', closeModal);

  // Klik di luar dialog
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  return closeModal;
}
