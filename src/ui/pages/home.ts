/**
 * Home Page (Beranda Publik) — HuggingStudio
 * Halaman pembuka untuk pengunjung yang belum login: hero brand,
 * separuh fitur, dan CTA yang mengarah ke halaman login khusus (/auth).
 * Vanilla TS DOM, no framework. Tanpa emoji — ikon SVG inline.
 */

import { navigate } from '../../router';
import { t } from '../../i18n';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Buat elemen dengan sekumpulan attribute dan children sekaligus. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

// ── Konten fitur ───────────────────────────────────────────────────────────

interface HomeFeature {
  icon: string;
  title: string;
  desc: string;
}

function getFeatures(): HomeFeature[] {
  return [
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
      title: 'Punya repo sendiri',
      desc: 'Masuk untuk melihat dan mengelola seluruh Model, Dataset, dan Space dari akun maupun organisasi Anda.',
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path></svg>',
      title: 'Editor langsung di browser',
      desc: 'Upload, unduh, pindah, dan ganti nama berkas — semua tersimpan dalam satu commit gabungan.',
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
      title: 'Privat & terlindungi',
      desc: 'Token OAuth PKCE hanya hidup di memori browser — tidak pernah menyentuh server pihak ketiga.',
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      title: 'Thumbnail instan',
      desc: 'Gambar dan video dirender sebagai pratampilan mini langsung di sisi browser, tanpa server.',
    },
  ];
}

// ── Blok pembangun ─────────────────────────────────────────────────────────

function buildHero(): HTMLElement {
  const hero = el('section', { className: 'home-hero' });

  // Badge kecil di atas judul
  const badge = el('span', { className: 'home-badge' });
  badge.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5L8 13.8l-6-4.6h7.6z"></path></svg>
    <span>Akses tamu tersedia untuk repo publik</span>
  `;

  const title = el('h1', { className: 'home-title' });
  const titleAccent = el('span', { className: 'home-title__accent' });
  titleAccent.textContent = 'Hugging Face';
  title.append('File manager untuk repositori ', titleAccent);

  const subtitle = el('p', { className: 'home-subtitle' });
  subtitle.textContent =
    'Jelajahi repo seperti Google Drive, commit seperti GitHub Desktop — langsung dari browser, tanpa install, tanpa server perantara.';

  const actions = el('div', { className: 'home-actions' });

  const btnLogin = el('button', { className: 'btn btn-primary home-cta', type: 'button' });
  btnLogin.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="8 7 3 12 8 17"></polyline><line x1="3" y1="12" x2="15" y2="12"></line></svg>
    <span>${t('auth.login')}</span>
  `;
  btnLogin.addEventListener('click', () => navigate('/auth'));

  const btnGuest = el('button', { className: 'btn btn-ghost home-cta home-cta--ghost', type: 'button' });
  btnGuest.textContent = `${t('auth.guestBrowse')} →`;
  btnGuest.addEventListener('click', () => navigate('/explore'));

  actions.append(btnLogin, btnGuest);
  hero.append(badge, title, subtitle, actions);
  return hero;
}

function buildFeatureGrid(): HTMLElement {
  const section = el('section', { className: 'home-features' });
  const grid = el('ul', { className: 'home-features__grid', role: 'list' });

  for (const feat of getFeatures()) {
    const item = el('li', { className: 'home-feature' });

    const icon = el('span', { className: 'home-feature__icon', 'aria-hidden': 'true' });
    icon.innerHTML = feat.icon;

    const title = el('strong', { className: 'home-feature__title' });
    title.textContent = feat.title;

    const desc = el('span', { className: 'home-feature__desc' });
    desc.textContent = feat.desc;

    item.append(icon, title, desc);
    grid.appendChild(item);
  }

  const children = Array.from(grid.children) as HTMLElement[];
  section.appendChild(grid);

  void children;
  return section;
}

function buildFooter(): HTMLElement {
  const footer = el('footer', { className: 'home-footer' });
  const p = el('p', { className: 'home-footer__text' });
  p.textContent = t('footer.disclaimer');
  footer.appendChild(p);
  return footer;
}

// ── Styles (suntik sekali) ─────────────────────────────────────────────────

const HOME_STYLE_ID = 'hs-home-styles';

function injectStyles(): void {
  if (document.getElementById(HOME_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = HOME_STYLE_ID;
  style.textContent = `
/* ──────────────────────────────────────────────────
   Home Page — beranda publik (guest)
   Semua warna via token semantik tokens.css
   ────────────────────────────────────────────────── */
.home-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6, 2rem);
  padding: var(--space-8, 4rem) var(--space-4, 1rem);
  box-sizing: border-box;
  background:
    radial-gradient(56rem 30rem at 78% -12%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 62%),
    radial-gradient(40rem 24rem at 12% 110%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 58%),
    var(--canvas);
}

/* Hero */
.home-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3, 0.75rem);
  text-align: center;
  max-width: 46rem;
}

.home-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-11, 11px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
}
.home-badge svg { color: var(--accent); }

.home-title {
  margin: 0;
  font-size: clamp(1.9rem, 5.4vw, 2.9rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: var(--text);
}

.home-title__accent { color: var(--accent); }

.home-subtitle {
  margin: 0;
  font-size: clamp(0.95rem, 2.4vw, 1.06rem);
  line-height: 1.65;
  color: var(--text-muted);
  max-width: 42rem;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 0.75rem);
  margin-top: var(--space-2, 0.5rem);
}

.home-cta {
  min-height: 2.75rem;
  font-size: var(--fs-14, 14px);
  font-weight: 600;
  border-radius: var(--radius-lg, 8px);
}
.home-cta--ghost { color: var(--text-muted); }
.home-cta--ghost:hover { color: var(--text); }

/* Feature grid */
.home-features { width: 100%; max-width: 46rem; }

.home-features__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3, 0.75rem);
}

@media (max-width: 640px) {
  .home-features__grid { grid-template-columns: 1fr; }
}

.home-feature {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-4, 1rem);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl, 10px);
  text-align: left;
  transition: border-color var(--dur-fast, 120ms), background var(--dur-fast, 120ms);
}
.home-feature:hover {
  border-color: var(--border-strong, var(--border));
  background: var(--surface-hover);
}

.home-feature__icon {
  display: inline-flex;
  align-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-lg, 8px);
  background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent));
  color: var(--accent);
  justify-content: center;
  flex-shrink: 0;
}

.home-feature__title {
  font-size: var(--fs-14, 14px);
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.home-feature__desc {
  font-size: var(--fs-12, 12px);
  line-height: 1.6;
  color: var(--text-muted);
}

/* Footer */
.home-footer { margin-top: var(--space-2, 0.5rem); }
.home-footer__text {
  margin: 0;
  font-size: var(--fs-11, 11px);
  color: var(--text-subtle);
  text-align: center;
  line-height: 1.7;
  max-width: 34rem;
}
`;
  document.head.appendChild(style);
}

// ── Entry ──────────────────────────────────────────────────────────────────

/**
 * Render beranda publik ke dalam `container` (untuk pengunjung belum login).
 * Form login sendiri berada di rute khusus /auth.
 */
export function renderHomePage(container: HTMLElement): void {
  injectStyles();

  container.innerHTML = '';

  const page = el('div', { className: 'home-page' });
  page.appendChild(buildHero());
  page.appendChild(buildFeatureGrid());
  page.appendChild(buildFooter());
  container.appendChild(page);
}
