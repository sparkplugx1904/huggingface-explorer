// ──────────────────────────────────────────────────────────────────────────
// src/ui/components/dialogs.ts — Dialog Konfirmasi & Tinjauan Kustom
// Dialog mandiri (tanpa alert/confirm bawaan browser), aksesibel, dan fokus terkunci.
// ──────────────────────────────────────────────────────────────────────────

import { openModal } from './modal';
import { iconFolder, iconFile, iconAlertCircle } from './icons';
import { pendingChanges } from '../../state/pending-changes';
import { startLogin } from '../../auth';
/** Sanitasi string */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 1. Dialog Perubahan Belum Disimpan (Navigasi / Ganti Repo) ─────────────

export function showUnsavedChangesDialog(
  onProceed: () => void,
  onCancel?: () => void
): void {
  const count = pendingChanges.value.length;
  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1rem">
      <div style="color:var(--hs-warning, #f59e0b);flex-shrink:0;padding-top:2px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
        <p style="font-weight:600;margin-bottom:0.25rem;font-size:1rem">
          Ada ${count} perubahan yang belum disimpan!
        </p>
        <p style="color:var(--hs-text-muted);font-size:0.875rem;line-height:1.4">
          Jika Anda berpindah halaman atau keluar sekarang, seluruh perubahan tertunda akan hilang dan tidak dapat dikembalikan.
        </p>
      </div>
    </div>
  `;

  openModal({
    title: 'Tinggalkan Halaman?',
    content,
    size: 'sm',
    onClose: onCancel,
    actions: [
      {
        label: 'Tetap di Sini',
        variant: 'secondary',
        onClick: () => onCancel?.(),
      },
      {
        label: 'Buang & Tinggalkan',
        variant: 'danger',
        onClick: () => onProceed(),
      },
    ],
  });
}


// ── 1b. Dialog Sesi Kedaluwarsa (HTTP 401) ──────────────────────────────────

let _isSessionExpiredDialogOpen = false;

/**
 * Dialog notifikasi saat token expired (HTTP 401).
 * Mengizinkan re-login tanpa menghapus data pendingChanges.
 */
export function showSessionExpiredDialog(onLogin?: () => void): void {
  if (_isSessionExpiredDialogOpen) return;
  _isSessionExpiredDialogOpen = true;

  const count = pendingChanges.value.length;
  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1rem">
      <div style="color:var(--hs-warning, #f59e0b);flex-shrink:0;padding-top:2px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div>
        <p style="font-weight:600;margin-bottom:0.25rem;font-size:1rem">
          Sesi Anda telah kedaluwarsa
        </p>
        <p style="color:var(--hs-text-muted);font-size:0.875rem;line-height:1.4;margin-bottom:0.5rem">
          Token autentikasi Hugging Face sudah kedaluwarsa atau tidak valid. Silakan masuk kembali untuk melanjutkan.
        </p>
        ${
          count > 0
            ? `<div style="background:var(--hs-surface-2, #1e293b);padding:0.5rem 0.75rem;border-radius:var(--hs-radius, 6px);border:1px solid var(--hs-border, #334155);font-size:0.825rem;color:var(--hs-text, #f8fafc)">
                Seluruh <strong>${count} perubahan tertunda</strong> Anda tetap utuh dan tersimpan di memori.
              </div>`
            : ''
        }
      </div>
    </div>
  `;

  openModal({
    title: 'Sesi Kedaluwarsa',
    content,
    size: 'sm',
    onClose: () => {
      _isSessionExpiredDialogOpen = false;
    },
    actions: [
      {
        label: 'Tutup',
        variant: 'secondary',
        onClick: () => {
          _isSessionExpiredDialogOpen = false;
        },
      },
      {
        label: 'Masuk Kembali',
        variant: 'primary',
        onClick: () => {
          _isSessionExpiredDialogOpen = false;
          if (onLogin) {
            onLogin();
          } else {
            void startLogin();
          }
        },
      },
    ],
  });
}
// ── 2. Dialog Konfirmasi Hapus ────────────────────────────────────────────

