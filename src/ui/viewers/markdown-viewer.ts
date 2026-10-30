// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/markdown-viewer.ts — Penampil Dokumen Markdown HuggingStudio
// Parsing markdown bersih, sanitasi ketat DOMPurify, dan tab Mentah vs Render.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, fetchFileRange } from '../../api/tree';
import { MAX_PREVIEW_TEXT } from './types';
import DOMPurify from 'dompurify';
import { showToast } from '../components/toast';
import { iconCopy, iconEye, iconFileCode } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parser Markdown sederhana, aman, dan berkinerja tinggi tanpa dependensi berat.
 */
function parseMarkdownToHtml(md: string): string {
  let html = esc(md);

  // Fenced Code Blocks: ```lang ... ```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="hs-md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline Code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="hs-md-inline-code">$1</code>');

  // Headings
  html = html.replace(/^###### (.*$)/gim, '<h6 class="hs-md-h6">$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5 class="hs-md-h5">$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4 class="hs-md-h4">$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="hs-md-h3">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="hs-md-h2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="hs-md-h1">$1</h1>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="hs-md-quote">$1</blockquote>');
  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links: [text](url) -> disanitasi ketat oleh DOMPurify
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered list items
  html = html.replace(/^\s*[-*+]\s+(.*$)/gim, '<li class="hs-md-li">$1</li>');

  // Ordered list items
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="hs-md-oli">$1</li>');

  // Horizontal Rules
  html = html.replace(/^---$/gim, '<hr class="hs-md-hr" />');

  // Paragraphs (dua newline bergantian)
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs
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

  return html;
}

export async function renderMarkdownViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  let mdText = '';
  if (file.size > MAX_PREVIEW_TEXT && !ctx.forcePreview) {
    const rangeRes = await fetchFileRange(repoType, repoId, file.path, 0, MAX_PREVIEW_TEXT - 1, revision, token);
    const decoder = new TextDecoder('utf-8');
    mdText = decoder.decode(rangeRes.arrayBuffer);
  } else {
    const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
    mdText = await blob.text();
  }

  // Sanitasi via DOMPurify untuk keamanan mutlak dari XSS: melarang script, onerror, onload, dll.
  const rawHtml = parseMarkdownToHtml(mdText);

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'b', 'i',
      'u', 's', 'del', 'code', 'pre', 'blockquote', 'li', 'ul', 'ol', 'hr',
      'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a',
    ],
    ALLOWED_ATTR: ['class', 'href', 'title', 'target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction', 'action'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  DOMPurify.removeHook('afterSanitizeAttributes');
  const rootEl = document.createElement('div');
  rootEl.className = 'hs-md-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-md-toolbar">
      <div class="segmented-control" role="tablist">
        <button id="btn-tab-preview" class="segmented-btn active" role="tab" type="button" aria-selected="true">
          ${iconEye(14)}
          <span>Pratinjau</span>
        </button>
        <button id="btn-tab-raw" class="segmented-btn" role="tab" type="button" aria-selected="false">
          ${iconFileCode(14)}
          <span>Mentah</span>
        </button>
      </div>

      <button id="btn-copy-md" class="btn btn-secondary btn-sm" type="button">
        ${iconCopy(14)}
        <span>Salin Markdown</span>
      </button>
    </div>

    <div class="hs-md-content">
      <div id="hs-md-rendered" class="hs-md-body">${safeHtml}</div>
      <div id="hs-md-raw" class="hs-md-raw" style="display:none;"><pre><code>${esc(mdText)}</code></pre></div>
    </div>
  `;

  const btnPreview = rootEl.querySelector<HTMLButtonElement>('#btn-tab-preview')!;
  const btnRaw = rootEl.querySelector<HTMLButtonElement>('#btn-tab-raw')!;
  const renderedEl = rootEl.querySelector<HTMLElement>('#hs-md-rendered')!;
  const rawEl = rootEl.querySelector<HTMLElement>('#hs-md-raw')!;

  btnPreview.addEventListener('click', () => {
    btnPreview.classList.add('active');
    btnPreview.setAttribute('aria-selected', 'true');
    btnRaw.classList.remove('active');
    btnRaw.setAttribute('aria-selected', 'false');
    renderedEl.style.display = 'block';
    rawEl.style.display = 'none';
  });

  btnRaw.addEventListener('click', () => {
    btnRaw.classList.add('active');
    btnRaw.setAttribute('aria-selected', 'true');
    btnPreview.classList.remove('active');
    btnPreview.setAttribute('aria-selected', 'false');
    renderedEl.style.display = 'none';
    rawEl.style.display = 'block';
  });

  rootEl.querySelector('#btn-copy-md')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(mdText);
    showToast('Markdown disalin ke papan klip!', 'success');
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
