/**
 * Repo List Page — HuggingStudio
 * Renders the repository list for a user or organization with modern developer tooling UI:
 * - Clean header with title ("Repositori Saya" or "Repositori: @owner"), badge count, and org switcher
 * - Segmented control filter tabs (Semua, Model, Dataset, Space)
 * - Modern search box with clear button
 * - View mode toggle (Grid vs Table)
 * - Polished cards and responsive data table
 * - Clean SVG-based empty and loading states
 */

import { listUserOrgs } from '../../api';
import { appStore, isAuthenticated } from '../../state/app-state';
import { navigate } from '../../router';
import { t } from '../../i18n';
import { showToast } from '../components/toast';
import { createAvatar } from '../components/avatar';
import {
  iconModel,
  iconDataset,
  iconSpace,
  iconLock,
  iconSearch,
  iconClose,
  iconGrid,
  iconList,
  iconDownload,
  iconHeart,
  iconHistory,
  iconChevronDown,
  iconCheck,
  iconExternalLink,
  iconAlertCircle,
} from '../components/icons';
import { repoStore, loadUserRepos } from '../../state/repo-store';
import type { RepoInfo, RepoType, OrgInfo } from '../../api/types';
import type { UserInfo } from '../../auth/types';

// ─── Constants & Types ───────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const VIEW_MODE_KEY = 'hs-repo-view-mode';

interface PageState {
  allRepos: RepoInfo[];
  filteredRepos: RepoInfo[];
  displayedCount: number;
  activeFilter: 'all' | RepoType;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  selectedOwner: string;
  orgs: OrgInfo[];
  isLoading: boolean;
  error: string | null;
}

interface SwitcherOption {
  id: string;
  name: string;
  login: string;
  avatarUrl?: string;
  type: 'user' | 'org';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toLocaleString();
}

function relativeTime(dateInput: Date | string | number | undefined): string {
  if (!dateInput) return 'Baru saja';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return 'Baru saja';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  const locale = appStore.value.locale === 'id' ? 'id-ID' : 'en-US';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSec < 60) return rtf.format(-Math.max(1, diffSec), 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHour < 24) return rtf.format(-diffHour, 'hour');
  if (diffDay < 30) return rtf.format(-diffDay, 'day');
  if (diffMonth < 12) return rtf.format(-diffMonth, 'month');
  return rtf.format(-diffYear, 'year');
}

function typeBadge(type: RepoType): string {
  if (type === 'dataset') {
    return `<span class="badge badge-dataset">${iconDataset(12)}<span>Dataset</span></span>`;
  }
  if (type === 'space') {
    return `<span class="badge badge-space">${iconSpace(12)}<span>Space</span></span>`;
  }
  return `<span class="badge badge-model">${iconModel(12)}<span>Model</span></span>`;
}

function visibilityBadge(isPrivate: boolean): string {
  if (isPrivate) {
    return `<span class="badge badge-private">${iconLock(12)}<span>${esc(t('repos.private') || 'Privat')}</span></span>`;
  }
  return `<span class="badge badge-public"><span>${esc(t('repos.public') || 'Publik')}</span></span>`;
}

