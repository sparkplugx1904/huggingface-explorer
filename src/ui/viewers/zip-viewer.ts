// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/zip-viewer.ts — Penampil Daftar Isi Arsip .zip HuggingStudio
// Inspeksi struktur direktori dan berkas di dalam arsip ZIP via fflate di browser.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, triggerFileDownload } from '../../api/tree';
import { MAX_PREVIEW_DOC } from './types';
import { renderInfoCard } from './info-card';
import { unzip } from 'fflate';
import { showToast } from '../components/toast';
import { iconDownload, iconFolder, iconFile, iconSearch } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface ZipEntryInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

export async function renderZipViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Arsip ZIP kosong (0 byte).');
    return;
  }

  if (file.size > MAX_PREVIEW_DOC && !ctx.forcePreview) {
    renderInfoCard(container, ctx, 'Ukuran arsip ZIP melampaui batas pratinjau otomatis 25 MB.');
    return;
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Arsip ZIP kosong (0 byte).');
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
    renderInfoCard(container, ctx, 'Gagal membuka atau membaca header arsip ZIP.');
    return;
  }

  const entries: ZipEntryInfo[] = [];
  let totalUncompressedSize = 0;

  for (const [path, data] of Object.entries(unzipped)) {
    const isDir = path.endsWith('/');
    const cleanPath = path.replace(/\/+$/, '');
    const name = cleanPath.split('/').pop() || cleanPath;
    const size = data.byteLength;
    totalUncompressedSize += size;

    entries.push({
      path: cleanPath,
      name,
      isDir,
      size,
    });
  }

  // Urutkan: direktori lebih dulu, kemudian nama abjad
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  let filteredEntries = [...entries];

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-zip-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-zip-toolbar">
      <div class="hs-zip-stats">
        <span class="badge font-mono">${entries.length} item</span>
        <span class="badge font-mono">Tak terkompresi: ${formatBytes(totalUncompressedSize)}</span>
        <span class="badge">Rasio: ${Math.round((1 - file.size / Math.max(totalUncompressedSize, 1)) * 100)}% lebih hemat</span>
      </div>

      <div class="hs-zip-toolbar-right">
        <div class="hs-zip-search-wrap">
          <span class="search-icon">${iconSearch(14)}</span>
          <input type="text" id="hs-zip-search-input" class="input input-sm hs-zip-search" placeholder="Cari berkas dalam zip…" />
        </div>

        <button id="btn-zip-download" class="btn btn-primary btn-sm" type="button">
          ${iconDownload(14)}
          <span>Unduh ZIP</span>
        </button>
      </div>
    </div>

    <div class="hs-zip-table-wrap">
      <table class="hs-zip-table">
        <thead>
          <tr>
            <th>Jalur Berkas</th>
            <th>Tipe</th>
            <th>Ukuran</th>
          </tr>
        </thead>
        <tbody id="hs-zip-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = rootEl.querySelector<HTMLElement>('#hs-zip-tbody')!;
  const searchInput = rootEl.querySelector<HTMLInputElement>('#hs-zip-search-input')!;

  function renderRows(): void {
    if (filteredEntries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-muted">Tidak ada berkas yang cocok.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredEntries
      .slice(0, 500)
      .map((e) => {
        const iconSvg = e.isDir ? iconFolder(16, 'text-muted') : iconFile(16, 'text-muted');
        return `
          <tr>
            <td class="font-mono text-xs">
              <span style="display:inline-flex;align-items:center;gap:6px;">
                ${iconSvg}
                <span style="color:var(--hs-text);font-weight:${e.isDir ? '600' : '400'};">${esc(e.path)}</span>
              </span>
            </td>
            <td><span class="badge badge-sm">${e.isDir ? 'Direktori' : 'Berkas'}</span></td>
            <td class="font-mono text-xs text-muted">${e.isDir ? '-' : formatBytes(e.size)}</td>
          </tr>
        `;
      })
      .join('');
  }

  renderRows();

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      filteredEntries = [...entries];
    } else {
      filteredEntries = entries.filter((e) => e.path.toLowerCase().includes(q));
    }
    renderRows();
  });

  rootEl.querySelector('#btn-zip-download')?.addEventListener('click', () => {
    void triggerFileDownload(repoType, repoId, file.path, revision, token);
    showToast(`Mengunduh ${file.name}…`, 'info');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
