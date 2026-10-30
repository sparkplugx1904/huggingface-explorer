// ──────────────────────────────────────────────────────────────────────────
// main.ts — Entry point HuggingStudio
// Orkestrasi boot: auth → router → render shell → routing awal.
// ──────────────────────────────────────────────────────────────────────────

import './styles/main.css';

import { initAuth, tokenStore } from './auth';
import { appStore } from './state/app-state';
import { initRouter, onNavigate } from './router';
import { detectLocale, setLocale } from './i18n';
import { initTheme } from './ui/components/theme';
import { renderShell, updateShellAuth, getMainEl } from './ui/shell';
import { loadUserRepos } from './state/repo-store';
import { showToast } from './ui/components/toast';
import { showSessionExpiredDialog } from './ui/components/dialogs';
// Halaman — static import (semua diketahui saat author-time; code-split oleh Vite via manualChunks)
import { renderLoginPage } from './ui/pages/login';
import { renderCallbackPage } from './ui/pages/callback';
import { renderRepoListPage } from './ui/pages/repo-list';
import { renderNotFoundPage } from './ui/pages/not-found';
import { renderFileManagerPage } from './ui/pages/file-manager';
import { renderCommitHistoryPage } from './ui/pages/commit-history';

import type { Route } from './router/router';
import type { RepoType } from './api/types';

// ── Routing ────────────────────────────────────────────────────────────────

/** Sanitasi string sebelum dimasukkan ke innerHTML. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function handleRoute(route: Route): void {
  const container = getMainEl();
  if (!container) return;

  // Kosongkan konten sebelumnya tanpa re-render shell
  container.innerHTML = '';

  switch (route.name) {
    case 'home': {
      const auth = appStore.value.auth;
      if (auth.token) {
        renderRepoListPage(container);
      } else {
        renderLoginPage(container);
      }
      break;
    }

    case 'explore': {
      renderRepoListPage(container);
      break;
    }

    case 'callback': {
      renderCallbackPage(container);
      break;
    }

    case 'owner': {
      // /:owner — daftar repo milik owner (publik atau private jika sudah login)
      renderRepoListPage(container, route.params.owner);
      break;
    }

    case 'repo':
    case 'browse': {
      const owner = route.params.owner ?? '';
      const repo = route.params.repo ?? '';
      const repoType = (route.params.type as RepoType) || 'model';
      const path = route.params.path ?? '';
      renderFileManagerPage(container, owner, repo, repoType, path);
      break;
    }
    case 'history': {
      const owner = route.params.owner ?? '';
      const repo = route.params.repo ?? '';
      const repoType = (route.params.type as RepoType) || 'model';
      const path = route.params.path ?? '';
      renderCommitHistoryPage(container, owner, repo, repoType, path || undefined);
      break;
    }


    default: {
      renderNotFoundPage(container);
    }
  }
}

// ── Boot sequence ──────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // 1. Terapkan tema & bahasa sebelum render apapun (hindari flash)
  initTheme();
  setLocale(detectLocale());

  // 2. Inisialisasi auth (cek callback OAuth / session tersimpan di sessionStorage)
  const authState = await initAuth();

  // 3. Update global store dengan auth state hasil boot
  appStore.update({ auth: authState });

  // 4. Render app shell (header + sidebar + area konten utama)
  renderShell();
  updateShellAuth(authState);
  if (authState.token) {
    void loadUserRepos(undefined, authState.token);
  }

  // 5. Sinkronkan shell saat auth store berubah (mis. setelah login/logout)
  appStore.subscribe((state) => {
    updateShellAuth(state.auth);
  });
  // 6. Tangani token kedaluwarsa secara terpusat: hapus sesi bila token expired (HTTP 401)
  // Menampilkan notifikasi re-login tanpa menghapus data perubahan tertunda (pendingChanges)
  let _authExpiredDebounce = 0;
  window.addEventListener('auth:expired', () => {
    const now = Date.now();
    if (now - _authExpiredDebounce < 1500) return;
    _authExpiredDebounce = now;

    if (tokenStore.token) {
      tokenStore.clearSession();
    }
    showToast('Sesi Anda telah kedaluwarsa. Silakan masuk kembali.', 'warning', 6000);
    showSessionExpiredDialog();
  });

  // 7. Daftarkan handler route SEBELUM initRouter agar rute awal langsung dieksekusi
  onNavigate(handleRoute);
  initRouter();

  // 8. Sembunyikan loading screen dengan transisi halus setelah render selesai
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    loadingEl.addEventListener('transitionend', () => loadingEl.remove(), { once: true });
  }
}

// ── Error boundary global ──────────────────────────────────────────────────

boot().catch((err: unknown) => {
  console.error('[HuggingStudio] Boot gagal:', err);
  const loading = document.getElementById('app-loading');
  if (loading) {
    loading.innerHTML = `
      <div style="text-align:center;padding:2rem;max-width:360px">
        <div style="color:#f59e0b;margin-bottom:1rem;display:flex;justify-content:center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p style="font-size:.875rem;color:#666;margin-bottom:1.5rem">${escHtml(String(err))}</p>
        <button onclick="location.reload()" style="
          padding:.625rem 1.25rem;border-radius:.5rem;
          background:#FF9D00;color:#fff;border:none;cursor:pointer;font-weight:600
        ">Muat Ulang</button>
      </div>
    `;
  }
});
