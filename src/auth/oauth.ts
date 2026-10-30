import { oauthLoginUrl, oauthHandleRedirectIfPresent, type OAuthResult } from '@huggingface/hub';
import { tokenStore } from './token-store';
import type { AuthState, UserInfo, OrgInfo } from './types';
import { pendingChanges, type PendingChange } from '../state/pending-changes';
export interface WhoamiProfile {
  login: string;
  name: string;
  avatarUrl: string;
  isPro?: boolean;
  orgs: OrgInfo[];
}

/**
 * Panggil GET https://huggingface.co/api/whoami-v2 untuk mendapatkan profil lengkap
 * dan daftar organisasi user saat ini.
 */
export async function fetchWhoami(token: string): Promise<WhoamiProfile | null> {
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      return null;
    }
    const data = (await res.json()) as {
      id?: string;
      name?: string;
      fullname?: string;
      avatarUrl?: string;
      isPro?: boolean;
      orgs?: Array<{
        name: string;
        avatarUrl?: string;
        isEnterprise?: boolean;
      }>;
    };
    const login = data.name || data.id || '';
    const name = data.fullname || data.name || login;
    const avatarUrl = data.avatarUrl || (login ? `https://huggingface.co/avatars/${login}` : '');
    const isPro = typeof data.isPro === 'boolean' ? data.isPro : undefined;
    const orgs: OrgInfo[] = Array.isArray(data.orgs)
      ? data.orgs.map((o) => ({
          name: o.name,
          avatarUrl: o.avatarUrl ?? `https://huggingface.co/avatars/${o.name}`,
          isEnterprise: Boolean(o.isEnterprise),
        }))
      : [];
    return { login, name, avatarUrl, isPro, orgs };
  } catch (err: unknown) {
    console.warn('[auth] Gagal memuat whoami-v2:', err);
    return null;
  }
}

/**
 * Bersihkan seluruh state PKCE dan nonce dari storage agar tidak bocor atau tertinggal.
 */
export function cleanupPkceStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('huggingface.co:oauth:code_verifier');
    localStorage.removeItem('huggingface.co:oauth:nonce');
    localStorage.removeItem('huggingface.co:oauth:state');
    sessionStorage.removeItem('huggingface.co:oauth:code_verifier');
    sessionStorage.removeItem('huggingface.co:oauth:nonce');
    sessionStorage.removeItem('huggingface.co:oauth:state');
  } catch {
    // Abaikan kegagalan akses storage
  }
}

/**
 * Cadangkan perubahan tertunda ke sessionStorage sebelum redirect browser ke HF OAuth.
 * Memastikan data file staged milik user tidak hilang selama alur login OAuth.
 */
async function backupPendingChanges(): Promise<void> {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const changes = pendingChanges.value;
    if (!changes || changes.length === 0) {
      sessionStorage.removeItem('hs:pending-changes:backup');
      return;
    }
    const serialized = await Promise.all(
      changes.map(async (c) => {
        let base64: string | undefined;
        let mimeType: string | undefined;
        if (c.content) {
          mimeType = c.content.type;
          const buf = await c.content.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const len = bytes.byteLength;
          const CHUNK = 0x8000;
          for (let i = 0; i < len; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
          }
          base64 = btoa(binary);
        }
        return {
          id: c.id,
          type: c.type,
          path: c.path,
          newPath: c.newPath,
          size: c.size,
          isDirectory: c.isDirectory,
          timestamp: c.timestamp,
          mimeType,
          contentBase64: base64,
        };
      })
    );
    sessionStorage.setItem('hs:pending-changes:backup', JSON.stringify(serialized));
  } catch (err) {
    console.warn('[auth] Gagal mencadangkan perubahan tertunda:', err);
  }
}

/**
 * Pulihkan perubahan tertunda dari sessionStorage setelah alur OAuth callback selesai.
 */
export function restorePendingChangesBackup(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem('hs:pending-changes:backup');
    if (!raw) return;
    sessionStorage.removeItem('hs:pending-changes:backup');

    const items = JSON.parse(raw) as Array<{
      id: string;
      type: 'add' | 'delete' | 'rename' | 'move' | 'create_folder';
      path: string;
      newPath?: string;
      size?: number;
      isDirectory?: boolean;
      timestamp: number;
      mimeType?: string;
      contentBase64?: string;
    }>;

    const restored: PendingChange[] = items.map((item) => {
      let content: Blob | undefined;
      if (item.contentBase64) {
        const binary = atob(item.contentBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        content = new Blob([bytes], { type: item.mimeType || 'application/octet-stream' });
      }
      return {
        id: item.id,
        type: item.type,
        path: item.path,
        newPath: item.newPath,
        content,
        size: item.size,
        isDirectory: item.isDirectory,
        timestamp: item.timestamp,
      };
    });

    if (restored.length > 0 && pendingChanges.value.length === 0) {
      pendingChanges.set(restored);
    }
  } catch (err) {
    console.warn('[auth] Gagal memulihkan perubahan tertunda dari cadangan:', err);
  }
}

// ── Login ──────────────────────────────────────────────────────────────────

/**
 * Mulai alur OAuth PKCE — generate URL lalu redirect browser ke HF.
 * clientId diambil dari env VITE_HF_CLIENT_ID yang di-set saat build/dev.
 */