export function showDeleteConfirmDialog(
  items: { path: string; name: string; isDirectory?: boolean }[],
  onConfirm: () => void
): void {
  const count = items.length;
  const content = document.createElement('div');

  const listHtml = items
    .slice(0, 5)
    .map(
      (it) => `
      <li style="padding:0.25rem 0;display:flex;align-items:center;gap:0.5rem;font-family:monospace;font-size:0.85rem">
        <span style="flex-shrink:0;display:flex;color:var(--hs-text-muted)">${it.isDirectory ? iconFolder(15) : iconFile(15)}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.path)}</span>
      </li>`
    )
    .join('');

  const moreNotice =
    count > 5
      ? `<p style="font-size:0.8rem;color:var(--hs-text-muted);margin-top:0.25rem">+ ${count - 5} item lainnya…</p>`
      : '';

  content.innerHTML = `
    <div style="margin-bottom:1rem">
      <p style="font-size:0.9rem;margin-bottom:0.75rem;color:var(--hs-text)">
        Apakah Anda yakin ingin menghapus <strong>${count} item</strong> berikut?
      </p>
      <ul style="list-style:none;background:var(--hs-surface-2);padding:0.75rem;border-radius:var(--hs-radius);border:1px solid var(--hs-border);max-height:160px;overflow-y:auto">
        ${listHtml}
      </ul>
      ${moreNotice}
      <p style="font-size:0.8rem;color:var(--hs-text-muted);margin-top:0.75rem">
        Catatan: Item akan masuk ke daftar perubahan tertunda dan baru dihapus permanen di HF setelah Anda menekan tombol Commit.
      </p>
    </div>
  `;

  openModal({
    title: count === 1 ? 'Hapus Item' : `Hapus ${count} Item`,
    content,
    size: 'sm',
    actions: [
      {
        label: 'Batal',
        variant: 'secondary',
        onClick: () => {},
      },
      {
        label: 'Hapus Item',
        variant: 'danger',
        onClick: () => onConfirm(),
      },
    ],
  });
}

// ── 3. Dialog Konflik Nama Berkas (Saat Upload / Move) ─────────────────────

export type NameConflictResolution = 'replace' | 'keep_both' | 'skip';

export function showNameConflictDialog(
  fileName: string,
  hasMultiple: boolean,
  onResolve: (choice: NameConflictResolution, applyToAll: boolean) => void
): void {
  const content = document.createElement('div');
  content.innerHTML = `
    <div style="margin-bottom:1.25rem">
      <p style="font-size:0.9rem;margin-bottom:0.75rem">
        Berkas dengan nama <strong style="font-family:monospace">${esc(fileName)}</strong> sudah ada di lokasi tujuan.
      </p>
      <div style="display:flex;flex-direction:column;gap:0.5rem;font-size:0.875rem">
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
          <input type="radio" name="conflict-res" value="replace" checked />
          <span><strong>Ganti</strong> (Timpa berkas yang ada)</span>
        </label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
          <input type="radio" name="conflict-res" value="keep_both" />
          <span><strong>Simpan Keduanya</strong> (Tambahkan nomor pada nama baru)</span>
        </label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
          <input type="radio" name="conflict-res" value="skip" />
          <span><strong>Lewati</strong> (Jangan unggah berkas ini)</span>
        </label>
      </div>
      ${
        hasMultiple
          ? `
        <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--hs-border)">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.85rem">
            <input type="checkbox" id="chk-apply-all" />
            <span>Terapkan pilihan ini untuk semua konflik berikutnya</span>
          </label>
        </div>`
          : ''
      }
    </div>
  `;

  let resolved = false;

  openModal({
    title: 'Konflik Nama Berkas',
    content,
    size: 'sm',
    onClose: () => {
      if (!resolved) {
        resolved = true;
        onResolve('skip', false);
      }
    },
    actions: [
      {
        label: 'Batal',
        variant: 'secondary',
        onClick: () => {
          if (!resolved) {
            resolved = true;
            onResolve('skip', false);
          }
        },
      },
      {
        label: 'Lanjutkan',
        variant: 'primary',
        onClick: () => {
          if (resolved) return;
          resolved = true;
          const selected = content.querySelector<HTMLInputElement>(
            'input[name="conflict-res"]:checked'
          )?.value as NameConflictResolution ?? 'replace';
          const applyAll = content.querySelector<HTMLInputElement>('#chk-apply-all')?.checked ?? false;
          onResolve(selected, applyAll);
        },
      },
    ],
  });
}

// ── 4. Dialog Tinjau Perubahan & Simpan Commit ─────────────────────────────

