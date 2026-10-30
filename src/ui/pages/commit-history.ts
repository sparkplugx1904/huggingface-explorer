// ──────────────────────────────────────────────────────────────────────────
// src/ui/pages/commit-history.ts — Halaman Riwayat Commit & Baru Dihapus
// Daftar commit timeline, git diff viewer, revert commit atomik, & pemulihan berkas.
// ──────────────────────────────────────────────────────────────────────────

import {
  fetchCommitHistory,
  fetchCommitDiff,
  revertCommit,
  restoreFileVersion,
  getRecentlyDeletedFiles,
} from '../../api/history';
import { appStore } from '../../state/app-state';
import { navigate } from '../../router';
import { showToast } from '../components/toast';
import { createSpinner } from '../components/spinner';
import { createAvatar } from '../components/avatar';
import { openModal } from '../components/modal';
import { createEmptyState } from '../components/empty-state';
import {
  iconHistory,
  iconArrowLeft,
  iconGitCommit,
  iconRotateCcw,
  iconRestore,
  iconCopy,
  iconCheck,
  iconTrash,
  iconFile,
  iconSearch,
  iconChevronDown,
  iconExternalLink,
  iconDiff,
  iconModel,
  iconDataset,
  iconSpace,
  iconAlertCircle,
} from '../components/icons';

import type { RepoType } from '../../api/types';
import type {
  CommitItem,
  CommitDiffResult,
  DeletedFileEntry,
} from '../../api/history';

// ── Sanitasi HTML String ──────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Format Waktu Relatif ──────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  if (diffDay > 0) return `${diffDay} hari yang lalu`;
  if (diffHour > 0) return `${diffHour} jam yang lalu`;
  if (diffMin > 0) return `${diffMin} menit yang lalu`;
  return 'Baru saja';
}

// ── Renderer Halaman Riwayat Commit ───────────────────────────────────────

