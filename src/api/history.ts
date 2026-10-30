// ──────────────────────────────────────────────────────────────────────────
// src/api/history.ts — Riwayat Commit, Diff, Revert, & Pemulihan Berkas
// Integrasi endpoint Hugging Face commits, git diff parser, dan revert commit atomik.
// ──────────────────────────────────────────────────────────────────────────

import { commit } from '@huggingface/hub';
import { hfFetch } from './hf-client';
import { downloadFileBlob, getRepoHeadCommit, invalidateTreeCache } from './tree';
import { stageAddFile } from '../state/pending-changes';

import type { RepoType } from './types';
import type { CommitOperation } from '@huggingface/hub';

// ── Tipe & Antarmuka Data ─────────────────────────────────────────────────

export interface CommitAuthor {
  username: string;
  avatarUrl: string;
}

export interface CommitItem {
  /** Commit SHA lengkap 40 karakter */
  oid: string;
  /** Commit SHA pendek 7 karakter */
  shortOid: string;
  /** Judul ringkas commit */
  title: string;
  /** Pesan lengkap / deskripsi commit */
  message: string;
  /** Daftar pembuat commit */
  authors: CommitAuthor[];
  /** Tanggal pembuatan commit */
  date: Date;
}

export type DiffChangeType = 'added' | 'deleted' | 'modified' | 'renamed';

export interface CommitDiffFile {
  /** Jalur berkas saat ini */
  path: string;
  /** Jalur berkas sebelumnya (jika rename) */
  oldPath?: string;
  /** Tipe perubahan */
  type: DiffChangeType;
  /** Jumlah baris yang ditambahkan */
  additions: number;
  /** Jumlah baris yang dihapus */
  deletions: number;
  /** Patch teks diff untuk berkas ini */
  patch: string;
}

