// ──────────────────────────────────────────────────────────────────────────
// src/state/pending-changes.ts — Sistem Perubahan Tertunda (Staged Changes)
// Menampung semua operasi file/folder sebelum disimpan ke HF dalam satu commit gabungan.
// ──────────────────────────────────────────────────────────────────────────

import { Store } from './store';

import type { FileEntry } from '../api/tree';

// ── Tipe Perubahan ────────────────────────────────────────────────────────

export type ChangeType = 'add' | 'delete' | 'rename' | 'move' | 'create_folder';

export interface PendingChange {
  /** Pengenal unik untuk setiap item perubahan */
  id: string;
  /** Tipe operasi */
  type: ChangeType;
  /** Jalur asal berkas/folder */
  path: string;
  /** Jalur tujuan (untuk rename/move) */
  newPath?: string;
  /** Konten data untuk berkas baru/diperbarui */
  content?: Blob;
  /** Ukuran berkas dalam byte */
  size?: number;
  /** Apakah entri merupakan direktori */
  isDirectory?: boolean;
  /** Waktu perubahan dibuat */
  timestamp: number;
}

// ── Store Perubahan Tertunda ──────────────────────────────────────────────

export const pendingChanges = new Store<PendingChange[]>([]);

/**
 * Memeriksa apakah ada perubahan tertunda yang belum di-commit.
 * Exported stable domain concept — dipakai oleh router guard dan app shell.
 */
export function hasPendingChanges(): boolean {
  return pendingChanges.value.length > 0;
}

// ── Listener Peringatan Sebelum Tutup Tab (beforeunload) ───────────────────

function handleBeforeUnload(e: BeforeUnloadEvent): void {
  if (hasPendingChanges()) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// Pasang event listener window secara otomatis
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', handleBeforeUnload);
}

// ── Pengelola Perubahan Tertunda ──────────────────────────────────────────

/** Buat ID acak sederhana */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Menambahkan berkas baru atau menimpa berkas yang ada.
 */
export function stageAddFile(path: string, content: Blob): void {
  const normalized = path.replace(/^\/+/, '');
  const existingIndex = pendingChanges.value.findIndex(
    (c) => c.path === normalized && (c.type === 'add' || c.type === 'create_folder')
  );

  const newChange: PendingChange = {
    id: generateId(),
    type: 'add',
    path: normalized,
    content,
    size: content.size,
    isDirectory: false,
    timestamp: Date.now(),
  };

  if (existingIndex >= 0) {
    const next = [...pendingChanges.value];
    next[existingIndex] = newChange;
    pendingChanges.set(next);
  } else {
    // Hapus perubahan delete jika sebelumnya ditandai dihapus
    const filtered = pendingChanges.value.filter(
      (c) => !(c.path === normalized && c.type === 'delete')
    );
    pendingChanges.set([...filtered, newChange]);
  }
}

/**
 * Menambahkan folder baru dengan membuat berkas penanda .gitkeep di dalamnya.
 */
export function stageCreateFolder(folderPath: string): void {
  const normalized = folderPath.replace(/^\/+|\/+$/g, '');
  const gitkeepPath = `${normalized}/.gitkeep`;
  const emptyBlob = new Blob([''], { type: 'text/plain' });

  const newChange: PendingChange = {
    id: generateId(),
    type: 'create_folder',
    path: gitkeepPath,
    content: emptyBlob,
    size: 0,
    isDirectory: true,
    timestamp: Date.now(),
  };

  // Jangan tambahkan jika sudah ada
  const exists = pendingChanges.value.some((c) => c.path === gitkeepPath);
  if (!exists) {
    pendingChanges.set([...pendingChanges.value, newChange]);
  }
}

/**
 * Menandai berkas atau folder untuk dihapus.
 */
