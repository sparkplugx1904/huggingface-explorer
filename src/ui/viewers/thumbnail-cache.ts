// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/thumbnail-cache.ts — Lazy Thumbnail Generator di Sisi Browser
// Antrean 3 paralel dengan garansi waktu (timeout per job), decode asinkron
// createImageBitmap (tidak memblokir main thread), dan poster frame video
// via <video> + seek. Downscale canvas ramah memori, IntersectionObserver.
// Tanpa backend/server thumbnail.
// ──────────────────────────────────────────────────────────────────────────

import type { RepoType } from '../../api/types';
import type { FileEntry } from '../../api/tree';
import { downloadFileBlob } from '../../api/tree';
import { getFromMediaVault, putToMediaVault, mediaVaultKey } from '../../api/media-cache';
import { MAX_THUMBNAIL_SIZE, MAX_VIDEO_THUMBNAIL_SIZE } from './types';

type ThumbKind = 'image' | 'video';

interface ThumbnailTask {
  key: string;
  kind: ThumbKind;
  repoType: RepoType;
  repoId: string;
  revision: string;
  path: string;
  token?: string | null;
  targetImg: HTMLImageElement;
  fallbackContainer?: HTMLElement;
}

// ── Konstanta Batas & Keandalan ────────────────────────────────────────────
/** Decode bitmap gimaksimal (piksel); di atas ini terlalu berat di RAM peramban. */
const MAX_SOURCE_PIXELS = 40_000_000;
/** Garansi pengerjaan per job gambar: lewati bila melebihi, jangan tahan antrean. */
const IMAGE_TIMEOUT_MS = 8_000;
/** Garansi pengerjaan per job video (load + seek): */
const VIDEO_TIMEOUT_MS = 7_000;

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

/** Race util: tolak dengan label bila pekerjaan melewati tenggat. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

/** Sisipkan frame sumber (img/bitmap/video) ke kanvas 96x96 motif cover tengah. */
function drawCoveredFrame(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetSize: number
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

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

  ctx.drawImage(source, offX, offY, drawW, drawH);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** Terapkan hasil thumbnail ke kartu: tampilkan <img>, sembunyikan ikon fallback. */
function applyThumb(targetImg: HTMLImageElement, dataUrl: string, fallbackContainer?: HTMLElement): void {
  targetImg.src = dataUrl;
  targetImg.style.display = 'block';
  if (fallbackContainer) fallbackContainer.style.display = 'none';
}

// ── Generator: Gambar ──────────────────────────────────────────────────────

async function generateImageThumb(blob: Blob, objectUrl: string): Promise<string> {
  // Jalur utama: decode asinkron di luar main thread (di mana tersedia).
  if (typeof createImageBitmap === 'function') {
    const bitmap = await withTimeout(createImageBitmap(blob), IMAGE_TIMEOUT_MS, 'decode-timeout');
    try {
      if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
        throw new Error('terlalu besar');
      }
      const dataUrl = drawCoveredFrame(bitmap, bitmap.width, bitmap.height, 96);
      if (!dataUrl) throw new Error('canvas-tidak-tersedia');
      return dataUrl;
    } finally {
      bitmap.close();
    }
  }

  // Jalur cadangan: <img> + decode() asinkron.
  const img = new Image();
  img.src = objectUrl;
  await withTimeout(img.decode(), IMAGE_TIMEOUT_MS, 'img-decode-timeout');
  const dataUrl = drawCoveredFrame(img, img.naturalWidth, img.naturalHeight, 96);
  if (!dataUrl) throw new Error('canvas-tidak-tersedia');
  return dataUrl;
}

// ── Generator: Poster Frame Video ─────────────────────────────────────────