export interface CommitDiffResult {
  commitSha: string;
  rawDiff: string;
  files: CommitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface DeletedFileEntry {
  /** Jalur lengkap berkas yang pernah dihapus */
  path: string;
  /** Nama berkas saja */
  name: string;
  /** Commit SHA saat berkas dihapus */
  deletedInCommitSha: string;
  /** Judul commit saat berkas dihapus */
  deletedInCommitTitle: string;
  /** Tanggal commit penghapusan */
  deletedDate: Date;
  /** SHA commit sebelum berkas dihapus (tempat berkas masih ada utuh) */
  parentCommitSha: string;
  /** Pembuat commit penghapusan */
  author?: CommitAuthor;
}

export interface FetchCommitsOptions {
  repoType: RepoType;
  repoId: string;
  revision?: string;
  limit?: number;
  token?: string | null;
  path?: string;
}

export interface RevertCommitParams {
  repoType: RepoType;
  repoId: string;
  branch?: string;
  commitSha: string;
  commitTitle?: string;
  token: string;
  onProgress?: (status: string) => void;
}

export interface RestoreFileParams {
  repoType: RepoType;
  repoId: string;
  branch?: string;
  filePath: string;
  revision: string;
  mode: 'staged' | 'commit';
  token?: string | null;
  onProgress?: (status: string) => void;
}

// ── 1. Mengambil Riwayat Commit ───────────────────────────────────────────

/**
 * Mengambil daftar commit dari repositori Hugging Face.
 * Endpoint: GET /api/{models|datasets|spaces}/{repoId}/commits/{revision}?limit={limit}
 */
export async function fetchCommitHistory(
  options: FetchCommitsOptions
): Promise<CommitItem[]> {
  const { repoType, repoId, revision = 'main', limit = 50, token, path } = options;
  const endpoint = `/api/${repoType}s/${repoId}/commits/${encodeURIComponent(revision)}?limit=${limit}`;

  const response = await hfFetch(endpoint, { token });
  const rawList = (await response.json()) as Array<{
    id: string;
    title: string;
    message?: string;
    authors?: Array<{ user?: string; avatar?: string }>;
    date: string;
  }>;

  const commits: CommitItem[] = rawList.map((item) => ({
    oid: item.id,
    shortOid: item.id.slice(0, 7),
    title: item.title || '(Tanpa judul)',
    message: item.message || '',
    authors: (item.authors || []).map((a) => ({
      username: a.user || 'anonymous',
      avatarUrl: a.avatar || '',
    })),
    date: new Date(item.date),
  }));

  // Jika memfilter berdasarkan path berkas tertentu, kita bisa menyaringnya
  if (path) {
    const normalizedTarget = path.replace(/^\/+/, '');
    // Kita filter dengan memeriksa diff dari commit-commit tersebut secara bertahap
    const filteredCommits: CommitItem[] = [];
    for (const commitItem of commits) {
      try {
        const diff = await fetchCommitDiff(repoType, repoId, commitItem.oid, token);
        const touchesFile = diff.files.some(
          (f) => f.path === normalizedTarget || f.oldPath === normalizedTarget
        );
        if (touchesFile) {
          filteredCommits.push(commitItem);
        }
      } catch {
        // Jika diff gagal diambil, tetap sertakan commit untuk kehati-hatian
        filteredCommits.push(commitItem);
      }
    }
    return filteredCommits;
  }

  return commits;
}

/**
 * Mengambil commit SHA parent langsung dari sebuah commit.
 * Menggunakan query commit history dengan revision spesifik commitSha (limit: 2).
 * Jika commit memiliki parent, parent berada di index 1.
 * Mengembalikan null jika commit adalah commit awal (root) tanpa parent.
 */
export async function getParentCommitSha(
  repoType: RepoType,
  repoId: string,
  commitSha: string,
  token?: string | null
): Promise<string | null> {
  try {
    const history = await fetchCommitHistory({
      repoType,
      repoId,
      revision: commitSha,
      limit: 2,
      token,
    });
    if (history.length > 1) {
      return history[1].oid;
    }
    return null;
  } catch {
    return null;
  }
}

// ── 2. Mengambil & Mem-parse Git Diff Commit ───────────────────────────────

/**
 * Menyusun URL endpoint diff Hugging Face sesuai tipe repositori:
 * - Model:   /{repoId}/commit/{sha}.diff
 * - Dataset: /datasets/{repoId}/commit/{sha}.diff
 * - Space:   /spaces/{repoId}/commit/{sha}.diff
 */
function getDiffUrl(repoType: RepoType, repoId: string, commitSha: string): string {
  if (repoType === 'dataset') {
    return `/datasets/${repoId}/commit/${commitSha}.diff`;
  }
  if (repoType === 'space') {
    return `/spaces/${repoId}/commit/${commitSha}.diff`;
  }
  return `/${repoId}/commit/${commitSha}.diff`;
}

/**
 * Mem-parse teks git diff mentah menjadi struktur CommitDiffResult yang terurai rapi.
 */
export function parseGitDiff(rawDiff: string, commitSha: string): CommitDiffResult {
  const files: CommitDiffFile[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  if (!rawDiff || rawDiff.trim() === '') {
    return { commitSha, rawDiff, files, totalAdditions: 0, totalDeletions: 0 };
  }

  // Pisahkan blok per berkas menggunakan "diff --git"
  const rawSections = rawDiff.split(/^diff --git /m);

  for (const section of rawSections) {
    if (!section.trim()) continue;

    const lines = section.split('\n');
    const headerLine = lines[0]; // contoh: "a/src/index.ts b/src/index.ts"

    let oldPath = '';
    let newPath = '';
    const matchPaths = headerLine.match(/^a\/(.+?)\s+b\/(.+?)$/);
    if (matchPaths) {
      oldPath = matchPaths[1];
      newPath = matchPaths[2];
    } else {
      const parts = headerLine.split(' ');
      oldPath = parts[0]?.replace(/^a\//, '') || '';
      newPath = parts[1]?.replace(/^b\//, '') || oldPath;
    }

    let type: DiffChangeType = 'modified';
    let fileAdditions = 0;
    let fileDeletions = 0;
    const patchLines: string[] = [];
    let insideHunk = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('new file mode')) {
        type = 'added';
      } else if (line.startsWith('deleted file mode')) {
        type = 'deleted';
      } else if (line.startsWith('similarity index') || line.startsWith('rename from')) {
        type = 'renamed';
      } else if (line.startsWith('--- /dev/null')) {
        type = 'added';
      } else if (line.startsWith('+++ /dev/null')) {
        type = 'deleted';
      }

      if (line.startsWith('@@')) {
        insideHunk = true;
      }

      if (insideHunk) {
        patchLines.push(line);
        if (line.startsWith('+') && !line.startsWith('+++')) {
          fileAdditions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          fileDeletions++;
        }
      }
    }

    totalAdditions += fileAdditions;
    totalDeletions += fileDeletions;

    files.push({
      path: type === 'deleted' ? oldPath : newPath,
      oldPath: type === 'renamed' ? oldPath : undefined,
      type,
      additions: fileAdditions,
      deletions: fileDeletions,
      patch: patchLines.join('\n'),
    });
  }

  return {
    commitSha,
    rawDiff,
    files,
    totalAdditions,
    totalDeletions,
  };
}

/**
 * Mengambil diff dari sebuah commit tertentu dan mem-parse berkas-berkas yang berubah.
 */
export async function fetchCommitDiff(
  repoType: RepoType,
  repoId: string,
  commitSha: string,
  token?: string | null
): Promise<CommitDiffResult> {
  const url = getDiffUrl(repoType, repoId, commitSha);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await hfFetch(url, { token, signal: controller.signal });
    const rawDiff = await response.text();
    return parseGitDiff(rawDiff, commitSha);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── 3. Revert Commit (Commit BARU yang Membalikkan Efek Target) ─────────────

/**
 * Mengembalikan (revert) perubahan dari commit tertentu dengan membuat commit BARU
 * di atas HEAD saat ini (TIDAK BOLEH force push atau merusak riwayat).
 */
export async function revertCommit(
  params: RevertCommitParams
): Promise<{ oid: string; url: string }> {
  const {
    repoType,
    repoId,
    branch = 'main',
    commitSha,
    commitTitle,
    token,
    onProgress,
  } = params;

  if (!token) {
    throw new Error('Token otentikasi diperlukan untuk melakukan revert commit.');
  }

  onProgress?.('Membaca perubahan commit yang akan di-revert…');
  const diffResult = await fetchCommitDiff(repoType, repoId, commitSha, token);

  if (diffResult.files.length === 0) {
    throw new Error('Tidak ada berkas yang dapat di-revert pada commit ini.');
  }

  onProgress?.('Mencari parent commit…');
  // Ambil commit list untuk mencari parent commit
  const commits = await fetchCommitHistory({
    repoType,
    repoId,
    revision: branch,
    limit: 100,
    token,
  });

  const commitIndex = commits.findIndex((c) => c.oid === commitSha);
  let parentSha: string | null = null;
  if (commitIndex >= 0 && commitIndex + 1 < commits.length) {
    parentSha = commits[commitIndex + 1].oid;
  } else {
    // Hindari fallback ~1 yang menyebabkan 404 pada raw/resolve endpoint.
    // Ambil parent SHA langsung dari revision commitSha.
    parentSha = await getParentCommitSha(repoType, repoId, commitSha, token);
  }

  if (!parentSha) {
    throw new Error(
      `Tidak dapat me-revert commit ${commitSha.slice(0, 7)}: commit ini merupakan commit awal (root) atau tidak memiliki parent commit.`
    );
  }

  onProgress?.('Mempersiapkan operasi pembalikan berkas…');
  const operations: CommitOperation[] = [];

  for (const file of diffResult.files) {
    switch (file.type) {
      case 'added': {
        // Jika berkas ditambahkan di commit target, revert berarti menghapus berkas tersebut
        onProgress?.(`Menghapus berkas baru: ${file.path}…`);
        operations.push({
          operation: 'delete',
          path: file.path,
        });
        break;
      }

      case 'deleted': {
        // Jika berkas dihapus di commit target, revert berarti mengembalikan berkas dari parent commit
        onProgress?.(`Mengembalikan berkas terhapus: ${file.path}…`);
        const restoredBlob = await downloadFileBlob(
          repoType,
          repoId,
          file.path,
          parentSha,
          token,
          'resolve'
        );
        operations.push({
          operation: 'addOrUpdate',
          path: file.path,
          content: restoredBlob,
        });
        break;
      }

      case 'modified': {
        // Jika berkas dimodifikasi, kembalikan konten ke versi sebelum commit target (dari parentSha)
        onProgress?.(`Memulihkan versi berkas: ${file.path}…`);
        const previousBlob = await downloadFileBlob(
          repoType,
          repoId,
          file.path,
          parentSha,
          token,
          'resolve'
        );
        operations.push({
          operation: 'addOrUpdate',
          path: file.path,
          content: previousBlob,
        });
        break;
      }

      case 'renamed': {
        // Jika berkas di-rename, hapus nama baru dan kembalikan konten lama ke oldPath
        if (file.oldPath) {
          onProgress?.(`Mengembalikan nama berkas: ${file.oldPath}…`);
          const originalBlob = await downloadFileBlob(
            repoType,
            repoId,
            file.oldPath,
            parentSha,
            token,
            'resolve'
          );
          operations.push({
            operation: 'delete',
            path: file.path,
          });
          operations.push({
            operation: 'addOrUpdate',
            path: file.oldPath,
            content: originalBlob,
          });
        }
        break;
      }
    }
  }

  onProgress?.('Mengambil commit HEAD saat ini…');
  const headSha = await getRepoHeadCommit(repoType, repoId, token, branch);

  const newTitle = `Revert "${commitTitle || commitSha.slice(0, 7)}"`;
  const newDescription = `This reverts commit ${commitSha}.\n\nReverted changes:\n${diffResult.files
    .map((f) => `- ${f.type.toUpperCase()}: ${f.path}`)
    .join('\n')}`;

  onProgress?.('Mengirim commit revert baru ke Hugging Face…');
  const result = await commit({
    repo: { type: repoType, name: repoId },
    branch,
    title: newTitle,
    description: newDescription,
    operations,
    parentCommit: headSha,
    credentials: { accessToken: token },
  });

  // Bersihkan cache direktori agar tampilan sinkron seketika
  invalidateTreeCache(repoType, repoId);

  return {
    oid: result.commit.oid,
    url: result.commit.url,
  };
}

// ── 4. Kembalikan Berkas ke Versi Tertentu (Restore Version) ───────────────

/**
 * Mengembalikan satu berkas spesifik ke status pada revision/commit tertentu.
 * - Mode 'staged': berkas diunduh dan dimasukkan ke staged changes (pending changes).
 * - Mode 'commit': dibuatkan commit baru secara atomik di atas HEAD.
 */
export async function restoreFileVersion(
  params: RestoreFileParams
): Promise<{ success: boolean; oid?: string }> {
  const {
    repoType,
    repoId,
    branch = 'main',
    filePath,
    revision,
    mode,
    token,
    onProgress,
  } = params;

  onProgress?.(`Mengunduh berkas ${filePath} dari revisi ${revision.slice(0, 7)}…`);
  const blob = await downloadFileBlob(repoType, repoId, filePath, revision, token, 'resolve');

  if (mode === 'staged') {
    stageAddFile(filePath, blob);
    return { success: true };
  }

  if (!token) {
    throw new Error('Token otentikasi diperlukan untuk membuat commit pemulihan berkas.');
  }

  onProgress?.('Mengambil commit HEAD saat ini…');
  const headSha = await getRepoHeadCommit(repoType, repoId, token, branch);

  onProgress?.('Membuat commit pemulihan berkas…');
  const title = `Restore ${filePath} to revision ${revision.slice(0, 7)}`;
  const description = `Restored file ${filePath} from revision ${revision}`;

  const result = await commit({
    repo: { type: repoType, name: repoId },
    branch,
    title,
    description,
    operations: [
      {
        operation: 'addOrUpdate',
        path: filePath.replace(/^\/+/, ''),
        content: blob,
      },
    ],
    parentCommit: headSha,
    credentials: { accessToken: token },
  });

  invalidateTreeCache(repoType, repoId);

  return {
    success: true,
    oid: result.commit.oid,
  };
}

// ── 5. Menelusuri Berkas yang Baru Dihapus (Recently Deleted Files) ─────────

/**
 * Menelusuri riwayat commit terbaru untuk mendeteksi berkas-berkas yang pernah dihapus
 * sehingga pengguna dapat memulihkannya kembali ("Baru Dihapus").
 */
export async function getRecentlyDeletedFiles(
  repoType: RepoType,
  repoId: string,
  revision: string = 'main',
  token?: string | null,
  limitCommits: number = 25
): Promise<DeletedFileEntry[]> {
  const commits = await fetchCommitHistory({
    repoType,
    repoId,
    revision,
    limit: limitCommits,
    token,
  });

  const deletedFilesMap = new Map<string, DeletedFileEntry>();
  const activeExistingFiles = new Set<string>();

  // Dapatkan daftar berkas yang saat ini ada di HEAD (jika memungkinkan)
  try {
    const headSha = commits[0]?.oid || revision;
    const endpoint = `/api/${repoType}s/${repoId}/revision/${headSha}`;
    const headRes = await hfFetch(endpoint, { token });
    if (headRes.ok) {
      const headData = (await headRes.json()) as { siblings?: Array<{ rfilename: string }> };
      if (headData.siblings) {
        for (const s of headData.siblings) {
          activeExistingFiles.add(s.rfilename);
        }
      }
    }
  } catch {
    // Abaikan error pengecekan HEAD jika terjadi masalah network
  }

  // Telusuri commit dari yang terbaru ke yang terlama
  for (let i = 0; i < commits.length; i++) {
    const currentCommit = commits[i];
    let parentCommitSha = i + 1 < commits.length ? commits[i + 1].oid : '';
    if (!parentCommitSha) {
      parentCommitSha = (await getParentCommitSha(repoType, repoId, currentCommit.oid, token)) || '';
    }
    try {
      const diff = await fetchCommitDiff(repoType, repoId, currentCommit.oid, token);
      for (const file of diff.files) {
        if (file.type === 'deleted') {
          // Hanya masukkan jika belum ada di map (ambil kejadian penghapusan yang paling baru)
          // dan tidak sedang aktif ada di HEAD
          if (!deletedFilesMap.has(file.path) && !activeExistingFiles.has(file.path)) {
            const fileName = file.path.split('/').pop() || file.path;
            deletedFilesMap.set(file.path, {
              path: file.path,
              name: fileName,
              deletedInCommitSha: currentCommit.oid,
              deletedInCommitTitle: currentCommit.title,
              deletedDate: currentCommit.date,
              parentCommitSha,
              author: currentCommit.authors[0],
            });
          }
        }
      }
    } catch {
      // Lanjutkan ke commit berikutnya jika satu diff gagal diambil
      continue;
    }
  }

  return Array.from(deletedFilesMap.values());
}