export function stageDeleteEntry(path: string, isDirectory: boolean = false): void {
  const normalized = path.replace(/^\/+/, '');
  const currentChanges = pendingChanges.value;

  // 1. Jika item baru dibuat di stage (belum ada di server), cukup batalkan stage-nya
  const wasAddedLocally = currentChanges.some(
    (c) => (c.path === normalized || c.path === `${normalized}/.gitkeep`) &&
           (c.type === 'add' || c.type === 'create_folder')
  );

  if (wasAddedLocally) {
    pendingChanges.set(
      currentChanges.filter(
        (c) => c.path !== normalized &&
               c.path !== `${normalized}/.gitkeep` &&
               !c.path.startsWith(`${normalized}/`)
      )
    );
    return;
  }

  // 2. Jika item sebelumnya di-rename atau di-move dari path server yang berbeda:
  const wasMovedLocally = currentChanges.find(
    (c) => c.newPath === normalized && (c.type === 'move' || c.type === 'rename')
  );

  if (wasMovedLocally) {
    // Hapus perubahan move/rename tersebut, lalu tandai path ASLI di server sebagai deleted
    const originalServerPath = wasMovedLocally.path;
    const filtered = currentChanges.filter((c) => c.id !== wasMovedLocally.id);
    const deleteChange: PendingChange = {
      id: generateId(),
      type: 'delete',
      path: originalServerPath,
      isDirectory,
      timestamp: Date.now(),
    };
    pendingChanges.set([...filtered, deleteChange]);
    return;
  }

  // 3. Item biasa dari server
  const newChange: PendingChange = {
    id: generateId(),
    type: 'delete',
    path: normalized,
    isDirectory,
    timestamp: Date.now(),
  };

  // Hapus operasi lain yang menyangkut path ini
  const filtered = currentChanges.filter((c) => c.path !== normalized && c.newPath !== normalized);
  pendingChanges.set([...filtered, newChange]);
}

/**
 * Memindahkan berkas atau folder ke lokasi lain.
 */
export function stageMoveEntry(
  fromPath: string,
  toPath: string,
  isDirectory: boolean = false,
  size?: number
): void {
  const fromNormalized = fromPath.replace(/^\/+/, '');
  const toNormalized = toPath.replace(/^\/+/, '');

  if (fromNormalized === toNormalized) return;

  const currentChanges = pendingChanges.value;

  // Cek apakah item ini baru dibuat di staging (belum pernah di-commit ke HF)
  const locallyAddedIdx = currentChanges.findIndex(
    (c) => (c.path === fromNormalized || (c.type === 'create_folder' && c.path === `${fromNormalized}/.gitkeep`)) &&
           (c.type === 'add' || c.type === 'create_folder')
  );

  if (locallyAddedIdx >= 0) {
    const existing = currentChanges[locallyAddedIdx];
    const updated = [...currentChanges];
    if (existing.type === 'create_folder') {
      updated[locallyAddedIdx] = {
        ...existing,
        path: `${toNormalized}/.gitkeep`,
        timestamp: Date.now(),
      };
    } else {
      updated[locallyAddedIdx] = {
        ...existing,
        path: toNormalized,
        timestamp: Date.now(),
      };
    }
    const cleaned = updated.filter((c, idx) => idx === locallyAddedIdx || c.path !== toNormalized);
    pendingChanges.set(cleaned);
    return;
  }

  // Cek apakah item ini sebelumnya sudah pernah di-rename atau di-move di staging
  const existingMoveIdx = currentChanges.findIndex(
    (c) => c.newPath === fromNormalized && (c.type === 'move' || c.type === 'rename')
  );

  if (existingMoveIdx >= 0) {
    const existing = currentChanges[existingMoveIdx];
    // Jika dikembalikan ke path asal di server, batalkan perubahan
    if (existing.path === toNormalized) {
      pendingChanges.set(currentChanges.filter((_, idx) => idx !== existingMoveIdx));
      return;
    }
    const updated = [...currentChanges];
    updated[existingMoveIdx] = {
      ...existing,
      newPath: toNormalized,
      size: size ?? existing.size,
      timestamp: Date.now(),
    };
    pendingChanges.set(updated);
    return;
  }

  const newChange: PendingChange = {
    id: generateId(),
    type: 'move',
    path: fromNormalized,
    newPath: toNormalized,
    size,
    isDirectory,
    timestamp: Date.now(),
  };

  // Bersihkan operasi move/rename ganda pada path yang sama
  const filtered = currentChanges.filter(
    (c) => c.path !== fromNormalized && c.newPath !== toNormalized
  );
  pendingChanges.set([...filtered, newChange]);
}

/**
 * Mengganti nama berkas atau folder.
 */
