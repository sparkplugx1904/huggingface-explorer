export type { AuthState, UserInfo, OrgInfo } from './types';
export { tokenStore, SESSION_KEY } from './token-store';
export { startLogin, handleCallback, logout, refreshIfNeeded, fetchWhoami, cleanupPkceStorage, restorePendingChangesBackup } from './oauth';
export type { WhoamiProfile } from './oauth';

import { handleCallback, fetchWhoami, type WhoamiProfile } from './oauth';
import { tokenStore } from './token-store';
import type { AuthState, UserInfo } from './types';

// ── Boot ───────────────────────────────────────────────────────────────────

/**
 * Inisialisasi auth saat app boot.
 * Urutan: coba OAuth callback → coba sesi tersimpan → return guest state.
 */
export async function initAuth(): Promise<AuthState> {
  // 1. Tangani redirect balik dari HF terlebih dahulu
  const fromCallback = await handleCallback();
  if (fromCallback) return fromCallback;

  // 2. Bukan halaman callback — muat sesi yang ada (memory / sessionStorage)
  const existing = tokenStore.loadSession();
  if (existing) {
    // Jika ada token, panggil GET https://huggingface.co/api/whoami-v2 di background
    // untuk memastikan user.login adalah username HF yang valid dan daftar orgs terbaru
    if (existing.token) {
      const activeToken = existing.token;
      try {
        const { promise, resolve } = Promise.withResolvers<WhoamiProfile | null>();
        const timer = setTimeout(() => resolve(null), 2000);
        fetchWhoami(activeToken)
          .then((p) => {
            clearTimeout(timer);
            resolve(p);
          })
          .catch(() => {
            clearTimeout(timer);
            resolve(null);
          });

        const profile = await promise;
        if (profile) {
          const updatedUser: UserInfo = {
            login: profile.login || existing.user?.login || '',
            name: profile.name || existing.user?.name || '',
            avatarUrl: profile.avatarUrl || existing.user?.avatarUrl || '',
            isPro: profile.isPro ?? existing.user?.isPro,
            orgs: profile.orgs.length > 0 ? profile.orgs : existing.user?.orgs,
          };
          const expiresAt = tokenStore.expiresAt ?? new Date(Date.now() + 3600 * 1000);
          tokenStore.saveSession(activeToken, expiresAt, updatedUser);
          return tokenStore.snapshot();
        }
      } catch (err: unknown) {
        console.warn('[auth] Whoami sync gagal:', err);
      }
    }
    return existing;
  }
  // 3. Tidak ada sesi — kembalikan guest state
  return { token: null, tokenExpiresAt: null, user: null, isGuest: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Akses cepat ke token aktif.
 * Exported sebagai fungsi agar callsite tidak coupling ke impl tokenStore.
 */
export function getToken(): string | null {
  return tokenStore.token;
}

/**
 * Guard untuk aksi yang membutuhkan login.
 * Throw dengan pesan jelas agar pemanggil bisa menampilkan prompt login.
 */
export function requireAuth(): void {
  if (!tokenStore.token) {
    throw new Error('Autentikasi diperlukan. Silakan login terlebih dahulu.');
  }
}
