// ──────────────────────────────────────────────────────────────────────────
// src/api/tree.ts — Tree API & File Explorer Operations
// Integrasi @huggingface/hub listFiles, cache hierarki berkas, dan unduh berkas/folder.
// ──────────────────────────────────────────────────────────────────────────

import { listFiles } from '@huggingface/hub';
import { zip } from 'fflate';
import { hfFetch } from './hf-client';

import type { RepoType } from './types';
import type { ListFileEntry } from '@huggingface/hub';

// ── Tipe & Antarmuka ──────────────────────────────────────────────────────

export interface FileEntry {
  /** Jalur lengkap relatif terhadap akar repo, contoh: "data/train.csv" */
  path: string;
  /** Nama berkas atau folder saja, contoh: "train.csv" */
  name: string;
  /** Tipe entri */
  type: 'file' | 'directory';
  /** Ukuran berkas dalam byte (0 untuk direktori) */
  size: number;
  /** Object ID / Git SHA berkas */
  oid: string;
  /** Apakah berkas dikelola oleh Git LFS */
  isLfs: boolean;
  /** Tanggal commit terakhir (jika tersedia) */
  lastCommitDate?: Date;
  /** Judul commit terakhir (jika tersedia) */
  lastCommitTitle?: string;
  /** Penanda status penundaan commit */
  stagedStatus?: 'added' | 'deleted' | 'renamed' | 'moved';
}

export interface TreeCacheEntry {
  timestamp: number;
  entries: FileEntry[];
}

// ── Cache di Memori ───────────────────────────────────────────────────────

/** Durasi masa berlaku cache tree (2 menit) */
const CACHE_TTL_MS = 2 * 60 * 1000;

/** Cache per direktori: key = `${repoType}:${repoId}:${revision}:${path}` */
const dirCache = new Map<string, TreeCacheEntry>();

/** Cache rekursif penuh seluruh repo: key = `${repoType}:${repoId}:${revision}` */
const fullRepoCache = new Map<string, TreeCacheEntry>();

/** Buat kunci cache */
function buildCacheKey(repoType: RepoType, repoId: string, revision: string, path: string): string {
  return `${repoType}:${repoId}:${revision}:${path}`;
}

/** Bersihkan cache untuk sebuah repositori (misal setelah commit berhasil) */
export function invalidateTreeCache(repoType: RepoType, repoId: string): void {
  const prefix = `${repoType}:${repoId}:`;
  for (const key of dirCache.keys()) {
    if (key.startsWith(prefix)) dirCache.delete(key);
  }
  for (const key of fullRepoCache.keys()) {
    if (key.startsWith(prefix)) fullRepoCache.delete(key);
  }
}

// ── Head Commit SHA (Parent Commit) ───────────────────────────────────────

/**
 * Mengambil commit SHA terakhir (HEAD) dari branch repositori.
 * Digunakan sebagai parentCommit untuk mendeteksi konflik (optimistic locking).
 */
export async function getRepoHeadCommit(
  repoType: RepoType,
  repoId: string,
  token?: string | null,
  revision: string = 'main'
): Promise<string> {
  if (!repoId || !repoId.trim()) {
    return '';
  }
  const endpoint = revision && revision !== 'main'
    ? `/api/${repoType}s/${repoId}/revision/${encodeURIComponent(revision)}`
    : `/api/${repoType}s/${repoId}`;
  const response = await hfFetch(endpoint, { token });
  const data = (await response.json()) as { sha?: string };
  if (!data.sha) {
    throw new Error(`Tidak dapat membaca commit SHA untuk repo ${repoId}`);
  }
  return data.sha;
}

// ── List Files (Folder Saat Ini) ──────────────────────────────────────────

/**
 * Mengambil isi dari sebuah folder dalam repositori.
 * Jika path kosong, mengambil isi direktori akar (root).
 */
