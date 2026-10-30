// Listing repository via Hugging Face REST API
// Mengambil models, datasets, dan spaces menggunakan hfFetch

import { hfFetch } from './hf-client.js';
import { tokenStore } from '../auth/token-store.js';
import { fetchWhoami } from '../auth/oauth.js';
import type { RepoInfo, OrgInfo, RepoType, ListReposOptions, ApiError } from './types.js';

interface HfRepoResponseItem {
  id?: string;
  _id?: string;
  name?: string;
  private?: boolean;
  lastModified?: string | number;
  createdAt?: string | number;
  updatedAt?: string | number;
  likes?: number;
  downloads?: number;
  description?: string;
  tags?: string[];
  author?: string;
}

function parseRepoItem(item: HfRepoResponseItem, type: RepoType, fallbackOwner: string): RepoInfo {
  const fullId = item.id || item._id || '';
  const parts = fullId.split('/');
  const itemOwner = parts.length > 1 ? parts[0] : (item.author || fallbackOwner);
  const repoName = parts.length > 1 ? parts.slice(1).join('/') : (item.name || fullId);

  return {
    id: fullId || `${itemOwner}/${repoName}`,
    name: repoName,
    owner: itemOwner,
    type,
    isPrivate: Boolean(item.private),
    lastModified: new Date(item.lastModified || item.createdAt || item.updatedAt || Date.now()),
    likes: typeof item.likes === 'number' ? item.likes : undefined,
    downloads: typeof item.downloads === 'number' ? item.downloads : undefined,
    description: item.description,
    tags: Array.isArray(item.tags) ? item.tags : undefined,
  };
}

/**
 * Menyelesaikan username asli dari akun pengguna jika parameter bernilai 'me' atau kosong.
 * Hugging Face REST API mencari user harfiah "me" bila tidak memakai username asli.
 */
export async function resolveAuthorUsername(
  author?: string,
  token?: string | null
): Promise<string> {
  const clean = (author || '').trim();
  if (clean && clean !== 'me') {
    return clean;
  }

  // Ambil dari snapshot sesi user aktif
  const authUser = tokenStore.snapshot().user;
  if (authUser?.login) {
    return authUser.login;
  }
  if (authUser?.name) {
    return authUser.name;
  }

  // Jika belum ada di memory dan token tersedia, panggil whoami-v2
  const activeToken = token !== undefined ? token : tokenStore.token;
  if (activeToken) {
    try {
      const whoami = await fetchWhoami(activeToken);
      if (whoami?.login) {
        return whoami.login;
      }
    } catch {
      // Abaikan jika network drop
    }
  }

  return '';
}

async function fetchReposByType(
  endpoint: 'models' | 'datasets' | 'spaces',
  type: RepoType,
  targetAuthor: string,
  token?: string | null
): Promise<RepoInfo[]> {
  const authorClean = targetAuthor.trim();
  // Cegah secara mutlak request dengan author 'me' atau kosong
  if (!authorClean || authorClean === 'me') {
    return [];
  }

  const items: HfRepoResponseItem[] = [];
  let url: string | null = `/api/${endpoint}?author=${encodeURIComponent(authorClean)}&limit=100&full=true`;

  try {
    while (url) {
      const res = await hfFetch(url, { token });
      const data = (await res.json()) as HfRepoResponseItem[];
      if (Array.isArray(data)) {
        items.push(...data);
      }

      // Ikuti pagination via header Link: <https://huggingface.co/api/models?...cursor=...>; rel="next"
      const linkHeader = res.headers.get('link');
      const match = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1].replace('https://huggingface.co', '') : null;
    }

    return items.map((item) => parseRepoItem(item, type, authorClean));
  } catch (err: unknown) {
    // Re-throw rate limit (429) dan auth expired (401) agar caller mengetahui status error
    if (typeof err === 'object' && err !== null && ('isRateLimit' in err || 'isAuth' in err)) {
      const apiErr = err as ApiError;
      if (apiErr.isRateLimit || apiErr.isAuth) {
        throw err;
      }
    }
    console.warn(`[HuggingStudio] fetchReposByType (${endpoint}) gagal:`, err);
    return [];
  }
}

/**
 * Ambil semua repo milik owner (user/org).
 * Menyelesaikan username asli dari whoami-v2 jika query 'me' atau akun login.
 * Mengirim Bearer token agar repositori privat dapat ditampilkan dengan badge "Private".
 * Memanggil endpoint models, datasets, dan spaces secara parallel serta mengikuti pagination Link header.
 */
