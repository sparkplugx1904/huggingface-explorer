// ──────────────────────────────────────────────────────────────────────────
// src/ui/components/recently-deleted.ts — Modal Pemulihan Berkas Terhapus
// Antarmuka pengguna untuk memindai berkas yang dihapus pada commit history
// dan memulihkannya ke pendingChanges dalam 1 klik.
// ──────────────────────────────────────────────────────────────────────────

import {
  detectRecentlyDeletedFiles,
  restoreDeletedFile,
  restoreAllDeletedFiles,
  formatBytes,
  formatRelativeTime,
} from '../../api/deleted-recovery.js';
import { showToast } from './toast.js';
import {
  iconTrash,
  iconRestore,
  iconRefresh,
  iconSearch,
  iconClose,
  iconCheck,
  iconAlertCircle,
  iconFile,
  iconFileCode,
  iconFileText,
  iconFileImage,
  iconFileArchive,
  iconGitCommit,
} from './icons.js';

import type { RepoType } from '../../api/types.js';
import type { DeletedFileInfo } from '../../api/deleted-recovery.js';

export interface RecentlyDeletedModalOptions {
  repoType: RepoType;
  repoId: string;
  branch?: string;
  token?: string | null;
  commitLimit?: number;
  onRestored?: (filePath: string) => void;
  onRestoreAllComplete?: (count: number) => void;
  onClose?: () => void;
}

export type ModalCloseFn = () => void;

// ── File Icon Selector ───────────────────────────────────────────────────────

const CODE_EXTS: Record<string, true> = {
  ts: true, js: true, tsx: true, jsx: true, py: true, json: true,
  html: true, css: true, c: true, cpp: true, rs: true, go: true,
  sh: true, yaml: true, yml: true, toml: true,
};

const TEXT_EXTS: Record<string, true> = {
  md: true, txt: true, csv: true, tsv: true, log: true, rst: true,
};

const IMG_EXTS: Record<string, true> = {
  png: true, jpg: true, jpeg: true, gif: true, svg: true, webp: true,
};

const ZIP_EXTS: Record<string, true> = {
  zip: true, tar: true, gz: true, '7z': true, rar: true, bz2: true,
};

function getFileIconSvg(path: string, size = 16): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (CODE_EXTS[ext]) return iconFileCode(size);
  if (TEXT_EXTS[ext]) return iconFileText(size);
  if (IMG_EXTS[ext]) return iconFileImage(size);
  if (ZIP_EXTS[ext]) return iconFileArchive(size);
  return iconFile(size);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Dialog Component ─────────────────────────────────────────────────────────

/**
 * Membuka dialog modal "Baru Dihapus" (Recently Deleted).
 * Mengembalikan fungsi untuk menutup modal secara programatis.
 */
