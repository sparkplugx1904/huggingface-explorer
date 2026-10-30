// ──────────────────────────────────────────────────────────────────────────
// src/api/commit.ts — Commit Gabungan & Deteksi Konflik
// Mengubah perubahan tertunda (staged) menjadi satu commit atomik via @huggingface/hub.
// ──────────────────────────────────────────────────────────────────────────

import { commit } from '@huggingface/hub';
import { pendingChanges, discardAllChanges } from '../state/pending-changes';
import { invalidateTreeCache, downloadFileBlob, fetchFullRepoTree } from './tree';

import type { RepoType } from './types';
import type { CommitOperation } from '@huggingface/hub';

export interface ExecuteCommitParams {
  repoType: RepoType;
  repoId: string;
  branch?: string;
  parentCommit: string;
  title: string;
  description?: string;
  token: string;
  onProgress?: (status: string) => void;
}

export interface CommitResult {
  oid: string;
  url: string;
}

export interface CommitConflictError extends Error {
  isConflict: true;
  expectedCommit: string;
  currentCommit?: string;
}

/**
 * Mengeksekusi seluruh perubahan tertunda dalam SATU commit gabungan atomik.
 */
export async function executeCombinedCommit(
  params: ExecuteCommitParams
): Promise<CommitResult> {
  const { repoType, repoId, branch = 'main', parentCommit, title, description, token, onProgress } = params;
  const changes = pendingChanges.value;

  if (changes.length === 0) {
    throw new Error('Tidak ada perubahan yang tertunda untuk di-commit.');
  }

  onProgress?.('Mempersiapkan operasi commit…');

  const operations: CommitOperation[] = [];
  const credentials = { accessToken: token };

  // Ambil struktur rekursif repo jika ada operasi folder delete/move
  const hasFolderOps = changes.some((c) => c.isDirectory);
  let fullTree = hasFolderOps
    ? await fetchFullRepoTree(repoType, repoId, branch, token)
    : [];

  const deletedPaths = new Set<string>();

  for (const c of changes) {
    const cleanPath = c.path.replace(/^\/+/, '');

    switch (c.type) {
      case 'add':
      case 'create_folder': {
        if (!c.content) {
          throw new Error(`Konten berkas untuk ${cleanPath} tidak ditemukan.`);
        }
        operations.push({
          operation: 'addOrUpdate',
          path: cleanPath,
          content: c.content,
        });
        break;
      }

      case 'delete': {
        if (c.isDirectory) {
          const dirPath = cleanPath.replace(/\/+$/g, '');
          const prefix = `${dirPath}/`;
          // Cari seluruh berkas di dalam folder ini dari pohon berkas remote
          const children = fullTree.filter(
            (f) => (f.path.startsWith(prefix) || f.path === `${dirPath}/.gitkeep`) && f.type === 'file'
          );
          for (const child of children) {
            const childClean = child.path.replace(/^\/+/, '');
            if (!deletedPaths.has(childClean)) {
              deletedPaths.add(childClean);
              operations.push({
                operation: 'delete',
                path: childClean,
              });
            }
          }
          // Pastikan .gitkeep juga terhapus jika ada di remote tree
          const gitkeepPath = `${dirPath}/.gitkeep`;
          if (
            !deletedPaths.has(gitkeepPath) &&
            fullTree.some((f) => f.path.replace(/^\/+/, '') === gitkeepPath)
          ) {
            deletedPaths.add(gitkeepPath);
            operations.push({
              operation: 'delete',
              path: gitkeepPath,
            });
          }
        } else {
          if (!deletedPaths.has(cleanPath)) {
            deletedPaths.add(cleanPath);
            operations.push({
              operation: 'delete',
              path: cleanPath,
            });
          }
        }
        break;
      }

      case 'rename':
      case 'move': {
        if (!c.newPath) break;
        const targetClean = c.newPath.replace(/^\/+/, '');

        if (c.isDirectory) {
          const sourceDir = cleanPath.replace(/\/+$/g, '');
          const targetDir = targetClean.replace(/\/+$/g, '');
          const prefix = `${sourceDir}/`;

          // Pindahkan semua berkas dalam folder secara rekursif (termasuk .gitkeep untuk folder kosong)
          const children = fullTree.filter(
            (f) => (f.path.startsWith(prefix) || f.path === `${sourceDir}/.gitkeep`) && f.type === 'file'
          );
          for (const child of children) {
            const relPath = child.path.startsWith(prefix)
              ? child.path.slice(prefix.length)
              : child.path.split('/').pop() || '';
            const targetPath = `${targetDir}/${relPath}`.replace(/\/+/g, '/');
            const sourceClean = child.path.replace(/^\/+/, '');

            onProgress?.(`Memproses pemindahan ${child.name}…`);
            // Unduh blob berkas asal dengan resolve agar LFS & binary terbaca utuh
            const fileBlob = await downloadFileBlob(repoType, repoId, sourceClean, branch, token, 'resolve');
            operations.push({
              operation: 'addOrUpdate',
              path: targetPath,
              content: fileBlob,
            });
            if (!deletedPaths.has(sourceClean)) {
              deletedPaths.add(sourceClean);
              operations.push({
                operation: 'delete',
                path: sourceClean,
              });
            }
          }
        } else {
          onProgress?.(`Memproses ${cleanPath}…`);
          // Jika berkas memiliki content lokal (berkas baru dibuat), pakai konten tersebut
          let contentBlob = c.content;
          if (!contentBlob) {
            contentBlob = await downloadFileBlob(repoType, repoId, cleanPath, branch, token, 'resolve');
          }

          operations.push({
            operation: 'addOrUpdate',
            path: targetClean,
            content: contentBlob,
          });
          if (!deletedPaths.has(cleanPath)) {
            deletedPaths.add(cleanPath);
            operations.push({
              operation: 'delete',
              path: cleanPath,
            });
          }
        }
        break;
      }
    }
  }

  // Sanitisasi operasi: jika sebuah path di-addOrUpdate, hapus operasi delete duplikat untuk path tersebut
  const addedPaths = new Set(
    operations.filter((op) => op.operation === 'addOrUpdate').map((op) => op.path)
  );
  const sanitizedOperations = operations.filter((op) => {
    if (op.operation === 'delete' && addedPaths.has(op.path)) {
      return false;
    }
    return true;
  });

  onProgress?.('Mengirim commit gabungan ke Hugging Face Hub…');

  try {
    const result = await commit({
      repo: { type: repoType, name: repoId },
      title,
      description,
      branch,
      operations: sanitizedOperations,
      parentCommit,
      credentials,
    });

    // Bersihkan cache dan hapus perubahan tertunda
    invalidateTreeCache(repoType, repoId);
    discardAllChanges();

    return {
      oid: result.commit.oid,
      url: result.commit.url,
    };
  } catch (err: unknown) {
    const errorStr = String(err);

    // Cek apakah error merupakan konflik parent commit (optimistic locking)
    const isConflict =
      errorStr.includes('parent commit') ||
      errorStr.includes('conflict') ||
      errorStr.includes('412') ||
      errorStr.includes('modified');

    if (isConflict) {
      const conflictErr = new Error(
        'Terjadi konflik commit: repositori telah diubah oleh pihak lain sejak halaman ini dibuka.'
      ) as CommitConflictError;
      conflictErr.isConflict = true;
      conflictErr.expectedCommit = parentCommit;
      throw conflictErr;
    }

    throw err;
  }
}