export async function listUserRepos(opts: ListReposOptions): Promise<RepoInfo[]> {
  const { owner, types, token, search, limit } = opts;
  const activeToken = token !== undefined ? token : tokenStore.token;

  // Selesaikan username asli (jangan pernah kirim harfiah 'me')
  const targetAuthor = await resolveAuthorUsername(owner, activeToken);

  if (!targetAuthor) {
    return [];
  }

  const wantModels   = !types || types.includes('model');
  const wantDatasets = !types || types.includes('dataset');
  const wantSpaces   = !types || types.includes('space');

  // Jalankan query REST API secara parallel untuk ketiga tipe
  const [modelsResult, datasetsResult, spacesResult] = await Promise.all([
    wantModels ? fetchReposByType('models', 'model', targetAuthor, activeToken) : Promise.resolve([]),
    wantDatasets ? fetchReposByType('datasets', 'dataset', targetAuthor, activeToken) : Promise.resolve([]),
    wantSpaces ? fetchReposByType('spaces', 'space', targetAuthor, activeToken) : Promise.resolve([]),
  ]);

  let repos = [...modelsResult, ...datasetsResult, ...spacesResult];

  // Filter pencarian di sisi client (nama atau id mengandung keyword)
  if (search) {
    const q = search.toLowerCase();
    repos = repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false)
    );
  }

  // Urutkan descending berdasarkan lastModified
  repos.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  // Terapkan limit jika disetel
  if (limit && limit > 0) {
    repos = repos.slice(0, limit);
  }

  return repos;
}

let _activeOrgsPromise: Promise<OrgInfo[]> | null = null;
let _cachedOrgs: { token: string; orgs: OrgInfo[]; timestamp: number } | null = null;
const ORGS_CACHE_TTL = 60_000; // 1 menit cache in-memory

/**
 * Ambil daftar organisasi yang diikuti user berdasarkan token.
 * Endpoint: GET /api/whoami-v2
 * Menggunakan deduplikasi single-flight dan cache in-memory 60 detik.
 */
export async function listUserOrgs(token: string): Promise<OrgInfo[]> {
  if (!token) return [];

  // Gunakan cache jika masih valid untuk token yang sama
  if (_cachedOrgs && _cachedOrgs.token === token && Date.now() - _cachedOrgs.timestamp < ORGS_CACHE_TTL) {
    return _cachedOrgs.orgs;
  }

  // Single-flight deduplication jika ada pemanggilan yang sedang berjalan
  if (_activeOrgsPromise) {
    return _activeOrgsPromise;
  }

  _activeOrgsPromise = (async () => {
    try {
      const response = await hfFetch('/api/whoami-v2', { token });
      const data = await response.json() as {
        orgs?: Array<{ name: string; avatarUrl?: string; type?: string }>;
      };

      const orgs: OrgInfo[] = (data.orgs ?? []).map((org) => ({
        name: org.name,
        avatarUrl: org.avatarUrl ?? `https://huggingface.co/avatars/${org.name}`,
        type: (org.type === 'org' ? 'org' : 'user') as OrgInfo['type'],
      }));

      _cachedOrgs = { token, orgs, timestamp: Date.now() };
      return orgs;
    } finally {
      _activeOrgsPromise = null;
    }
  })();

  return _activeOrgsPromise;
}
/**
 * Ambil metadata satu repo.
 * Endpoint: GET /api/{models|datasets|spaces}/{owner}/{name}
 */
export async function getRepoInfo(
  owner: string,
  name: string,
  type: RepoType,
  token?: string | null
): Promise<RepoInfo> {
  // Pilih segment path sesuai tipe
  const segment = type === 'model' ? 'models' : type === 'dataset' ? 'datasets' : 'spaces';
  const response = await hfFetch(`/api/${segment}/${owner}/${name}`, { token });
  const data = await response.json() as Record<string, unknown>;

  return {
    id: `${owner}/${name}`,
    name,
    owner,
    type,
    isPrivate: (data['private'] as boolean | undefined) ?? false,
    lastModified: new Date((data['lastModified'] ?? data['updatedAt'] ?? 0) as string | number),
    description: data['description'] as string | undefined,
    tags: (data['tags'] as string[] | undefined) ?? [],
    downloads: data['downloads'] as number | undefined,
    likes: data['likes'] as number | undefined,
  };
}