export function stageRenameEntry(
  fromPath: string,
  newName: string,
  isDirectory: boolean = false,
  size?: number
): void {
  const fromNormalized = fromPath.replace(/^\/+/, '');
  const parts = fromNormalized.split('/');
  parts[parts.length - 1] = newName;
  const toNormalized = parts.join('/');

  if (fromNormalized === toNormalized) return;

  const currentChanges = pendingChanges.value;

  // Cek apakah item ini dibuat di staging
  const locallyAddedIdx = currentChanges.findIndex(
    (c) => (c.path === fromNormalized || (c.type === 'create_folder' && c.path === `${fromNormalized}/.gitkeep`)) &&
           (c.type === 'add' || c.type === 'create_folder')
  );

  if (locallyAddedIdx >= 0) {
    const existing = currentChanges[locallyAddedIdx];
    const updated = [...currentChanges];
    if (existing.type === 'create_folder') {
      updated[locallyAddedIdx] = {
        ...existing,
        path: `${toNormalized}/.gitkeep`,
        timestamp: Date.now(),
      };
    } else {
      updated[locallyAddedIdx] = {
        ...existing,
        path: toNormalized,
        timestamp: Date.now(),
      };
    }
    const cleaned = updated.filter((c, idx) => idx === locallyAddedIdx || c.path !== toNormalized);
    pendingChanges.set(cleaned);
    return;
  }

  // Cek apakah item ini sebelumnya sudah di-rename / di-move
  const existingMoveIdx = currentChanges.findIndex(
    (c) => c.newPath === fromNormalized && (c.type === 'move' || c.type === 'rename')
  );

  if (existingMoveIdx >= 0) {
    const existing = currentChanges[existingMoveIdx];
    if (existing.path === toNormalized) {
      pendingChanges.set(currentChanges.filter((_, idx) => idx !== existingMoveIdx));
      return;
    }
    const updated = [...currentChanges];
    updated[existingMoveIdx] = {
      ...existing,
      newPath: toNormalized,
      size: size ?? existing.size,
      timestamp: Date.now(),
    };
    pendingChanges.set(updated);
    return;
  }

  const newChange: PendingChange = {
    id: generateId(),
    type: 'rename',
    path: fromNormalized,
    newPath: toNormalized,
    size,
    isDirectory,
    timestamp: Date.now(),
  };

  const filtered = currentChanges.filter((c) => c.path !== fromNormalized && c.newPath !== toNormalized);
  pendingChanges.set([...filtered, newChange]);
}

/**
 * Membatalkan satu perubahan tertentu berdasarkan ID.
 */
export function discardChange(id: string): void {
  pendingChanges.set(pendingChanges.value.filter((c) => c.id !== id));
}

/**
 * Membuang semua perubahan tertunda.
 */
export function discardAllChanges(): void {
  pendingChanges.set([]);
}

// ── Generator Pesan Commit Otomatis ───────────────────────────────────────

/**
 * Menghasilkan judul dan deskripsi commit otomatis berdasarkan ringkasan perubahan.
 */
export function generateCommitMessage(): { title: string; description: string } {
  const changes = pendingChanges.value;
  if (changes.length === 0) {
    return { title: 'Pembaruan berkas via HuggingStudio', description: '' };
  }

  let addCount = 0;
  let deleteCount = 0;
  let moveCount = 0;
  let renameCount = 0;
  let folderCount = 0;

  const detailLines: string[] = [];

  for (const c of changes) {
    switch (c.type) {
      case 'add':
        addCount++;
        detailLines.push(`add: ${c.path}`);
        break;
      case 'create_folder':
        folderCount++;
        detailLines.push(`mkdir: ${c.path.replace(/\/\.gitkeep$/, '')}`);
        break;
      case 'delete':
        deleteCount++;
        detailLines.push(`delete: ${c.path}`);
        break;
      case 'move':
        moveCount++;
        detailLines.push(`move: ${c.path} -> ${c.newPath}`);
        break;
      case 'rename':
        renameCount++;
        detailLines.push(`rename: ${c.path} -> ${c.newPath}`);
        break;
    }
  }

  const summaryParts: string[] = [];
  if (addCount > 0) summaryParts.push(`tambah ${addCount} berkas`);
  if (folderCount > 0) summaryParts.push(`buat ${folderCount} folder`);
  if (moveCount > 0) summaryParts.push(`pindah ${moveCount} entri`);
  if (renameCount > 0) summaryParts.push(`ganti nama ${renameCount} entri`);
  if (deleteCount > 0) summaryParts.push(`hapus ${deleteCount} entri`);

  const summaryText = summaryParts.join(', ');
  const capitalizedSummary = summaryText.charAt(0).toUpperCase() + summaryText.slice(1);
  const title = `${capitalizedSummary} via HuggingStudio`;
  const description = detailLines.join('\n');

  return { title, description };
}

// ── Overlay Perubahan Tertunda pada Tampilan Direktori ────────────────────

/**
 * Mengaplikasikan perubahan tertunda secara virtual ke daftar berkas direktori aktif
 * agar pengguna langsung melihat dampak perubahan secara instan di UI.
 */
