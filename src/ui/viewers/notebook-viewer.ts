// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/notebook-viewer.ts — Penampil Jupyter Notebook .ipynb
// Render sel markdown sanitized, sel kode syntax highlighted, dan luaran (output).
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, fetchFileRange } from '../../api/tree';
import { MAX_PREVIEW_TEXT } from './types';
import DOMPurify from 'dompurify';
import { showToast } from '../components/toast';
import { iconCopy } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const NOTEBOOK_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'b', 'i',
  'u', 's', 'del', 'sub', 'sup', 'code', 'pre', 'blockquote', 'li', 'ul', 'ol',
  'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'img',
];

const NOTEBOOK_ALLOWED_ATTR = [
  'class', 'href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style',
];

const NOTEBOOK_FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea',
];

const NOTEBOOK_FORBID_ATTR = [
  'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction', 'action',
];

function parseNotebookMarkdown(md: string): string {
  let html = esc(md);
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, _l, code) => {
    return `<pre class="hs-code-pre"><code>${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="hs-md-inline-code">$1</code>');
  html = html.replace(/^###### (.*$)/gim, '<h6 class="hs-md-h6">$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5 class="hs-md-h5">$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4 class="hs-md-h4">$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="hs-md-h3">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="hs-md-h2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="hs-md-h1">$1</h1>');
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="hs-md-quote">$1</blockquote>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/^\s*[-*+]\s+(.*$)/gim, '<li class="hs-md-li">$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="hs-md-oli">$1</li>');
  html = html.replace(/^---$/gim, '<hr class="hs-md-hr" />');
  const paragraphs = html.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<li') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr')
      ) {
        return trimmed;
      }
      return `<p class="hs-md-p">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
}

interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  execution_count?: number | null;
  outputs?: NotebookOutput[];
}

interface NotebookOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  text?: string | string[];
  ename?: string;
  evalue?: string;
  traceback?: string[];
  data?: Record<string, unknown>;
}

interface NotebookData {
  metadata?: {
    kernelspec?: { display_name?: string; language?: string };
    language_info?: { name?: string; version?: string };
  };
  cells?: NotebookCell[];
}

function getSourceText(source: string | string[]): string {
  if (Array.isArray(source)) return source.join('');
  return source || '';
}

