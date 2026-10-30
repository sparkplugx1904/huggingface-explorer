// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/info-card.ts — Kartu Informasi Berkas HuggingStudio
// Kartu pratinjau untuk format biner, format tidak didukung, atau berkas besar.
// Desain developer tool modern berstandar Linear/GitHub, bebas emoji kartun.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { buildHfRawUrl, triggerFileDownload } from '../../api/tree';
import { showToast } from '../components/toast';
import {
  iconDownload,
  iconExternalLink,
  iconFile,
  iconAlertCircle,
} from '../components/icons';
import { MAX_PREVIEW_HARD_LIMIT } from './types';

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

export function renderInfoCard(
  container: HTMLElement,
  ctx: ViewerContext,
  reason?: string
): void {
  const { repoType, repoId, revision, file, token, forcePreview } = ctx;
  const rawUrl = buildHfRawUrl(repoType, repoId, file.path, revision, 'raw');
  const isTooHuge = file.size >= MAX_PREVIEW_HARD_LIMIT;

  const cardEl = document.createElement('div');
  cardEl.className = 'hs-info-card-container';

  const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  const dateStr = file.lastCommitDate
    ? file.lastCommitDate.toLocaleString()
    : 'Tidak tersedia';

  cardEl.innerHTML = `
    <div class="hs-info-card">
      <div class="hs-info-card-icon-wrap">
        ${iconFile(48)}
        <span class="hs-info-card-ext-badge">${esc(ext)}</span>
      </div>

      <h3 class="hs-info-card-title">${esc(file.name)}</h3>
      <p class="hs-info-card-path">${esc(file.path)}</p>

      ${
        reason
          ? `
        <div class="hs-info-card-banner">
          <span style="color:var(--hs-warning);flex-shrink:0;">${iconAlertCircle(16)}</span>
          <span>${esc(reason)}</span>
        </div>
      `
          : ''
      }

      <div class="hs-info-card-meta-grid">
        <div class="hs-info-meta-row">
          <span class="hs-info-meta-label">Ukuran Berkas</span>
          <span class="hs-info-meta-value font-mono">${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)</span>
        </div>
        <div class="hs-info-meta-row">
          <span class="hs-info-meta-label">Git LFS</span>
          <span class="hs-info-meta-value">${file.isLfs ? '<span class="badge badge-warning">LFS Tracked</span>' : '<span class="badge">Standar Git</span>'}</span>
        </div>
        <div class="hs-info-meta-row">
          <span class="hs-info-meta-label">Commit Terakhir</span>
          <span class="hs-info-meta-value">${esc(dateStr)}</span>
        </div>
        ${
          file.lastCommitTitle
            ? `
          <div class="hs-info-meta-row">
            <span class="hs-info-meta-label">Pesan Commit</span>
            <span class="hs-info-meta-value">${esc(file.lastCommitTitle)}</span>
          </div>
        `
            : ''
        }
        <div class="hs-info-meta-row">
          <span class="hs-info-meta-label">Object ID (SHA)</span>
          <span class="hs-info-meta-value font-mono text-xs">${esc(file.oid || '-')}</span>
        </div>
      </div>

      <div class="hs-info-card-actions">
        <button id="btn-info-download" class="btn btn-primary" type="button">
          ${iconDownload(16)}
          <span>Unduh Berkas</span>
        </button>

        <button id="btn-info-copy-url" class="btn btn-secondary" type="button">
          ${iconExternalLink(16)}
          <span>Salin Tautan Langsung</span>
        </button>

        ${
          !isTooHuge && !forcePreview && reason
            ? `
          <button id="btn-info-force-preview" class="btn btn-secondary" type="button">
            <span>Tetap Buka Pratinjau</span>
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;

  // Listener Tombol Unduh
  cardEl.querySelector('#btn-info-download')?.addEventListener('click', () => {
    void triggerFileDownload(repoType, repoId, file.path, revision, token);
    showToast(`Mengunduh ${file.name}…`, 'info');
  });

  // Listener Salin URL
  cardEl.querySelector('#btn-info-copy-url')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(rawUrl);
    showToast('Tautan langsung disalin ke papan klip!', 'success');
  });

  // Listener Tetap Buka Pratinjau
  cardEl.querySelector('#btn-info-force-preview')?.addEventListener('click', () => {
    ctx.forcePreview = true;
    container.innerHTML = '';
    // Panggil ulang modal untuk render dengan mode paksa
    const event = new CustomEvent('hs-force-preview', { detail: { path: file.path } });
    container.dispatchEvent(event);
  });

  container.innerHTML = '';
  container.appendChild(cardEl);
}
