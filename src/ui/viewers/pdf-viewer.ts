// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/pdf-viewer.ts — Penampil Dokumen PDF HuggingStudio
// Penampil PDF aman, batas ukuran 25 MB, buka tab baru, dan unduh berkas.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, triggerFileDownload } from '../../api/tree';
import { MAX_PREVIEW_DOC } from './types';
import { renderInfoCard } from './info-card';
import { showToast } from '../components/toast';
import { iconDownload, iconExternalLink } from '../components/icons';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function renderPdfViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<() => void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas PDF kosong (0 byte).');
    return () => {};
  }

  if (file.size > MAX_PREVIEW_DOC && !ctx.forcePreview) {
    renderInfoCard(container, ctx, `Ukuran berkas PDF melampaui batas pratinjau otomatis 25 MB.`);
    return () => {};
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Berkas PDF kosong (0 byte).');
    return () => {};
  }
  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(pdfBlob);

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-pdf-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-pdf-toolbar">
      <div class="hs-pdf-stats">
        <span class="badge font-mono">${formatBytes(file.size)}</span>
        <span class="badge">Dokumen PDF</span>
      </div>

      <div class="hs-pdf-actions">
        <a id="btn-pdf-new-tab" class="btn btn-secondary btn-sm" href="${objectUrl}" target="_blank" rel="noopener noreferrer">
          ${iconExternalLink(14)}
          <span>Buka di Tab Baru</span>
        </a>

        <button id="btn-pdf-download" class="btn btn-primary btn-sm" type="button">
          ${iconDownload(14)}
          <span>Unduh PDF</span>
        </button>
      </div>
    </div>

    <div class="hs-pdf-frame-container">
      <iframe
        id="hs-pdf-iframe"
        class="hs-pdf-iframe"
        src="${objectUrl}#toolbar=1&navpanes=0"
        title="Pratinjau PDF ${file.name}"
        sandbox="allow-scripts allow-forms"
      ></iframe>
    </div>
  `;

  rootEl.querySelector('#btn-pdf-download')?.addEventListener('click', () => {
    void triggerFileDownload(repoType, repoId, file.path, revision, token);
    showToast(`Mengunduh ${file.name}…`, 'info');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);

  return () => {
    URL.revokeObjectURL(objectUrl);
  };
}