export async function renderNotebookViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  let rawJson = '';
  if (file.size > MAX_PREVIEW_TEXT && !ctx.forcePreview) {
    const res = await fetchFileRange(repoType, repoId, file.path, 0, MAX_PREVIEW_TEXT - 1, revision, token);
    const decoder = new TextDecoder('utf-8');
    rawJson = decoder.decode(res.arrayBuffer);
  } else {
    const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
    rawJson = await blob.text();
  }

  let nb: NotebookData;
  try {
    nb = JSON.parse(rawJson) as NotebookData;
  } catch {
    container.innerHTML = '<div class="p-4 text-muted">Format berkas .ipynb tidak valid.</div>';
    return;
  }

  const cells = nb.cells || [];
  const kernelName = nb.metadata?.kernelspec?.display_name || nb.metadata?.language_info?.name || 'Python 3';

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-nb-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-nb-toolbar">
      <div class="hs-nb-meta">
        <span class="badge badge-warning">${esc(kernelName)}</span>
        <span class="badge font-mono">${cells.length} sel</span>
      </div>

      <button id="btn-copy-nb-json" class="btn btn-secondary btn-sm" type="button">
        ${iconCopy(14)}
        <span>Salin Sumber</span>
      </button>
    </div>

    <div class="hs-nb-cells-container"></div>
  `;

  const cellsContainer = rootEl.querySelector<HTMLElement>('.hs-nb-cells-container')!;

  for (let idx = 0; idx < cells.length; idx++) {
    const cell = cells[idx];
    const cellEl = document.createElement('div');
    cellEl.className = `hs-nb-cell hs-nb-cell-${cell.cell_type}`;

    const text = getSourceText(cell.source);

    if (cell.cell_type === 'markdown') {
      DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      const parsed = parseNotebookMarkdown(text);
      const sanitized = DOMPurify.sanitize(parsed, {
        ALLOWED_TAGS: NOTEBOOK_ALLOWED_TAGS,
        ALLOWED_ATTR: NOTEBOOK_ALLOWED_ATTR,
        FORBID_TAGS: NOTEBOOK_FORBID_TAGS,
        FORBID_ATTR: NOTEBOOK_FORBID_ATTR,
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
      DOMPurify.removeHook('afterSanitizeAttributes');
      cellEl.innerHTML = `
        <div class="hs-nb-prompt"></div>
        <div class="hs-nb-markdown-body">${sanitized}</div>
      `;
    } else if (cell.cell_type === 'code') {
      const execCount = cell.execution_count != null ? `[${cell.execution_count}]:` : '[ ]:';

      let outputsHtml = '';
      if (cell.outputs && cell.outputs.length > 0) {
        outputsHtml = '<div class="hs-nb-outputs">';
        for (const out of cell.outputs) {
          if (out.output_type === 'stream' && out.text) {
            const outText = getSourceText(out.text);
            outputsHtml += `<pre class="hs-nb-output-stream"><code>${esc(outText)}</code></pre>`;
          } else if (out.output_type === 'error' && out.traceback) {
            const errText = out.traceback.join('\n');
            outputsHtml += `<pre class="hs-nb-output-error"><code>${esc(errText)}</code></pre>`;
          } else if (out.data) {
            // PNG / JPEG Image
            const imgData = (out.data['image/png'] || out.data['image/jpeg']) as string | undefined;
            if (typeof imgData === 'string') {
              const cleanBase64 = imgData.replace(/[^A-Za-z0-9+/=]/g, '');
              const mime = out.data['image/png'] ? 'image/png' : 'image/jpeg';
              outputsHtml += `<div class="hs-nb-output-image"><img src="data:${mime};base64,${cleanBase64}" alt="Luaran plot notebook" /></div>`;
            } else if (typeof out.data['image/svg+xml'] === 'string') {
              const safeSvg = DOMPurify.sanitize(out.data['image/svg+xml'] as string, {
                USE_PROFILES: { svg: true, svgFilters: true },
                FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject', 'base'],
                FORBID_ATTR: NOTEBOOK_FORBID_ATTR,
              });
              outputsHtml += `<div class="hs-nb-output-image hs-nb-output-svg">${safeSvg}</div>`;
            } else if (typeof out.data['text/html'] === 'string') {
              DOMPurify.addHook('afterSanitizeAttributes', (node) => {
                if (node.tagName === 'A') {
                  node.setAttribute('target', '_blank');
                  node.setAttribute('rel', 'noopener noreferrer');
                }
              });
              const safeHtml = DOMPurify.sanitize(out.data['text/html'], {
                ALLOWED_TAGS: NOTEBOOK_ALLOWED_TAGS,
                ALLOWED_ATTR: NOTEBOOK_ALLOWED_ATTR,
                FORBID_TAGS: NOTEBOOK_FORBID_TAGS,
                FORBID_ATTR: NOTEBOOK_FORBID_ATTR,
                ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
              });
              DOMPurify.removeHook('afterSanitizeAttributes');
              outputsHtml += `<div class="hs-nb-output-html">${safeHtml}</div>`;
            } else if (out.data['text/plain']) {
              const plainText = getSourceText(out.data['text/plain'] as string | string[]);
              outputsHtml += `<pre class="hs-nb-output-plain"><code>${esc(plainText)}</code></pre>`;
            }
          }
        }
        outputsHtml += '</div>';
      }

      cellEl.innerHTML = `
        <div class="hs-nb-cell-input-row">
          <div class="hs-nb-prompt font-mono text-xs">${execCount}</div>
          <div class="hs-nb-code-box">
            <pre class="hs-code-pre"><code>${esc(text)}</code></pre>
          </div>
        </div>
        ${outputsHtml}
      `;
    }

    cellsContainer.appendChild(cellEl);
  }

  rootEl.querySelector('#btn-copy-nb-json')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(rawJson);
    showToast('Sumber JSON notebook disalin ke papan klip!', 'success');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
