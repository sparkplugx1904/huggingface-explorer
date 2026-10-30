// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/text-code-viewer.ts — Penampil Teks & Kode Sumber HuggingStudio
// Syntax highlighting ringan berkecepatan tinggi, nomor baris, toggle word wrap,
// dan pemotongan cerdas HTTP Range (1 MB pertama + tombol muat lebih).
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { fetchFileRange, downloadFileBlob } from '../../api/tree';
import { MAX_PREVIEW_TEXT } from './types';
import { showToast } from '../components/toast';
import { iconCopy, iconAlertCircle } from '../components/icons';

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

// ── Tokenizer Syntax Highlighter Ringan ────────────────────────────────────

const KEYWORDS = new Set([
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
  'switch', 'case', 'break', 'continue', 'class', 'extends', 'import', 'from',
  'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw',
  'new', 'typeof', 'instanceof', 'void', 'this', 'super', 'interface', 'type',
  'enum', 'namespace', 'implements', 'public', 'private', 'protected', 'static',
  'readonly', 'as', 'def', 'elif', 'yield', 'lambda', 'with', 'pass', 'raise',
  'fn', 'mut', 'pub', 'struct', 'impl', 'trait', 'match', 'use', 'mod', 'crate',
  'select', 'where', 'group', 'order', 'by', 'having', 'insert', 'update', 'delete',
]);

const BUILTINS = new Set([
  'true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil',
  'self', 'cls', 'boolean', 'string', 'number', 'any', 'unknown', 'never',
  'int', 'float', 'str', 'bool', 'list', 'dict', 'tuple', 'set',
]);