async function generateVideoThumb(objectUrl: string): Promise<string> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = objectUrl;

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video-tak-terbaca'));
    }),
    VIDEO_TIMEOUT_MS,
    'video-load-timeout'
  );

  // Ambil frame: 10% masuk video (atau 0.1 s untuk klip pendek); hindari frame hitam awal.
  const duration = Number.isFinite(video.duration) ? video.duration : 0.5;
  const seekTo = Math.max(0.1, Math.min(duration * 0.1, 3));

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('video-seek-gagal'));
      video.currentTime = seekTo;
    }),
    VIDEO_TIMEOUT_MS,
    'video-seek-timeout'
  );

  const dataUrl = drawCoveredFrame(video, video.videoWidth, video.videoHeight, 96);
  if (!dataUrl) throw new Error('canvas-tidak-tersedia');
  return dataUrl;
}

// ── Orkestrasi Job ────────────────────────────────────────────────────────

async function generateThumbnail(task: ThumbnailTask): Promise<void> {
  const { key, repoType, repoId, revision, path, token, targetImg, fallbackContainer } = task;

  // Cek cache ulang (bisa terisi sejak job masuk antrean)
  const cached = memoryCache.get(key);
  if (cached) {
    applyThumb(targetImg, cached, fallbackContainer);
    return;
  }

  // Hemat kuota: cek salinan thumbnail di vault (TTL 8 jam) sebelum unduh ulang.
  // Thumbnail tersimpan sebagai dataURL kecil → refresh halaman tidak memicu
  // unduhan ulang sumber gambar/video berukuran MB.
  const vaultKey = await mediaVaultKey('thumb', repoType, repoId, revision, path).catch(() => '');
  if (vaultKey) {
    const vaultBlob = await getFromMediaVault(vaultKey);
    if (vaultBlob) {
      const savedUrl = await vaultBlob.text();
      memoryCache.set(key, savedUrl);
      applyThumb(targetImg, savedUrl, fallbackContainer);
      return;
    }
  }

  let objectUrl: string | null = null;
  try {
    const blob = await downloadFileBlob(repoType, repoId, path, revision, token);
    if (blob.size === 0) {
      return;
    }
    objectUrl = URL.createObjectURL(blob);

    const dataUrl =
      task.kind === 'video'
        ? await generateVideoThumb(objectUrl)
        : await generateImageThumb(blob, objectUrl);

    // Simpan di cache memori lalu pasang ke kartu
    memoryCache.set(key, dataUrl);
    if (vaultKey) {
      void putToMediaVault(vaultKey, new Blob([dataUrl], { type: 'text/plain' }));
    }
    applyThumb(targetImg, dataUrl, fallbackContainer);
  } catch {
    // Biarkan ikon fallback SVG tetap tampil jika gagal / melewati tenggat
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

// ── Registrasi Kartu ──────────────────────────────────────────────────────

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'm4v', 'mov', 'mkv', 'avi']);

/**
 * Daftarkan kartu berkas gambar/video ke sistem lazy thumbnail.
 * - Gambar: diterima walau besar (decode asinkron + garansi waktu) dengan batas
 *   MAX_THUMBNAIL_SIZE dan batas piksel MAX_SOURCE_PIXELS.
 * - Video: poster frame diambil di ~10% awal klip dengan batas MAX_VIDEO_THUMBNAIL_SIZE.
 */
export function registerLazyThumbnail(
  cardThumbEl: HTMLElement,
  file: FileEntry,
  repoType: RepoType,
  repoId: string,
  revision: string,
  token?: string | null
): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let kind: ThumbKind | null = null;
  if (IMAGE_EXT.has(ext)) {
    kind = 'image';
  } else if (VIDEO_EXT.has(ext)) {
    kind = 'video';
  }
  if (!kind || file.size <= 0) return;

  // Batas ukuran per jenis; melebihi tetap pakai ikon fallback.
  const limit = kind === 'video' ? MAX_VIDEO_THUMBNAIL_SIZE : MAX_THUMBNAIL_SIZE;
  if (file.size > limit) return;

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
    applyThumb(imgEl, cached, fallbackSvg || undefined);
    return;
  }

  // Daftarkan ke observer
  const task: ThumbnailTask = {
    key: cacheKey,
    kind,
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