function getSavedViewMode(): 'grid' | 'list' {
  try {
    const saved = sessionStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

// ─── Renderers ───────────────────────────────────────────────────────────────

function repoCardGridHTML(repo: RepoInfo): string {
  const dateStr = relativeTime(repo.lastModified);
  const href = `/${esc(repo.owner)}/${esc(repo.name)}/${esc(repo.type)}`;
  const hasDesc = Boolean(repo.description && repo.description.trim().length > 0);
  const descText = hasDesc ? esc(repo.description!.trim()) : 'Tidak ada deskripsi';
  const descClass = hasDesc ? '' : ' empty';

  const statsHtml: string[] = [];
  if (repo.downloads != null) {
    statsHtml.push(`
      <span class="repo-stat-item" title="${repo.downloads.toLocaleString()} unduhan">
        ${iconDownload(13)}
        <span>${formatNumber(repo.downloads)}</span>
      </span>
    `);
  }
  if (repo.likes != null) {
    statsHtml.push(`
      <span class="repo-stat-item" title="${repo.likes.toLocaleString()} suka">
        ${iconHeart(13)}
        <span>${formatNumber(repo.likes)}</span>
      </span>
    `);
  }

  return `
    <a class="repo-card" data-type="${esc(repo.type)}" href="${href}" role="article">
      <div class="repo-card-top">
        <div class="repo-card-badges">
          ${typeBadge(repo.type)}
          ${repo.isPrivate ? visibilityBadge(true) : ''}
        </div>
        <div class="repo-card-title-group">
          <div class="repo-card-full-name">
            <span class="repo-card-owner">${esc(repo.owner)}</span>
            <span class="repo-card-slash">/</span>
            <span class="repo-card-name">${esc(repo.name)}</span>
          </div>
        </div>
        <p class="repo-card-desc${descClass}">${descText}</p>
      </div>
      <div class="repo-card-footer">
        <div class="repo-card-updated" title="Terakhir diperbarui: ${esc(new Date(repo.lastModified).toLocaleString())}">
          ${iconHistory(13)}
          <span>${esc(dateStr)}</span>
        </div>
        <div class="repo-card-stats">
          ${statsHtml.join('')}
        </div>
      </div>
    </a>
  `;
}

function repoTableListHTML(repos: RepoInfo[]): string {
  const rows = repos.map(repo => {
    const dateStr = relativeTime(repo.lastModified);
    const href = `/${esc(repo.owner)}/${esc(repo.name)}/${esc(repo.type)}`;

    let typeIconBox = '';
    if (repo.type === 'model') {
      typeIconBox = `<span class="repo-table-type-icon type-model">${iconModel(14)}</span>`;
    } else if (repo.type === 'dataset') {
      typeIconBox = `<span class="repo-table-type-icon type-dataset">${iconDataset(14)}</span>`;
    } else {
      typeIconBox = `<span class="repo-table-type-icon type-space">${iconSpace(14)}</span>`;
    }

    const likesCount = repo.likes ?? 0;
    const downloadsCount = repo.downloads ?? 0;

    return `
      <tr class="repo-table-row" data-href="${href}" tabindex="0">
        <td class="td-name">
          <div class="repo-table-name-cell">
            ${typeIconBox}
            <div class="repo-table-name-wrap">
              <a class="repo-table-link" href="${href}">
                <span class="repo-table-owner">${esc(repo.owner)}/</span><span class="repo-table-name">${esc(repo.name)}</span>
              </a>
              ${repo.description ? `<div class="repo-table-desc">${esc(repo.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="td-type">
          ${typeBadge(repo.type)}
        </td>
        <td class="td-visibility">
          ${visibilityBadge(repo.isPrivate)}
        </td>
        <td class="td-likes">
          <span class="repo-meta-stat" title="${likesCount.toLocaleString()} suka">
            ${iconHeart(13)}
            <span>${formatNumber(likesCount)}</span>
          </span>
        </td>
        <td class="td-downloads">
          <span class="repo-meta-stat" title="${downloadsCount.toLocaleString()} unduhan">
            ${iconDownload(13)}
            <span>${formatNumber(downloadsCount)}</span>
          </span>
        </td>
        <td class="td-updated">
          <span class="repo-meta-updated" title="Terakhir diperbarui: ${esc(new Date(repo.lastModified).toLocaleString())}">
            ${esc(dateStr)}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="repo-table-container">
      <table class="repo-table">
        <thead>
          <tr>
            <th class="th-name">Nama</th>
            <th class="th-type">Tipe</th>
            <th class="th-visibility">Visibilitas</th>
            <th class="th-likes">Likes</th>
            <th class="th-downloads">Downloads</th>
            <th class="th-updated">Diubah</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderSkeletons(container: HTMLElement, viewMode: 'grid' | 'list'): void {
  container.innerHTML = '';
  if (viewMode === 'grid') {
    const grid = document.createElement('div');
    grid.className = 'repo-skeleton-grid';
    for (let i = 0; i < 6; i++) {
      grid.insertAdjacentHTML(
        'beforeend',
        `
        <div class="repo-skeleton-card">
          <div class="repo-skeleton-top">
            <div class="skeleton-pulse skeleton-badge"></div>
          </div>
          <div class="skeleton-pulse skeleton-title"></div>
          <div class="skeleton-pulse skeleton-desc-1"></div>
          <div class="skeleton-pulse skeleton-desc-2"></div>
          <div class="repo-skeleton-footer">
            <div class="skeleton-pulse skeleton-meta"></div>
            <div class="skeleton-pulse skeleton-stats"></div>
          </div>
        </div>
      `
      );
    }
    container.appendChild(grid);
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'repo-table-container';
    let rowsHtml = '';
    for (let i = 0; i < 6; i++) {
      rowsHtml += `
        <tr class="repo-skeleton-row">
          <td><div class="skeleton-pulse skeleton-table-name"></div></td>
          <td><div class="skeleton-pulse skeleton-table-badge"></div></td>
          <td><div class="skeleton-pulse skeleton-table-badge"></div></td>
          <td><div class="skeleton-pulse skeleton-table-sm"></div></td>
          <td><div class="skeleton-pulse skeleton-table-sm"></div></td>
          <td><div class="skeleton-pulse skeleton-table-date"></div></td>
        </tr>
      `;
    }
    wrap.innerHTML = `
      <table class="repo-table">
        <thead>
          <tr>
            <th class="th-name">Nama</th>
            <th class="th-type">Tipe</th>
            <th class="th-visibility">Visibilitas</th>
            <th class="th-likes">Likes</th>
            <th class="th-downloads">Downloads</th>
            <th class="th-updated">Diubah</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    container.appendChild(wrap);
  }
}

function renderEmptyState(
  container: HTMLElement,
  options: {
    iconSvg: string;
    title: string;
    desc: string;
    actionLabel?: string;
    actionType?: 'primary' | 'secondary';
    onAction?: () => void;
    actionHref?: string;
  }
): void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'repo-empty-container';

  const iconEl = document.createElement('div');
  iconEl.className = 'repo-empty-icon';
  iconEl.innerHTML = options.iconSvg;

  const titleEl = document.createElement('h3');
  titleEl.className = 'repo-empty-title';
  titleEl.textContent = options.title;

  const descEl = document.createElement('p');
  descEl.className = 'repo-empty-desc';
  descEl.textContent = options.desc;

  root.append(iconEl, titleEl, descEl);

  if (options.actionLabel) {
    const actions = document.createElement('div');
    actions.className = 'repo-empty-actions';

    if (options.actionHref) {
      const link = document.createElement('a');
      link.className = `btn btn-${options.actionType ?? 'primary'}`;
      link.href = options.actionHref;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = `<span>${esc(options.actionLabel)}</span> ${iconExternalLink(14)}`;
      actions.appendChild(link);
    } else if (options.onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-${options.actionType ?? 'primary'}`;
      btn.textContent = options.actionLabel;
      btn.addEventListener('click', options.onAction);
      actions.appendChild(btn);
    }

    root.appendChild(actions);
  }

  container.appendChild(root);
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function renderRepoListPage(container: HTMLElement, initialOwner?: string): void {
  const authUser: UserInfo | null = appStore.value.auth.user;
  const resolvedOwner = initialOwner || authUser?.login || authUser?.name || appStore.value.currentOwner || '';

  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  const initialFilter: 'all' | RepoType =
    typeParam === 'model' || typeParam === 'dataset' || typeParam === 'space'
      ? typeParam
      : 'all';

  const state: PageState = {
    allRepos: repoStore.value.allRepos,
    filteredRepos: [],
    displayedCount: PAGE_SIZE,
    activeFilter: initialFilter,
    searchQuery: '',
    viewMode: getSavedViewMode(),
    selectedOwner: resolvedOwner,
    orgs: [],
    isLoading: repoStore.value.isLoading,
    error: repoStore.value.error,
  };
  // Sync currentOwner in store
  if (state.selectedOwner) {
    appStore.value.currentOwner = state.selectedOwner;
  }

  function isSelfAccount(): boolean {
    if (!authUser || !state.selectedOwner) return false;
    const target = state.selectedOwner.trim().toLowerCase();
    const login = (authUser.login || '').trim().toLowerCase();
    const name = (authUser.name || '').trim().toLowerCase();
    return (login.length > 0 && target === login) || (name.length > 0 && target === name);
  }

  // ── Root container ──────────────────────────────────────────────────────────
  container.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'repo-page';
  container.appendChild(page);

  // ── Header Section ─────────────────────────────────────────────────────────
  const headerSection = document.createElement('header');
  headerSection.className = 'repo-header';
  page.appendChild(headerSection);

  const headerMain = document.createElement('div');
  headerMain.className = 'repo-header-main';
  headerSection.appendChild(headerMain);

  const headerTitleRow = document.createElement('div');
  headerTitleRow.className = 'repo-header-title-row';
  headerMain.appendChild(headerTitleRow);

  const headerTitle = document.createElement('h1');
  headerTitle.className = 'repo-header-title';
  headerTitleRow.appendChild(headerTitle);

  const headerBadge = document.createElement('span');
  headerBadge.className = 'repo-header-badge';
  headerTitleRow.appendChild(headerBadge);

  const headerSubtitle = document.createElement('p');
  headerSubtitle.className = 'repo-header-subtitle';
  headerMain.appendChild(headerSubtitle);

  const headerActions = document.createElement('div');
  headerActions.className = 'repo-header-actions';
  headerSection.appendChild(headerActions);

  function updateHeading(): void {
    const isSelf = isSelfAccount();
    if (isSelf) {
      headerTitle.textContent = 'Repositori Saya';
      headerSubtitle.textContent = 'Kelola model, dataset, dan space dari akun Hugging Face Anda.';
    } else if (state.selectedOwner) {
      headerTitle.innerHTML = `Repositori: <span class="repo-header-owner">@${esc(state.selectedOwner)}</span>`;
      headerSubtitle.textContent = `Menjelajahi repositori publik milik ${esc(state.selectedOwner)}.`;
    } else {
      headerTitle.textContent = 'Repositori';
      headerSubtitle.textContent = 'Jelajahi repositori di Hugging Face.';
    }

    if (state.isLoading) {
      headerBadge.className = 'repo-header-badge loading';
      headerBadge.textContent = 'Memuat…';
    } else {
      headerBadge.className = 'repo-header-badge';
      const count = state.allRepos.length;
      headerBadge.textContent = `${count.toLocaleString()} ${count === 1 ? 'repositori' : 'repositori'}`;
    }
  }

  // ── Organization Switcher ───────────────────────────────────────────────────
  function renderAccountSwitcher(): void {
    headerActions.innerHTML = '';
    if (!isAuthenticated() || !authUser) {
      return;
    }

    const options: SwitcherOption[] = [
      {
        id: authUser.login || authUser.name,
        name: authUser.name || authUser.login,
        login: authUser.login,
        avatarUrl: authUser.avatarUrl,
        type: 'user',
      },
    ];

    for (const org of state.orgs) {
      options.push({
        id: org.name,
        name: org.name,
        login: org.name,
        avatarUrl: org.avatarUrl,
        type: 'org',
      });
    }

    const current = options.find(
      o => o.id.toLowerCase() === state.selectedOwner.toLowerCase()
    ) ?? options[0];

    const wrapper = document.createElement('div');
    wrapper.className = 'repo-switcher-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'repo-switcher-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');

    const avatarEl = createAvatar(
      {
        name: current.name,
        login: current.login,
        avatarUrl: current.avatarUrl,
      },
      'sm'
    );

    const labelEl = document.createElement('span');
    labelEl.className = 'repo-switcher-label';
    labelEl.textContent = current.name;

    const arrowEl = document.createElement('span');
    arrowEl.className = 'repo-switcher-arrow';
    arrowEl.innerHTML = iconChevronDown(14);

    trigger.append(avatarEl, labelEl, arrowEl);

    const menu = document.createElement('div');
    menu.className = 'repo-switcher-menu';

    const menuHeader = document.createElement('div');
    menuHeader.className = 'repo-switcher-header';
    menuHeader.textContent = 'Ganti Akun / Organisasi';
    menu.appendChild(menuHeader);

    for (const opt of options) {
      const isSelected = opt.id.toLowerCase() === state.selectedOwner.toLowerCase();
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `repo-switcher-item${isSelected ? ' active' : ''}`;

      const optAvatar = createAvatar(
        {
          name: opt.name,
          login: opt.login,
          avatarUrl: opt.avatarUrl,
        },
        'sm'
      );

      const info = document.createElement('div');
      info.className = 'repo-switcher-item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'repo-switcher-item-name';
      nameSpan.textContent = opt.name;

      const typeSpan = document.createElement('span');
      typeSpan.className = 'repo-switcher-item-type';
      typeSpan.textContent = opt.type === 'user' ? 'Akun Personal' : 'Organisasi';

      info.append(nameSpan, typeSpan);
      item.append(optAvatar, info);

      if (isSelected) {
        const checkEl = document.createElement('span');
        checkEl.className = 'repo-switcher-check';
        checkEl.innerHTML = iconCheck(14);
        item.appendChild(checkEl);
      }

      item.addEventListener('click', e => {
        e.stopPropagation();
        menu.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');

        if (state.selectedOwner.toLowerCase() !== opt.id.toLowerCase()) {
          state.selectedOwner = opt.id;
          appStore.value.currentOwner = opt.id;
          state.displayedCount = PAGE_SIZE;
          state.searchQuery = '';
          state.activeFilter = 'all';

          const isUserSelf = Boolean(
            authUser && opt.id.toLowerCase() === (authUser.login || authUser.name).toLowerCase()
          );
          const newPath = isUserSelf ? '/' : `/${opt.id}`;
          window.history.pushState(null, '', newPath);

          updateHeading();
          renderAccountSwitcher();
          renderFilterBar();
          loadRepos();
        }
      });

      menu.appendChild(item);
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains('open');
      menu.classList.toggle('open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });

    const onDocClick = (e: MouseEvent): void => {
      if (!wrapper.contains(e.target as Node)) {
        menu.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('click', onDocClick);

    wrapper.append(trigger, menu);
    headerActions.appendChild(wrapper);
  }

  // ── Filter Bar Section ─────────────────────────────────────────────────────
  const filterBarSection = document.createElement('div');
  filterBarSection.className = 'repo-filter-bar';
  page.appendChild(filterBarSection);

  const segmentedControl = document.createElement('div');
  segmentedControl.className = 'repo-segmented-control';
  segmentedControl.setAttribute('role', 'tablist');
  segmentedControl.setAttribute('aria-label', 'Filter tipe repositori');
  filterBarSection.appendChild(segmentedControl);

  const toolbarRight = document.createElement('div');
  toolbarRight.className = 'repo-toolbar-right';
  filterBarSection.appendChild(toolbarRight);

  // Search box
  const searchBox = document.createElement('div');
  searchBox.className = 'repo-search-box';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'repo-search-icon';
  searchIcon.innerHTML = iconSearch(16);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'repo-search-input';
  searchInput.placeholder = t('repos.searchRepos') || 'Cari repositori…';
  searchInput.value = state.searchQuery;

  const clearSearchBtn = document.createElement('button');
  clearSearchBtn.type = 'button';
  clearSearchBtn.className = 'repo-search-clear';
  clearSearchBtn.setAttribute('aria-label', 'Hapus pencarian');
  clearSearchBtn.innerHTML = iconClose(14);
  clearSearchBtn.style.display = state.searchQuery ? 'inline-flex' : 'none';

  let debounceTimer: number;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      state.searchQuery = searchInput.value.trim().toLowerCase();
      clearSearchBtn.style.display = state.searchQuery ? 'inline-flex' : 'none';
      state.displayedCount = PAGE_SIZE;
      applyFilters();
      renderFilterBar();
      renderContent();
    }, 200);
  });

  clearSearchBtn.addEventListener('click', () => {
    state.searchQuery = '';
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    state.displayedCount = PAGE_SIZE;
    applyFilters();
    renderFilterBar();
    renderContent();
    searchInput.focus();
  });

  searchBox.append(searchIcon, searchInput, clearSearchBtn);
  toolbarRight.appendChild(searchBox);

  // View toggle
  const viewToggle = document.createElement('div');
  viewToggle.className = 'view-toggle';
  viewToggle.setAttribute('role', 'group');
  viewToggle.setAttribute('aria-label', 'Pengalih tampilan');

  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = `view-toggle-btn${state.viewMode === 'grid' ? ' active' : ''}`;
  gridBtn.title = 'Tampilan Kotak (Grid)';
  gridBtn.setAttribute('aria-pressed', String(state.viewMode === 'grid'));
  gridBtn.innerHTML = iconGrid(16);

  const listBtn = document.createElement('button');
  listBtn.type = 'button';
  listBtn.className = `view-toggle-btn${state.viewMode === 'list' ? ' active' : ''}`;
  listBtn.title = 'Tampilan Tabel (List)';
  listBtn.setAttribute('aria-pressed', String(state.viewMode === 'list'));
  listBtn.innerHTML = iconList(16);

  function setViewMode(mode: 'grid' | 'list'): void {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    try {
      sessionStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // storage quota or private browsing
    }
    gridBtn.classList.toggle('active', mode === 'grid');
    listBtn.classList.toggle('active', mode === 'list');
    gridBtn.setAttribute('aria-pressed', String(mode === 'grid'));
    listBtn.setAttribute('aria-pressed', String(mode === 'list'));
    renderContent();
  }

  gridBtn.addEventListener('click', () => {
    setViewMode('grid');
  });
  listBtn.addEventListener('click', () => {
    setViewMode('list');
  });

  viewToggle.append(gridBtn, listBtn);
  toolbarRight.appendChild(viewToggle);

  function renderFilterBar(): void {
    const totalCount = state.allRepos.length;
    const modelCount = state.allRepos.filter(r => r.type === 'model').length;
    const datasetCount = state.allRepos.filter(r => r.type === 'dataset').length;
    const spaceCount = state.allRepos.filter(r => r.type === 'space').length;

    segmentedControl.innerHTML = '';

    const tabs: Array<{ key: 'all' | RepoType; label: string; count: number; icon: string }> = [
      { key: 'all', label: 'Semua', count: totalCount, icon: '' },
      { key: 'model', label: 'Model', count: modelCount, icon: iconModel(14) },
      { key: 'dataset', label: 'Dataset', count: datasetCount, icon: iconDataset(14) },
      { key: 'space', label: 'Space', count: spaceCount, icon: iconSpace(14) },
    ];

    for (const tab of tabs) {
      const isActive = state.activeFilter === tab.key;
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = `repo-tab-pill${isActive ? ' active' : ''}`;
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-selected', String(isActive));
      tabBtn.innerHTML = `
        ${tab.icon}
        <span>${tab.label}</span>
        <span class="repo-tab-count">${tab.count}</span>
      `;

      tabBtn.addEventListener('click', () => {
        if (state.activeFilter !== tab.key) {
          state.activeFilter = tab.key;
          state.displayedCount = PAGE_SIZE;
          applyFilters();
          renderFilterBar();
          renderContent();
        }
      });

      segmentedControl.appendChild(tabBtn);
    }
  }

  // ── Main Content Container ─────────────────────────────────────────────────
  const contentSection = document.createElement('main');
  contentSection.className = 'repo-content-area';
  page.appendChild(contentSection);

  // ── Load More Section ───────────────────────────────────────────────────────
  const loadMoreSection = document.createElement('div');
  loadMoreSection.className = 'repo-load-more';
  page.appendChild(loadMoreSection);

  // ── Filter Application ─────────────────────────────────────────────────────
  function applyFilters(): void {
    let list = state.allRepos;

    if (state.activeFilter !== 'all') {
      list = list.filter(r => r.type === state.activeFilter);
    }

    if (state.searchQuery) {
      const q = state.searchQuery;
      list = list.filter(
        r => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
      );
    }

    state.filteredRepos = list;
  }

  // ── Content Rendering ──────────────────────────────────────────────────────
  function renderContent(): void {
    contentSection.innerHTML = '';
    loadMoreSection.innerHTML = '';

    if (state.isLoading && state.allRepos.length === 0) {
      renderSkeletons(contentSection, state.viewMode);
      return;
    }

    if (state.error && state.allRepos.length === 0) {
      renderEmptyState(contentSection, {
        iconSvg: iconAlertCircle(32),
        title: t('repos.errorLoad') || 'Gagal Memuat Repositori',
        desc: state.error,
        actionLabel: t('repos.errorRetry') || 'Coba Lagi',
        actionType: 'secondary',
        onAction: () => {
          loadRepos();
        },
      });
      return;
    }

    // No repos matching filter / search
    if (state.filteredRepos.length === 0 && !state.isLoading) {
      const hasFilterOrSearch = state.searchQuery.length > 0 || state.activeFilter !== 'all';

      if (hasFilterOrSearch) {
        renderEmptyState(contentSection, {
          iconSvg: iconSearch(32),
          title: 'Tidak ada repositori ditemukan',
          desc: state.searchQuery
            ? `Tidak ada repositori yang cocok dengan pencarian "${state.searchQuery}".`
            : `Tidak ada repositori dengan tipe "${state.activeFilter}".`,
          actionLabel: 'Reset Filter',
          actionType: 'secondary',
          onAction: () => {
            state.searchQuery = '';
            state.activeFilter = 'all';
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            state.displayedCount = PAGE_SIZE;
            applyFilters();
            renderFilterBar();
            renderContent();
          },
        });
      } else {
        renderEmptyState(contentSection, {
          iconSvg: iconModel(32),
          title: 'Belum ada repositori',
          desc: `Akun @${esc(state.selectedOwner)} belum memiliki repositori model, dataset, atau space di Hugging Face.`,
          actionLabel: 'Buat repo di Hugging Face',
          actionType: 'primary',
          actionHref: 'https://huggingface.co/new',
        });
      }
      return;
    }

    const visibleItems = state.filteredRepos.slice(0, state.displayedCount);

    if (state.activeFilter === 'all') {
      const datasets = visibleItems.filter((r) => r.type === 'dataset');
      const models = visibleItems.filter((r) => r.type === 'model');
      const spaces = visibleItems.filter((r) => r.type === 'space');

      if (datasets.length > 0 && models.length > 0) {
        // ── Section Datasets ──────────────────────────────────────────────
        const dsSection = document.createElement('div');
        dsSection.className = 'repo-type-group';
        dsSection.style.marginBottom = '2rem';
        dsSection.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
            <h2 style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:6px;color:var(--hs-text);">
              <span style="color:var(--hs-color-dataset);display:inline-flex;">${iconDataset(18)}</span>
              <span>Datasets</span>
              <span class="badge badge-dataset" style="font-size:0.75rem;">${datasets.length}</span>
            </h2>
            <button class="btn btn-ghost btn-sm" id="btn-view-all-datasets" style="font-size:0.75rem;">Lihat semua datasets &rarr;</button>
          </div>
        `;
        dsSection.querySelector('#btn-view-all-datasets')?.addEventListener('click', () => {
          state.activeFilter = 'dataset';
          applyFilters();
          renderFilterBar();
          renderContent();
        });

        if (state.viewMode === 'grid') {
          const dsGrid = document.createElement('div');
          dsGrid.className = 'repo-grid';
          dsGrid.innerHTML = datasets.map(repoCardGridHTML).join('');
          dsSection.appendChild(dsGrid);
        } else {
          dsSection.insertAdjacentHTML('beforeend', repoTableListHTML(datasets));
        }
        contentSection.appendChild(dsSection);

        // ── Section Models ────────────────────────────────────────────────
        const mdSection = document.createElement('div');
        mdSection.className = 'repo-type-group';
        mdSection.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
            <h2 style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:6px;color:var(--hs-text);">
              <span style="color:var(--hs-color-model);display:inline-flex;">${iconModel(18)}</span>
              <span>Models</span>
              <span class="badge badge-model" style="font-size:0.75rem;">${models.length}</span>
            </h2>
            <button class="btn btn-ghost btn-sm" id="btn-view-all-models" style="font-size:0.75rem;">Lihat semua models &rarr;</button>
          </div>
        `;
        mdSection.querySelector('#btn-view-all-models')?.addEventListener('click', () => {
          state.activeFilter = 'model';
          applyFilters();
          renderFilterBar();
          renderContent();
        });

        if (state.viewMode === 'grid') {
          const mdGrid = document.createElement('div');
          mdGrid.className = 'repo-grid';
          mdGrid.innerHTML = models.map(repoCardGridHTML).join('');
          mdSection.appendChild(mdGrid);
        } else {
          mdSection.insertAdjacentHTML('beforeend', repoTableListHTML(models));
        }
        contentSection.appendChild(mdSection);

        // ── Section Spaces (jika ada) ────────────────────────────────────
        if (spaces.length > 0) {
          const spSection = document.createElement('div');
          spSection.className = 'repo-type-group';
          spSection.style.marginTop = '2rem';
          spSection.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
              <h2 style="font-size:1rem;font-weight:700;display:flex;align-items:center;gap:6px;color:var(--hs-text);">
                <span style="color:var(--hs-color-space);display:inline-flex;">${iconSpace(18)}</span>
                <span>Spaces</span>
                <span class="badge badge-space" style="font-size:0.75rem;">${spaces.length}</span>
              </h2>
            </div>
          `;
          if (state.viewMode === 'grid') {
            const spGrid = document.createElement('div');
            spGrid.className = 'repo-grid';
            spGrid.innerHTML = spaces.map(repoCardGridHTML).join('');
            spSection.appendChild(spGrid);
          } else {
            spSection.insertAdjacentHTML('beforeend', repoTableListHTML(spaces));
          }
          contentSection.appendChild(spSection);
        }
      } else {
        if (state.viewMode === 'grid') {
          const grid = document.createElement('div');
          grid.className = 'repo-grid';
          grid.innerHTML = visibleItems.map(repoCardGridHTML).join('');
          contentSection.appendChild(grid);
        } else {
          contentSection.innerHTML = repoTableListHTML(visibleItems);
        }
      }
    } else {
      if (state.viewMode === 'grid') {
        const grid = document.createElement('div');
        grid.className = 'repo-grid';
        grid.innerHTML = visibleItems.map(repoCardGridHTML).join('');
        contentSection.appendChild(grid);
      } else {
        contentSection.innerHTML = repoTableListHTML(visibleItems);
      }
    }
    // Intercept clicks on links for SPA navigation
    contentSection.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(anchor => {
      anchor.addEventListener('click', e => {
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('//')) return;
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          navigate(href);
        }
      });
    });

    // Row clicks for list view
    if (state.viewMode === 'list') {
      contentSection.querySelectorAll<HTMLTableRowElement>('tr.repo-table-row').forEach(row => {
        const href = row.getAttribute('data-href');
        if (!href) return;
        row.addEventListener('click', e => {
          const target = e.target as HTMLElement;
          if (target.closest('a')) return;
          navigate(href);
        });
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            navigate(href);
          }
        });
      });
    }

    // Load more controls
    if (state.displayedCount < state.filteredRepos.length) {
      const remaining = state.filteredRepos.length - state.displayedCount;
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'btn btn-secondary';
      loadMoreBtn.textContent = `${t('repos.loadMore') || 'Muat Lebih Banyak'} (${remaining.toLocaleString()} lagi)`;
      loadMoreBtn.addEventListener('click', () => {
        state.displayedCount += PAGE_SIZE;
        renderContent();
      });

      const hint = document.createElement('p');
      hint.className = 'repo-load-more-hint';
      hint.textContent = `Menampilkan ${visibleItems.length.toLocaleString()} dari ${state.filteredRepos.length.toLocaleString()} repositori`;

      loadMoreSection.append(loadMoreBtn, hint);
    }
  }

  // ── Data Fetching ──────────────────────────────────────────────────────────
  async function loadRepos(): Promise<void> {
    if (!state.selectedOwner) {
      renderEmptyState(contentSection, {
        iconSvg: iconModel(32),
        title: 'Masuk ke Hugging Face',
        desc: 'Silakan masuk dengan akun Hugging Face Anda untuk melihat dan mengelola repositori.',
        actionLabel: 'Masuk Sekarang',
        actionType: 'primary',
        onAction: () => {
          navigate('/auth');
        },
      });
      return;
    }

    state.isLoading = true;
    state.error = null;
    updateHeading();
    renderContent();

    const token = appStore.value.auth.token;

    try {
      const repos = await loadUserRepos(state.selectedOwner, token, false);
      state.allRepos = repos;
      state.displayedCount = PAGE_SIZE;
      applyFilters();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('errors.networkError') || 'Gagal memuat repositori.';
      state.error = msg;
      showToast(msg, 'error');
    } finally {
      state.isLoading = false;
      updateHeading();
      renderFilterBar();
      renderContent();
    }
  }

  async function loadOrgs(): Promise<void> {
    const token = appStore.value.auth.token;
    if (!token) return;
    try {
      state.orgs = await listUserOrgs(token);
    } catch {
      // Non-critical: personal account switcher remains functional
    }
    renderAccountSwitcher();
  }

  // ── Boot Sequence ──────────────────────────────────────────────────────────
  updateHeading();
  renderFilterBar();
  renderAccountSwitcher();
  loadOrgs();
  loadRepos();
}
