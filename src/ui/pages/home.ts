/**
 * Home Page (Beranda Publik) — HuggingStudio
 * Halaman pembuka untuk pengunjung yang belum login: hero brand,
 * separuh fitur, dan CTA yang mengarah ke halaman login khusus (/auth).
 * Vanilla TS DOM, no framework. Tanpa emoji — ikon SVG inline.
 *
 * Lapisan hidup: aurora kanvas + rotating word + staggered entrance
 * + shine sweep pada kartu. Semua gerak mati di prefers-reduced-motion
 * (guard CSS di life.css; rotasi kata via matchMedia).
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

/** Matikan gerak dinamis bila user memilih reduced motion. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Konten fitur ───────────────────────────────────────────────────────────

/** Ikon SVG kartu fitur — urut sesuai kunci hero.feat#Title/Desc. */
const FEATURE_ITEMS: { icon: string }[] = [
  {
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
  },
  {
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path></svg>',
  },
  {
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  },
  {
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  },
];

/** Kunci i18n untuk judul & deskripsi fitur (urut sesuai FEATURE_ICONS). */
const FEATURE_TITLE_KEYS = ['hero.feat1Title', 'hero.feat2Title', 'hero.feat3Title', 'hero.feat4Title'] as const;
const FEATURE_DESC_KEYS = ['hero.feat1Desc', 'hero.feat2Desc', 'hero.feat3Desc', 'hero.feat4Desc'] as const;

// ── Rotating word — judul yang bernapas ─────────────────────────────────────

const WORD_MARGIN_CH = 9; // ruang maksimum untuk kata terpanjang ("Datasets")

function buildRotatingTitle(): HTMLElement {
  const title = el('h1', { className: 'home-title' });

  const word = el('span', {
    className: 'home-title__word',
    'aria-live': 'off',
  });
  word.textContent = t('hero.wordModel');
  word.style.setProperty('--word-w', `${WORD_MARGIN_CH}ch`);
  word.dataset.rotation = '0';

  const brand = el('span', { className: 'home-title__accent' });
  brand.textContent = t('hero.brand');

  title.append(t('hero.titlePrefix'), ' ', word, ' ', brand);
  return title;
}

/** Putar kata Model → Dataset → Space dengan cross-fade vertikal. */
function startWordRotation(word: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const words = [t('hero.wordModel'), t('hero.wordDataset'), t('hero.wordSpace')];
  let idx = 0;

  window.setInterval(() => {
    idx = (idx + 1) % words.length;
    word.classList.add('is-out');
    window.setTimeout(() => {
      word.textContent = words[idx];
      word.dataset.rotation = String(idx);
      word.classList.remove('is-out');
      word.classList.add('is-in');
      window.setTimeout(() => word.classList.remove('is-in'), 260);
    }, 230);
  }, 2600);
}

// ── Blok pembangun ─────────────────────────────────────────────────────────

function buildHero(): HTMLElement {
  const hero = el('section', { className: 'home-hero' });

  // Badge kecil di atas judul
  const badge = el('span', { className: 'home-badge' });
  badge.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5L8 13.8l-6-4.6h7.6z"></path></svg>
    <span></span>
  `;
  badge.querySelector('span:last-child')!.textContent = t('hero.badge');

  const title = buildRotatingTitle();

  const subtitle = el('p', { className: 'home-subtitle' });
  subtitle.textContent = t('hero.subtitle');

  const actions = el('div', { className: 'home-actions home-cta-row' });

  const btnLogin = el('button', { className: 'btn btn-primary home-cta home-cta--shine', type: 'button' });
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
  const grid = el('ul', { className: 'home-features__grid hs-stagger', role: 'list' });
  grid.style.setProperty('--stagger-step', '70ms');

  FEATURE_ITEMS.forEach((feat, i) => {
    const item = el('li', { className: 'home-feature' });
    item.style.setProperty('--i', String(i));

    const icon = el('span', { className: 'home-feature__icon home-feature__icon--pop', 'aria-hidden': 'true' });
    icon.innerHTML = feat.icon;

    const title = el('strong', { className: 'home-feature__title' });
    title.textContent = t(FEATURE_TITLE_KEYS[i]!);

    const desc = el('span', { className: 'home-feature__desc' });
    desc.textContent = t(FEATURE_DESC_KEYS[i]!);

    item.append(icon, title, desc);
    grid.appendChild(item);
  });

  section.appendChild(grid);

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
   Lapisan hidup: aurora + rotating word + stagger
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
  background: var(--canvas);
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
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 9px;
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

/* Rotating word — slot lebar tetap supaya layout tak goyang */
.home-title__word {
  display: inline-block;
  min-width: var(--word-w, 9ch);
  text-align: center;
  color: var(--c2);
  vertical-align: baseline;
  transition:
    opacity 230ms var(--ease-out, ease),
    transform 230ms var(--ease-out, ease);
}
.home-title__word:hover { color: var(--accent); }
.home-title__word.is-out {
  opacity: 0;
  transform: translateY(-0.28em);
}
.home-title__word.is-in {
  opacity: 1;
  transform: translateY(0.14em);
  animation: hs-word-settle 260ms var(--ease-spring, ease) both;
}
@keyframes hs-word-settle {
  from { transform: translateY(0.14em); opacity: 0.65; }
  to   { transform: translateY(0);      opacity: 1; }
}

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
.home-cta--stay-put { }
.home-cta--shine {
  position: relative;
  overflow: hidden;
}
.home-cta--shine::after {
  content: '';
  position: absolute;
  top: -40%;
  bottom: -40%;
  left: 0;
  width: 34%;
  background: linear-gradient(
    105deg,
    transparent,
    color-mix(in srgb, #ffffff 55%, transparent),
    transparent
  );
  opacity: 0;
  pointer-events: none;
  transform: translateX(-140%) skewX(-12deg);
}
.home-cta--shine:hover::after {
  opacity: 0.8;
  animation: hs-shine-sweep 0.7s var(--ease-out, ease) both;
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-4, 1rem);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl, 10px);
  text-align: left;
  overflow: hidden;
  transition:
    border-color var(--dur-fast, 120ms),
    background var(--dur-fast, 120ms),
    transform var(--dur-base, 180ms) var(--ease-spring, ease),
    box-shadow var(--dur-base, 180ms);
}
.home-feature:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--surface-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -10px rgb(0 0 0 / 0.5),
              0 0 22px -12px var(--accent-glow);
}

/* Ikon: pop dengan spring saat kartu di-hover */
.home-feature__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-lg, 8px);
  background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent));
  color: var(--accent);
  flex-shrink: 0;
  transition: transform 260ms var(--ease-spring, ease);
}
.home-feature:hover .home-feature__icon { transform: scale(1.12) rotate(-4deg); }

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

@media (prefers-reduced-motion: reduce) {
  .home-title__word { transition: none; }
  .home-feature:hover { transform: none; }
  .home-feature:hover .home-feature__icon { transform: none; }
  .home-cta--shine::after { display: none; }
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

  const page = el('div', { className: 'home-page hs-aurora' });

  const hero = buildHero();
  page.appendChild(hero);
  page.appendChild(buildFeatureGrid());
  page.appendChild(buildFooter());

  container.appendChild(page);

  // Nyalakan rotasi kata pada judul (setelah mount supaya transition jalan)
  const word = page.querySelector<HTMLElement>('.home-title__word');
  if (word) startWordRotation(word);
}