export function applyStagedOverlay(
  remoteEntries: FileEntry[],
  currentFolder: string
): FileEntry[] {
  const normalizedFolder = currentFolder.replace(/^\/+|\/+$/g, '');
  const prefix = normalizedFolder ? `${normalizedFolder}/` : '';
  const changes = pendingChanges.value;

  // Salin entri remote
  const entryMap = new Map<string, FileEntry>();
  for (const entry of remoteEntries) {
    entryMap.set(entry.path, { ...entry });
  }

  for (const c of changes) {
    // 1. Tangani Hapus
    if (c.type === 'delete') {
      if (entryMap.has(c.path)) {
        const item = entryMap.get(c.path)!;
        item.stagedStatus = 'deleted';
      }
      // Jika menghapus folder, tandai semua isi di dalamnya
      if (c.isDirectory) {
        for (const [path, item] of entryMap.entries()) {
          if (path.startsWith(`${c.path}/`)) {
            item.stagedStatus = 'deleted';
          }
        }
      }
    }

    // 2. Tangani Tambah Berkas / Folder
    else if (c.type === 'add' || c.type === 'create_folder') {
      const targetPath = c.type === 'create_folder'
        ? c.path.replace(/\/\.gitkeep$/, '')
        : c.path;

      const isDirectChild = normalizedFolder === ''
        ? !targetPath.includes('/')
        : targetPath.startsWith(prefix) && !targetPath.slice(prefix.length).includes('/');

      const isDescendant = normalizedFolder === ''
        ? targetPath.includes('/')
        : targetPath.startsWith(prefix) && targetPath.slice(prefix.length).includes('/');

      if (isDirectChild) {
        const name = targetPath.split('/').pop() ?? targetPath;
        entryMap.set(targetPath, {
          path: targetPath,
          name,
          type: c.type === 'create_folder' ? 'directory' : 'file',
          size: c.size ?? c.content?.size ?? 0,
          oid: 'staged',
          isLfs: false,
          stagedStatus: 'added',
        });
      } else if (isDescendant) {
        // Tampilkan folder direktori tingkat atas dari berkas/folder baru ini
        const rel = normalizedFolder === '' ? targetPath : targetPath.slice(prefix.length);
        const dirName = rel.split('/')[0];
        const dirPath = prefix ? `${prefix}${dirName}` : dirName;
        if (!entryMap.has(dirPath)) {
          entryMap.set(dirPath, {
            path: dirPath,
            name: dirName,
            type: 'directory',
            size: 0,
            oid: 'staged',
            isLfs: false,
            stagedStatus: 'added',
          });
        }
      }
    }

    // 3. Tangani Rename & Move
    else if ((c.type === 'rename' || c.type === 'move') && c.newPath) {
      if (entryMap.has(c.path)) {
        entryMap.delete(c.path);
      }
      if (c.isDirectory) {
        for (const path of Array.from(entryMap.keys())) {
          if (path.startsWith(`${c.path}/`)) {
            entryMap.delete(path);
          }
        }
      }

      const isTargetDirectChild = normalizedFolder === ''
        ? !c.newPath.includes('/')
        : c.newPath.startsWith(prefix) && !c.newPath.slice(prefix.length).includes('/');

      const isTargetDescendant = normalizedFolder === ''
        ? c.newPath.includes('/')
        : c.newPath.startsWith(prefix) && c.newPath.slice(prefix.length).includes('/');

      if (isTargetDirectChild) {
        const name = c.newPath.split('/').pop() ?? c.newPath;
        const origEntry = remoteEntries.find((e) => e.path === c.path);
        const size = c.size ?? origEntry?.size ?? 0;
        entryMap.set(c.newPath, {
          path: c.newPath,
          name,
          type: c.isDirectory ? 'directory' : 'file',
          size,
          oid: origEntry?.oid ?? 'staged',
          isLfs: origEntry?.isLfs ?? false,
          stagedStatus: c.type === 'rename' ? 'renamed' : 'moved',
        });
      } else if (isTargetDescendant) {
        const rel = normalizedFolder === '' ? c.newPath : c.newPath.slice(prefix.length);
        const dirName = rel.split('/')[0];
        const dirPath = prefix ? `${prefix}${dirName}` : dirName;
        if (!entryMap.has(dirPath)) {
          entryMap.set(dirPath, {
            path: dirPath,
            name: dirName,
            type: 'directory',
            size: 0,
            oid: 'staged',
            isLfs: false,
            stagedStatus: 'added',
          });
        }
      }
    }
  }

  const result = Array.from(entryMap.values());
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return result;
}
