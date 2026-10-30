// SPA Router berbasis History API

import { hasPendingChanges, discardAllChanges } from '../state/pending-changes';
import { showUnsavedChangesDialog } from '../ui/components/dialogs';

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

export type Route = {
  /** Nama rute: 'home' | 'callback' | 'explore' | 'owner' | 'repo' | 'browse' | 'not-found' */
  name: string;
  /** Parameter path dinamis, mis. { owner: 'user1', repo: 'my-model', type: 'model' } */
  params: Record<string, string>;
  /** Query string ter-parse, mis. { q: 'bert' } */
  query: Record<string, string>;
};

type NavigationHandler = (route: Route) => void;

// ---------------------------------------------------------------------------
// Definisi pola rute — urutan penting, lebih spesifik duluan
// ---------------------------------------------------------------------------

interface RouteDef {
  name: string;
  /** Regex untuk mencocokkan pathname */
  pattern: RegExp;
  /** Nama group capture sesuai urutan dalam regex */
  paramNames: string[];
}

const ROUTE_DEFS: RouteDef[] = [
  {
    name: 'callback',
    pattern: /^\/callback\/?$/,
    paramNames: [],
  },
  {
    name: 'auth',
    pattern: /^\/auth\/?$/,
    paramNames: [],
  },
  {
    name: 'explore',
    pattern: /^\/explore\/?$/,
    paramNames: [],
  },
  {
    name: 'history',
    // /:owner/:repo/:type/history/*path
    pattern: /^\/([^/]+)\/([^/]+)\/(model|dataset|space)\/history\/(.+)$/,
    paramNames: ['owner', 'repo', 'type', 'path'],
  },
  {
    name: 'history',
    // /:owner/:repo/:type/history
    pattern: /^\/([^/]+)\/([^/]+)\/(model|dataset|space)\/history\/?$/,
    paramNames: ['owner', 'repo', 'type'],
  },
  {
    name: 'history',
    // /:owner/:repo/history/*path
    pattern: /^\/([^/]+)\/([^/]+)\/history\/(.+)$/,
    paramNames: ['owner', 'repo', 'path'],
  },
  {
    name: 'history',
    // /:owner/:repo/history
    pattern: /^\/([^/]+)\/([^/]+)\/history\/?$/,
    paramNames: ['owner', 'repo'],
  },
  {
    name: 'browse',
    // /browse/:owner/:repo/:type/*path
    pattern: /^\/browse\/([^/]+)\/([^/]+)\/(model|dataset|space)\/(.+)$/,
    paramNames: ['owner', 'repo', 'type', 'path'],
  },
  {
    name: 'browse',
    // /:owner/:repo/:type/*path
    pattern: /^\/([^/]+)\/([^/]+)\/(model|dataset|space)\/(.+)$/,
    paramNames: ['owner', 'repo', 'type', 'path'],
  },
  {
    name: 'repo',
    // /:owner/:repo/:type — type opsional defaultnya 'model' (tangkap dulu, normalisasi di parseRoute)
    pattern: /^\/([^/]+)\/([^/]+)\/(model|dataset|space)\/?$/,
    paramNames: ['owner', 'repo', 'type'],
  },
  {
    name: 'repo',
    // /:owner/:repo tanpa type eksplisit
    pattern: /^\/([^/]+)\/([^/]+)\/?$/,
    paramNames: ['owner', 'repo'],
  },
  {
    name: 'owner',
    pattern: /^\/([^/]+)\/?$/,
    paramNames: ['owner'],
  },
  {
    name: 'home',
    pattern: /^\/$/,
    paramNames: [],
  },
];

// ---------------------------------------------------------------------------
// Parse helper
// ---------------------------------------------------------------------------

