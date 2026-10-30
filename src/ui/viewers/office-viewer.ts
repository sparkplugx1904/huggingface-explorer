// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/office-viewer.ts — Penampil Dokumen Office (Docx & Spreadsheet)
// Word .docx (mammoth + DOMPurify) & Spreadsheet .xlsx/.xls (SheetJS virtual table).
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob } from '../../api/tree';
import { MAX_PREVIEW_DOC } from './types';
import { renderInfoCard } from './info-card';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { iconSearch } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const DOCX_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'b', 'i',
  'u', 's', 'del', 'code', 'pre', 'blockquote', 'li', 'ul', 'ol', 'hr', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img',
];

const DOCX_ALLOWED_ATTR = [
  'class', 'href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height',
];

const DOCX_FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea',
];

const DOCX_FORBID_ATTR = [
  'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction', 'action',
];


/**
 * Render dokumen Word .docx
 */
export async function renderDocxViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas dokumen .docx kosong (0 byte).');
    return;
  }

  if (file.size > MAX_PREVIEW_DOC && !ctx.forcePreview) {
    renderInfoCard(container, ctx, 'Ukuran dokumen .docx melampaui batas 25 MB.');
    return;
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Berkas dokumen .docx kosong (0 byte).');
    return;
  }
  const arrayBuffer = await blob.arrayBuffer();

  const conversion = await mammoth.convertToHtml({ arrayBuffer });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  const safeHtml = DOMPurify.sanitize(conversion.value, {
    ALLOWED_TAGS: DOCX_ALLOWED_TAGS,
    ALLOWED_ATTR: DOCX_ALLOWED_ATTR,
    FORBID_TAGS: DOCX_FORBID_TAGS,
    FORBID_ATTR: DOCX_FORBID_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  DOMPurify.removeHook('afterSanitizeAttributes');
  const rootEl = document.createElement('div');
  rootEl.className = 'hs-docx-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-docx-page">
      <div class="hs-docx-body">${safeHtml || '<p class="text-muted">Dokumen tidak memiliki isi teks.</p>'}</div>
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(rootEl);
}

/**
 * Render dokumen Spreadsheet .xlsx / .xls / .ods
 */
export async function renderSpreadsheetViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  if (file.size === 0) {
    renderInfoCard(container, ctx, 'Berkas lembar kerja spreadsheet kosong (0 byte).');
    return;
  }

  if (file.size > MAX_PREVIEW_DOC && !ctx.forcePreview) {
    renderInfoCard(container, ctx, 'Ukuran lembar kerja spreadsheet melampaui batas 25 MB.');
    return;
  }

  const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
  if (blob.size === 0) {
    renderInfoCard(container, ctx, 'Berkas lembar kerja spreadsheet kosong (0 byte).');
    return;
  }
  const arrayBuffer = await blob.arrayBuffer();

  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    container.innerHTML = '<div class="p-4 text-muted">Buku kerja kosong.</div>';
    return;
  }

  let activeSheetName = sheetNames[0];

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-sheet-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-sheet-toolbar">
      <div class="hs-sheet-tabs" role="tablist">
        ${sheetNames
          .map(
            (name, idx) => `
          <button class="hs-sheet-tab-btn ${idx === 0 ? 'active' : ''}" data-sheet="${esc(name)}" type="button" role="tab">
            <span>${esc(name)}</span>
          </button>
        `
          )
          .join('')}
      </div>

      <div class="hs-sheet-search-wrap">
        <span class="search-icon">${iconSearch(14)}</span>
        <input type="text" id="hs-sheet-search-input" class="input input-sm hs-sheet-search" placeholder="Cari dalam sheet…" />
      </div>
    </div>

    <div class="hs-sheet-table-wrap">
      <table class="hs-sheet-table">
        <thead id="hs-sheet-thead"></thead>
        <tbody id="hs-sheet-tbody"></tbody>
      </table>
    </div>

    <div class="hs-sheet-pagination">
      <div id="hs-sheet-page-info" class="text-xs text-muted"></div>
      <div class="btn-group">
        <button id="btn-sheet-prev" class="btn btn-secondary btn-sm" type="button">Sebelumnya</button>
        <button id="btn-sheet-next" class="btn btn-secondary btn-sm" type="button">Berikutnya</button>
      </div>
    </div>
  `;

  const thead = rootEl.querySelector<HTMLElement>('#hs-sheet-thead')!;
  const tbody = rootEl.querySelector<HTMLElement>('#hs-sheet-tbody')!;
  const pageInfo = rootEl.querySelector<HTMLElement>('#hs-sheet-page-info')!;
  const btnPrev = rootEl.querySelector<HTMLButtonElement>('#btn-sheet-prev')!;
  const btnNext = rootEl.querySelector<HTMLButtonElement>('#btn-sheet-next')!;
  const searchInput = rootEl.querySelector<HTMLInputElement>('#hs-sheet-search-input')!;

  const PAGE_SIZE = 100;
  let currentPage = 1;
  let currentRows: unknown[][] = [];
  let filteredRows: unknown[][] = [];

  function loadSheet(sheetName: string): void {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    currentRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
    filteredRows = [...currentRows];
    currentPage = 1;
    renderSheetPage();
  }

  function getColLetter(colIdx: number): string {
    let result = '';
    let c = colIdx;
    while (c >= 0) {
      result = String.fromCharCode((c % 26) + 65) + result;
      c = Math.floor(c / 26) - 1;
    }
    return result;
  }

  function renderSheetPage(): void {
    if (filteredRows.length === 0) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td class="p-4 text-muted">Sheet tidak memiliki data baris.</td></tr>';
      pageInfo.textContent = '0 baris';
      btnPrev.disabled = true;
      btnNext.disabled = true;
      return;
    }

    // Hitung max kolom
    let maxCols = 0;
    for (const r of filteredRows.slice(0, 50)) {
      if (r && r.length > maxCols) maxCols = r.length;
    }
    maxCols = Math.max(maxCols, 1);

    // Header A, B, C...
    let theadHtml = '<tr><th class="hs-sheet-row-num">#</th>';
    for (let c = 0; c < maxCols; c++) {
      theadHtml += `<th class="hs-sheet-th">${getColLetter(c)}</th>`;
    }
    theadHtml += '</tr>';
    thead.innerHTML = theadHtml;

    // Body baris
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageData = filteredRows.slice(start, start + PAGE_SIZE);

    pageInfo.textContent = `Menampilkan ${start + 1}–${Math.min(start + PAGE_SIZE, filteredRows.length)} dari ${filteredRows.length.toLocaleString()} baris (Halaman ${currentPage}/${totalPages})`;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;

    let tbodyHtml = '';
    for (let i = 0; i < pageData.length; i++) {
      const row = pageData[i] || [];
      const rowNum = start + i + 1;
      tbodyHtml += `<tr><td class="hs-sheet-row-num">${rowNum}</td>`;
      for (let c = 0; c < maxCols; c++) {
        const val = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
        tbodyHtml += `<td class="hs-sheet-cell" title="${esc(val)}">${esc(val)}</td>`;
      }
      tbodyHtml += '</tr>';
    }
    tbody.innerHTML = tbodyHtml;
  }

  loadSheet(activeSheetName);

  // Tab switcher
  rootEl.querySelectorAll<HTMLButtonElement>('.hs-sheet-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sName = btn.dataset.sheet;
      if (!sName) return;
      activeSheetName = sName;
      rootEl.querySelectorAll('.hs-sheet-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadSheet(activeSheetName);
    });
  });

  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderSheetPage();
    }
  });

  btnNext.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderSheetPage();
    }
  });

  // Filter pencarian
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      filteredRows = [...currentRows];
    } else {
      filteredRows = currentRows.filter((r) =>
        r ? r.some((c) => String(c ?? '').toLowerCase().includes(q)) : false
      );
    }
    currentPage = 1;
    renderSheetPage();
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