/**
 * Mengembalikan redirect URI kanonikal yang terdaftar di HF OAuth App.
 * Menghindari 400 akibat hash preview Cloudflare Pages (misal: 3338bb7e.huggingstudio.pages.dev).
 */
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return 'https://huggingstudio.pages.dev/callback';
  const { hostname, origin } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${origin}/callback`;
  }

  if (hostname.endsWith('.pages.dev')) {
    return 'https://huggingstudio.pages.dev/callback';
  }

  return `${origin}/callback`;
}

export async function startLogin(): Promise<void> {
  if (typeof window !== 'undefined') {
    const { hostname, pathname, search } = window.location;

    // Simpan rute saat ini agar setelah callback user kembali ke lokasi yang sama
    try {
      const returnUrl = pathname + search;
      if (pathname !== '/callback' && pathname !== '/login') {
        sessionStorage.setItem('hs:auth:return_to', returnUrl);
      }
    } catch {
      // abaikan
    }

    // Amankan perubahan tertunda sebelum redirect
    await backupPendingChanges();

    // Pastikan jika berada di subdomain preview Cloudflare Pages, arahkan ke domain kanonikal
    // agar PKCE verifier dan redirect_uri berada pada origin yang sama persis
    if (hostname.endsWith('.pages.dev') && hostname !== 'huggingstudio.pages.dev') {
      window.location.assign('https://huggingstudio.pages.dev/login');
      return;
    }
  }

  const redirectUrl = getRedirectUri();
  const url = await oauthLoginUrl({
    clientId: (import.meta.env.VITE_HF_CLIENT_ID as string | undefined) ?? '1ccb4f95-5065-465e-9d8e-61980884d4e0',
    redirectUrl,
    scopes: 'openid profile read-repos write-repos',
  });
  window.location.assign(url);
}

// ── Callback ───────────────────────────────────────────────────────────────

/**
 * Tangani redirect balik dari HF setelah user approve.
 * Mengembalikan AuthState jika ada code OAuth di URL, null jika tidak.
 */
let _handleCallbackPromise: Promise<AuthState | null> | null = null;

export async function handleCallback(): Promise<AuthState | null> {
  if (_handleCallbackPromise) {
    return _handleCallbackPromise;
  }

  _handleCallbackPromise = (async () => {
    let result: OAuthResult | false;

    try {
      result = await oauthHandleRedirectIfPresent();
    } catch (err) {
      // OAuth error (mismatched state, code expired, dll) — bersihkan sisa URL dan PKCE
      cleanupPkceStorage();
      const clean = new URL(window.location.href);
      clean.search = '';
      window.history.replaceState(null, '', clean.toString());
      console.error('[auth] OAuth callback gagal:', err);
      return null;
    } finally {
      // Pastikan state/code_verifier selalu terhapus setelah callback selesai
      cleanupPkceStorage();
    }

    if (!result) {
      // Tidak ada code di URL — bukan halaman callback
      return null;
    }

    const { accessToken, accessTokenExpiresAt, userInfo } = result;

    const login = userInfo.name || userInfo.id;
    const name = userInfo.fullname || userInfo.name;

    let user: UserInfo = {
      login,
      name,
      avatarUrl: userInfo.avatarUrl,
      isPro: userInfo.isPro,
      orgs: (userInfo.orgs || []).map((o) => ({
        name: o.name,
        avatarUrl: o.avatarUrl,
        isEnterprise: o.isEnterprise,
      })),
    };

    // Sinkronisasi dengan GET /api/whoami-v2 jika token ada untuk melengkapi profil dan orgs
    if (accessToken) {
      try {
        const whoami = await fetchWhoami(accessToken);
        if (whoami) {
          user = {
            login: whoami.login || user.login,
            name: whoami.name || user.name,
            avatarUrl: whoami.avatarUrl || user.avatarUrl,
            isPro: whoami.isPro ?? user.isPro,
            orgs: whoami.orgs.length > 0 ? whoami.orgs : user.orgs,
          };
        }
      } catch (err) {
        console.warn('[auth] fetchWhoami saat callback gagal:', err);
      }
    }

    tokenStore.saveSession(accessToken, accessTokenExpiresAt, user);

    // Pulihkan perubahan tertunda dari cadangan jika ada
    restorePendingChangesBackup();

    // Bersihkan query string agar tidak ter-replay saat refresh dan tidak bocor di URL
    const clean = new URL(window.location.href);
    clean.search = '';
    const targetPath = clean.pathname === '/callback' ? '/' : clean.toString();
    window.history.replaceState(null, '', targetPath);

    // Hapus PKCE verifier dan nonce secara tuntas
    cleanupPkceStorage();

    return tokenStore.snapshot();
  })().finally(() => {
    _handleCallbackPromise = null;
  });

  return _handleCallbackPromise;
}

// ── Logout ─────────────────────────────────────────────────────────────────

/**
 * Hapus sesi lokal, revoke token di sisi HF (best-effort), lalu redirect ke '/'.
 */
export async function logout(): Promise<void> {
  const token = tokenStore.token;
  tokenStore.clearSession();
  cleanupPkceStorage();

  if (token) {
    try {
      // HF mendukung revoke via form POST; abaikan error jaringan
      await fetch('https://huggingface.co/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // best-effort — sesi lokal sudah dibersihkan di atas
    }
  }

  window.location.assign('/');
}

// ── Refresh guard ──────────────────────────────────────────────────────────

/** Batas waktu sebelum expiry untuk meminta login ulang (5 menit dalam ms) */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/**
 * Cek apakah token masih valid dalam batas margin.
 * HF tidak mendukung silent refresh untuk public client tanpa secret,
 * jadi jika hampir expired: revoke + paksa login ulang.
 * Mengembalikan true jika token masih cukup valid untuk dipakai.
 */
export async function refreshIfNeeded(): Promise<boolean> {
  const { token, expiresAt } = tokenStore;

  // Tidak ada sesi — guest mode, tidak perlu refresh
  if (!token || !expiresAt) return true;

  if (expiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    return true;
  }

  // Token hampir atau sudah expired — bersihkan sesi aktif dan beritahu aplikasi
  // tanpa merusak tampilan atau menghapus pendingChanges
  tokenStore.clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return false;
}
