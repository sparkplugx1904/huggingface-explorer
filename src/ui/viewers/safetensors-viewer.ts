// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/safetensors-viewer.ts — Penampil Metadata Berkas Safetensors
// Membaca HANYA header metadata via HTTP Range tanpa mengunduh bobot multi-GB.
// Menghitung jumlah parameter, bentuk tensor (shape), tipe data (dtype), dan offset.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { fetchFileRange } from '../../api/tree';
import { renderInfoCard } from './info-card';
import { showToast } from '../components/toast';
import { iconCopy, iconSearch } from '../components/icons';

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

function formatParamCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} K`;
  return n.toLocaleString();
}

interface TensorInfo {
  name: string;
  dtype: string;
  shape: number[];
  offsets: [number, number];
  paramCount: number;
  byteSize: number;
}

export async function renderSafetensorsViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size < 8) {
    renderInfoCard(
      container,
      ctx,
      file.size === 0
        ? 'Berkas Safetensors kosong (0 byte).'
        : 'Ukuran berkas terlalu kecil untuk format Safetensors.'
    );
    return;
  }

  let buffer: ArrayBuffer;
  try {
    // Ambil 1 MB pertama untuk membaca header
    const initialFetch = await fetchFileRange(
      repoType,
      repoId,
      file.path,
      0,
      1024 * 1024 - 1,
      revision,
      token
    );
    buffer = initialFetch.arrayBuffer;
  } catch {
    renderInfoCard(container, ctx, 'Gagal mengambil header Safetensors via HTTP Range.');
    return;
  }

  if (buffer.byteLength < 8) {
    renderInfoCard(container, ctx, 'Ukuran berkas terlalu kecil untuk format Safetensors.');
    return;
  }

  // Baca 8 byte pertama sebagai 64-bit unsigned integer little-endian
  const dataView = new DataView(buffer);
  const headerLength = Number(dataView.getBigUint64(0, true));

  if (headerLength <= 0 || headerLength > 100 * 1024 * 1024) {
    renderInfoCard(container, ctx, 'Panjang header Safetensors tidak valid.');
    return;
  }

  let jsonBytes: Uint8Array;
  if (buffer.byteLength >= 8 + headerLength) {
    jsonBytes = new Uint8Array(buffer, 8, headerLength);
  } else {
    // Jika header > 1 MB, ambil rentang yang tepat
    const fullHeaderRes = await fetchFileRange(
      repoType,
      repoId,
      file.path,
      8,
      8 + headerLength - 1,
      revision,
      token
    );
    jsonBytes = new Uint8Array(fullHeaderRes.arrayBuffer);
  }

  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(jsonBytes);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    renderInfoCard(container, ctx, 'Header JSON Safetensors korup.');
    return;
  }

  // Pisahkan __metadata__ dan daftar tensor
  const metadata = (parsed.__metadata__ as Record<string, string>) || {};
  const tensors: TensorInfo[] = [];

  let totalParams = 0;
  const dtypeCounts: Record<string, number> = {};

  for (const [key, val] of Object.entries(parsed)) {
    if (key === '__metadata__') continue;
    if (typeof val === 'object' && val !== null && 'dtype' in val && 'shape' in val) {
      const tVal = val as { dtype: string; shape?: number[]; data_offsets?: number[] };
      const shape = Array.isArray(tVal.shape) ? tVal.shape : [];
      const rawOffsets = Array.isArray(tVal.data_offsets) ? tVal.data_offsets : [0, 0];
      const offsets: [number, number] = rawOffsets.length >= 2 ? [rawOffsets[0], rawOffsets[1]] : [0, 0];
      const count = shape.reduce((acc, dim) => acc * dim, 1);
      const byteSize = Math.max(0, offsets[1] - offsets[0]);

      totalParams += count;
      dtypeCounts[tVal.dtype] = (dtypeCounts[tVal.dtype] || 0) + 1;

      tensors.push({
        name: key,
        dtype: tVal.dtype,
        shape,
        offsets,
        paramCount: count,
        byteSize,
      });
    }
  }

  let filteredTensors = [...tensors];

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-safetensors-viewer-root';

  const dtypeSummary = Object.entries(dtypeCounts)
    .map(([dtype, cnt]) => `<span class="badge font-mono">${esc(dtype)}: ${cnt}</span>`)
    .join(' ');

  rootEl.innerHTML = `
    <div class="hs-safetensors-summary">
      <div class="hs-safetensors-stat-card">
        <span class="hs-stat-label">Total Parameter</span>
        <span class="hs-stat-val font-mono" style="color:var(--hs-color-model);">${formatParamCount(totalParams)}</span>
        <span class="hs-stat-sub font-mono">${totalParams.toLocaleString()} elemen</span>
      </div>

      <div class="hs-safetensors-stat-card">
        <span class="hs-stat-label">Jumlah Tensor</span>
        <span class="hs-stat-val font-mono">${tensors.length.toLocaleString()}</span>
        <span class="hs-stat-sub">${dtypeSummary || 'Standar'}</span>
      </div>

      <div class="hs-safetensors-stat-card">
        <span class="hs-stat-label">Ukuran Total Bobot</span>
        <span class="hs-stat-val font-mono">${formatBytes(file.size)}</span>
        <span class="hs-stat-sub">Header: ${formatBytes(headerLength)}</span>
      </div>
    </div>

    ${
      Object.keys(metadata).length > 0
        ? `
      <div class="hs-safetensors-meta-box">
        <span class="text-xs font-semibold text-muted">METADATA MODEL:</span>
        <div class="hs-safetensors-meta-tags">
          ${Object.entries(metadata)
            .map(
              ([k, v]) => `
            <span class="badge"><strong>${esc(k)}:</strong> ${esc(String(v))}</span>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }

    <div class="hs-safetensors-table-toolbar">
      <div class="hs-safetensors-search-wrap">
        <span class="search-icon">${iconSearch(14)}</span>
        <input type="text" id="hs-tensor-search" class="input input-sm hs-tensor-search" placeholder="Cari nama tensor (mis. attn, mlp, weight)…" />
      </div>

      <button id="btn-copy-tensor-names" class="btn btn-secondary btn-sm" type="button">
        ${iconCopy(14)}
        <span>Salin Daftar Tensor</span>
      </button>
    </div>

    <div class="hs-safetensors-table-wrap">
      <table class="hs-safetensors-table">
        <thead>
          <tr>
            <th>Nama Tensor</th>
            <th>Tipe Data</th>
            <th>Bentuk (Shape)</th>
            <th>Parameter</th>
            <th>Ukuran Bita</th>
          </tr>
        </thead>
        <tbody id="hs-tensor-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = rootEl.querySelector<HTMLElement>('#hs-tensor-tbody')!;
  const searchInput = rootEl.querySelector<HTMLInputElement>('#hs-tensor-search')!;

  function renderRows(): void {
    if (filteredTensors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-muted">Tidak ada tensor yang cocok.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredTensors
      .slice(0, 300) // Tampilkan hingga 300 baris pertama
      .map(
        (t) => `
        <tr>
          <td class="font-mono text-xs" style="color:var(--hs-text);font-weight:500;">${esc(t.name)}</td>
          <td><span class="badge font-mono text-xs">${esc(t.dtype)}</span></td>
          <td class="font-mono text-xs">[${t.shape.join(', ')}]</td>
          <td class="font-mono text-xs">${formatParamCount(t.paramCount)}</td>
          <td class="font-mono text-xs text-muted">${formatBytes(t.byteSize)}</td>
        </tr>
      `
      )
      .join('');
  }

  renderRows();

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      filteredTensors = [...tensors];
    } else {
      filteredTensors = tensors.filter((t) => t.name.toLowerCase().includes(q));
    }
    renderRows();
  });

  rootEl.querySelector('#btn-copy-tensor-names')?.addEventListener('click', () => {
    const names = tensors.map((t) => t.name).join('\n');
    void navigator.clipboard.writeText(names);
    showToast('Daftar nama tensor disalin ke papan klip!', 'success');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