export function renderCommitHistoryPage(
  container: HTMLElement,
  owner: string,
  repo: string,
  repoType: RepoType = 'model',
  filePath?: string
): void {
  const repoId = `${owner}/${repo}`;
  const token = appStore.value.auth.token;

  let activeTab: 'commits' | 'deleted' = 'commits';
  let commits: CommitItem[] = [];
  let deletedFiles: DeletedFileEntry[] = [];
  let isLoading = false;
  let searchQuery = '';
  const diffCache = new Map<string, CommitDiffResult>();
  const expandedDiffs = new Set<string>();

  // Buat wadah utama halaman
  const root = document.createElement('div');
  root.className = 'history-container';
  container.replaceChildren(root);

  // ── Render Kerangka UI ─────────────────────────────────────────────────

  function renderFrame(): void {
    const typeIconSvg =
      repoType === 'dataset'
        ? iconDataset(16)
        : repoType === 'space'
        ? iconSpace(16)
        : iconModel(16);

    const backUrl = filePath
      ? `/browse/${owner}/${repo}/${repoType}/${filePath}`
      : `/${owner}/${repo}/${repoType}`;

    root.innerHTML = `
      <div class="history-top-bar">
        <div class="history-top-left">
          <button id="btn-back-to-repo" class="btn btn-secondary btn-sm" type="button" title="Kembali ke Repositori">
            ${iconArrowLeft(16)} <span>Kembali</span>
          </button>
          <div class="history-title-group">
            <h1 class="history-title">
              ${iconHistory(22)}
              <span>${filePath ? `Riwayat: ${esc(filePath.split('/').pop() || filePath)}` : 'Riwayat Commit'}</span>
              <span class="badge badge-subtle" style="font-size:0.75rem;display:inline-flex;align-items:center;gap:4px">
                ${typeIconSvg} ${esc(repoType)}
              </span>
            </h1>
            <div class="history-subtitle">${esc(repoId)}${filePath ? ` • ${esc(filePath)}` : ''}</div>
          </div>
        </div>

        <div class="history-top-actions">
          <button id="btn-refresh-history" class="btn btn-ghost btn-sm" type="button" title="Segarkan Data">
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      <nav class="history-tabs-bar" role="tablist">
        <button id="tab-commits" class="history-tab-btn ${activeTab === 'commits' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'commits'}">
          ${iconGitCommit(16)}
          <span>Riwayat Commit</span>
          <span class="history-tab-badge" id="badge-commits-count">${commits.length}</span>
        </button>
        <button id="tab-deleted" class="history-tab-btn ${activeTab === 'deleted' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'deleted'}">
          ${iconTrash(16)}
          <span>Baru Dihapus</span>
          <span class="history-tab-badge" id="badge-deleted-count">${deletedFiles.length}</span>
        </button>
      </nav>

      <div id="history-content-area" class="history-content-area"></div>
    `;

    // Event listener navigasi kembali & refresh
    root.querySelector('#btn-back-to-repo')?.addEventListener('click', () => {
      navigate(backUrl);
    });

    root.querySelector('#btn-refresh-history')?.addEventListener('click', () => {
      diffCache.clear();
      expandedDiffs.clear();
      void loadData(true);
    });

    // Tab buttons
    root.querySelector('#tab-commits')?.addEventListener('click', () => {
      if (activeTab !== 'commits') {
        activeTab = 'commits';
        renderFrame();
        renderTabContent();
      }
    });

    root.querySelector('#tab-deleted')?.addEventListener('click', () => {
      if (activeTab !== 'deleted') {
        activeTab = 'deleted';
        renderFrame();
        renderTabContent();
      }
    });
  }

  // ── Render Konten Sesuai Tab Aktif ─────────────────────────────────────

  function renderTabContent(): void {
    const contentArea = root.querySelector<HTMLElement>('#history-content-area');
    if (!contentArea) return;

    if (isLoading) {
      contentArea.replaceChildren(
        createSpinner('lg')
      );
      return;
    }

    if (activeTab === 'commits') {
      renderCommitsTab(contentArea);
    } else {
      renderDeletedTab(contentArea);
    }
  }

  // ── Tab 1: Riwayat Commit ──────────────────────────────────────────────

  function renderCommitsTab(containerEl: HTMLElement): void {
    const filteredCommits = commits.filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q) ||
        c.oid.toLowerCase().includes(q) ||
        c.authors.some((a) => a.username.toLowerCase().includes(q))
      );
    });

    const wrapper = document.createElement('div');

    // Baris Pencarian
    const searchRow = document.createElement('div');
    searchRow.className = 'history-search-row';
    searchRow.innerHTML = `
      <div class="history-search-input-wrap">
        <span class="history-search-icon">${iconSearch(16)}</span>
        <input
          id="commit-search-input"
          class="input"
          type="search"
          placeholder="Cari pesan commit, pengarang, atau SHA…"
          value="${esc(searchQuery)}"
        />
      </div>
      <div style="font-size:0.8125rem;color:var(--hs-text-muted)">
        Menampilkan ${filteredCommits.length} dari ${commits.length} commit
      </div>
    `;

    const searchInput = searchRow.querySelector<HTMLInputElement>('#commit-search-input');
    searchInput?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      renderCommitsTab(containerEl);
    });

    wrapper.appendChild(searchRow);

    if (filteredCommits.length === 0) {
      const emptyEl = createEmptyState({
        icon: iconGitCommit(32),
        title: searchQuery ? 'Tidak ada commit yang cocok' : 'Belum ada riwayat commit',
        description: searchQuery
          ? `Tidak ditemukan commit dengan kata kunci "${searchQuery}". Coba kata kunci lain.`
          : 'Repositori ini belum memiliki riwayat commit pada revisi ini.',
      });
      wrapper.appendChild(emptyEl);
      containerEl.replaceChildren(wrapper);
      return;
    }

    // Timeline Commit
    const timelineEl = document.createElement('div');
    timelineEl.className = 'history-timeline';

    for (const commitItem of filteredCommits) {
      const rowEl = createCommitRowElement(commitItem);
      timelineEl.appendChild(rowEl);
    }

    wrapper.appendChild(timelineEl);
    containerEl.replaceChildren(wrapper);
  }

  // ── Render Kartu Commit Individual ─────────────────────────────────────

  function createCommitRowElement(commitItem: CommitItem): HTMLElement {
    const rowEl = document.createElement('div');
    rowEl.className = 'commit-row';

    const author = commitItem.authors[0] || { username: 'anonymous', avatarUrl: '' };
    const dateFormatted = formatRelativeTime(commitItem.date);
    const hasExpandedDiff = expandedDiffs.has(commitItem.oid);

    const hfCommitUrl = `https://huggingface.co/${repoId}/commit/${commitItem.oid}`;

    rowEl.innerHTML = `
      <div class="commit-timeline-node">
        <div class="commit-node-dot"></div>
      </div>

      <div class="commit-card" data-commit-id="${esc(commitItem.oid)}">
        <div class="commit-card-header">
          <div class="commit-author-group">
            <div class="commit-author-avatar-wrap"></div>
            <span class="commit-author-name">${esc(author.username)}</span>
            <span class="commit-date" title="${commitItem.date.toLocaleString()}">• ${esc(dateFormatted)}</span>
          </div>

          <div style="display:flex;align-items:center;gap:6px">
            <button class="commit-sha-badge btn-copy-sha" type="button" title="Salin Full SHA (${commitItem.oid})">
              <span>${esc(commitItem.shortOid)}</span>
              ${iconCopy(13)}
            </button>
            <a href="${esc(hfCommitUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-xs" title="Buka di Hugging Face" style="padding:4px;color:var(--hs-text-muted)">
              ${iconExternalLink(14)}
            </a>
          </div>
        </div>

        <div class="commit-title-text">${esc(commitItem.title)}</div>

        ${
          commitItem.message && commitItem.message.trim() !== commitItem.title.trim()
            ? `<div class="commit-message-body">${esc(commitItem.message.trim())}</div>`
            : ''
        }

        <div class="commit-card-actions">
          <div class="commit-card-actions-left">
            <button class="btn btn-secondary btn-xs btn-toggle-diff" type="button" style="display:flex;align-items:center;gap:4px">
              ${iconDiff(14)}
              <span>${hasExpandedDiff ? 'Sembunyikan Diff' : 'Lihat Perubahan'}</span>
              ${iconChevronDown(12)}
            </button>
          </div>

          <div class="commit-card-actions-right">
            ${
              filePath
                ? `<button class="btn btn-secondary btn-xs btn-restore-version" type="button" style="display:flex;align-items:center;gap:4px">
                    ${iconRestore(14)} <span>Kembalikan Versi Ini</span>
                   </button>`
                : ''
            }
            <button class="btn btn-ghost btn-xs btn-revert-commit" type="button" style="display:flex;align-items:center;gap:4px;color:var(--hs-error, #ef4444)">
              ${iconRotateCcw(14)} <span>Revert Commit</span>
            </button>
          </div>
        </div>

        <div class="commit-diff-container" style="${hasExpandedDiff ? 'display:block' : 'display:none'}"></div>
      </div>
    `;

    // Sisipkan avatar
    const avatarEl = createAvatar(
      { name: author.username, login: author.username, avatarUrl: author.avatarUrl },
      'sm'
    );
    rowEl.querySelector('.commit-author-avatar-wrap')?.appendChild(avatarEl);

    // Event: Salin SHA
    rowEl.querySelector('.btn-copy-sha')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(commitItem.oid);
        showToast(`SHA ${commitItem.shortOid} disalin ke papan klip!`, 'success', 2500);
      } catch {
        showToast('Gagal menyalin SHA.', 'error');
      }
    });

    // Event: Toggle Diff
    const diffContainer = rowEl.querySelector<HTMLElement>('.commit-diff-container');
    const toggleDiffBtn = rowEl.querySelector<HTMLButtonElement>('.btn-toggle-diff');

    toggleDiffBtn?.addEventListener('click', async () => {
      if (expandedDiffs.has(commitItem.oid)) {
        expandedDiffs.delete(commitItem.oid);
        if (diffContainer) diffContainer.style.display = 'none';
        toggleDiffBtn.innerHTML = `${iconDiff(14)} <span>Lihat Perubahan</span> ${iconChevronDown(12)}`;
      } else {
        expandedDiffs.add(commitItem.oid);
        if (diffContainer) {
          diffContainer.style.display = 'block';
          toggleDiffBtn.innerHTML = `${iconDiff(14)} <span>Sembunyikan Diff</span> ${iconChevronDown(12)}`;
          await loadAndRenderDiff(commitItem.oid, diffContainer);
        }
      }
    });

    // Event: Revert Commit
    rowEl.querySelector('.btn-revert-commit')?.addEventListener('click', () => {
      confirmAndExecuteRevert(commitItem);
    });

    // Event: Kembalikan Versi Ini (jika dalam konteks berkas)
    if (filePath) {
      rowEl.querySelector('.btn-restore-version')?.addEventListener('click', () => {
        confirmAndRestoreFileVersion(commitItem, filePath);
      });
    }

    return rowEl;
  }

  // ── Muat & Tampilkan Diff Commit ───────────────────────────────────────

  async function loadAndRenderDiff(
    commitSha: string,
    diffContainer: HTMLElement
  ): Promise<void> {
    let diffResult = diffCache.get(commitSha);

    if (!diffResult) {
      diffContainer.replaceChildren(
        createSpinner('sm')
      );

      try {
        diffResult = await fetchCommitDiff(repoType, repoId, commitSha, token);
        diffCache.set(commitSha, diffResult);
      } catch (err: unknown) {
        const hfCommitUrl =
          repoType === 'dataset'
            ? `https://huggingface.co/datasets/${repoId}/commit/${commitSha}`
            : repoType === 'space'
              ? `https://huggingface.co/spaces/${repoId}/commit/${commitSha}`
              : `https://huggingface.co/${repoId}/commit/${commitSha}`;

        diffContainer.innerHTML = `
          <div style="padding:10px 14px;background:var(--hs-surface-2);border-radius:6px;border:1px solid var(--hs-border);margin:8px 0;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;font-size:0.8125rem;color:var(--hs-text-muted);">
                <span style="color:var(--hs-warning);">${iconAlertCircle(16)}</span>
                <span>Diff teks mentah dibatasi oleh CORS Hugging Face untuk browser tanpa server proxy.</span>
              </div>
              <a href="${hfCommitUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px;">
                ${iconExternalLink(14)}
                <span>Lihat Diff di Hugging Face</span>
              </a>
            </div>
          </div>
        `;
        return;
      }
    }

    if (diffResult.files.length === 0) {
      diffContainer.innerHTML = `
        <div style="padding:8px;color:var(--hs-text-muted);font-size:0.8125rem">
          Tidak ada berkas yang berubah pada commit ini (atau commit inisial).
        </div>
      `;
      return;
    }

    const panelEl = document.createElement('div');
    panelEl.className = 'commit-diff-panel';

    // Summary ringkas: +N -M, jumlah berkas
    const summaryEl = document.createElement('div');
    summaryEl.className = 'commit-diff-summary';
    const maxDisplay = 50;
    const displayedFiles = diffResult.files.slice(0, maxDisplay);

    summaryEl.innerHTML = `
      <span><strong>${diffResult.files.length.toLocaleString()}</strong> berkas berubah ${diffResult.files.length > maxDisplay ? `(menampilkan ${maxDisplay} pertama)` : ''}</span>
      <span class="diff-add-badge">+${diffResult.totalAdditions.toLocaleString()}</span>
      <span class="diff-del-badge">-${diffResult.totalDeletions.toLocaleString()}</span>
    `;
    panelEl.appendChild(summaryEl);

    // List berkas (maksimal 50)
    for (const file of displayedFiles) {
      const fileItem = document.createElement('div');
      fileItem.className = 'diff-file-item';

      const badgeClass =
        file.type === 'added' ? 'added' : file.type === 'deleted' ? 'deleted' : 'modified';
      const badgeText =
        file.type === 'added'
          ? 'Tambah'
          : file.type === 'deleted'
          ? 'Hapus'
          : file.type === 'renamed'
          ? 'Ganti Nama'
          : 'Ubah';

      fileItem.innerHTML = `
        <div class="diff-file-header">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="diff-file-badge ${badgeClass}">${badgeText}</span>
            <span>${esc(file.path)}${file.oldPath ? ` (dari ${esc(file.oldPath)})` : ''}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem">
            <span class="diff-add-badge">+${file.additions}</span>
            <span class="diff-del-badge">-${file.deletions}</span>
          </div>
        </div>

        ${
          file.patch
            ? `<div class="diff-patch-view">${file.patch
                .split('\n')
                .map((line) => {
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    return `<div class="diff-patch-line-add">${esc(line)}</div>`;
                  }
                  if (line.startsWith('-') && !line.startsWith('---')) {
                    return `<div class="diff-patch-line-del">${esc(line)}</div>`;
                  }
                  return `<div>${esc(line)}</div>`;
                })
                .join('')}</div>`
            : ''
        }
      `;

      panelEl.appendChild(fileItem);
    }

    diffContainer.replaceChildren(panelEl);
  }

  // ── Konfirmasi & Eksekusi Revert Commit ─────────────────────────────────

  function confirmAndExecuteRevert(commitItem: CommitItem): void {
    if (!token) {
      showToast('Anda harus masuk untuk melakukan revert commit.', 'error');
      return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <p style="font-size:0.875rem;line-height:1.5;color:var(--hs-text)">
          Apakah Anda yakin ingin membalikkan perubahan dari commit <strong>${esc(commitItem.title)}</strong> (<code>${commitItem.shortOid}</code>)?
        </p>
        <div style="padding:8px 12px;background-color:var(--hs-surface-2);border-radius:var(--hs-radius-sm);font-size:0.8125rem;color:var(--hs-text-muted);border-left:3px solid var(--hs-warning, #f59e0b)">
          Sistem akan membuat <strong>commit baru</strong> di branch utama yang membalikkan seluruh berkas ke status sebelum commit ini. Riwayat git sebelumnya tetap utuh tanpa force-push.
        </div>
      </div>
    `;

    openModal({
      title: 'Revert Commit',
      content,
      size: 'sm',
      actions: [
        {
          label: 'Batal',
          variant: 'secondary',
          onClick: () => {},
        },
        {
          label: 'Buat Revert Commit',
          variant: 'danger',
          onClick: async () => {
            try {
              showToast('Menjalankan revert commit…', 'info', 4000);
              const result = await revertCommit({
                repoType,
                repoId,
                commitSha: commitItem.oid,
                commitTitle: commitItem.title,
                token,
                onProgress: (status) => showToast(status, 'info', 2000),
              });

              showToast(
                `Revert commit berhasil dibuat! (${result.oid.slice(0, 7)})`,
                'success',
                6000
              );

              // Muat ulang daftar commit
              await loadData(true);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              showToast(`Gagal melakukan revert: ${msg}`, 'error', 6000);
            }
          },
        },
      ],
    });
  }

  // ── Konfirmasi & Kembalikan Versi Berkas ────────────────────────────────

  function confirmAndRestoreFileVersion(commitItem: CommitItem, targetFilePath: string): void {
    const fileName = targetFilePath.split('/').pop() || targetFilePath;
    const content = document.createElement('div');
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <p style="font-size:0.875rem;line-height:1.5;color:var(--hs-text)">
          Pilih metode pemulihan untuk berkas <strong>${esc(fileName)}</strong> dari versi <code>${commitItem.shortOid}</code>:
        </p>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:0.875rem;cursor:pointer">
            <input type="radio" name="restore-mode" value="staged" checked />
            <div>
              <div style="font-weight:600">Simpan ke Perubahan Tertunda (Staged)</div>
              <div style="color:var(--hs-text-muted);font-size:0.75rem">Tinjau terlebih dahulu sebelum di-commit bersama perubahan lainnya.</div>
            </div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:0.875rem;cursor:pointer">
            <input type="radio" name="restore-mode" value="commit" />
            <div>
              <div style="font-weight:600">Commit Langsung Sekarang</div>
              <div style="color:var(--hs-text-muted);font-size:0.75rem">Langsung buat commit baru di branch utama Hugging Face.</div>
            </div>
          </label>
        </div>
      </div>
    `;

    openModal({
      title: 'Kembalikan Versi Berkas',
      content,
      size: 'sm',
      actions: [
        {
          label: 'Batal',
          variant: 'secondary',
          onClick: () => {},
        },
        {
          label: 'Kembalikan Versi',
          variant: 'primary',
          onClick: async () => {
            const selectedMode = (
              content.querySelector<HTMLInputElement>('input[name="restore-mode"]:checked')?.value || 'staged'
            ) as 'staged' | 'commit';

            try {
              showToast('Mengunduh dan memulihkan versi berkas…', 'info');
              const res = await restoreFileVersion({
                repoType,
                repoId,
                filePath: targetFilePath,
                revision: commitItem.oid,
                mode: selectedMode,
                token,
                onProgress: (msg) => showToast(msg, 'info', 1500),
              });

              if (selectedMode === 'staged') {
                showToast(
                  `Berkas ${fileName} berhasil dipulihkan ke perubahan tertunda!`,
                  'success',
                  5000
                );
                // Buka kembali file manager agar pengguna melihat staged bar
                navigate(`/browse/${owner}/${repo}/${repoType}/${targetFilePath}`);
              } else {
                showToast(
                  `Commit pemulihan berhasil disimpan! (${res.oid?.slice(0, 7) || ''})`,
                  'success',
                  5000
                );
                await loadData(true);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              showToast(`Gagal memulihkan berkas: ${msg}`, 'error', 5000);
            }
          },
        },
      ],
    });
  }

  // ── Tab 2: Baru Dihapus (Recently Deleted) ──────────────────────────────

  function renderDeletedTab(containerEl: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'deleted-files-container';

    // Banner penjelasan
    const banner = document.createElement('div');
    banner.className = 'deleted-banner-info';
    banner.innerHTML = `
      <div style="color:var(--hs-accent, #f59e0b);flex-shrink:0">${iconHistory(20)}</div>
      <div>
        <div style="font-weight:600;color:var(--hs-text);margin-bottom:2px">Pemulihan Berkas Terhapus</div>
        <div>
          Menelusuri commit terbaru repositori untuk mendeteksi berkas yang pernah dihapus agar dapat Anda pulihkan kembali ke perubahan tertunda atau langsung dibuatkan commit pemulihan.
        </div>
      </div>
    `;
    wrapper.appendChild(banner);

    if (deletedFiles.length === 0) {
      const emptyEl = createEmptyState({
        icon: iconTrash(32),
        title: 'Tidak Ada Berkas yang Baru Dihapus',
        description: 'Tidak ada berkas yang terdeteksi dihapus dalam 25 commit terbaru repositori ini.',
      });
      wrapper.appendChild(emptyEl);
      containerEl.replaceChildren(wrapper);
      return;
    }

    // List berkas terhapus
    for (const item of deletedFiles) {
      const card = createDeletedFileCard(item);
      wrapper.appendChild(card);
    }

    containerEl.replaceChildren(wrapper);
  }

  // ── Kartu Berkas Baru Dihapus ──────────────────────────────────────────

  function createDeletedFileCard(item: DeletedFileEntry): HTMLElement {
    const card = document.createElement('div');
    card.className = 'deleted-card';

    const relativeDate = formatRelativeTime(item.deletedDate);
    const authorName = item.author?.username || 'seseorang';

    card.innerHTML = `
      <div class="deleted-file-info">
        <div style="color:var(--hs-text-muted);flex-shrink:0">${iconFile(22)}</div>
        <div class="deleted-file-names">
          <span class="deleted-file-name">${esc(item.name)}</span>
          <span class="deleted-file-path">${esc(item.path)}</span>
          <span class="deleted-file-meta">
            Dihapus pada commit <em>"${esc(item.deletedInCommitTitle)}"</em> (${esc(item.deletedInCommitSha.slice(0, 7))}) oleh <strong>${esc(authorName)}</strong> • ${esc(relativeDate)}
          </span>
        </div>
      </div>

      <div class="deleted-card-actions">
        <button class="btn btn-secondary btn-sm btn-restore-staged" type="button" style="display:flex;align-items:center;gap:4px">
          ${iconRestore(15)} <span>Pulihkan ke Staged</span>
        </button>
        <button class="btn btn-primary btn-sm btn-restore-commit" type="button" style="display:flex;align-items:center;gap:4px">
          ${iconCheck(15)} <span>Commit Pemulihan</span>
        </button>
      </div>
    `;

    // Event: Pulihkan ke Staged
    card.querySelector('.btn-restore-staged')?.addEventListener('click', async () => {
      try {
        showToast(`Memulihkan ${item.name} ke staged changes…`, 'info');
        await restoreFileVersion({
          repoType,
          repoId,
          filePath: item.path,
          revision: item.parentCommitSha,
          mode: 'staged',
          token,
        });

        showToast(
          `Berkas ${item.name} berhasil dimasukkan ke staged changes! Buka File Manager untuk meninjau.`,
          'success',
          6000
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Gagal memulihkan berkas: ${msg}`, 'error');
      }
    });

    // Event: Commit Langsung
    card.querySelector('.btn-restore-commit')?.addEventListener('click', async () => {
      if (!token) {
        showToast('Anda harus masuk untuk membuat commit.', 'error');
        return;
      }

      try {
        showToast(`Membuat commit pemulihan untuk ${item.name}…`, 'info');
        const res = await restoreFileVersion({
          repoType,
          repoId,
          filePath: item.path,
          revision: item.parentCommitSha,
          mode: 'commit',
          token,
        });

        showToast(
          `Berkas ${item.name} berhasil dipulihkan! (${res.oid?.slice(0, 7) || ''})`,
          'success',
          5000
        );
        // Refresh data
        await loadData(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Gagal membuat commit pemulihan: ${msg}`, 'error');
      }
    });

    return card;
  }

  // ── Pemuat Data Riwayat & Berkas Terhapus ───────────────────────────────

  async function loadData(_forceRefresh: boolean = false): Promise<void> {
    isLoading = true;
    renderTabContent();

    try {
      // Ambil daftar commit
      commits = await fetchCommitHistory({
        repoType,
        repoId,
        revision: 'main',
        limit: 50,
        token,
        path: filePath,
      });

      // Update badge jumlah commit
      const commitsCountEl = root.querySelector('#badge-commits-count');
      if (commitsCountEl) commitsCountEl.textContent = String(commits.length);

      // Ambil berkas terhapus secara paralel di background
      void getRecentlyDeletedFiles(repoType, repoId, 'main', token, 20)
        .then((files) => {
          deletedFiles = files;
          const delCountEl = root.querySelector('#badge-deleted-count');
          if (delCountEl) delCountEl.textContent = String(deletedFiles.length);
          if (activeTab === 'deleted') {
            renderTabContent();
          }
        })
        .catch(() => {
          // Abaikan kegagalan ekstraksi deleted files
        });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Gagal memuat riwayat: ${msg}`, 'error');
    } finally {
      isLoading = false;
      renderTabContent();
    }
  }

  // Render awal frame dan muat data
  renderFrame();
  void loadData();
}