export function openRecentlyDeletedModal(
  options: RecentlyDeletedModalOptions
): ModalCloseFn {
  const {
    repoType,
    repoId,
    branch = 'main',
    token = null,
    commitLimit: initialLimit = 20,
    onRestored,
    onRestoreAllComplete,
    onClose,
  } = options;

  let currentLimit = initialLimit;
  let deletedFiles: DeletedFileInfo[] = [];
  const restoredPaths = new Set<string>();
  let isLoading = false;
  let errorMessage: string | null = null;
  let searchQuery = '';

  // ── Overlay & Dialog Container ─────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay recently-deleted-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background-color: rgba(9, 13, 22, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    padding: 1rem;
    animation: hs-fade-in 0.15s ease-out;
  `;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Berkas Baru Dihapus');

  const dialog = document.createElement('div');
  dialog.className = 'modal modal-xl recently-deleted-dialog';
  dialog.style.cssText = `
    background-color: var(--hs-surface, #090d16);
    border: 1px solid var(--hs-border, #1f293d);
    border-radius: var(--hs-radius-lg, 10px);
    width: 100%;
    max-width: 860px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    color: var(--hs-text, #f1f5f9);
    font-family: inherit;
  `;

  // ── Close handler ──────────────────────────────────────────────────────────
  let isClosed = false;
  function closeModal(): void {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener('keydown', handleKeyDown);
    overlay.style.animation = 'hs-fade-out 0.15s ease-in forwards';
    setTimeout(() => {
      overlay.remove();
      onClose?.();
    }, 140);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }
  document.addEventListener('keydown', handleKeyDown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // ── Render Template Skeleton ───────────────────────────────────────────────
  dialog.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--hs-border,#1f293d);background:var(--hs-surface-2,#0d1322)">
      <div style="display:flex;align-items:center;gap:0.6rem">
        <span style="color:#ef4444;display:flex;align-items:center">${iconTrash(20)}</span>
        <div>
          <h2 style="font-size:1.0625rem;font-weight:600;margin:0;line-height:1.3;color:var(--hs-text,#f1f5f9)">Baru Dihapus (Recently Deleted)</h2>
          <p style="font-size:0.8rem;color:var(--hs-text-muted,#94a3b8);margin:0">
            Pindai commit pada branch <code style="font-size:0.75rem;padding:0.1rem 0.35rem;background:rgba(255,255,255,0.06);border-radius:var(--hs-radius-sm,4px);color:#38bdf8">${escapeHtml(branch)}</code> dan pulihkan ke perubahan tertunda (staged).
          </p>
        </div>
      </div>
      <button id="rd-btn-close" class="btn btn-ghost btn-sm" aria-label="Tutup dialog" style="padding:0.35rem 0.5rem;color:var(--hs-text-muted,#94a3b8);cursor:pointer;border:none;background:transparent;border-radius:var(--hs-radius,6px)">
        ${iconClose(18)}
      </button>
    </div>

    <!-- Toolbar / Controls -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1.25rem;border-bottom:1px solid var(--hs-border,#1f293d);background:var(--hs-surface,#090d16);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:220px">
        <div style="position:relative;flex:1">
          <span style="position:absolute;left:0.65rem;top:50%;transform:translateY(-50%);color:var(--hs-text-muted,#64748b);display:flex;pointer-events:none">
            ${iconSearch(14)}
          </span>
          <input
            id="rd-search-input"
            type="search"
            placeholder="Cari berkas terhapus…"
            class="input"
            style="width:100%;height:32px;padding:0.25rem 0.65rem 0.25rem 2rem;font-size:0.8125rem;background:var(--hs-surface-2,#0d1322);border:1px solid var(--hs-border,#1f293d);border-radius:var(--hs-radius,6px);color:inherit;outline:none"
          />
        </div>

        <select id="rd-limit-select" class="select" style="height:32px;font-size:0.8125rem;background:var(--hs-surface-2,#0d1322);border:1px solid var(--hs-border,#1f293d);border-radius:var(--hs-radius,6px);color:inherit;padding:0 0.5rem;cursor:pointer">
          <option value="10" ${currentLimit === 10 ? 'selected' : ''}>10 commit terakhir</option>
          <option value="20" ${currentLimit === 20 ? 'selected' : ''}>20 commit terakhir</option>
          <option value="50" ${currentLimit === 50 ? 'selected' : ''}>50 commit terakhir</option>
        </select>

        <button id="rd-btn-refresh" class="btn btn-secondary btn-sm" title="Pindai Ulang" style="height:32px;padding:0 0.6rem;display:flex;align-items:center;gap:0.35rem;font-size:0.8125rem;background:var(--hs-surface-2,#0d1322);border:1px solid var(--hs-border,#1f293d);border-radius:var(--hs-radius,6px);color:inherit;cursor:pointer">
          ${iconRefresh(14)} <span>Pindai</span>
        </button>
      </div>

      <div style="display:flex;align-items:center;gap:0.5rem">
        <button id="rd-btn-restore-all" class="btn btn-primary btn-sm" disabled style="height:32px;display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8125rem;font-weight:500;padding:0 0.85rem;border-radius:var(--hs-radius,6px);cursor:pointer">
          ${iconRestore(14)} <span id="rd-restore-all-label">Pulihkan Semua</span>
        </button>
      </div>
    </div>

    <!-- Body / List area -->
    <div id="rd-body" style="flex:1;overflow-y:auto;padding:0;min-height:260px;position:relative">
      <!-- Dynamic contents rendered here -->
    </div>

    <!-- Footer info -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 1.25rem;border-top:1px solid var(--hs-border,#1f293d);background:var(--hs-surface-2,#0d1322);font-size:0.75rem;color:var(--hs-text-muted,#94a3b8)">
      <div id="rd-footer-status">Memuat data…</div>
      <div>Berkas dipulihkan langsung ke Staged Changes untuk review commit atomik.</div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus trap / initial focus
  const closeBtn = dialog.querySelector<HTMLButtonElement>('#rd-btn-close');
  closeBtn?.addEventListener('click', closeModal);

  const searchInput = dialog.querySelector<HTMLInputElement>('#rd-search-input');
  const limitSelect = dialog.querySelector<HTMLSelectElement>('#rd-limit-select');
  const refreshBtn = dialog.querySelector<HTMLButtonElement>('#rd-btn-refresh');
  const restoreAllBtn = dialog.querySelector<HTMLButtonElement>('#rd-btn-restore-all');
  const restoreAllLabel = dialog.querySelector<HTMLElement>('#rd-restore-all-label');
  const bodyEl = dialog.querySelector<HTMLElement>('#rd-body')!;
  const footerStatusEl = dialog.querySelector<HTMLElement>('#rd-footer-status')!;

  searchInput?.focus();

  // ── Render Area Handlers ───────────────────────────────────────────────────

  function renderList(): void {
    if (isLoading) {
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1rem;gap:0.8rem;color:var(--hs-text-muted,#94a3b8)">
          <div style="width:28px;height:28px;border:2px solid var(--hs-border,#1f293d);border-top-color:#38bdf8;border-radius:50%;animation:hs-spin 0.7s linear infinite"></div>
          <div style="font-size:0.875rem">Memindai riwayat commit & diff berkas terhapus…</div>
        </div>
      `;
      footerStatusEl.textContent = 'Memindai…';
      if (restoreAllBtn) restoreAllBtn.disabled = true;
      return;
    }

    if (errorMessage) {
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1rem;gap:0.8rem;text-align:center">
          <div style="color:#ef4444">${iconAlertCircle(32)}</div>
          <div style="font-size:0.9375rem;font-weight:600;color:var(--hs-text,#f1f5f9)">Gagal Memindai Riwayat</div>
          <div style="font-size:0.8125rem;color:var(--hs-text-muted,#94a3b8);max-width:440px">${escapeHtml(errorMessage)}</div>
          <button id="rd-retry-btn" class="btn btn-secondary btn-sm" style="margin-top:0.4rem;display:inline-flex;align-items:center;gap:0.35rem">
            ${iconRefresh(14)} Coba Lagi
          </button>
        </div>
      `;
      bodyEl.querySelector('#rd-retry-btn')?.addEventListener('click', () => loadDeletedFiles());
      footerStatusEl.textContent = 'Terjadi kesalahan.';
      if (restoreAllBtn) restoreAllBtn.disabled = true;
      return;
    }

    // Filter berdasarkan query pencarian
    const query = searchQuery.trim().toLowerCase();
    const filteredFiles = deletedFiles.filter((f) => {
      if (!query) return true;
      return f.path.toLowerCase().includes(query) || f.name.toLowerCase().includes(query);
    });

    const pendingToRestoreCount = filteredFiles.filter((f) => !restoredPaths.has(f.path)).length;

    // Update tombol restore all
    if (restoreAllBtn && restoreAllLabel) {
      restoreAllBtn.disabled = pendingToRestoreCount === 0;
      restoreAllLabel.textContent = pendingToRestoreCount > 0
        ? `Pulihkan Semua (${pendingToRestoreCount})`
        : 'Pulihkan Semua';
    }

    // Jika kosong sama sekali
    if (deletedFiles.length === 0) {
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3.5rem 1rem;gap:0.8rem;text-align:center">
          <div style="color:var(--hs-text-muted,#64748b);opacity:0.75">${iconTrash(36)}</div>
          <div style="font-size:0.9375rem;font-weight:600;color:var(--hs-text,#f1f5f9)">Tidak Ada Berkas Terhapus</div>
          <div style="font-size:0.8125rem;color:var(--hs-text-muted,#94a3b8);max-width:440px">
            Tidak ditemukan berkas yang dihapus dalam ${currentLimit} commit terakhir pada branch <code style="color:#38bdf8">${escapeHtml(branch)}</code>.
          </div>
        </div>
      `;
      footerStatusEl.textContent = '0 berkas terhapus ditemukan.';
      return;
    }

    // Jika filter pencarian tidak menemukan kecocokan
    if (filteredFiles.length === 0) {
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1rem;gap:0.6rem;text-align:center">
          <div style="font-size:0.875rem;color:var(--hs-text-muted,#94a3b8)">
            Tidak ada berkas terhapus yang cocok dengan pencarian "<strong>${escapeHtml(query)}</strong>".
          </div>
        </div>
      `;
      footerStatusEl.textContent = `0 dari ${deletedFiles.length} berkas cocok.`;
      return;
    }

    // Render tabel berkas terhapus
    let rowsHtml = '';
    for (const file of filteredFiles) {
      const isRestored = restoredPaths.has(file.path);
      const shortSha = file.deletedInCommitSha.slice(0, 7);
      const commitTitle = file.deletedInCommitTitle || 'Tanpa judul commit';
      const fileIcon = getFileIconSvg(file.path, 16);
      const sizeText = formatBytes(file.size);
      const timeText = formatRelativeTime(file.deletedAt);

      rowsHtml += `
        <tr style="border-bottom:1px solid var(--hs-border,#1f293d);transition:background 0.1s" class="rd-row" data-path="${escapeHtml(file.path)}">
          <td style="padding:0.65rem 1rem;vertical-align:middle">
            <div style="display:flex;align-items:flex-start;gap:0.65rem">
              <span style="display:flex;align-items:center;margin-top:0.15rem;color:var(--hs-text-muted,#94a3b8);flex-shrink:0">
                ${fileIcon}
              </span>
              <div style="overflow:hidden">
                <div style="font-size:0.875rem;font-weight:500;color:var(--hs-text,#f1f5f9);word-break:break-all">
                  ${escapeHtml(file.name)}
                </div>
                <div style="font-size:0.75rem;color:var(--hs-text-muted,#64748b);font-family:monospace;margin-top:0.1rem;word-break:break-all">
                  ${escapeHtml(file.path)}
                </div>
              </div>
            </div>
          </td>

          <td style="padding:0.65rem 0.8rem;vertical-align:middle;font-size:0.8125rem;color:var(--hs-text-muted,#94a3b8);white-space:nowrap">
            ${sizeText}
          </td>

          <td style="padding:0.65rem 0.8rem;vertical-align:middle;font-size:0.8125rem;color:var(--hs-text-muted,#94a3b8);white-space:nowrap" title="${file.deletedAt.toLocaleString('id-ID')}">
            ${timeText}
          </td>

          <td style="padding:0.65rem 0.8rem;vertical-align:middle;white-space:nowrap">
            <span
              style="display:inline-flex;align-items:center;gap:0.25rem;font-family:monospace;font-size:0.75rem;padding:0.15rem 0.4rem;background:rgba(255,255,255,0.05);border:1px solid var(--hs-border,#1f293d);border-radius:var(--hs-radius-sm,4px);color:#38bdf8"
              title="${escapeHtml(commitTitle)}"
            >
              ${iconGitCommit(12)} ${shortSha}
            </span>
          </td>

          <td style="padding:0.65rem 1rem;vertical-align:middle;text-align:right;white-space:nowrap">
            ${
              isRestored
                ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.78125rem;color:#10b981;font-weight:500;padding:0.25rem 0.6rem;background:rgba(16,185,129,0.1);border-radius:var(--hs-radius-sm,4px)">
                    ${iconCheck(13)} Dipulihkan
                   </span>`
                : `<button
                    class="btn btn-secondary btn-sm rd-btn-restore"
                    data-path="${escapeHtml(file.path)}"
                    style="height:28px;padding:0 0.65rem;font-size:0.8125rem;display:inline-flex;align-items:center;gap:0.35rem;cursor:pointer;background:var(--hs-surface-2,#0d1322);border:1px solid var(--hs-border,#1f293d);border-radius:var(--hs-radius,6px);color:inherit"
                   >
                    ${iconRestore(13)} <span>Pulihkan</span>
                   </button>`
            }
          </td>
        </tr>
      `;
    }

    bodyEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="border-bottom:1px solid var(--hs-border,#1f293d);background:var(--hs-surface-2,#0d1322);color:var(--hs-text-muted,#94a3b8);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em">
            <th style="padding:0.5rem 1rem;font-weight:600">Berkas</th>
            <th style="padding:0.5rem 0.8rem;font-weight:600;width:90px">Ukuran</th>
            <th style="padding:0.5rem 0.8rem;font-weight:600;width:110px">Waktu Hapus</th>
            <th style="padding:0.5rem 0.8rem;font-weight:600;width:110px">Commit SHA</th>
            <th style="padding:0.5rem 1rem;font-weight:600;text-align:right;width:120px">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    footerStatusEl.textContent = `${filteredFiles.length} berkas terhapus ditemukan (${restoredPaths.size} telah dipulihkan).`;

    // Pasang listener tombol pulihkan individual
    const restoreButtons = bodyEl.querySelectorAll<HTMLButtonElement>('.rd-btn-restore');
    restoreButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const path = btn.getAttribute('data-path');
        const targetFile = deletedFiles.find((f) => f.path === path);
        if (!targetFile) return;

        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<span style="display:inline-block;animation:hs-spin 0.7s linear infinite">${iconRefresh(13)}</span> <span>Memulihkan…</span>`;

        try {
          await restoreDeletedFile(targetFile, undefined, token);
          restoredPaths.add(targetFile.path);
          showToast(`Berkas "${targetFile.path}" berhasil dipulihkan ke perubahan tertunda`, 'success');
          onRestored?.(targetFile.path);
          renderList();
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          const msg = err instanceof Error ? err.message : String(err);
          showToast(`Gagal memulihkan berkas: ${msg}`, 'error');
        }
      });
    });
  }

  // ── Load Data ──────────────────────────────────────────────────────────────

  async function loadDeletedFiles(): Promise<void> {
    isLoading = true;
    errorMessage = null;
    renderList();

    try {
      deletedFiles = await detectRecentlyDeletedFiles({
        repoType,
        repoId,
        branch,
        commitLimit: currentLimit,
        token,
        excludeActiveInHead: true,
      });
      isLoading = false;
      renderList();
    } catch (err) {
      isLoading = false;
      errorMessage = err instanceof Error ? err.message : 'Terjadi kegagalan saat mengambil riwayat commit repositori.';
      renderList();
    }
  }

  // ── Listener Event Controls ────────────────────────────────────────────────

  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  limitSelect?.addEventListener('change', () => {
    currentLimit = parseInt(limitSelect.value, 10) || 20;
    loadDeletedFiles();
  });

  refreshBtn?.addEventListener('click', () => {
    loadDeletedFiles();
  });

  restoreAllBtn?.addEventListener('click', async () => {
    const unrecovered = deletedFiles.filter((f) => !restoredPaths.has(f.path));
    if (unrecovered.length === 0) return;

    restoreAllBtn.disabled = true;
    if (restoreAllLabel) restoreAllLabel.textContent = `Memulihkan (0/${unrecovered.length})…`;

    const result = await restoreAllDeletedFiles(unrecovered, token, (progress) => {
      if (restoreAllLabel) {
        restoreAllLabel.textContent = `Memulihkan (${progress.restoredCount + 1}/${progress.total})…`;
      }
    });

    for (const f of unrecovered) {
      const isFailed = result.errors.some((e) => e.file.path === f.path);
      if (!isFailed) {
        restoredPaths.add(f.path);
        onRestored?.(f.path);
      }
    }

    if (result.restoredCount > 0) {
      showToast(`${result.restoredCount} berkas berhasil dipulihkan ke perubahan tertunda`, 'success');
      onRestoreAllComplete?.(result.restoredCount);
    }

    if (result.errors.length > 0) {
      showToast(`${result.errors.length} berkas gagal dipulihkan`, 'error');
    }

    renderList();
  });

  // Muat data awal
  loadDeletedFiles();

  return closeModal;
}
