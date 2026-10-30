// ──────────────────────────────────────────────────────────────
// App Shell — HuggingStudio
// Render struktur HTML utama: header, sidebar drawer, main area.
// Linear / GitHub style: clean, modern obsidian canvas, crisp borders.
// ──────────────────────────────────────────────────────────────

import type { AuthState } from '../auth/types';
import { logout } from '../auth';
import { navigate, onNavigate } from '../router';
import { t } from '../i18n';
import { initTheme, toggleTheme, getCurrentTheme } from './components/theme';
import { listUserOrgs } from '../api/repos';
import {
  iconSun,
  iconMoon,
  iconFolder,
  iconSearch,
  iconClose,
  iconChevronDown,
  iconExternalLink,
  iconHuggingFace,
  iconModel,
  iconDataset,
  iconSpace,
  iconLock,
  createSvg,
} from './components/icons';
import { repoStore } from '../state/repo-store';
import { appStore } from '../state/app-state';
import { initCommandPalette, togglePalette } from './components/command-palette';
// ── Referensi elemen DOM ─────────────────────────────────────

let _header: HTMLElement | null = null;
let _sidebar: HTMLElement | null = null;
let _main: HTMLElement | null = null;
let _backdrop: HTMLElement | null = null;
let _hamburger: HTMLButtonElement | null = null;
let _breadcrumbEl: HTMLElement | null = null;
let _loadingOrgs = false;
let _repoStoreUnsub: (() => void) | null = null;

// ── Sanitasi ──────────────────────────────────────────────────

/** Escape string untuk dimasukkan ke atribut / teks HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Header Breadcrumb ─────────────────────────────────────────

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Atur daftar breadcrumb pada header secara eksplisit.
 */
export function setHeaderBreadcrumbs(crumbs: BreadcrumbItem[]): void {
  if (!_breadcrumbEl) return;

  if (crumbs.length === 0) {
    _breadcrumbEl.innerHTML = '';
    _breadcrumbEl.style.display = 'none';
    return;
  }

  _breadcrumbEl.style.display = 'flex';
  _breadcrumbEl.innerHTML = crumbs
    .map((crumb, idx) => {
      const isLast = idx === crumbs.length - 1;
      const labelText = esc(crumb.label);
      const content =
        crumb.href && !isLast
          ? `<a href="${esc(crumb.href)}" class="header-crumb">${labelText}</a>`
          : `<span class="header-crumb active"${isLast ? ' aria-current="page"' : ''}>${labelText}</span>`;

      return `
        <span class="header-crumb-sep" aria-hidden="true">/</span>
        ${content}
      `;
    })
    .join('');
}

/**
 * Otomatis sinkronkan breadcrumbs berdasarkan URL pathname saat navigasi.
 */
export function updateBreadcrumbsFromPath(pathname: string): void {
  if (pathname === '/' || pathname === '') {
    setHeaderBreadcrumbs([]);
    return;
  }

  if (pathname === '/explore') {
    setHeaderBreadcrumbs([{ label: 'Explore' }]);
    return;
  }

  const clean = pathname.replace(/^\/+|\/+$/g, '');
  const segments = clean.split('/');

  if (segments[0] === 'browse' && segments.length >= 4) {
    // /browse/:owner/:repo/:type/*path
    const owner = segments[1];
    const repo = segments[2];
    const crumbs: BreadcrumbItem[] = [
      { label: owner, href: `/${owner}` },
      { label: repo, href: `/${owner}/${repo}` },
    ];
    if (segments.length > 4) {
      crumbs.push({ label: segments.slice(4).join('/') });
    }
    setHeaderBreadcrumbs(crumbs);
    return;
  }
  if (segments.length >= 4 && ['model', 'dataset', 'space'].includes(segments[2])) {
    const owner = segments[0];
    const repo = segments[1];
    const type = segments[2];
    const subPath = segments.slice(3).join('/');
    const crumbs: BreadcrumbItem[] = [
      { label: owner, href: `/${owner}` },
      { label: repo, href: `/${owner}/${repo}/${type}` },
      { label: decodeURIComponent(subPath) },
    ];
    setHeaderBreadcrumbs(crumbs);
    return;
  }


  // :owner/:repo/(model|dataset|space)/history/*path atau :owner/:repo/history/*path
  const historyIdx = segments.indexOf('history');
  if (historyIdx >= 2) {
    const owner = segments[0];
    const repo = segments[1];
    const subPath = segments.slice(historyIdx + 1).join('/');
    const crumbs: BreadcrumbItem[] = [
      { label: owner, href: `/${owner}` },
      { label: repo, href: `/${owner}/${repo}` },
    ];
    if (subPath) {
      crumbs.push({ label: 'Riwayat', href: `/${owner}/${repo}/history` });
      crumbs.push({ label: subPath });
    } else {
      crumbs.push({ label: 'Riwayat Commit' });
    }
    setHeaderBreadcrumbs(crumbs);
    return;
  }

  if (segments.length === 1) {
    setHeaderBreadcrumbs([{ label: segments[0] }]);
    return;
  }

  if (segments.length >= 2) {
    setHeaderBreadcrumbs([
      { label: segments[0], href: `/${segments[0]}` },
      { label: segments[1] },
    ]);
    return;
  }

  setHeaderBreadcrumbs([]);
}

