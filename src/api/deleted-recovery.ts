// ──────────────────────────────────────────────────────────────────────────
// src/api/deleted-recovery.ts — Pemulihan Berkas Terhapus (Recently Deleted)
// Mendeteksi berkas yang pernah dihapus dalam commit history dan memulihkannya
// ke pendingChanges untuk di-review dan di-commit atomik.
// ──────────────────────────────────────────────────────────────────────────

import { hfFetch } from './hf-client.js';
import { downloadFileBlob } from './tree.js';
import { stageAddFile } from '../state/pending-changes.js';

import type { RepoType } from './types.js';

// ── Tipe & Antarmuka ─────────────────────────────────────────────────────────

export interface DeletedFileAuthor {
  username: string;
  avatarUrl?: string;
}

export interface DeletedFileInfo {
  /** Jalur lengkap berkas saat masih ada, contoh: "src/utils/math.ts" */
  path: string;
  /** Nama berkas tanpa folder, contoh: "math.ts" */
  name: string;
  /** Tipe repositori */
  repoType: RepoType;
  /** Pengenal repo, contoh: "username/my-model" */
  repoId: string;
  /** Commit SHA saat berkas dihapus */
  deletedInCommitSha: string;
  /** Judul atau pesan commit saat berkas dihapus */
  deletedInCommitTitle?: string;
  /** Waktu commit penghapusan */
  deletedAt: Date;
  /** SHA commit sebelum penghapusan terjadi (tempat berkas masih ada utuh) */
  previousCommitSha: string;
  /** Estimasi atau ukuran pasti berkas dalam byte jika diketahui */
  size?: number;
  /** Git blob OID sebelum berkas dihapus */
  blobOid?: string;
  /** Pembuat commit penghapusan */
  author?: DeletedFileAuthor;
}

export interface DetectDeletedFilesOptions {
  repoType: RepoType;
  repoId: string;
  /** Branch target, default: 'main' */
  branch?: string;
  /** Jumlah commit terakhir yang dipindai, default: 20 */
  commitLimit?: number;
  /** Token autentikasi Hugging Face opsional */
  token?: string | null;
  /** Apakah menyaring berkas yang saat ini aktif di branch HEAD (default: true) */
  excludeActiveInHead?: boolean;
}

export interface RestoreDeletedResult {
  path: string;
  blob: Blob;
  size: number;
}

export interface RestoreAllProgress {
  restoredCount: number;
  total: number;
  currentFile: string;
}

export interface RestoreAllResult {
  restoredCount: number;
  errors: Array<{ file: DeletedFileInfo; error: Error }>;
}

// ── Diff URL Builder ─────────────────────────────────────────────────────────

/**
 * Membangun URL diff langsung ke Hugging Face.
 */
export function buildCommitDiffUrl(
  repoType: RepoType,
  repoId: string,
  commitSha: string
): string {
  if (repoType === 'dataset') {
    return `https://huggingface.co/datasets/${repoId}/commit/${commitSha}.diff`;
  }
  if (repoType === 'space') {
    return `https://huggingface.co/spaces/${repoId}/commit/${commitSha}.diff`;
  }
  return `https://huggingface.co/${repoId}/commit/${commitSha}.diff`;
}

// ── Diff Parser untuk Berkas Terhapus ────────────────────────────────────────

export interface ParsedDeletedEntry {
  path: string;
  blobOid?: string;
  estimatedSize?: number;
}

/**
 * Mem-parse patch git diff untuk mengekstrak berkas yang dihapus.
 * Menangani header 'deleted file mode', '+++ /dev/null', quote path dengan spasi,
 * dan estimasi ukuran byte (termasuk pointer Git LFS).
 */
