// ──────────────────────────────────────────────────────────────────────────
// src/state/repo-store.ts — Central Repository Store
// Menyimpan daftar repo pengguna (dibagi menjadi Models & Datasets),
// agar sidebar dan halaman utama dapat menampilkan daftar repo secara reaktif.
// ──────────────────────────────────────────────────────────────────────────

import { Store } from './store';
import { listUserRepos, resolveAuthorUsername } from '../api/repos';
import { tokenStore } from '../auth/token-store';

import type { RepoInfo } from '../api/types';

export interface RepoStoreState {
  models: RepoInfo[];
  datasets: RepoInfo[];
  spaces: RepoInfo[];
  allRepos: RepoInfo[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  currentOwner: string;
}

const initialRepoState: RepoStoreState = {
  models: [],
  datasets: [],
  spaces: [],
  allRepos: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  currentOwner: '',
};

export const repoStore = new Store<RepoStoreState>(initialRepoState);

let _activePromise: Promise<RepoInfo[]> | null = null;
let _activeOwner = '';

/** Cek apakah dua identifier owner mereferensikan akun yang sama (misal 'me' vs username aktif) */
function isSameOwner(a: string, b: string, userLogin?: string | null): boolean {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA === cleanB) return true;
  if (userLogin) {
    const u = userLogin.trim().toLowerCase();
    const aIsSelf = cleanA === u || cleanA === 'me';
    const bIsSelf = cleanB === u || cleanB === 'me';
    if (aIsSelf && bIsSelf) return true;
  }
  return false;
}

/**
 * Memuat repositori untuk pemilik tertentu (user atau org).
 * Otomatis membagi repositori menjadi `models`, `datasets`, dan `spaces`.
 */
export async function loadUserRepos(
  owner?: string,
  token?: string | null,
  force: boolean = false
): Promise<RepoInfo[]> {
  const activeToken = token !== undefined ? token : tokenStore.token;
  const authUser = tokenStore.snapshot().user;
  const authLogin = authUser?.login || authUser?.name;
  const targetOwner = await resolveAuthorUsername(owner, activeToken);
  // Pengguna guest tidak memiliki repo: jangan buat request ke API
  if (!targetOwner) {
    repoStore.update({
      models: [],
      datasets: [],
      spaces: [],
      allRepos: [],
      isLoading: false,
      hasLoaded: true,
      error: null,
      currentOwner: '',
    });
    return [];
  }

  // Jika ada panggilan aktif yang sedang berjalan untuk owner yang sama, gunakan promise tersebut (single-flight)
  if (_activePromise && isSameOwner(_activeOwner, targetOwner, authLogin)) {
    return _activePromise;
  }

  // Jika data sudah pernah dimuat untuk owner yang sama dan tidak dipaksa refresh, gunakan cache
  const state = repoStore.value;
  if (!force && state.hasLoaded && isSameOwner(state.currentOwner, targetOwner, authLogin)) {
    return state.allRepos;
  }

  repoStore.update({ isLoading: true, error: null, currentOwner: targetOwner });
  _activeOwner = targetOwner;

  _activePromise = (async () => {
    try {
      const repos = await listUserRepos({
        owner: targetOwner,
        token: activeToken,
      });

      const models = repos.filter((r) => r.type === 'model');
      const datasets = repos.filter((r) => r.type === 'dataset');
      const spaces = repos.filter((r) => r.type === 'space');

      repoStore.update({
        models,
        datasets,
        spaces,
        allRepos: repos,
        isLoading: false,
        hasLoaded: true,
        error: null,
        currentOwner: targetOwner,
      });

      return repos;
    } catch (err: unknown) {
      let msg = 'Gagal memuat repositori';
      if (err instanceof Error) {
        msg = err.message;
      } else if (err && typeof err === 'object' && 'message' in err) {
        msg = String(err.message);
      }
      repoStore.update({
        isLoading: false,
        hasLoaded: true,
        error: msg,
        currentOwner: targetOwner,
      });
      return [];
    } finally {
      _activePromise = null;
      _activeOwner = '';
    }
  })();

  return _activePromise;
}
