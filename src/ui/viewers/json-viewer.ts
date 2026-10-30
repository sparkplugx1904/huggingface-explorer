// ──────────────────────────────────────────────────────────────────────────
// src/ui/viewers/json-viewer.ts — Penampil Hierarki Berkas JSON HuggingStudio
// Pohon interaktif, lipat/buka simpul, filter pencarian kunci/nilai, dan salin.
// ──────────────────────────────────────────────────────────────────────────

import type { ViewerContext } from './types';
import { downloadFileBlob, fetchFileRange } from '../../api/tree';
import { MAX_PREVIEW_TEXT } from './types';
import { showToast } from '../components/toast';
import { iconCopy, iconSearch, iconChevronRight, iconChevronDown } from '../components/icons';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderJsonNode(key: string | null, val: unknown, depth = 0): HTMLElement {
  const node = document.createElement('div');
  node.className = 'hs-json-node';
  node.style.paddingLeft = `${depth * 18}px`;

  const keyHtml = key !== null ? `<span class="hs-json-key">"${esc(key)}"</span><span class="hs-json-colon">: </span>` : '';

  if (val === null) {
    node.innerHTML = `${keyHtml}<span class="hs-json-null">null</span>`;
    return node;
  }

  if (typeof val === 'boolean') {
    node.innerHTML = `${keyHtml}<span class="hs-json-bool">${val}</span>`;
    return node;
  }

  if (typeof val === 'number') {
    node.innerHTML = `${keyHtml}<span class="hs-json-num">${val}</span>`;
    return node;
  }

  if (typeof val === 'string') {
    node.innerHTML = `${keyHtml}<span class="hs-json-str">"${esc(val)}"</span>`;
    return node;
  }

  // Object atau Array (Collapsible)
  const isArray = Array.isArray(val);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const entries = isArray
    ? (val as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(val as Record<string, unknown>);

  const count = entries.length;

  const header = document.createElement('div');
  header.className = 'hs-json-header';
  header.innerHTML = `
    <span class="hs-json-toggle">${iconChevronDown(12)}</span>
    ${keyHtml}
    <span class="hs-json-bracket">${openBracket}</span>
    <span class="hs-json-count">${count} ${isArray ? 'item' : 'kunci'}</span>
  `;

  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'hs-json-children';

  for (const [k, v] of entries) {
    const childNode = renderJsonNode(isArray ? null : k, v, depth + 1);
    childrenContainer.appendChild(childNode);
  }

  const footer = document.createElement('div');
  footer.className = 'hs-json-footer';
  footer.style.paddingLeft = `${depth * 18}px`;
  footer.innerHTML = `<span class="hs-json-bracket">${closeBracket}</span>`;

  let isCollapsed = false;
  header.querySelector('.hs-json-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollapsed = !isCollapsed;
    childrenContainer.style.display = isCollapsed ? 'none' : 'block';
    footer.style.display = isCollapsed ? 'none' : 'block';
    const toggleIcon = header.querySelector('.hs-json-toggle');
    if (toggleIcon) {
      toggleIcon.innerHTML = isCollapsed ? iconChevronRight(12) : iconChevronDown(12);
    }
  });

  node.appendChild(header);
  node.appendChild(childrenContainer);
  node.appendChild(footer);
  return node;
}

export async function renderJsonViewer(
  container: HTMLElement,
  ctx: ViewerContext
): Promise<void> {
  const { repoType, repoId, revision, file, token } = ctx;

  let jsonStr = '';
  if (file.size > MAX_PREVIEW_TEXT && !ctx.forcePreview) {
    const res = await fetchFileRange(repoType, repoId, file.path, 0, MAX_PREVIEW_TEXT - 1, revision, token);
    const decoder = new TextDecoder('utf-8');
    jsonStr = decoder.decode(res.arrayBuffer);
  } else {
    const blob = await downloadFileBlob(repoType, repoId, file.path, revision, token);
    jsonStr = await blob.text();
  }

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    parseError = err instanceof Error ? err.message : 'Format JSON tidak valid';
  }

  const rootEl = document.createElement('div');
  rootEl.className = 'hs-json-viewer-root';

  rootEl.innerHTML = `
    <div class="hs-json-toolbar">
      <div class="hs-json-search-wrap">
        <span class="search-icon">${iconSearch(14)}</span>
        <input type="text" id="hs-json-search-input" class="input input-sm hs-json-search" placeholder="Cari kunci atau nilai…" />
      </div>

      <div style="display:flex;gap:8px;">
        <button id="btn-copy-json" class="btn btn-secondary btn-sm" type="button">
          ${iconCopy(14)}
          <span>Salin JSON</span>
        </button>
      </div>
    </div>

    <div class="hs-json-tree-container"></div>
  `;

  const treeContainer = rootEl.querySelector<HTMLElement>('.hs-json-tree-container')!;

  if (parseError) {
    treeContainer.innerHTML = `
      <div class="hs-json-error">
        <p><strong>Gagal mem-parsing JSON:</strong> ${esc(parseError)}</p>
        <pre class="hs-code-pre"><code>${esc(jsonStr)}</code></pre>
      </div>
    `;
  } else {
    const treeEl = renderJsonNode(null, parsed, 0);
    treeContainer.appendChild(treeEl);
  }

  // Tombol Salin JSON
  rootEl.querySelector('#btn-copy-json')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(
      parsed !== null ? JSON.stringify(parsed, null, 2) : jsonStr
    );
    showToast('JSON rapi disalin ke papan klip!', 'success');
  });

  // Filter pencarian sederhana
  const searchInput = rootEl.querySelector<HTMLInputElement>('#hs-json-search-input');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const nodes = treeContainer.querySelectorAll<HTMLElement>('.hs-json-node');
    if (!q) {
      nodes.forEach((n) => (n.style.backgroundColor = ''));
      return;
    }
    nodes.forEach((n) => {
      const text = n.textContent?.toLowerCase() ?? '';
      if (text.includes(q)) {
        n.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
      } else {
        n.style.backgroundColor = '';
      }
    });
  });

  container.innerHTML = '';
  container.appendChild(rootEl);
}