// ── Command Palette Trigger ────────────────────────────────────

function createSearchIndicator(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'header-center';

  const isMac = /mac|iphone|ipad/i.test(navigator.userAgent);
  const btn = document.createElement('button');
  btn.className = 'header-search-indicator';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Buka palette perintah (Ctrl+K)');
  btn.innerHTML = `
    <span aria-hidden="true">${iconSearch(14)}</span>
    <span class="header-search-text">Cari atau jalankan perintah…</span>
    <kbd class="header-search-kbd">${isMac ? '⌘K' : 'Ctrl K'}</kbd>
  `;

  btn.addEventListener('click', () => {
    togglePalette();
  });

  wrapper.appendChild(btn);
  return wrapper;
}

// ── Theme Toggle ──────────────────────────────────────────────

function createThemeToggle(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm theme-toggle';
  btn.type = 'button';

  function updateIcon(): void {
    const theme = getCurrentTheme();
    const label = theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = theme === 'dark' ? iconSun(18) : iconMoon(18);
  }

  updateIcon();

  btn.addEventListener('click', () => {
    toggleTheme();
    updateIcon();
  });

  window.addEventListener('themechange', () => updateIcon());
  return btn;
}

// ── Header user menu ──────────────────────────────────────────

function createLoginButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-sm';
  btn.type = 'button';
  btn.textContent = t('auth.login');
  // Arahkan ke halaman login khusus (return_to halaman saat ini disimpan oleh startLogin di /auth)
  btn.addEventListener('click', () => navigate('/auth'));
  return btn;
}