export function parseDeletedFilesFromDiff(diffText: string): ParsedDeletedEntry[] {
  const result: ParsedDeletedEntry[] = [];
  if (!diffText || typeof diffText !== 'string') return result;

  const chunks = diffText.split(/^diff --git\s+/m);

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    const isDeletedMode = /deleted file mode \d+/m.test(chunk);
    const isDevNull = /\+\+\+ \/dev\/null/m.test(chunk);

    if (!isDeletedMode && !isDevNull) {
      continue;
    }

    let filePath: string | null = null;

    // Coba ambil dari pola "--- a/path"
    const minusMatch = chunk.match(/^---\s+(?:a\/|"a\/)(.+?)(?:"|\s*$)/m);
    if (minusMatch && minusMatch[1] && minusMatch[1] !== '/dev/null') {
      filePath = minusMatch[1];
    } else {
      // Coba ambil dari header baris pertama git diff: a/path b/path
      const headerMatch = chunk.match(/^(?:"?a\/(.+?)"?)\s+(?:"?b\/(.+?)"?)$/m);
      if (headerMatch && headerMatch[1]) {
        filePath = headerMatch[1];
      }
    }

    if (!filePath) continue;

    // Bersihkan unescaped quotes dan leading slash
    filePath = filePath.replace(/\\"/g, '"').replace(/^\/+/, '').trim();
    if (!filePath) continue;

    // Ambil blob OID lama dari baris index jika ada: index abc1234..0000000
    const indexMatch = chunk.match(/^index\s+([0-9a-fA-F]+)\.\.([0-9a-fA-F]+)/m);
    const blobOid = indexMatch ? indexMatch[1] : undefined;

    // Estimasi ukuran:
    let estimatedSize: number | undefined;

    // 1. Cek apakah berkas merupakan Git LFS pointer (-size 12345)
    const lfsSizeMatch = chunk.match(/^-size\s+(\d+)/m);
    if (lfsSizeMatch && lfsSizeMatch[1]) {
      estimatedSize = parseInt(lfsSizeMatch[1], 10);
    } else {
      // 2. Hitung total karakter dari baris-baris yang dihapus
      const deletedLines = chunk.match(/^-.*$/gm) || [];
      const contentLines = deletedLines.filter((line) => !line.startsWith('--- '));
      if (contentLines.length > 0) {
        estimatedSize = contentLines.reduce((acc, line) => acc + (line.length - 1) + 1, 0);
      }
    }

    result.push({
      path: filePath,
      blobOid,
      estimatedSize,
    });
  }

  return result;
}

// ── 1. Endpoint Deteksi Berkas Terhapus ───────────────────────────────────────

/**
 * Mendeteksi berkas yang pernah dihapus dalam N commit terakhir pada branch repositori.
 * Menelusuri commit history, mem-parse diff penghapusan, dan menyematkan SHA commit
 * induk (previousCommitSha) agar berkas dapat diunduh kembali sebelum dihapus.
 */
export async function detectRecentlyDeletedFiles(
  options: DetectDeletedFilesOptions
): Promise<DeletedFileInfo[]> {
  const {
    repoType,
    repoId,
    branch = 'main',
    commitLimit = 20,
    token = null,
    excludeActiveInHead = true,
  } = options;

  // 1. Ambil commitLimit + 1 commit agar commit terakhir yang dipindai tetap memiliki parent SHA
  const commitsEndpoint = `/api/${repoType}s/${repoId}/commits/${encodeURIComponent(branch)}?limit=${commitLimit + 1}`;
  let rawCommits: Array<{
    id: string;
    title: string;
    message?: string;
    authors?: Array<{ user?: string; username?: string; avatar?: string; avatarUrl?: string }>;
    date: string;
  }> = [];

  try {
    const res = await hfFetch(commitsEndpoint, { token });
    if (res.ok) {
      rawCommits = (await res.json()) as typeof rawCommits;
    }
  } catch (err) {
    console.warn(`[deleted-recovery] Gagal memuat riwayat commit untuk ${repoId}:`, err);
    return [];
  }

  if (!Array.isArray(rawCommits) || rawCommits.length === 0) {
    return [];
  }

  // 2. Identifikasi berkas yang saat ini masih aktif di HEAD (jika opsi aktif)
  const activeInHead = new Set<string>();
  if (excludeActiveInHead && rawCommits.length > 0) {
    try {
      const headSha = rawCommits[0].id;
      const revisionEndpoint = `/api/${repoType}s/${repoId}/revision/${headSha}`;
      const revRes = await hfFetch(revisionEndpoint, { token });
      if (revRes.ok) {
        const revData = (await revRes.json()) as { siblings?: Array<{ rfilename: string }> };
        if (Array.isArray(revData.siblings)) {
          for (const s of revData.siblings) {
            if (s.rfilename) activeInHead.add(s.rfilename);
          }
        }
      }
    } catch {
      // Abaikan jika endpoint revision tidak tersedia atau gagal
    }
  }

  const deletedMap = new Map<string, DeletedFileInfo>();
  const scanCount = Math.min(rawCommits.length, commitLimit);

  // 3. Telusuri commit dari yang terbaru ke yang terlama
  for (let i = 0; i < scanCount; i++) {
    const currentCommit = rawCommits[i];
    // Parent commit SHA adalah commit tepat setelahnya dalam urutan kronologis terbalik
    const previousCommitSha = i + 1 < rawCommits.length ? rawCommits[i + 1].id : null;

    // Jika commit tidak memiliki parent commit (root commit pertama repo), tidak ada versi sebelumnya
    if (!previousCommitSha) {
      continue;
    }

    try {
      const diffUrl = buildCommitDiffUrl(repoType, repoId, currentCommit.id);
      const diffRes = await hfFetch(diffUrl, { token });
      if (!diffRes.ok) {
        continue;
      }

      const diffText = await diffRes.text();
      const deletedEntries = parseDeletedFilesFromDiff(diffText);

      const firstAuthor = currentCommit.authors?.[0];
      const authorInfo: DeletedFileAuthor | undefined = firstAuthor
        ? {
            username: firstAuthor.user || firstAuthor.username || 'unknown',
            avatarUrl: firstAuthor.avatar || firstAuthor.avatarUrl,
          }
        : undefined;

      for (const entry of deletedEntries) {
        // Hanya simpan jika:
        // 1. Belum ada di deletedMap (ambil kejadian penghapusan paling mutakhir)
        // 2. Tidak sedang aktif kembali di branch HEAD
        if (!deletedMap.has(entry.path) && !activeInHead.has(entry.path)) {
          const fileName = entry.path.split('/').pop() || entry.path;
          deletedMap.set(entry.path, {
            path: entry.path,
            name: fileName,
            repoType,
            repoId,
            deletedInCommitSha: currentCommit.id,
            deletedInCommitTitle: currentCommit.title,
            deletedAt: new Date(currentCommit.date),
            previousCommitSha,
            size: entry.estimatedSize,
            blobOid: entry.blobOid,
            author: authorInfo,
          });
        }
      }
    } catch (err) {
      // Lewati commit jika gagal fetch diff individual agar tidak menggagalkan seluruh recovery
      console.warn(`[deleted-recovery] Gagal membaca diff commit ${currentCommit.id}:`, err);
      continue;
    }
  }

  return Array.from(deletedMap.values());
}