export async function fetchDirectoryContents(
  repoType: RepoType,
  repoId: string,
  folderPath: string = '',
  revision: string = 'main',
  token?: string | null,
  forceRefresh: boolean = false
): Promise<FileEntry[]> {
  if (!repoId || !repoId.trim()) {
    return [];
  }
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
  const cacheKey = buildCacheKey(repoType, repoId, revision, normalizedPath);
  if (!forceRefresh) {
    const cached = dirCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.entries;
    }
  }

  const entries: FileEntry[] = [];
  const credentials = token ? { accessToken: token } : undefined;

  // listFiles @huggingface/hub menginterpolasi params.path langsung tanpa per-segment encoding.
  // Encode setiap segmen path agar karakter spasi, #, ?, %, non-ASCII aman.
  const encodedPathForHub = normalizedPath
    ? normalizedPath.split('/').map(encodeURIComponent).join('/')
    : '';

  const iterator = listFiles({
    repo: { type: repoType, name: repoId },
    path: encodedPathForHub,
    recursive: false,
    expand: false,
    revision,
    credentials,
  });

  for await (const item of iterator) {
    const entry = mapHubEntryToFileEntry(item);
    entries.push(entry);
  }

  // Urutkan direktori di atas, kemudian abjad
  sortEntries(entries);

  dirCache.set(cacheKey, { timestamp: Date.now(), entries });
  return entries;
}

// ── List Full Tree (Rekursif Penuh) ───────────────────────────────────────

/**
 * Mengambil seluruh struktur berkas secara rekursif.
 * Digunakan untuk navigasi sidebar tree panel dan pencarian rekursif.
 */
export async function fetchFullRepoTree(
  repoType: RepoType,
  repoId: string,
  revision: string = 'main',
  token?: string | null,
  forceRefresh: boolean = false
): Promise<FileEntry[]> {
  if (!repoId || !repoId.trim()) {
    return [];
  }
  const cacheKey = `${repoType}:${repoId}:${revision}`;
  if (!forceRefresh) {
    const cached = fullRepoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.entries;
    }
  }

  const entries: FileEntry[] = [];
  const credentials = token ? { accessToken: token } : undefined;

  const iterator = listFiles({
    repo: { type: repoType, name: repoId },
    recursive: true,
    expand: false,
    revision,
    credentials,
  });

  for await (const item of iterator) {
    const entry = mapHubEntryToFileEntry(item);
    entries.push(entry);
  }

  fullRepoCache.set(cacheKey, { timestamp: Date.now(), entries });
  return entries;
}

// ── Subtree Folder Tertentu (Rekursif Ter-scope) ──────────────────────────

/**
 * Mengambil seluruh berkas di DALAM satu folder tertentu secara rekursif.
 * Jauh lebih ringan daripada memindai seluruh repo — hanya sub-pohon folder
 * yang diminta (dipakai untuk unduhan ZIP folder tanpa full-tree scan).
 */
export async function fetchFolderSubtree(
  repoType: RepoType,
  repoId: string,
  folderPath: string,
  revision: string = 'main',
  token?: string | null,
  forceRefresh: boolean = false
): Promise<FileEntry[]> {
  if (!repoId || !repoId.trim()) {
    return [];
  }
  const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
  // Kunci memakai awalan sama dengan cache lain agar ikut terhapus invalidateTreeCache
  const cacheKey = `${repoType}:${repoId}:${revision}:${normalizedPath}:subtree`;
  if (!forceRefresh) {
    const cached = fullRepoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.entries;
    }
  }

  const entries: FileEntry[] = [];
  const credentials = token ? { accessToken: token } : undefined;

  const encodedPathForHub = normalizedPath
    ? normalizedPath.split('/').map(encodeURIComponent).join('/')
    : '';

  const iterator = listFiles({
    repo: { type: repoType, name: repoId },
    path: encodedPathForHub,
    recursive: true,
    expand: false,
    revision,
    credentials,
  });

  for await (const item of iterator) {
    const entry = mapHubEntryToFileEntry(item);
    entries.push(entry);
  }

  fullRepoCache.set(cacheKey, { timestamp: Date.now(), entries });
  return entries;
}

/**
 * Membangun URL unduh raw atau resolve langsung ke Hugging Face Hub.
 * - datasets: https://huggingface.co/datasets/:owner/:repo/:endpoint/:revision/:path
 * - spaces:   https://huggingface.co/spaces/:owner/:repo/:endpoint/:revision/:path
 * - models:   https://huggingface.co/:owner/:repo/:endpoint/:revision/:path (tanpa prefix /models/)
 */