function createUserMenu(auth: AuthState): HTMLElement {
  const user = auth.user!;
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown';

  const trigger = document.createElement('button');
  trigger.className = 'btn btn-ghost btn-sm header-user';
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', `${user.name || user.login} (@${user.login})`);

  const initials = (user.name || user.login).slice(0, 2).toUpperCase();
  const avatarHtml = user.avatarUrl
    ? `<img src="${esc(user.avatarUrl)}" alt="" class="avatar-img" loading="lazy" />`
    : `<span class="avatar-initials">${esc(initials)}</span>`;

  trigger.innerHTML = `
    <span class="avatar avatar-sm header-user-avatar" aria-hidden="true">${avatarHtml}</span>
    <span class="header-user-name">@${esc(user.login)}</span>
    ${iconChevronDown(14, 'header-user-chevron')}
  `;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.setAttribute('role', 'menu');

  // User details header
  const userMeta = document.createElement('div');
  userMeta.className = 'dropdown-user-meta';
  userMeta.style.padding = '8px 12px';
  userMeta.style.borderBottom = '1px solid var(--hs-border)';
  userMeta.style.marginBottom = '4px';
  userMeta.innerHTML = `
    <div style="font-weight:600;font-size:0.875rem;color:var(--hs-text);line-height:1.2;">${esc(user.name || user.login)}</div>
    <div style="font-size:0.75rem;color:var(--hs-text-muted);margin-top:2px;">@${esc(user.login)}</div>
  `;

  // Item 1: Profil di HF
  const profileItem = document.createElement('a');
  profileItem.className = 'dropdown-item';
  profileItem.href = `https://huggingface.co/${encodeURIComponent(user.login)}`;
  profileItem.target = '_blank';
  profileItem.rel = 'noopener noreferrer';
  profileItem.setAttribute('role', 'menuitem');
  profileItem.innerHTML = `
    ${iconExternalLink(16)}
    <span>Profil di Hugging Face</span>
  `;

  // Item 2: Ganti Tema
  const themeItem = document.createElement('button');
  themeItem.className = 'dropdown-item';
  themeItem.type = 'button';
  themeItem.setAttribute('role', 'menuitem');

  function updateThemeItem(): void {
    const isDark = getCurrentTheme() === 'dark';
    themeItem.innerHTML = `
      ${isDark ? iconSun(16) : iconMoon(16)}
      <span>${isDark ? t('nav.lightMode') : t('nav.darkMode')}</span>
    `;
  }
  updateThemeItem();
  window.addEventListener('themechange', updateThemeItem);

  themeItem.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTheme();
    updateThemeItem();
  });

  const divider = document.createElement('div');
  divider.className = 'dropdown-divider';
  divider.setAttribute('role', 'separator');

  // Item 3: Logout
  const logoutItem = document.createElement('button');
  logoutItem.className = 'dropdown-item dropdown-item-danger';
  logoutItem.type = 'button';
  logoutItem.setAttribute('role', 'menuitem');
  logoutItem.innerHTML = `
    ${iconClose(16)}
    <span>${t('auth.logout')}</span>
  `;
  logoutItem.addEventListener('click', () => {
    closeDropdown();
    logout();
  });

  menu.append(userMeta, profileItem, themeItem, divider, logoutItem);
  wrapper.append(trigger, menu);

  function openDropdown(): void {
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown(): void {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('open')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      closeDropdown();
      trigger.focus();
    }
  });

  return wrapper;
}

// ── Sidebar & Organizations ───────────────────────────────────

async function fetchOrgsIfNeeded(auth: AuthState): Promise<void> {
  if (!auth.token || !auth.user || auth.user.orgs !== undefined || _loadingOrgs) return;
  _loadingOrgs = true;
  try {
    const orgs = await listUserOrgs(auth.token);
    if (auth.user) {
      auth.user.orgs = orgs.map((o) => ({
        name: o.name,
        avatarUrl: o.avatarUrl,
        isEnterprise: typeof o === 'object' && o !== null && 'isEnterprise' in o
          ? Boolean((o as Record<string, unknown>).isEnterprise)
          : false,
      }));
      renderSidebar(auth);
    }
  } catch {
    // Bila gagal, tandai dengan array kosong agar tidak di-fetch ulang terus menerus
    if (auth.user) {
      auth.user.orgs = [];
    }
  } finally {
    _loadingOrgs = false;
  }
}

