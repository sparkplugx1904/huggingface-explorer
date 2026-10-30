// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/pptx-viewer.ts — Penampil Presentasi .pptx HuggingStudio
// Mengekstrak teks per slide via dekompresi fflate XML slide, dek navigasi slide,
// dan tombol unduh presentasi.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, triggerFileDownload } from '../../api/tree';
import { MAX_PREVIEW_DOC } from './types';
import { renderInfoCard } from './info-card';
import { unzip } from 'fflate';
import { showToast } from '../components/toast';
import { iconDownload } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SlideInfo {
  number: number;
  title: string;
  texts: string[];
}

export async function renderPptxViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas presentasi .pptx kosong (0 byte).');
    return;
  }

  if (file.size > MAX_PREVIEW_DOC && !ctx.forcePreview) {
    renderInfoCard(container, ctx, 'Ukuran berkas presentasi .pptx melampaui batas 25 MB.');
    return;
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Berkas presentasi .pptx kosong (0 byte).');
    return;
  }
  const arrayBuffer = await blob.arrayBuffer();

  const { promise, resolve, reject } = Promise.withResolvers<Record<string, Uint8Array>>();
  unzip(new Uint8Array(arrayBuffer), (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await promise;
  } catch {
    renderInfoCard(container, ctx, 'Tidak dapat membaca struktur berkas presentasi .pptx.');
    return;
  }

  const decoder = new TextDecoder('utf-8');
  const slides: SlideInfo[] = [];

  // Cari berkas ppt/slides/slide*.xml
  const slidePaths = Object.keys(unzipped)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      return numA - numB;
    });

  for (let i = 0; i < slidePaths.length; i++) {
    const p = slidePaths[i];
    const xml = decoder.decode(unzipped[p]);

    // Ekstrak tag <a:t>...</a:t>
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gi));
    const rawTexts = matches.map((m) => m[1].trim()).filter((t) => t.length > 0);

    const title = rawTexts[0] || `Slide ${i + 1}`;
    const texts = rawTexts.slice(1);

    slides.push({
      number: i + 1,
      title,
      texts,
    });
  }

  if (slides.length === 0) {
    renderInfoCard(container, ctx, 'Tidak ada teks slide yang ditemukan dalam berkas .pptx ini.');
    return;
  }

  let activeIndex = 0;

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-pptx-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-pptx-layout">
      <div class="hs-pptx-sidebar">
        <div class="hs-pptx-sidebar-header">
          <span class="badge font-mono">${slides.length} slide</span>
        </div>
        <div class="hs-pptx-slide-list">
          ${slides
            .map(
              (s, idx) => `
            <div class="hs-pptx-slide-thumb ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
              <span class="hs-pptx-slide-num">${s.number}</span>
              <span class="hs-pptx-slide-title-preview">${esc(s.title)}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="hs-pptx-main">
        <div class="hs-pptx-toolbar">
          <div class="hs-pptx-nav-controls btn-group">
            <button id="btn-pptx-prev" class="btn btn-secondary btn-sm" type="button">‹ Slide Sebelumnya</button>
            <span id="hs-pptx-counter" class="badge">Slide 1 dari ${slides.length}</span>
            <button id="btn-pptx-next" class="btn btn-secondary btn-sm" type="button">Slide Berikutnya ›</button>
          </div>

          <button id="btn-pptx-download" class="btn btn-primary btn-sm" type="button">
            ${iconDownload(14)}
            <span>Unduh PPTX</span>
          </button>
        </div>

        <div class="hs-pptx-card-stage">
          <div id="hs-pptx-slide-card" class="hs-pptx-slide-card"></div>
        </div>
      </div>
    </div>
  `;

  const slideCard = rootEl.querySelector<HTMLElement>('#hs-pptx-slide-card')!;
  const counterBadge = rootEl.querySelector<HTMLElement>('#hs-pptx-counter')!;
  const btnPrev = rootEl.querySelector<HTMLButtonElement>('#btn-pptx-prev')!;
  const btnNext = rootEl.querySelector<HTMLButtonElement>('#btn-pptx-next')!;
  const thumbEls = rootEl.querySelectorAll<HTMLElement>('.hs-pptx-slide-thumb');

  function renderActiveSlide(): void {
    const s = slides[activeIndex];
    counterBadge.textContent = `Slide ${s.number} dari ${slides.length}`;
    btnPrev.disabled = activeIndex <= 0;
    btnNext.disabled = activeIndex >= slides.length - 1;

    thumbEls.forEach((el, idx) => {
      el.classList.toggle('active', idx === activeIndex);
    });

    slideCard.innerHTML = `
      <div class="hs-pptx-card-header">
        <span class="hs-pptx-card-num">SLIDE ${s.number}</span>
        <h2 class="hs-pptx-card-title">${esc(s.title)}</h2>
      </div>

      <div class="hs-pptx-card-body">
        ${
          s.texts.length > 0
            ? `
          <ul class="hs-pptx-bullet-list">
            ${s.texts.map((t) => `<li>${esc(t)}</li>`).join('')}
          </ul>
        `
            : '<p class="text-muted" style="margin-top:1rem;">(Slide visual/grafik tanpa teks pelengkap)</p>'
        }
      </div>
    `;
  }

  renderActiveSlide();

  btnPrev.addEventListener('click', () => {
    if (activeIndex > 0) {
      activeIndex--;
      renderActiveSlide();
    }
  });

  btnNext.addEventListener('click', () => {
    if (activeIndex < slides.length - 1) {
      activeIndex++;
      renderActiveSlide();
    }
  });

  thumbEls.forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx || '0', 10);
      activeIndex = idx;
      renderActiveSlide();
    });
  });

  rootEl.querySelector('#btn-pptx-download')?.addEventListener('click', () => {
    void triggerFileDownload(repoType, repoId, file.path, revision, token);
    showToast(`Mengunduh ${file.name}…`, 'info');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