/** Parse pathname menjadi objek Route */
export function parseRoute(path: string): Route {
  // Pisahkan pathname dari query string
  const qIdx = path.indexOf('?');
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const search = qIdx === -1 ? '' : path.slice(qIdx + 1);

  // Alias: jika path adalah /repos atau /repos/, redirect ke /
  if (pathname === '/repos' || pathname === '/repos/') {
    const target = '/' + (search ? `?${search}` : '');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.replaceState(null, '', target);
    }
    return parseRoute(target);
  }
  // Parse query string
  const query: Record<string, string> = {};
  if (search) {
    new URLSearchParams(search).forEach((value, key) => {
      query[key] = value;
    });
  }

  // Cocokkan pola rute
  for (const def of ROUTE_DEFS) {
    const match = def.pattern.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    def.paramNames.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(match[i + 1] ?? '');
      } catch {
        params[name] = match[i + 1] ?? '';
      }
    });

    return { name: def.name, params, query };
  }

  return { name: 'not-found', params: {}, query };
}

// ---------------------------------------------------------------------------
// Router state internal
// ---------------------------------------------------------------------------

const _handlers: NavigationHandler[] = [];
let _currentLocation = typeof window !== 'undefined'
  ? window.location.pathname + window.location.search
  : '/';

/** Kirim route ke semua handler terdaftar */
function _emit(route: Route): void {
  for (const handler of _handlers) {
    handler(route);
  }
}

function performNavigate(path: string, replace: boolean): void {
  const qIdx = path.indexOf('?');
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const search = qIdx === -1 ? '' : path.slice(qIdx + 1);

  let targetPath = path;
  let shouldReplace = replace;
  if (pathname === '/repos' || pathname === '/repos/') {
    targetPath = '/' + (search ? `?${search}` : '');
    shouldReplace = true;
  }
  if (targetPath === _currentLocation && !shouldReplace) {
    return;
  }

  if (shouldReplace) {
    history.replaceState(null, '', targetPath);
  } else {
    history.pushState(null, '', targetPath);
  }
  _currentLocation = targetPath;
  _emit(parseRoute(targetPath));
}
// ---------------------------------------------------------------------------
// API publik
// ---------------------------------------------------------------------------

/**
 * Navigasi ke path baru.
 * Jika ada perubahan tertunda, intersep dengan dialog konfirmasi kustom.
 */
export function navigate(path: string, replace = false): void {
  if (path === _currentLocation) return;

  if (hasPendingChanges()) {
    showUnsavedChangesDialog(() => {
      discardAllChanges();
      performNavigate(path, replace);
    });
    return;
  }

  performNavigate(path, replace);
}

/** Kembali ke halaman sebelumnya dalam history browser */
export function back(): void {
  if (hasPendingChanges()) {
    showUnsavedChangesDialog(() => {
      discardAllChanges();
      history.back();
    });
    return;
  }
  history.back();
}

/**
 * Daftarkan handler navigasi.
 * Kembalikan fungsi untuk membatalkan langganan.
 */
export function onNavigate(handler: NavigationHandler): () => void {
  _handlers.push(handler);
  return () => {
    const idx = _handlers.indexOf(handler);
    if (idx !== -1) _handlers.splice(idx, 1);
  };
}

/**
 * Inisialisasi router: pasang listener popstate dan emit rute awal.
 * Intersepsi navigasi popstate jika terdapat perubahan tertunda.
 */
export function initRouter(): void {
  const currentPathname = window.location.pathname;
  if (currentPathname === '/repos' || currentPathname === '/repos/') {
    const target = '/' + window.location.search;
    window.history.replaceState(null, '', target);
  }

  _currentLocation = window.location.pathname + window.location.search;

  window.addEventListener('popstate', () => {
    const newLocation = window.location.pathname + window.location.search;

    if (hasPendingChanges()) {
      // Kembalikan URL di browser address bar ke posisi sebelumnya
      history.pushState(null, '', _currentLocation);
      showUnsavedChangesDialog(() => {
        discardAllChanges();
        _currentLocation = newLocation;
        history.replaceState(null, '', newLocation);
        _emit(parseRoute(newLocation));
      });
      return;
    }

    _currentLocation = newLocation;
    _emit(parseRoute(newLocation));
  });

  // Emit rute awal sesuai URL saat ini
  _emit(parseRoute(_currentLocation));
}