/** Render isi navigasi sidebar. */
function renderSidebar(auth: AuthState): void {
  if (!_sidebar) return;

  const currentPath = window.location.pathname;
  const currentSearch = window.location.search;
  const isLoggedIn = Boolean(auth.token);

  if (isLoggedIn && auth.user && auth.user.orgs === undefined) {
    void fetchOrgsIfNeeded(auth);
  }


  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.height = '100%';

  // Drawer Header (mobile only)
  const drawerHeader = document.createElement('div');
  drawerHeader.className = 'sidebar-header';
  drawerHeader.innerHTML = `
    <div class="sidebar-brand" style="display:flex;align-items:center;gap:8px;">
      <span aria-hidden="true">${iconHuggingFace(20)}</span>
      <span style="font-weight:600;font-size:0.875rem;color:var(--hs-text);">HuggingStudio</span>
      <span class="header-logo-badge">PRO</span>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-close-btn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t('common.close') || 'Tutup');
  closeBtn.innerHTML = iconClose(18);
  closeBtn.addEventListener('click', closeSidebar);
  drawerHeader.appendChild(closeBtn);
  container.appendChild(drawerHeader);

  // Main Nav
  const nav = document.createElement('nav');
  nav.className = 'sidebar-nav';
  nav.setAttribute('aria-label', 'Navigasi utama');

  // Top Menu Items
  const allReposLink = document.createElement('a');
  allReposLink.href = '/';
  allReposLink.className = `sidebar-link ${currentPath === '/' && !currentSearch.includes('type=') ? 'active' : ''}`;
  allReposLink.innerHTML = `
    ${iconFolder(18)}
    <span>${esc(t('repos.myRepos') || 'Semua Repositori')}</span>
  `;
  nav.appendChild(allReposLink);

  const exploreLink = document.createElement('a');
  exploreLink.href = '/explore';
  exploreLink.className = `sidebar-link ${currentPath === '/explore' ? 'active' : ''}`;
  exploreLink.innerHTML = `
    ${iconSearch(18)}
    <span>Explore</span>
  `;
  nav.appendChild(exploreLink);

  if (isLoggedIn) {
    const { models, datasets, spaces, isLoading } = repoStore.value;

    // ── DATASETS Section ─────────────────────────────────────
    const datasetsHeader = document.createElement('a');
    datasetsHeader.href = '/?type=dataset';
    datasetsHeader.className = `sidebar-section-header ${currentSearch.includes('type=dataset') ? 'active' : ''}`;
    datasetsHeader.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;">
        <span style="color:var(--hs-color-dataset);display:inline-flex;">${iconDataset(14)}</span>
        <span>Datasets</span>
      </span>
      <span class="sidebar-badge-count">${datasets.length}</span>
    `;
    nav.appendChild(datasetsHeader);

    const datasetsContainer = document.createElement('div');
    datasetsContainer.className = 'sidebar-repo-list';

    if (isLoading && datasets.length === 0) {
      datasetsContainer.innerHTML = '<div class="sidebar-empty-hint">Memuat dataset…</div>';
    } else if (datasets.length === 0) {
      datasetsContainer.innerHTML = '<div class="sidebar-empty-hint">Belum ada dataset</div>';
    } else {
      for (const d of datasets.slice(0, 12)) {
        const repoHref = `/${esc(d.owner)}/${esc(d.name)}/dataset`;
        const isItemActive = currentPath === repoHref;
        const item = document.createElement('a');
        item.href = repoHref;
        item.className = `sidebar-repo-item ${isItemActive ? 'active' : ''}`;
        item.title = d.id;
        item.innerHTML = `
          <span class="sidebar-repo-icon" style="color:var(--hs-color-dataset);">${iconDataset(13)}</span>
          <span class="sidebar-repo-name">${esc(d.name)}</span>
          ${d.isPrivate ? `<span class="sidebar-repo-lock">${iconLock(11)}</span>` : ''}
        `;
        datasetsContainer.appendChild(item);
      }
    }
    nav.appendChild(datasetsContainer);

    // ── MODELS Section ───────────────────────────────────────
    const modelsHeader = document.createElement('a');
    modelsHeader.href = '/?type=model';
    modelsHeader.className = `sidebar-section-header ${currentSearch.includes('type=model') ? 'active' : ''}`;
    modelsHeader.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;">
        <span style="color:var(--hs-color-model);display:inline-flex;">${iconModel(14)}</span>
        <span>Models</span>
      </span>
      <span class="sidebar-badge-count">${models.length}</span>
    `;
    nav.appendChild(modelsHeader);

    const modelsContainer = document.createElement('div');
    modelsContainer.className = 'sidebar-repo-list';

    if (isLoading && models.length === 0) {
      modelsContainer.innerHTML = '<div class="sidebar-empty-hint">Memuat model…</div>';
    } else if (models.length === 0) {
      modelsContainer.innerHTML = '<div class="sidebar-empty-hint">Belum ada model</div>';
    } else {
      for (const m of models.slice(0, 12)) {
        const repoHref = `/${esc(m.owner)}/${esc(m.name)}/model`;
        const isItemActive = currentPath === repoHref;
        const item = document.createElement('a');
        item.href = repoHref;
        item.className = `sidebar-repo-item ${isItemActive ? 'active' : ''}`;
        item.title = m.id;
        item.innerHTML = `
          <span class="sidebar-repo-icon" style="color:var(--hs-color-model);">${iconModel(13)}</span>
          <span class="sidebar-repo-name">${esc(m.name)}</span>
          ${m.isPrivate ? `<span class="sidebar-repo-lock">${iconLock(11)}</span>` : ''}
        `;
        modelsContainer.appendChild(item);
      }
    }
    nav.appendChild(modelsContainer);

    // ── SPACES Section (jika ada) ───────────────────────────
    if (spaces.length > 0) {
      const spacesHeader = document.createElement('a');
      spacesHeader.href = '/?type=space';
      spacesHeader.className = 'sidebar-section-header';
      spacesHeader.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;">
          <span style="color:var(--hs-color-space);display:inline-flex;">${iconSpace(14)}</span>
          <span>Spaces</span>
        </span>
        <span class="sidebar-badge-count">${spaces.length}</span>
      `;
      nav.appendChild(spacesHeader);

      const spacesContainer = document.createElement('div');
      spacesContainer.className = 'sidebar-repo-list';
      for (const s of spaces.slice(0, 6)) {
        const repoHref = `/${esc(s.owner)}/${esc(s.name)}/space`;
        const item = document.createElement('a');
        item.href = repoHref;
        item.className = `sidebar-repo-item ${currentPath === repoHref ? 'active' : ''}`;
        item.title = s.id;
        item.innerHTML = `
          <span class="sidebar-repo-icon" style="color:var(--hs-color-space);">${iconSpace(13)}</span>
          <span class="sidebar-repo-name">${esc(s.name)}</span>
        `;
        spacesContainer.appendChild(item);
      }
      nav.appendChild(spacesContainer);
    }

    // ── ORGANISASI Section ──────────────────────────────────
    const orgs = auth.user?.orgs;
    if (orgs && orgs.length > 0) {
      const orgsTitle = document.createElement('div');
      orgsTitle.className = 'sidebar-section-title';
      orgsTitle.textContent = 'Organisasi';
      nav.appendChild(orgsTitle);

      for (const org of orgs) {
        const orgPath = `/${org.name}`;
        const isOrgActive = currentPath === orgPath;
        const orgLink = document.createElement('a');
        orgLink.href = orgPath;
        orgLink.className = `sidebar-org-item ${isOrgActive ? 'active' : ''}`;
        const avatarHtml = org.avatarUrl
          ? `<img src="${esc(org.avatarUrl)}" alt="" class="sidebar-org-avatar" loading="lazy" />`
          : `<span class="sidebar-org-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--hs-surface-hover);font-size:10px;font-weight:600;color:var(--hs-text);">${esc(org.name.slice(0, 2).toUpperCase())}</span>`;

        orgLink.innerHTML = `
          ${avatarHtml}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(org.name)}</span>
          ${org.isEnterprise ? '<span class="badge badge-sm" style="font-size:10px;padding:1px 4px;">Enterprise</span>' : ''}
        `;
        nav.appendChild(orgLink);
      }
    }
  } else {
    // Guest login prompt
    const loginPrompt = document.createElement('div');
    loginPrompt.style.padding = '0.75rem 0.625rem';
    loginPrompt.innerHTML = `
      <p style="font-size:0.75rem;color:var(--hs-text-muted);margin-bottom:0.5rem;line-height:1.4;">
        Masuk untuk melihat dan mengelola dataset dan model Anda.
      </p>
      <button class="btn btn-primary btn-sm btn-block" id="sidebar-login-btn">
        ${iconHuggingFace(14)}
        <span>Masuk Akun</span>
      </button>
    `;
    loginPrompt.querySelector('#sidebar-login-btn')?.addEventListener('click', () => navigate('/auth'));
    nav.appendChild(loginPrompt);
  }

  container.appendChild(nav);
  _sidebar.innerHTML = '';
  _sidebar.appendChild(container);
}

