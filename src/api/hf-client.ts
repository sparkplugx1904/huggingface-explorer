// HTTP client wrapper untuk HuggingFace API
// Semua request langsung ke huggingface.co tanpa proxy

import { tokenStore } from '../auth/token-store.js';
import type { ApiError } from './types.js';

const BASE_URL = 'https://huggingface.co';

// Waktu timestamp (ms) hingga batas rate limit berakhir
let _rateLimitResetUntil = 0;

type HfFetchOptions = RequestInit & { token?: string | null };

/**
 * Fetch wrapper untuk HuggingFace API.
 * - Inject Authorization header jika token ada
 * - Handle 401 → emit event 'auth:expired'
 * - Handle 429 → throw ApiError dengan isRateLimit: true, sertakan Retry-After
 * - Handle 5xx → retry 1x dengan delay 1 detik
 * - Handle non-ok → throw ApiError dengan message dari body
 */
export async function hfFetch(
  path: string,
  options: HfFetchOptions = {}
): Promise<Response> {
  // Fast-fail jika masih dalam masa cooldown rate limit dari request sebelumnya
  if (Date.now() < _rateLimitResetUntil) {
    const waitSec = Math.max(1, Math.ceil((_rateLimitResetUntil - Date.now()) / 1000));
    throw {
      status: 429,
      message: `Rate limited oleh Hugging Face API. Coba lagi dalam ${waitSec} detik.`,
      isRateLimit: true,
      isAuth: false,
    } satisfies ApiError;
  }

  const { token, ...fetchOptions } = options;

  // Susun headers dengan Authorization jika token tersedia (atau otomatis dari tokenStore)
  const headers = new Headers(fetchOptions.headers);
  const activeToken = token !== undefined ? token : tokenStore.token;
  if (activeToken) {
    headers.set('Authorization', `Bearer ${activeToken}`);
  }

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const init: RequestInit = { ...fetchOptions, headers };

  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (err) {
    // Error jaringan
    throw { status: 0, message: err instanceof Error ? err.message : 'Network error', isRateLimit: false, isAuth: false } satisfies ApiError;
  }

  // Retry 1x untuk 5xx dengan delay 1 detik menggunakan Promise.withResolvers
  if (response.status >= 500 && response.status < 600) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 1000);
    await promise;

    try {
      response = await fetch(url, init);
    } catch (err) {
      throw { status: 0, message: err instanceof Error ? err.message : 'Network error', isRateLimit: false, isAuth: false } satisfies ApiError;
    }
  }

  // Handle 401 Unauthorized → hanya emit event jika request memang membawa token aktif
  if (response.status === 401) {
    if (activeToken && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw { status: 401, message: 'Authentication expired', isRateLimit: false, isAuth: true } satisfies ApiError;
  }

  // Handle 429 Rate Limit → catat cooldown dan sertakan nilai Retry-After
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retrySeconds = retryAfterHeader ? Math.max(1, parseInt(retryAfterHeader, 10) || 5) : 5;
    _rateLimitResetUntil = Math.max(_rateLimitResetUntil, Date.now() + retrySeconds * 1000);
    const message = `Rate limited. Retry after ${retrySeconds}s`;
    throw { status: 429, message, isRateLimit: true, isAuth: false } satisfies ApiError;
  }

  // Handle error lainnya → ekstrak message dari body
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.text();
      if (body) {
        // Coba parse JSON untuk field error/message
        try {
          const json = JSON.parse(body) as Record<string, unknown>;
          message = String(json.error ?? json.message ?? body);
        } catch {
          message = body;
        }
      }
    } catch {
      // Biarkan message default
    }
    throw { status: response.status, message, isRateLimit: false, isAuth: false } satisfies ApiError;
  }

  return response;
}
