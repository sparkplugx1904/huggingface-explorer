// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/image-viewer.ts — Penampil Citra & Grafik HuggingStudio
// Zoom, Pan, Fit, dimensi alami, latar transparan checkerboard, SVG aman.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, triggerFileDownload } from '../../api/tree';
import { MAX_PREVIEW_IMAGE } from './types';
import { renderInfoCard } from './info-card';
import { iconAlertCircle, iconDownload } from '../components/icons';
import { showToast } from '../components/toast';
import DOMPurify from 'dompurify';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function renderImageViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<() => void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas citra kosong (0 byte).');
    return () => {};
  }

  if (file.size > MAX_PREVIEW_IMAGE && !ctx.forcePreview) {
    renderInfoCard(container, ctx, `Ukuran gambar melampaui batas pratinjau otomatis 20 MB.`);
    return () => {};
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Berkas citra kosong (0 byte).');
    return () => {};
  }
  const isSvg = file.name.toLowerCase().endsWith('.svg');
  let finalBlob: Blob = blob;

  // Deteksi kontainer HEIC/HEIF dari magic bytes ftypheic/ftypmif1
  const slice = await blob.slice(0, 32).arrayBuffer();
  const magic = String.fromCharCode(...new Uint8Array(slice));
  const isHeic = magic.includes('ftypheic') || magic.includes('ftypmif1') || magic.includes('ftypmsf1') || magic.includes('ftypheix') || magic.includes('ftyphevc');

  if (isHeic) {
    try {
      // Exception: heic2any is genuinely runtime-selected and dynamically imported only on demand when HEIC format is detected, preventing heavy parser overhead from loading during standard image views.
      const heic2any = (await import('heic2any')).default;
      const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
      finalBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      // Biarkan finalBlob apa adanya bila konversi gagal
    }
  } else if (isSvg) {
    const rawSvgText = await blob.text();
    const safeSvgText = DOMPurify.sanitize(rawSvgText, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject', 'base'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
    finalBlob = new Blob([safeSvgText], { type: 'image/svg+xml' });
  }
  const objectUrl = URL.createObjectURL(finalBlob);
  const rootEl = document.createElement('div');
  rootEl.className = 'hs-image-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-image-toolbar">
      <div class="hs-image-meta">
        <span id="hs-img-dims" class="badge font-mono">Memuat dimensi…</span>
      </div>

      <div class="hs-image-controls btn-group">
        <button id="btn-zoom-out" class="btn btn-secondary btn-sm" type="button" title="Perkecil">−</button>
        <button id="btn-zoom-reset" class="btn btn-secondary btn-sm" type="button" title="Reset Zoom">100%</button>
        <button id="btn-zoom-in" class="btn btn-secondary btn-sm" type="button" title="Perbesar">+</button>
        <button id="btn-zoom-fit" class="btn btn-secondary btn-sm" type="button" title="Paskan ke Jendela">Paskan</button>
      </div>
    </div>

    <div class="hs-image-viewport hs-checkerboard">
      <div class="hs-image-stage">
        <img id="hs-preview-img" class="hs-image-el" src="${objectUrl}" alt="${esc(file.name)}" draggable="false" />
      </div>
    </div>
  `;

  const imgEl = rootEl.querySelector<HTMLImageElement>('#hs-preview-img')!;
  const dimsEl = rootEl.querySelector<HTMLElement>('#hs-img-dims')!;
  const stageEl = rootEl.querySelector<HTMLElement>('.hs-image-stage')!;
  const viewportEl = rootEl.querySelector<HTMLElement>('.hs-image-viewport')!;

  const btnZoomOut = rootEl.querySelector<HTMLButtonElement>('#btn-zoom-out')!;
  const btnZoomReset = rootEl.querySelector<HTMLButtonElement>('#btn-zoom-reset')!;
  const btnZoomIn = rootEl.querySelector<HTMLButtonElement>('#btn-zoom-in')!;
  const btnZoomFit = rootEl.querySelector<HTMLButtonElement>('#btn-zoom-fit')!;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function applyTransform(): void {
    stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    btnZoomReset.textContent = `${Math.round(scale * 100)}%`;
  }

  imgEl.onload = () => {
    const w = imgEl.naturalWidth;
    const h = imgEl.naturalHeight;
    dimsEl.textContent = `${w} × ${h} px (${(w / h).toFixed(2)}:1)`;
  };

  imgEl.onerror = () => {
    dimsEl.textContent = isHeic ? 'Format HEIC/HEIF (unduh untuk melihat)' : 'Format tidak didukung peramban';
    dimsEl.classList.add('badge-warning');
    stageEl.innerHTML = `
      <div class="hs-image-fallback-card" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:2rem;text-align:center;max-width:440px;background:var(--hs-surface);border:1px solid var(--hs-border);border-radius:10px;box-shadow:var(--hs-shadow-md);">
        <span style="color:var(--hs-warning);">${iconAlertCircle(36)}</span>
        <h3 style="font-size:1.0625rem;font-weight:600;margin:0;color:var(--hs-text);">
          ${isHeic ? 'Kontainer HEIC/HEIF Terdeteksi' : 'Format Gambar Tidak Didukung Browser'}
        </h3>
        <p class="text-xs text-muted" style="margin:0;line-height:1.6;">
          ${
            isHeic
              ? `Berkas <strong>${esc(file.name)}</strong> berisi data HEIC/HEIF asli (Apple High Efficiency Image) yang tidak dapat didekode langsung oleh mesin peramban Chromium/Firefox.`
              : `Peramban tidak dapat mendekode data citra ini secara langsung.`
          }
          Anda dapat mengunduh berkas ini untuk membukanya di aplikasi penampil foto bawaan komputer/HP Anda.
        </p>
        <button id="btn-download-unsupported-img" class="btn btn-primary btn-sm" type="button" style="margin-top:6px;">
          ${iconDownload(14)}
          <span>Unduh Berkas Asli</span>
        </button>
      </div>
    `;

    stageEl.querySelector('#btn-download-unsupported-img')?.addEventListener('click', () => {
      void triggerFileDownload(repoType, repoId, file.path, revision, token);
      showToast(`Mengunduh ${file.name}…`, 'info');
    });
  };

  btnZoomIn.addEventListener('click', () => {
    scale = Math.min(scale * 1.25, 10);
    applyTransform();
  });

  btnZoomOut.addEventListener('click', () => {
    scale = Math.max(scale / 1.25, 0.1);
    applyTransform();
  });

  btnZoomReset.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  });

  btnZoomFit.addEventListener('click', () => {
    const vpW = viewportEl.clientWidth - 40;
    const vpH = viewportEl.clientHeight - 40;
    const imgW = imgEl.naturalWidth || 400;
    const imgH = imgEl.naturalHeight || 300;
    scale = Math.min(vpW / imgW, vpH / imgH, 1);
    panX = 0;
    panY = 0;
    applyTransform();
  });

  // Zoom dengan Wheel Mouse
  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    scale = Math.min(Math.max(scale * factor, 0.1), 10);
    applyTransform();
  });

  // Pan / Dragging
  viewportEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewportEl.classList.add('panning');
  });

  const handleMouseMove = (e: MouseEvent): void => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  };

  const handleMouseUp = (): void => {
    if (isPanning) {
      isPanning = false;
      viewportEl.classList.remove('panning');
    }
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  container.innerHTML = '';
  container.appendChild(rootEl);

  return () => {
    URL.revokeObjectURL(objectUrl);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}