function updateSidebarActiveLinks(): void {
  if (!_sidebar) return;
  const currentPath = window.location.pathname;

  const links = _sidebar.querySelectorAll<HTMLAnchorElement>('.sidebar-link, .sidebar-org-item');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const isActive =
      href === '/'
        ? currentPath === '/'
        : currentPath === href || currentPath.startsWith(href + '/');

    if (isActive) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });
}

// ── Sidebar buka/tutup (mobile drawer) ─────────────────────────

/** Buka sidebar sebagai drawer di mobile. */
export function openSidebar(): void {
  document.body.classList.add('sidebar-open');
  _backdrop?.setAttribute('aria-hidden', 'false');
  _hamburger?.setAttribute('aria-expanded', 'true');
  _sidebar?.focus();

  const firstLink = _sidebar?.querySelector<HTMLElement>('.sidebar-link, .sidebar-close-btn');
  firstLink?.focus();
}

/** Tutup sidebar drawer. */
export function closeSidebar(): void {
  document.body.classList.remove('sidebar-open');
  _backdrop?.setAttribute('aria-hidden', 'true');
  _hamburger?.setAttribute('aria-expanded', 'false');
}

// ── Header actions ────────────────────────────────────────────

/** Perbarui area header-actions sesuai state auth. */
export function updateShellAuth(auth: AuthState): void {
  const actionsEl = _header?.querySelector<HTMLElement>('.header-actions');
  if (!actionsEl) return;

  const existing = actionsEl.querySelector('.header-auth-area');
  const authArea = document.createElement('div');
  authArea.className = 'header-auth-area';

  if (auth.token && auth.user) {
    authArea.appendChild(createUserMenu(auth));
  } else {
    authArea.appendChild(createLoginButton());
  }

  if (existing) {
    actionsEl.replaceChild(authArea, existing);
  } else {
    actionsEl.appendChild(authArea);
  }

  // Update sidebar sesuai auth state baru
  renderSidebar(auth);
}

