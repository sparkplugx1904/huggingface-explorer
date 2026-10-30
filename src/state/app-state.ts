// State global aplikasi — satu sumber kebenaran

import type { AuthState } from '../auth/types';
import type { RepoType } from '@huggingface/hub';
import { Store } from './store';
import { tokenStore } from '../auth/token-store';

export interface AppState {
  auth: AuthState;
  /** User atau org yang sedang dilihat di sidebar/repo list */
  currentOwner: string | null;
  currentRepo: RepoInfo | null;
  repoListFilter: {
    type: 'all' | RepoType;
    search: string;
    /** null = user sendiri yang sedang login */
    owner: string | null;
  };
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark' | 'system';
  locale: 'id' | 'en';
  /** Drawer terbuka di mobile */
  sidebarOpen: boolean;
}

/** Info ringkas sebuah repo (diisi oleh api layer) */
export interface RepoInfo {
  id: string;
  type: RepoType;
  name: string;
  owner: string;
  private: boolean;
  updatedAt: Date | null;
}

const initialState: AppState = {
  auth: {
    token: null,
    tokenExpiresAt: null,
    user: null,
    isGuest: true,
  },
  currentOwner: null,
  currentRepo: null,
  repoListFilter: {
    type: 'all',
    search: '',
    owner: null,
  },
  isLoading: false,
  error: null,
  // Ikuti preferensi sistem secara default
  theme: 'system',
  locale: (navigator.language.startsWith('id') ? 'id' : 'en'),
  sidebarOpen: false,
};

/** Singleton store untuk state global */
export const appStore = new Store<AppState>(initialState);

// Sinkronkan auth state secara reaktif saat tokenStore berubah (login, logout, background whoami)
tokenStore.addEventListener('change', (e: Event) => {
  if (e instanceof CustomEvent && e.detail) {
    const detail = e.detail as AuthState;
    const current = appStore.value.auth;
    // Hindari update redundan jika state auth tidak berubah
    if (
      current.token !== detail.token ||
      current.isGuest !== detail.isGuest ||
      current.user?.login !== detail.user?.login ||
      current.user?.orgs !== detail.user?.orgs
    ) {
      appStore.update({ auth: detail });
    }
  }
});

/**
 * Apakah user sudah terautentikasi dengan token valid.
 * Exported stable domain concept — dipakai di banyak tempat.
 */
export const isAuthenticated = (): boolean => {
  const { token, tokenExpiresAt } = appStore.value.auth;
  return token !== null && (tokenExpiresAt === null || tokenExpiresAt > new Date());
};

/**
 * Ambil access token dari memory store.
 * Token TIDAK disimpan di localStorage, hanya di memori (+ sessionStorage fallback di auth layer).
 */
export const getToken = (): string | null => appStore.value.auth.token;