// ── 2. Pemulihan Berkas Tunggal ──────────────────────────────────────────────

/**
 * Mengunduh berkas versi terakhir sebelum dihapus dan memasukkannya ke stageAddFile
 * di pendingChanges agar pengguna bisa me-review dan me-restore dalam commit gabungan atomik.
 *
 * @param file        Informasi berkas yang dihapus (mengandung previousCommitSha)
 * @param targetPath  Jalur target berkas jika ingin diubah (opsional, default: file.path)
 * @param token       Token Hugging Face opsional
 */
export async function restoreDeletedFile(
  file: DeletedFileInfo,
  targetPath?: string,
  token?: string | null
): Promise<RestoreDeletedResult> {
  const pathToRestore = targetPath ? targetPath.replace(/^\/+/, '') : file.path;

  // Unduh konten berkas versi terakhir sebelum dihapus
  const blob = await downloadFileBlob(
    file.repoType,
    file.repoId,
    file.path,
    file.previousCommitSha,
    token
  );

  // Masukkan berkas ke staged changes (pendingChanges)
  stageAddFile(pathToRestore, blob);

  return {
    path: pathToRestore,
    blob,
    size: blob.size,
  };
}

// ── 3. Pemulihan Seluruh Berkas Terhapus Sekaligus ────────────────────────────

/**
 * Memulihkan semua berkas terhapus yang diberikan ke dalam pendingChanges.
 * Mendukung callback progress agar UI dapat menampilkan progres secara dinamis.
 */
export async function restoreAllDeletedFiles(
  files: DeletedFileInfo[],
  token?: string | null,
  onProgress?: (progress: RestoreAllProgress) => void
): Promise<RestoreAllResult> {
  let restoredCount = 0;
  const errors: Array<{ file: DeletedFileInfo; error: Error }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({
      restoredCount,
      total: files.length,
      currentFile: file.name,
    });

    try {
      await restoreDeletedFile(file, undefined, token);
      restoredCount++;
    } catch (err) {
      errors.push({
        file,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return { restoredCount, errors };
}

// ── Format Helpers ───────────────────────────────────────────────────────────

/**
 * Format ukuran bita ke representasi mudah dibaca (B, KB, MB, GB).
 */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/**
 * Format waktu relatif dalam Bahasa Indonesia (contoh: "5 menit lalu", "2 jam lalu").
 */
export function formatRelativeTime(dateInput: Date | string | number): string {
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : dateInput;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 30) return `${diffDays} hari lalu`;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
