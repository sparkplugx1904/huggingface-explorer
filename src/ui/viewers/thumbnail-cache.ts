// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/thumbnail-cache.ts — Lazy Thumbnail Generator di Sisi Browser
// Antrean 3 paralel, downscale canvas ramah memori, IntersectionObserver.
// Tanpa backend/server thumbnail.
// ──────────────────────────────────────────────────────────────────────────

import type { RepoType } from '../../api/types';
import type { FileEntry } from '../../api/tree';
import { downloadFileBlob } from '../../api/tree';
import { MAX_THUMBNAIL_SIZE } from './types';

interface ThumbnailTask {
  key: string;
  repoType: RepoType;
  repoId: string;
  revision: string;
  path: string;
  token?: string | null;
  targetImg: HTMLImageElement;
  fallbackContainer?: HTMLElement;
}

// ── Cache di Memori ────────────────────────────────────────────────────────
const memoryCache = new Map<string, string>();

// ── Antrean Pekerjaan Paralel (Maksimal 3 Bersamaan) ───────────────────────
const CONCURRENCY_LIMIT = 3;
let activeWorkers = 0;
const taskQueue: ThumbnailTask[] = [];

function processNextTask(): void {
  if (activeWorkers >= CONCURRENCY_LIMIT || taskQueue.length === 0) return;

  const task = taskQueue.shift();
  if (!task) return;

  activeWorkers++;

  void generateThumbnail(task).finally(() => {
    activeWorkers--;
    processNextTask();
  });
}

async function generateThumbnail(task: ThumbnailTask): Promise<void> {
  const { key, repoType, repoId, revision, path, token, targetImg, fallbackContainer } = task;

  // Cek cache ulang
  const cached = memoryCache.get(key);
  if (cached) {
    targetImg.src = cached;
    targetImg.style.display = 'block';
    if (fallbackContainer) fallbackContainer.style.display = 'none';
    return;
  }

  let objectUrl: string | null = null;
  try {
    const blob = await downloadFileBlob(repoType, repoId, path, revision, token);
    if (blob.size === 0) {
      return;
    }
    objectUrl = URL.createObjectURL(blob);

    const img = new Image();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Gagal memuat citra'));
    img.src = objectUrl;

    await promise;

    // Render ke canvas kecil (96x96) dengan preserve aspect ratio cover
    const canvas = document.createElement('canvas');
    const targetSize = 96;
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Hitung cropping tengah
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      const aspect = srcW / srcH;

      let drawW = targetSize;
      let drawH = targetSize;
      let offX = 0;
      let offY = 0;

      if (aspect > 1) {
        drawW = targetSize * aspect;
        offX = -(drawW - targetSize) / 2;
      } else {
        drawH = targetSize / aspect;
        offY = -(drawH - targetSize) / 2;
      }

      ctx.drawImage(img, offX, offY, drawW, drawH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

      // Simpan di cache memori
      memoryCache.set(key, dataUrl);

      targetImg.src = dataUrl;
      targetImg.style.display = 'block';
      if (fallbackContainer) fallbackContainer.style.display = 'none';
    }
  } catch {
    // Biarkan ikon fallback SVG tetap tampil jika gagal
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

// ── IntersectionObserver untuk Lazy Loading ────────────────────────────────

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            observer?.unobserve(el);

            const taskData = (el as unknown as { _hsThumbTask?: ThumbnailTask })._hsThumbTask;
            if (taskData) {
              taskQueue.push(taskData);
              processNextTask();
            }
          }
        }
      },
      {
        rootMargin: '100px', // Preload sedikit sebelum masuk viewport
      }
    );
  }
  return observer;
}

/**
 * Daftarkan kartu berkas gambar ke sistem lazy thumbnail.
 * Hanya memproses berkas gambar dengan ukuran <= 2 MB.
 */
export function registerLazyThumbnail(
  cardThumbEl: HTMLElement,
  file: FileEntry,
  repoType: RepoType,
  repoId: string,
  revision: string,
  token?: string | null
): void {
  // Hanya proses berkas bertipe gambar dengan ukuran <= 2 MB
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);

  if (!isImage || file.size <= 0 || file.size > MAX_THUMBNAIL_SIZE) {
    return;
  }

  const cacheKey = `${repoType}:${repoId}:${revision}:${file.path}`;

  // Elemen target citra thumbnail
  let imgEl = cardThumbEl.querySelector<HTMLImageElement>('.fm-card-thumb-img');
  if (!imgEl) {
    imgEl = document.createElement('img');
    imgEl.className = 'fm-card-thumb-img';
    imgEl.alt = file.name;
    imgEl.style.display = 'none';
    cardThumbEl.appendChild(imgEl);
  }

  const fallbackSvg = cardThumbEl.querySelector<HTMLElement>('svg');

  // Jika sudah ada di cache, pasang langsung tanpa antrean
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    imgEl.src = cached;
    imgEl.style.display = 'block';
    if (fallbackSvg) fallbackSvg.style.display = 'none';
    return;
  }

  // Daftarkan ke observer
  const task: ThumbnailTask = {
    key: cacheKey,
    repoType,
    repoId,
    revision,
    path: file.path,
    token,
    targetImg: imgEl,
    fallbackContainer: fallbackSvg || undefined,
  };

  (cardThumbEl as unknown as { _hsThumbTask: ThumbnailTask })._hsThumbTask = task;
  getObserver().observe(cardThumbEl);
}
