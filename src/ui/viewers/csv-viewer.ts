// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/csv-viewer.ts — Penampil Tabel Virtual CSV & TSV HuggingStudio
// Tabel data dengan paginasi virtual, deteksi pemisah otomatis, urutkan kolom,
// dan pencarian cepat baris.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, fetchFileRange } from '../../api/tree';
import { MAX_PREVIEW_TEXT } from './types';
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

/**
 * Deteksi pemisah terbaik: koma, tab, titik koma, atau pipe.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const pipeCount = (firstLine.match(/\|/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  if (pipeCount > commaCount && pipeCount > semiCount) return '|';
  return ',';
}

/**
 * Parser CSV RFC 4180 yang menangani tanda petik dan karakter baris baru di dalam sel.
 */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // lewati quote ganda
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export async function renderCsvViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  let rawText = '';
  if (file.size > MAX_PREVIEW_TEXT && !ctx.forcePreview) {
    const res = await fetchFileRange(repoType, repoId, file.path, 0, MAX_PREVIEW_TEXT - 1, revision, token);
    const decoder = new TextDecoder('utf-8');
    rawText = decoder.decode(res.arrayBuffer);
  } else {
    const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
    rawText = await blob.text();
  }

  const delimiter = detectDelimiter(rawText);
  const parsedRows = parseCsv(rawText, delimiter);

  if (parsedRows.length === 0) {
    container.innerHTML = '<div class="p-4 text-muted">Berkas CSV/TSV kosong atau tidak memiliki data.</div>';
    return;
  }

  const headers = parsedRows[0];
  const allDataRows = parsedRows.slice(1);
  let filteredRows = [...allDataRows];

  // Paginasi virtual: 100 baris per halaman
  const PAGE_SIZE = 100;
  let currentPage = 1;
  let sortColIndex = -1;
  let sortAsc = true;

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-csv-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-csv-toolbar">
      <div class="hs-csv-stats">
        <span class="badge font-mono">${allDataRows.length.toLocaleString()} baris</span>
        <span class="badge font-mono">${headers.length} kolom</span>
        <span class="badge">Pemisah: ${delimiter === '\t' ? 'TAB' : delimiter}</span>
      </div>

      <div class="hs-csv-toolbar-right">
        <div class="hs-csv-search-wrap">
          <span class="search-icon">${iconSearch(14)}</span>
          <input type="text" id="hs-csv-search-input" class="input input-sm hs-csv-search" placeholder="Filter baris…" />
        </div>

        <button id="btn-copy-csv" class="btn btn-secondary btn-sm" type="button">
          ${iconCopy(14)}
          <span>Salin Data</span>
        </button>
      </div>
    </div>

    <div class="hs-csv-table-wrap">
      <table class="hs-csv-table">
        <thead>
          <tr id="hs-csv-thead-row">
            <th class="hs-csv-row-num">#</th>
          </tr>
        </thead>
        <tbody id="hs-csv-tbody"></tbody>
      </table>
    </div>

    <div class="hs-csv-pagination">
      <div id="hs-csv-page-info" class="text-xs text-muted"></div>
      <div class="btn-group">
        <button id="btn-csv-prev" class="btn btn-secondary btn-sm" type="button">Sebelumnya</button>
        <button id="btn-csv-next" class="btn btn-secondary btn-sm" type="button">Berikutnya</button>
      </div>
    </div>
  `;

  const theadRow = rootEl.querySelector<HTMLElement>('#hs-csv-thead-row')!;
  const tbody = rootEl.querySelector<HTMLElement>('#hs-csv-tbody')!;
  const pageInfo = rootEl.querySelector<HTMLElement>('#hs-csv-page-info')!;
  const btnPrev = rootEl.querySelector<HTMLButtonElement>('#btn-csv-prev')!;
  const btnNext = rootEl.querySelector<HTMLButtonElement>('#btn-csv-next')!;

  // Buat header kolom dengan pengurutan
  headers.forEach((h, colIdx) => {
    const th = document.createElement('th');
    th.className = 'hs-csv-th';
    th.innerHTML = `
      <div class="hs-csv-th-inner">
        <span>${esc(h || `Kolom ${colIdx + 1}`)}</span>
        <span class="hs-csv-sort-icon">↕</span>
      </div>
    `;
    th.addEventListener('click', () => {
      if (sortColIndex === colIdx) {
        sortAsc = !sortAsc;
      } else {
        sortColIndex = colIdx;
        sortAsc = true;
      }

      filteredRows.sort((a, b) => {
        const valA = a[colIdx] ?? '';
        const valB = b[colIdx] ?? '';
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });

      currentPage = 1;
      renderTablePage();
    });
    theadRow.appendChild(th);
  });

  function renderTablePage(): void {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredRows.slice(startIdx, startIdx + PAGE_SIZE);

    pageInfo.textContent = `Menampilkan ${startIdx + 1}–${Math.min(startIdx + PAGE_SIZE, filteredRows.length)} dari ${filteredRows.length.toLocaleString()} baris (Halaman ${currentPage}/${totalPages})`;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;

    let tbodyHtml = '';
    for (let r = 0; r < pageRows.length; r++) {
      const row = pageRows[r];
      const rowNum = startIdx + r + 1;
      tbodyHtml += `
        <tr>
          <td class="hs-csv-row-num">${rowNum}</td>
          ${headers.map((_, i) => `<td class="hs-csv-cell" title="${esc(row[i] ?? '')}">${esc(row[i] ?? '')}</td>`).join('')}
        </tr>
      `;
    }
    tbody.innerHTML = tbodyHtml;
  }

  renderTablePage();

  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePage();
    }
  });

  btnNext.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderTablePage();
    }
  });

  // Filter pencarian
  const searchInput = rootEl.querySelector<HTMLInputElement>('#hs-csv-search-input');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      filteredRows = [...allDataRows];
    } else {
      filteredRows = allDataRows.filter((r) => r.some((c) => c.toLowerCase().includes(q)));
    }
    currentPage = 1;
    renderTablePage();
  });

  // Tombol Salin
  rootEl.querySelector('#btn-copy-csv')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(rawText);
    showToast('Teks data disalin ke papan klip!', 'success');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
