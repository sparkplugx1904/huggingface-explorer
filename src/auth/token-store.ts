import type { AuthState, UserInfo } from './types';

// Kunci sessionStorage — bukan localStorage
const SESSION_KEY = 'hs:session';

// ── State reaktif via EventTarget ──────────────────────────────────────────
class AuthStore extends EventTarget {
  /**
   * Token tersimpan di memory JS; tidak pernah ke localStorage atau cookies.
   * Dilarang keras melakukan URL leaking / cookie storage untuk token sesi.
   */
  private _token: string | null = null;
  private _expiresAt: Date | null = null;
  private _user: UserInfo | null = null;

  /** Simpan sesi ke memori dan sessionStorage sebagai fallback refresh */
  saveSession(token: string, expiresAt: Date, user: UserInfo): void {
    this._token = token;
    this._expiresAt = expiresAt;
    this._user = user;

    // Simpan ke sessionStorage (dibersihkan saat tab ditutup)
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          token,
          expiresAt: expiresAt.toISOString(),
          user,
        })
      );
    } catch {
      // sessionStorage tidak tersedia (private browsing ekstrem), tetap lanjut
    }

    // Pastikan tidak ada token atau sesi yang tersimpan di localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('token');
        localStorage.removeItem('hs:token');
      }
    } catch {
      // abaikan
    }

    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  /** Muat sesi — coba memori dulu, lalu sessionStorage */
  loadSession(): AuthState | null {
    // Prioritas 1: memory (tab masih aktif)
    if (this._token) {
      return this.snapshot();
    }

    // Prioritas 2: sessionStorage (setelah page refresh)
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as {
        token?: unknown;
        expiresAt?: unknown;
        user?: unknown;
      };

      if (!parsed || typeof parsed.token !== 'string' || !parsed.token) {
        this.clearSession();
        return null;
      }

      if (typeof parsed.expiresAt !== 'string') {
        this.clearSession();
        return null;
      }

      const expiresAt = new Date(parsed.expiresAt);
      if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        this.clearSession();
        return null;
      }

      const user = (parsed.user && typeof parsed.user === 'object')
        ? (parsed.user as UserInfo)
        : null;

      // Pulihkan ke memori
      this._token = parsed.token;
      this._expiresAt = expiresAt;
      this._user = user;

      return this.snapshot();
    } catch {
      // Data sessionStorage korup, bersihkan
      this.clearSession();
      return null;
    }
  }

  /** Hapus semua sesi dari memori dan sessionStorage */
  clearSession(): void {
    this._token = null;
    this._expiresAt = null;
    this._user = null;

    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // abaikan
    }

    // Bersihkan residu di localStorage jika ada
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('token');
        localStorage.removeItem('hs:token');
      }
    } catch {
      // abaikan
    }

    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  /** Snapshot AuthState saat ini */
  snapshot(): AuthState {
    return {
      token: this._token,
      tokenExpiresAt: this._expiresAt,
      user: this._user,
      isGuest: this._token === null,
    };
  }

  /** Akses cepat ke token tanpa membuat objek baru */
  get token(): string | null {
    return this._token;
  }

  get expiresAt(): Date | null {
    return this._expiresAt;
  }
}

// Singleton — satu instance per tab
export const tokenStore = new AuthStore();

export { SESSION_KEY };
export type { AuthState };