export function buildHfRawUrl(
  repoType: RepoType,
  repoId: string,
  filePath: string,
  revision: string = 'main',
  endpoint: 'raw' | 'resolve' = 'raw'
): string {
  const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
  const encodedPath = cleanPath
    ? cleanPath.split('/').map(encodeURIComponent).join('/')
    : '';
  const encodedRevision = encodeURIComponent(revision || 'main');

  if (repoType === 'dataset') {
    return `https://huggingface.co/datasets/${repoId}/${endpoint}/${encodedRevision}/${encodedPath}`;
  }
  if (repoType === 'space') {
    return `https://huggingface.co/spaces/${repoId}/${endpoint}/${encodedRevision}/${encodedPath}`;
  }
  return `https://huggingface.co/${repoId}/${endpoint}/${encodedRevision}/${encodedPath}`;
}

export interface RangeFetchResult {
  arrayBuffer: ArrayBuffer;
  totalSize?: number;
  isPartial: boolean;
  status: number;
}

/**
 * Mengambil potongan bita berkas menggunakan HTTP header Range (bytes=start-end).
 * Mematuhi aturan hemat lebar pita: tidak mengunduh berkas utuh ke memori.
 */
export async function fetchFileRange(
  repoType: RepoType,
  repoId: string,
  filePath: string,
  startByte: number,
  endByte: number,
  revision: string = 'main',
  token?: string | null
): Promise<RangeFetchResult> {
  // Gunakan 'resolve' agar file LFS maupun reguler terbaca byte range aslinya (bukan LFS pointer 130 byte)
  const url = buildHfRawUrl(repoType, repoId, filePath, revision, 'resolve');
  const response = await hfFetch(url, {
    token,
    headers: {
      Range: `bytes=${startByte}-${endByte}`,
    },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Gagal membaca range berkas ${filePath}: HTTP ${response.status}`);
  }

  const contentRange = response.headers.get('content-range');
  let totalSize: number | undefined;
  if (contentRange) {
    const match = /\/(\d+)$/.exec(contentRange);
    if (match) {
      totalSize = parseInt(match[1], 10);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    arrayBuffer,
    totalSize,
    isPartial: response.status === 206,
    status: response.status,
  };
}

/**
 * Menyelesaikan URL bertanda tangan (signed/resolved redirect URL) untuk repositori privat.
 * Melakukan fetch dengan Authorization header, membaca response.url, lalu membatalkan body.
 */
export async function resolvePrivateFileUrl(
  repoType: RepoType,
  repoId: string,
  filePath: string,
  revision: string = 'main',
  token?: string | null
): Promise<string> {
  const url = buildHfRawUrl(repoType, repoId, filePath, revision, 'resolve');
  if (!token) {
    return url;
  }
  try {
    // Gunakan probe request dengan header Range bytes=0-0 agar server merespons
    // redirect signed URL CDN tanpa mendownload seluruh isi berkas media (anti double-fetch)
    const response = await hfFetch(url, {
      token,
      method: 'GET',
      headers: {
        Range: 'bytes=0-0',
      },
    });
    const finalUrl = response.url || url;
    void response.body?.cancel();
    return finalUrl;
  } catch {
    return url;
  }
}

/**
 * Mengunduh berkas tunggal dari Hugging Face Hub sebagai Blob.
 */
export async function downloadFileBlob(
  repoType: RepoType,
  repoId: string,
  filePath: string,
  revision: string = 'main',
  token?: string | null,
  endpoint: 'raw' | 'resolve' = 'resolve',
  signal?: AbortSignal
): Promise<Blob> {
  // Default 'resolve' untuk memastikan file LFS dan binary diunduh konten aslinya, bukan pointer text
  const url = buildHfRawUrl(repoType, repoId, filePath, revision, endpoint);
  const response = await hfFetch(url, { token, signal });
  if (!response.ok) {
    throw new Error(`Gagal mengunduh berkas ${filePath}: HTTP ${response.status}`);
  }
  return await response.blob();
}

/**
 * Mengunduh berkas dan memicu download dialog di peramban.
 */
export async function triggerFileDownload(
  repoType: RepoType,
  repoId: string,
  filePath: string,
  revision: string = 'main',
  token?: string | null
): Promise<void> {
  const blob = await downloadFileBlob(repoType, repoId, filePath, revision, token);
  const downloadUrl = URL.createObjectURL(blob);
  const filename = filePath.split('/').pop() ?? 'download';

  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Lepaskan URL objek memori
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}

// ── Unduh Folder Sebagai ZIP di Browser ───────────────────────────────────

/**
 * Mengunduh seluruh berkas dalam folder lalu menggabungkannya ke dalam arsip ZIP
 * di sisi peramban menggunakan pustaka fflate murni tanpa backend.
 */
export async function downloadFolderAsZip(
  repoType: RepoType,
  repoId: string,
  folderPath: string,
  filesToDownload: FileEntry[],
  revision: string = 'main',
  token?: string | null,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const onlyFiles = filesToDownload.filter((f) => f.type === 'file');
  const total = onlyFiles.length;
  if (total === 0) {
    throw new Error('Tidak ada berkas untuk diunduh dalam folder ini.');
  }

  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
  const prefix = cleanFolder ? `${cleanFolder}/` : '';
  const zipFiles: Record<string, Uint8Array> = {};
  let completed = 0;

  // Batasi antrean paralel 3 berkas secara simultan
  const CONCURRENCY = 3;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < onlyFiles.length) {
      const currentIdx = index++;
      const file = onlyFiles[currentIdx];
      // Unduh blob asli (resolve LFS & binary)
      const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token, 'resolve');
      const arrayBuffer = await blob.arrayBuffer();

      // Normalisasi jalur file (hilangkan leading slash dan duplikasi slash)
      const cleanFilePath = file.path.replace(/^\/+/, '').replace(/\/+/g, '/');
      let relativePath = cleanFilePath;

      if (prefix && cleanFilePath.startsWith(prefix)) {
        relativePath = cleanFilePath.slice(prefix.length);
      } else if (cleanFolder && cleanFilePath.startsWith(cleanFolder)) {
        relativePath = cleanFilePath.slice(cleanFolder.length).replace(/^\/+/, '');
      }

      // Pastikan relativePath bersih dari leading slash atau duplikasi slash
      relativePath = relativePath.replace(/^\/+/, '').replace(/\/+/g, '/');
      if (!relativePath) {
        relativePath = file.name || 'file';
      }

      zipFiles[relativePath] = new Uint8Array(arrayBuffer);
      completed++;
      onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, onlyFiles.length) }, () => worker());
  await Promise.all(workers);

  // Kompresi ZIP menggunakan fflate asynchronous
  const { promise, resolve, reject } = Promise.withResolvers<Uint8Array>();
  zip(zipFiles, { level: 6 }, (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });

  const zipData = await promise;
  const zipBlob = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
  const downloadUrl = URL.createObjectURL(zipBlob);
  const cleanFolderName = cleanFolder ? cleanFolder.split('/').pop() : '';
  const zipName = `${cleanFolderName || repoId.replace('/', '_')}.zip`;

  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = zipName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}

// ── Utilitas Pemetaan & Pengurutan ─────────────────────────────────────────

function mapHubEntryToFileEntry(item: ListFileEntry): FileEntry {
  const name = item.path.split('/').pop() ?? item.path;
  const isLfs = Boolean(item.lfs);
  const lastCommitDate = item.lastCommit?.date ? new Date(item.lastCommit.date) : undefined;

  return {
    path: item.path,
    name,
    type: item.type === 'directory' ? 'directory' : 'file',
    size: item.size ?? 0,
    oid: item.oid,
    isLfs,
    lastCommitDate,
    lastCommitTitle: item.lastCommit?.title,
  };
}

function sortEntries(entries: FileEntry[]): void {
  entries.sort((a, b) => {
    // Direktori selalu di atas berkas
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    // Urutkan nama abjad tanpa membedakan huruf besar/kecil
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
