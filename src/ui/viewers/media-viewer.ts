// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/media-viewer.ts — Penampil Audio & Video Native HuggingStudio
// Streaming HTTP Range native, resolusi URL bertanda tangan untuk repo privat,
// kendali kecepatan putar, dan tombol unduh fallback.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { renderInfoCard } from './info-card';
import { resolvePrivateFileUrl, triggerFileDownload } from '../../api/tree';
import { showToast } from '../components/toast';
import { iconDownload, iconAlertCircle } from '../components/icons';

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

export async function renderMediaViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<() => void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas media audio/video kosong (0 byte).');
    return () => {};
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isVideo = ['mp4', 'webm', 'mov', 'ogg'].includes(ext);

  // Ambil URL streaming (signed/resolved redirect URL untuk repo privat)
  const streamUrl = await resolvePrivateFileUrl(repoType, repoId, file.path, revision, token);

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-media-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-media-player-box">
      ${
        isVideo
          ? `
        <video id="hs-media-element" class="hs-video-player" src="${esc(streamUrl)}" controls preload="metadata" playsinline>
          Peramban Anda tidak mendukung elemen video native.
        </video>
      `
          : `
        <div class="hs-audio-wrap">
          <div class="hs-audio-disc-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div class="hs-audio-title">${esc(file.name)}</div>
          <audio id="hs-media-element" class="hs-audio-player" src="${esc(streamUrl)}" controls preload="metadata">
            Peramban Anda tidak mendukung elemen audio native.
          </audio>
        </div>
      `
      }

      <div class="hs-media-toolbar">
        <div class="hs-media-stats">
          <span class="badge font-mono">${formatBytes(file.size)}</span>
          <span id="hs-media-duration" class="badge">--:--</span>
        </div>

        <div class="hs-media-controls">
          <span class="text-xs text-muted" style="margin-right:4px;">Kecepatan:</span>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm speed-btn" data-speed="0.5" type="button">0.5x</button>
            <button class="btn btn-primary btn-sm speed-btn" data-speed="1.0" type="button">1x</button>
            <button class="btn btn-secondary btn-sm speed-btn" data-speed="1.5" type="button">1.5x</button>
            <button class="btn btn-secondary btn-sm speed-btn" data-speed="2.0" type="button">2x</button>
          </div>

          <button id="btn-media-download" class="btn btn-secondary btn-sm" type="button">
            ${iconDownload(14)}
            <span>Unduh</span>
          </button>
        </div>
      </div>

      <div id="hs-media-error-banner" class="hs-media-error" style="display:none;">
        <span style="color:var(--hs-warning);">${iconAlertCircle(16)}</span>
        <span>Gagal memutar media secara langsung. Anda dapat mengunduh berkas ini secara utuh.</span>
      </div>
    </div>
  `;

  const mediaEl = rootEl.querySelector<HTMLMediaElement>('#hs-media-element')!;
  const durationBadge = rootEl.querySelector<HTMLElement>('#hs-media-duration')!;
  const errorBanner = rootEl.querySelector<HTMLElement>('#hs-media-error-banner')!;

  function formatTime(seconds: number): string {
    if (isNaN(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  mediaEl.addEventListener('loadedmetadata', () => {
    durationBadge.textContent = formatTime(mediaEl.duration);
  });

  mediaEl.addEventListener('error', () => {
    errorBanner.style.display = 'flex';
  });

  // Tombol Pengubah Kecepatan Putar
  const speedBtns = rootEl.querySelectorAll<HTMLButtonElement>('.speed-btn');
  speedBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed || '1.0');
      mediaEl.playbackRate = speed;
      speedBtns.forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
    });
  });

  // Unduh Fallback
  rootEl.querySelector('#btn-media-download')?.addEventListener('click', () => {
    void triggerFileDownload(repoType, repoId, file.path, revision, token);
    showToast(`Mengunduh ${file.name}…`, 'info');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);

  return () => {
    mediaEl.pause();
    mediaEl.removeAttribute('src');
    while (mediaEl.firstChild) {
      mediaEl.removeChild(mediaEl.firstChild);
    }
    mediaEl.load();
  };
}