export function showCommitReviewDialog(
  initialTitle: string,
  initialDescription: string,
  onCommit: (title: string, description: string) => Promise<void>
): void {
  const changes = pendingChanges.value;
  const content = document.createElement('div');

  const diffRows = changes
    .map((c) => {
      let badge = '';
      let text = '';
      switch (c.type) {
        case 'add':
          badge = '<span class="badge" style="background:#dcfce7;color:#15803d">+ Tambah</span>';
          text = esc(c.path);
          break;
        case 'create_folder':
          badge = '<span class="badge" style="background:#e5e7eb;color:#374151;display:inline-flex;align-items:center;gap:4px">Folder</span>';
          text = esc(c.path.replace(/\/\.gitkeep$/, ''));
          break;
        case 'delete':
          badge = '<span class="badge" style="background:#fee2e2;color:#b91c1c">- Hapus</span>';
          text = esc(c.path);
          break;
        case 'move':
          badge = '<span class="badge" style="background:#fef3c7;color:#b45309">⇄ Pindah</span>';
          text = `${esc(c.path)} &rarr; ${esc(c.newPath ?? '')}`;
          break;
        case 'rename':
          badge = '<span class="badge" style="background:#fef3c7;color:#b45309">✎ Ganti Nama</span>';
          text = `${esc(c.path)} &rarr; ${esc(c.newPath ?? '')}`;
          break;
      }
      return `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--hs-border);font-size:0.85rem">
          ${badge}
          <span style="font-family:monospace;word-break:break-all">${text}</span>
        </div>
      `;
    })
    .join('');

  content.innerHTML = `
    <div>
      <div style="margin-bottom:1rem">
        <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem">
          Daftar Perubahan (${changes.length})
        </label>
        <div style="max-height:180px;overflow-y:auto;background:var(--hs-surface-2);border:1px solid var(--hs-border);border-radius:var(--hs-radius);padding:0.5rem 0.75rem">
          ${diffRows}
        </div>
      </div>
      <div style="margin-bottom:1rem">
        <label for="commit-title-input" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem">
          Judul Pesan Commit
        </label>
        <input
          id="commit-title-input"
          class="input"
          type="text"
          value="${esc(initialTitle)}"
          placeholder="Ringkasan perubahan…"
          style="width:100%"
        />
      </div>
      <div>
        <label for="commit-desc-input" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem">
          Deskripsi Opsional
        </label>
        <textarea
          id="commit-desc-input"
          class="input"
          rows="4"
          placeholder="Rincian perubahan…"
          style="width:100%;resize:vertical;font-family:monospace;font-size:0.8rem"
        >${esc(initialDescription)}</textarea>
      </div>
      <div id="commit-error-box" style="display:none;color:var(--hs-error);font-size:0.85rem;margin-top:0.75rem"></div>
    </div>
  `;

  const closeModal = openModal({
    title: 'Tinjau & Commit Perubahan',
    content,
    size: 'md',
    actions: [
      {
        label: 'Batal',
        variant: 'secondary',
        onClick: () => {},
      },
      {
        label: 'Simpan ke Hugging Face',
        variant: 'primary',
        closeOnClick: false,
        onClick: async () => {
          const titleInput = content.querySelector<HTMLInputElement>('#commit-title-input');
          const descInput = content.querySelector<HTMLTextAreaElement>('#commit-desc-input');
          const errorBox = content.querySelector<HTMLDivElement>('#commit-error-box');

          const title = titleInput?.value.trim() ?? initialTitle;
          const desc = descInput?.value.trim() ?? '';

          if (!title) {
            if (errorBox) {
              errorBox.style.display = 'block';
              errorBox.textContent = 'Judul commit tidak boleh kosong.';
            }
            return;
          }

          // Nonaktifkan tombol saat proses commit berlangsung
          const btn = content.closest('.modal-panel')?.querySelector<HTMLButtonElement>('.btn-primary');
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Menyimpan commit…';
          }

          try {
            await onCommit(title, desc);
            closeModal();
          } catch (err: unknown) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Simpan ke Hugging Face';
            }
            if (errorBox) {
              errorBox.style.display = 'block';
              errorBox.textContent = `Gagal menyimpan commit: ${String(err)}`;
            }
          }
        },
      },
    ],
  });
}

// ── 5. Dialog Konflik Parent Commit ───────────────────────────────────────