function highlightCode(rawCode: string): string {
  const lines = rawCode.split('\n');
  return lines
    .map((line) => {
      // String literal
      let processed = esc(line);

      // Comments: // ... or # ... or -- ...
      const commentIdx = processed.search(/(\/\/|#|--)(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
      if (commentIdx !== -1) {
        const before = processed.slice(0, commentIdx);
        const comment = processed.slice(commentIdx);
        processed = `${highlightTokens(before)}<span class="hs-code-comment">${comment}</span>`;
      } else {
        processed = highlightTokens(processed);
      }

      return processed;
    })
    .join('\n');
}

function highlightTokens(code: string): string {
  // Strings
  code = code.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="hs-code-string">$1</span>');

  // Numbers
  code = code.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hs-code-number">$1</span>');

  // Identifiers / Keywords
  code = code.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (match) => {
    if (KEYWORDS.has(match)) {
      return `<span class="hs-code-keyword">${match}</span>`;
    }
    if (BUILTINS.has(match)) {
      return `<span class="hs-code-builtin">${match}</span>`;
    }
    return match;
  });

  return code;
}

// ── Render Utama Text / Code Viewer ────────────────────────────────────────

export async function renderTextCodeViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  let loadedBytes = 0;
  let textContent = '';
  let isTruncated = false;

  // Baca 1 MB pertama jika berkas besar
  if (file.size > MAX_PREVIEW_TEXT && !ctx.forcePreview) {
    const rangeResult = await fetchFileRange(
      repoType,
      repoId,
      file.path,
      0,
      MAX_PREVIEW_TEXT - 1,
      revision,
      token
    );
    const decoder = new TextDecoder('utf-8');
    textContent = decoder.decode(rangeResult.arrayBuffer);
    loadedBytes = rangeResult.arrayBuffer.byteLength;
    isTruncated = true;
  } else {
    const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
    textContent = await blob.text();
    loadedBytes = blob.size;
    isTruncated = false;
  }

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-code-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-code-toolbar">
      <div class="hs-code-toolbar-left">
        <span class="hs-code-stats">
          <span id="hs-code-line-count">0</span> baris
          <span class="hs-crumb-sep">·</span>
          <span>${formatBytes(loadedBytes)}</span>
          ${isTruncated ? `<span class="badge badge-warning" style="margin-left:6px;">Dipotong pada 1 MB</span>` : ''}
        </span>
      </div>

      <div class="hs-code-toolbar-right">
        <button id="btn-toggle-wrap" class="btn btn-secondary btn-sm" type="button" title="Bungkus teks panjang">
          <span>Bungkus Teks</span>
        </button>
        <button id="btn-copy-code" class="btn btn-secondary btn-sm" type="button" title="Salin kode">
          ${iconCopy(14)}
          <span>Salin</span>
        </button>
      </div>
    </div>

    ${
      isTruncated
        ? `
      <div class="hs-code-truncated-banner">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:var(--hs-warning);">${iconAlertCircle(16)}</span>
          <span>Berkas berukuran besar (${formatBytes(file.size)}). Menampilkan 1 MB pertama.</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="btn-load-more" class="btn btn-secondary btn-sm" type="button">Muat 1 MB Lebih</button>
          <button id="btn-load-all" class="btn btn-primary btn-sm" type="button">Muat Semua</button>
        </div>
      </div>
    `
        : ''
    }

    <div class="hs-code-container">
      <div class="hs-code-line-numbers" aria-hidden="true"></div>
      <pre class="hs-code-pre"><code class="hs-code-body"></code></pre>
    </div>
  `;

  const codeBodyEl = rootEl.querySelector<HTMLElement>('.hs-code-body')!;
  const lineNumbersEl = rootEl.querySelector<HTMLElement>('.hs-code-line-numbers')!;
  const lineCountSpan = rootEl.querySelector<HTMLElement>('#hs-code-line-count')!;
  const codeContainer = rootEl.querySelector<HTMLElement>('.hs-code-container')!;

  function updateView(): void {
    const lines = textContent.split('\n');
    lineCountSpan.textContent = lines.length.toLocaleString();

    // Buat nomor baris
    const lineNumbersHtml = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    lineNumbersEl.innerHTML = lineNumbersHtml;

    // Highlight kode
    codeBodyEl.innerHTML = highlightCode(textContent);
  }

  updateView();

  // Tombol Toggle Word Wrap
  const btnWrap = rootEl.querySelector<HTMLButtonElement>('#btn-toggle-wrap');
  let isWrapped = false;
  btnWrap?.addEventListener('click', () => {
    isWrapped = !isWrapped;
    codeContainer.classList.toggle('wrap-lines', isWrapped);
    btnWrap.classList.toggle('btn-primary', isWrapped);
    btnWrap.classList.toggle('btn-secondary', !isWrapped);
  });

  // Tombol Salin Kode
  const btnCopy = rootEl.querySelector<HTMLButtonElement>('#btn-copy-code');
  btnCopy?.addEventListener('click', () => {
    void navigator.clipboard.writeText(textContent);
    showToast('Kode disalin ke papan klip!', 'success');
  });

  // Tombol Muat 1 MB Lebih
  rootEl.querySelector('#btn-load-more')?.addEventListener('click', async () => {
    const btn = rootEl.querySelector<HTMLButtonElement>('#btn-load-more');
    if (btn) btn.disabled = true;

    try {
      const nextStart = loadedBytes;
      const nextEnd = Math.min(nextStart + MAX_PREVIEW_TEXT - 1, file.size - 1);
      const res = await fetchFileRange(repoType, repoId, file.path, nextStart, nextEnd, revision, token);
      const decoder = new TextDecoder('utf-8');
      textContent += decoder.decode(res.arrayBuffer);
      loadedBytes += res.arrayBuffer.byteLength;

      if (loadedBytes >= file.size) {
        rootEl.querySelector('.hs-code-truncated-banner')?.remove();
      }
      updateView();
      showToast('1 MB berhasil dimuat.', 'info');
    } catch {
      showToast('Gagal memuat potongan berikutnya.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Tombol Muat Semua
  rootEl.querySelector('#btn-load-all')?.addEventListener('click', async () => {
    const btn = rootEl.querySelector<HTMLButtonElement>('#btn-load-all');
    if (btn) btn.disabled = true;

    try {
      const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
      textContent = await blob.text();
      loadedBytes = blob.size;
      rootEl.querySelector('.hs-code-truncated-banner')?.remove();
      updateView();
      showToast('Seluruh berkas berhasil dimuat.', 'success');
    } catch {
      showToast('Gagal memuat seluruh berkas.', 'error');
    }
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
