// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/types.ts — Definisi Tipe & Konstanta Ukuran Viewer HuggingStudio
// Batasan ukuran aman, konteks penampil berkas, dan kontrak renderer lazy-loaded.
// ──────────────────────────────────────────────────────────────────────────

import type { RepoType } from '../../api/types';
import type { FileEntry } from '../../api/tree';

// ── Konstanta Batas Ukuran (Mudah disesuaikan) ─────────────────────────────

/** Maksimal ukuran berkas teks/kode/JSON/CSV untuk pratinjau langsung: 1 MB */
export const MAX_PREVIEW_TEXT = 1 * 1024 * 1024;

/** Maksimal ukuran gambar untuk dimuat langsung: 20 MB */
export const MAX_PREVIEW_IMAGE = 20 * 1024 * 1024;

/** Maksimal ukuran dokumen Office/PDF untuk pratinjau: 25 MB */
export const MAX_PREVIEW_DOC = 25 * 1024 * 1024;

/** Batas mutlak 1 GB: Jangan pernah memuat berkas >= 1 GB ke memori browser */
export const MAX_PREVIEW_HARD_LIMIT = 1024 * 1024 * 1024;

/** Maksimal ukuran berkas gambar untuk pembuatan thumbnail malas: 12 MB.
 *  Decode pakai createImageBitmap asinkron + garansi waktu, jadi gambar besar tetap aman. */
export const MAX_THUMBNAIL_SIZE = 12 * 1024 * 1024;

/** Maksimal ukuran video untuk pengambilan poster frame thumbnail: 16 MB.
 *  Hanya metadata + satu frame yang didekode, bukan seluruh isi klip. */
export const MAX_VIDEO_THUMBNAIL_SIZE = 16 * 1024 * 1024;

// ── Konteks Viewer ─────────────────────────────────────────────────────────

export interface ViewerContext {
  repoType: RepoType;
  repoId: string;
  revision: string;
  file: FileEntry;
  token?: string | null;
  allFiles?: FileEntry[];
  onNavigateFile?: (file: FileEntry) => void;
  onClose?: () => void;
  forcePreview?: boolean;
}

/** Tipe fungsi renderer viewer. Mengembalikan fungsi cleanup opsional. */
export type ViewerRenderer = (
  container: HTMLElement,
  ctx: ViewerContext
) => Promise<(() => void) | void> | (() => void) | void;

/** Kategori penampil berkas */
export type ViewerCategory =
  | 'code'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'image'
  | 'media'
  | 'pdf'
  | 'docx'
  | 'spreadsheet'
  | 'pptx'
  | 'notebook'
  | 'safetensors'
  | 'zip'
  | 'info';

// ── Pemetaan Ekstensi ke Kategori Viewer ───────────────────────────────────

const EXT_CODE_RECORD: Record<string, true> = {
  txt: true, py: true, js: true, ts: true, jsx: true, tsx: true,
  html: true, css: true, scss: true, sass: true, less: true,
  c: true, cpp: true, h: true, hpp: true, cs: true, java: true,
  rs: true, go: true, rb: true, php: true, sh: true, bash: true,
  zsh: true, yaml: true, yml: true, toml: true, xml: true, sql: true,
  dockerfile: true, makefile: true, env: true, log: true, r: true,
  lua: true, swift: true, kt: true, scala: true, ini: true, conf: true,
  gitattributes: true, gitignore: true, gitmodules: true, editorconfig: true,
  cfg: true, properties: true,
};

const EXT_IMAGE_RECORD: Record<string, true> = {
  png: true, jpg: true, jpeg: true, gif: true, webp: true,
  svg: true, bmp: true, ico: true, avif: true,
};

const EXT_MEDIA_RECORD: Record<string, true> = {
  mp4: true, webm: true, mov: true, ogg: true,
  mp3: true, wav: true, flac: true, m4a: true, aac: true,
};

const EXT_SPREADSHEET_RECORD: Record<string, true> = {
  xlsx: true, xls: true, ods: true,
};

/**
 * Mendeteksi kategori viewer yang tepat berdasarkan nama dan ekstensi berkas.
 */
export function detectViewerCategory(fileName: string): ViewerCategory {
  const lower = fileName.toLowerCase();

  // Kasus nama berkas khusus tanpa ekstensi
  if (lower === 'dockerfile' || lower === 'makefile') return 'code';

  const parts = lower.split('.');
  const ext = parts.length > 1 ? parts.pop()! : '';

  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'ipynb') return 'notebook';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'safetensors') return 'safetensors';
  if (ext === 'zip') return 'zip';

  if (EXT_IMAGE_RECORD[ext]) return 'image';
  if (EXT_MEDIA_RECORD[ext]) return 'media';
  if (EXT_SPREADSHEET_RECORD[ext]) return 'spreadsheet';
  if (EXT_CODE_RECORD[ext]) return 'code';

  return 'info';
}