export function showCommitConflictDialog(onReload: () => void): void {
  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display:flex;gap:1rem;align-items:flex-start">
      <div style="line-height:1;color:var(--error, #ef4444);flex-shrink:0">${iconAlertCircle(28)}</div>
      <div>
        <p style="font-weight:600;margin-bottom:0.5rem">
          Repositori telah diubah oleh pihak lain!
        </p>
        <p style="font-size:0.875rem;color:var(--hs-text-muted);line-height:1.4">
          Commit terakhir di Hugging Face tidak sesuai dengan versi awal saat halaman ini dibuka.
          Untuk mencegah penimpaan berkas tanpa sengaja, silakan muat ulang repositori untuk melihat versi terbaru.
        </p>
      </div>
    </div>
  `;

  openModal({
    title: 'Konflik Versi Repositori',
    content,
    size: 'sm',
    actions: [
      {
        label: 'Muat Ulang Repositori',
        variant: 'primary',
        onClick: () => onReload(),
      },
    ],
  });
}

// ── 6. Dialog Buat Folder Baru ────────────────────────────────────────────

export function showCreateFolderDialog(
  currentPath: string,
  onCreate: (folderName: string) => void
): void {
  const content = document.createElement('div');
  content.innerHTML = `
    <div>
      <p style="font-size:0.875rem;color:var(--hs-text-muted);margin-bottom:0.75rem">
        Lokasi: <span style="font-family:monospace">/${esc(currentPath || 'akar')}</span>
      </p>
      <div style="margin-bottom:0.5rem">
        <label for="folder-name-input" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem">
          Nama Folder
        </label>
        <input
          id="folder-name-input"
          class="input"
          type="text"
          placeholder="contoh: dataset_v2"
          style="width:100%"
          autocomplete="off"
        />
      </div>
      <p id="folder-error" style="display:none;color:var(--hs-error);font-size:0.8rem"></p>
    </div>
  `;

  const closeModal = openModal({
    title: 'Buat Folder Baru',
    content,
    size: 'sm',
    actions: [
      {
        label: 'Batal',
        variant: 'secondary',
        onClick: () => {},
      },
      {
        label: 'Buat Folder',
        variant: 'primary',
        closeOnClick: false,
        onClick: () => {
          const input = content.querySelector<HTMLInputElement>('#folder-name-input');
          const errorP = content.querySelector<HTMLParagraphElement>('#folder-error');
          const name = input?.value.trim() ?? '';

          if (!name) {
            if (errorP) {
              errorP.style.display = 'block';
              errorP.textContent = 'Nama folder tidak boleh kosong.';
            }
            return;
          }

          if (name.includes('/') || name.includes('\\')) {
            if (errorP) {
              errorP.style.display = 'block';
              errorP.textContent = 'Nama folder tidak boleh mengandung tanda garis miring (/).';
            }
            return;
          }

          onCreate(name);
          closeModal();
        },
      },
    ],
  });

  // Fokus otomatis ke input
  setTimeout(() => content.querySelector<HTMLInputElement>('#folder-name-input')?.focus(), 50);
}

// ── 7. Dialog Ganti Nama (Rename) ─────────────────────────────────────────

export function showRenameDialog(
  oldName: string,
  isDirectory: boolean,
  onRename: (newName: string) => void
): void {
  const content = document.createElement('div');
  content.innerHTML = `
    <div>
      <div style="margin-bottom:0.5rem">
        <label for="rename-input" style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.25rem">
          Nama Baru untuk ${isDirectory ? 'Folder' : 'Berkas'}
        </label>
        <input
          id="rename-input"
          class="input"
          type="text"
          value="${esc(oldName)}"
          style="width:100%"
          autocomplete="off"
        />
      </div>
      <p id="rename-error" style="display:none;color:var(--hs-error);font-size:0.8rem"></p>
    </div>
  `;

  const closeModal = openModal({
    title: isDirectory ? 'Ganti Nama Folder' : 'Ganti Nama Berkas',
    content,
    size: 'sm',
    actions: [
      {
        label: 'Batal',
        variant: 'secondary',
        onClick: () => {},
      },
      {
        label: 'Simpan',
        variant: 'primary',
        closeOnClick: false,
        onClick: () => {
          const input = content.querySelector<HTMLInputElement>('#rename-input');
          const errorP = content.querySelector<HTMLParagraphElement>('#rename-error');
          const newName = input?.value.trim() ?? '';

          if (!newName) {
            if (errorP) {
              errorP.style.display = 'block';
              errorP.textContent = 'Nama tidak boleh kosong.';
            }
            return;
          }

          if (newName === oldName) {
            closeModal();
            return;
          }

          if (newName.includes('/') || newName.includes('\\')) {
            if (errorP) {
              errorP.style.display = 'block';
              errorP.textContent = 'Nama tidak boleh mengandung tanda garis miring (/).';
            }
            return;
          }

          onRename(newName);
          closeModal();
        },
      },
    ],
  });

  // Pilih teks nama tanpa ekstensi jika berkas
  setTimeout(() => {
    const input = content.querySelector<HTMLInputElement>('#rename-input');
    if (input) {
      input.focus();
      const dotIdx = oldName.lastIndexOf('.');
      if (!isDirectory && dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    }
  }, 50);
}

// ── 8. Dialog Panduan Pintasan Keyboard ──────────────────────────────────────

export function showKeyboardShortcutsDialog(): void {
  const content = document.createElement('div');
  content.className = 'hs-shortcuts-modal';
  content.innerHTML = `
    <style>
      .hs-kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        height: 1.5rem;
        padding: 0 0.4rem;
        font-family: var(--hs-font-mono, monospace);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--hs-text, #f1f5f9);
        background: var(--hs-surface-2, #1e293b);
        border: 1px solid var(--hs-border, #334155);
        border-radius: 4px;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
      }
      .hs-shortcuts-group {
        margin-bottom: 1.25rem;
      }
      .hs-shortcuts-group:last-child {
        margin-bottom: 0;
      }
      .hs-shortcuts-title {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--hs-text-muted, #94a3b8);
        margin-bottom: 0.5rem;
      }
      .hs-shortcuts-table {
        display: grid;
        grid-template-columns: 1fr auto;
        row-gap: 0.5rem;
        column-gap: 1rem;
        align-items: center;
        font-size: 0.875rem;
      }
      .hs-shortcuts-keys {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
    </style>

    <div class="hs-shortcuts-group">
      <div class="hs-shortcuts-title">Navigasi & Pencarian</div>
      <div class="hs-shortcuts-table">
        <span>Fokus ke pencarian berkas</span>
        <div class="hs-shortcuts-keys">
          <kbd class="hs-kbd">/</kbd>
          <span style="color:var(--hs-text-muted);font-size:0.75rem">atau</span>
          <kbd class="hs-kbd">Ctrl</kbd><kbd class="hs-kbd">K</kbd>
        </div>
        <span>Tutup modal / Bersihkan pencarian / Batalkan seleksi</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">Esc</kbd></div>
        <span>Buka panduan pintasan keyboard ini</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">?</kbd></div>
      </div>
    </div>

    <div class="hs-shortcuts-group" style="border-top:1px solid var(--hs-border,#1e293b);padding-top:1rem">
      <div class="hs-shortcuts-title">Manajemen Berkas</div>
      <div class="hs-shortcuts-table">
        <span>Pilih semua berkas di direktori aktif</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">Ctrl</kbd><kbd class="hs-kbd">A</kbd></div>
        <span>Hapus berkas/folder terpilih</span>
        <div class="hs-shortcuts-keys">
          <kbd class="hs-kbd">Delete</kbd>
          <span style="color:var(--hs-text-muted);font-size:0.75rem">atau</span>
          <kbd class="hs-kbd">Backspace</kbd>
        </div>
        <span>Ganti nama berkas/folder terpilih</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">F2</kbd></div>
        <span>Buka folder / Pratinjau berkas terpilih</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">Enter</kbd></div>
        <span>Alihkan seleksi berkas terfokus</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">Spasi</kbd></div>
      </div>
    </div>

    <div class="hs-shortcuts-group" style="border-top:1px solid var(--hs-border,#1e293b);padding-top:1rem">
      <div class="hs-shortcuts-title">Penampil Berkas & Dialog</div>
      <div class="hs-shortcuts-table">
        <span>Berkas sebelumnya / berikutnya</span>
        <div class="hs-shortcuts-keys"><kbd class="hs-kbd">←</kbd><kbd class="hs-kbd">→</kbd></div>
        <span>Siklus fokus kontrol dialog (Focus Trap)</span>
        <div class="hs-shortcuts-keys">
          <kbd class="hs-kbd">Tab</kbd>
          <span style="color:var(--hs-text-muted);font-size:0.75rem">/</span>
          <kbd class="hs-kbd">Shift</kbd><kbd class="hs-kbd">Tab</kbd>
        </div>
      </div>
    </div>
  `;

  openModal({
    title: 'Pintasan Keyboard',
    content,
    size: 'md',
    actions: [
      {
        label: 'Tutup',
        variant: 'secondary',
        onClick: () => {},
      },
    ],
  });
}