// ── SPA Link Interception ─────────────────────────────────────

function initSpaLinkInterception(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    // Hanya tangani klik primer (tombol kiri mouse)
    if (e.button !== 0) return;
    // Jangan intersep bila tombol modifier ditekan (buka tab baru / download)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Jangan intersep bila aksi default sudah dicegah
    if (e.defaultPrevented) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a');
    if (!anchor) return;

    // Lewati link yang secara eksplisit tidak diintersep
    if (anchor.hasAttribute('data-no-intercept')) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Lewati target eksternal, protokol non-web, atau anchor internal halaman (#)
    if (
      anchor.target === '_blank' ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      return;
    }

    // Periksa asal (origin) — lewati domain eksternal
    try {
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) {
        return;
      }

      e.preventDefault();
      const destination = url.pathname + url.search + url.hash;
      navigate(destination);
      closeSidebar();
    } catch {
      // Abaikan jika URL tidak valid
    }
  });
}

// ── renderShell ───────────────────────────────────────────────

/**
 * Render struktur HTML shell ke #app.
 * Dipanggil sekali saat aplikasi pertama dimuat.
 */
export function renderShell(): void {
  // Inisialisasi tema sebelum render
  initTheme();

  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('[HuggingStudio] Elemen #app tidak ditemukan di DOM.');

  // ── Buat elemen-elemen shell ──────────────────────────────────

  const shell = document.createElement('div');
  shell.id = 'hs-shell';

  // ── Header ────────────────────────────────────────────────────
  const header = document.createElement('header');
  header.id = 'hs-header';
  header.className = 'app-header';

  const headerInner = document.createElement('div');
  headerInner.className = 'header-inner';

  // Bagian Kiri: Hamburger + Logo Wordmark + Breadcrumb
  const headerLeft = document.createElement('div');
  headerLeft.className = 'header-left';

  // Hamburger (mobile)
  const hamburger = document.createElement('button');
  hamburger.className = 'header-menu-btn';
  hamburger.type = 'button';
  hamburger.setAttribute('aria-label', 'Buka menu');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-controls', 'hs-sidebar');
  hamburger.innerHTML = createSvg(
    '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    18,
    'hs-icon-menu',
  );
  hamburger.addEventListener('click', () => {
    const isOpen = document.body.classList.contains('sidebar-open');
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // Logo Wordmark dengan badge kuning-oranye
  const logo = document.createElement('a');
  logo.href = '/';
  logo.className = 'header-logo';
  logo.setAttribute('aria-label', 'HuggingStudio — Halaman Utama');
  logo.innerHTML = `
    <span aria-hidden="true" style="display:flex;align-items:center;">${iconHuggingFace(20)}</span>
    <span>Hugging<span style="color:var(--hs-amber-500, #f59e0b);">Studio</span></span>
    <span class="header-logo-badge">PRO</span>
  `;

  // Breadcrumb ringkas
  const breadcrumb = document.createElement('nav');
  breadcrumb.id = 'hs-header-breadcrumb';
  breadcrumb.className = 'header-breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');
  breadcrumb.style.display = 'none';

  headerLeft.append(hamburger, logo, breadcrumb);

  // Bagian Tengah: Search Indicator / Spacer
  const headerCenter = createSearchIndicator();

  // Bagian Kanan: Theme Toggle + Auth Area
  const actions = document.createElement('div');
  actions.className = 'header-actions';

  const themeToggle = createThemeToggle();
  actions.appendChild(themeToggle);

  const authArea = document.createElement('div');
  authArea.className = 'header-auth-area';
  actions.appendChild(authArea);

  headerInner.append(headerLeft, headerCenter, actions);
  header.appendChild(headerInner);

  // ── Body: sidebar + backdrop + main ──────────────────────────
  const body = document.createElement('div');
  body.className = 'app-body';

  // Sidebar
  const sidebar = document.createElement('aside');
  sidebar.id = 'hs-sidebar';
  sidebar.className = 'app-sidebar';
  sidebar.setAttribute('aria-label', 'Navigasi');
  sidebar.setAttribute('tabindex', '-1');

  // Backdrop (overlay mobile)
  const backdrop = document.createElement('div');
  backdrop.id = 'hs-backdrop';
  backdrop.className = 'sidebar-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('role', 'presentation');
  backdrop.addEventListener('click', () => {
    closeSidebar();
  });

  // Main content area
  const main = document.createElement('main');
  main.id = 'hs-main';
  main.className = 'app-main';
  main.setAttribute('role', 'main');
  main.setAttribute('tabindex', '-1');

  body.append(sidebar, backdrop, main);
  shell.append(header, body);
  appEl.appendChild(shell);

  // Simpan referensi DOM
  _header = header;
  _sidebar = sidebar;
  _main = main;
  _backdrop = backdrop;
  _hamburger = hamburger;
  _breadcrumbEl = breadcrumb;

  // Intersepsi navigasi SPA
  initSpaLinkInterception();

  // Daftarkan listener router agar breadcrumbs & active link selalu sinkron
  onNavigate(() => {
    updateSidebarActiveLinks();
    updateBreadcrumbsFromPath(window.location.pathname);
  });
  // Re-render sidebar saat repoStore berubah (idempoten, batalkan langganan lama jika ada)
  if (_repoStoreUnsub) {
    _repoStoreUnsub();
  }
  _repoStoreUnsub = repoStore.subscribe(() => {
    renderSidebar(appStore.value.auth);
  });
  // Sinkronkan breadcrumb awal
  updateBreadcrumbsFromPath(window.location.pathname);

  // Palette perintah: Ctrl/⌘+K, Esc, dan klik indikator header
  // dikelola oleh modul command-palette
  initCommandPalette();

  // Keyboard: tutup sidebar dengan Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      closeSidebar();
      hamburger.focus();
    }
  });
}

/** Kembalikan elemen <main> agar halaman bisa dirender ke dalamnya. */
export function getMainEl(): HTMLElement | null {
  return _main;
}
