/**
 * Login Page — HuggingStudio
 * Halaman landing untuk pengguna yang belum login.
 * Vanilla TS DOM, no framework. Mobile-first, dark-mode ready.
 */

import { startLogin } from '../../auth';
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

// ── Feature highlights ─────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

function getFeatures(): Feature[] {
  return [
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
      title: 'Jelajahi Repo',
      desc: 'Akses model, dataset, dan Space publik milik siapa saja.',
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>',
      title: 'Kelola File',
      desc: 'Upload, unduh, rename, dan hapus file di repo Anda.',
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
      title: 'Repo Privat',
      desc: 'Lihat dan kelola repo privat dengan aman via token OAuth.',
    },
    {
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
      title: 'Dark Mode',
      desc: 'Tampilan nyaman di siang maupun malam hari.',
    },
  ];
}

// ── Spinner ────────────────────────────────────────────────────────────────

function buildSpinner(): HTMLElement {
  const s = el('span', { className: 'spinner spinner-sm', role: 'status', 'aria-hidden': 'true' });
  s.style.cssText = 'display:none;margin-right:0.4rem;vertical-align:middle;';
  return s;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function buildLogo(): HTMLElement {
  const wrap = el('div', { className: 'login-logo' });

  // Emoji mascot
  // SVG mascot
  const mascot = el('div', { className: 'login-logo__mascot', 'aria-hidden': 'true' });
  mascot.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--hs-orange, #f59e0b)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
      <path d="M2 17l10 5 10-5"></path>
      <path d="M2 12l10 5 10-5"></path>
    </svg>
  `;

  // Wordmark: "Hugging" + "Studio"
  const wordmark = el('div', { className: 'login-logo__wordmark' });
  const hugging = el('span', { className: 'login-logo__hugging' });
  hugging.textContent = 'Hugging';
  const studio = el('span', { className: 'login-logo__studio' });
  studio.textContent = 'Studio';
  wordmark.append(hugging, studio);

  // Tagline
  const tagline = el('p', { className: 'login-logo__tagline' });
  tagline.textContent = 'Klien desktop untuk Hugging Face — ringan, cepat, open‑source.';

  wrap.append(mascot, wordmark, tagline);
  return wrap;
}

function buildFeatureList(): HTMLElement {
  const grid = el('ul', { className: 'login-features', role: 'list' });
  for (const feat of getFeatures()) {
    const item = el('li', { className: 'login-feature' });

    const icon = el('span', { className: 'login-feature__icon', 'aria-hidden': 'true' });
    icon.innerHTML = feat.icon;

    const body = el('span', { className: 'login-feature__body' });
    const title = el('strong', { className: 'login-feature__title' });
    title.textContent = feat.title;
    const desc = el('span', { className: 'login-feature__desc' });
    desc.textContent = ` — ${feat.desc}`;

    body.append(title, desc);
    item.append(icon, body);
    grid.appendChild(item);
  }
  return grid;
}

function buildFooterDisclaimer(): HTMLElement {
  const footer = el('footer', { className: 'login-footer' });
  const p = el('p', { className: 'login-footer__text' });
  p.textContent = t('footer.disclaimer');
  footer.appendChild(p);
  return footer;
}

// ── Card ───────────────────────────────────────────────────────────────────

function buildCard(): HTMLElement {
  const card = el('div', { className: 'login-card card', role: 'main' });

  // Logo
  card.appendChild(buildLogo());

  // Divider
  const divider = el('hr', { className: 'login-divider', 'aria-hidden': 'true' });
  card.appendChild(divider);

  // Features
  card.appendChild(buildFeatureList());

  // Divider
  const divider2 = el('hr', { className: 'login-divider', 'aria-hidden': 'true' });
  card.appendChild(divider2);

  // Action area
  const actions = el('div', { className: 'login-actions' });

  // Primary: Sign in with HF
  const spinner = buildSpinner();
  const btnText = el('span', { className: 'login-btn-hf__text' });
  btnText.textContent = t('auth.loginWith');

  const btnLogin = el('button', {
    className: 'btn btn-block login-btn-hf',
    type: 'button',
    'aria-label': t('auth.loginWith'),
  });
  btnLogin.append(spinner, btnText);

  btnLogin.addEventListener('click', async () => {
    if (btnLogin.disabled) return;
    // Loading state
    btnLogin.disabled = true;
    btnLogin.setAttribute('aria-disabled', 'true');
    spinner.style.display = 'inline-block';
    btnText.textContent = 'Menghubungkan…';
    try {
      await startLogin();
      // startLogin() redirects; if we somehow return, reset state
    } catch (err) {
      console.error('[login] startLogin error:', err);
      // Restore state on error
      btnLogin.disabled = false;
      btnLogin.removeAttribute('aria-disabled');
      spinner.style.display = 'none';
      btnText.textContent = t('auth.loginWith');
      // Show inline error
      showError(card, err instanceof Error ? err.message : String(err));
    }
  });

  // Secondary: Browse as guest
  const btnGuest = el('button', {
    className: 'btn btn-ghost btn-block login-btn-guest',
    type: 'button',
  });
  btnGuest.textContent = t('auth.guestBrowse') + ' →';
  btnGuest.addEventListener('click', () => {
    navigate('/explore');
  });

  actions.append(btnLogin, btnGuest);
  card.appendChild(actions);

  // Footer disclaimer
  card.appendChild(buildFooterDisclaimer());

  return card;
}

// ── Inline error banner ────────────────────────────────────────────────────

function showError(card: HTMLElement, message: string): void {
  // Remove any existing error
  card.querySelector('.login-error')?.remove();

  const banner = el('div', {
    className: 'login-error',
    role: 'alert',
    'aria-live': 'assertive',
  });
  const icon = el('span', { 'aria-hidden': 'true', style: 'display:inline-flex;align-items:center;margin-right:0.35rem;color:var(--hs-error,#ef4444)' });
  icon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  `;
  const msg = el('span');
  msg.textContent = message;
  banner.append(icon, msg);

  // Insert after actions
  const actions = card.querySelector('.login-actions');
  if (actions) {
    card.insertBefore(banner, actions.nextSibling);
  } else {
    card.appendChild(banner);
  }
}

// ── Page-level styles (injected once) ─────────────────────────────────────

const LOGIN_STYLE_ID = 'hs-login-styles';

function injectStyles(): void {
  if (document.getElementById(LOGIN_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LOGIN_STYLE_ID;
  style.textContent = `
/* ──────────────────────────────────────────────────
   Login Page — scoped styles
   (All colours via CSS custom properties from tokens)
   ────────────────────────────────────────────────── */

/* Outer: full-viewport centred flex */
.login-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--hs-space-4);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--hs-yellow) 12%, var(--hs-surface)) 0%,
    var(--hs-surface) 50%,
    color-mix(in srgb, var(--hs-orange) 8%, var(--hs-surface)) 100%
  );
  background-attachment: fixed;
  box-sizing: border-box;
}

/* Card */
.login-card.card {
  width: 100%;
  max-width: 420px;
  padding: var(--hs-space-8) var(--hs-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--hs-space-5);
  box-shadow: var(--hs-shadow-lg);
  border-radius: var(--hs-radius-xl);
  border: 1px solid var(--hs-border);
  background: var(--hs-surface);
}

@media (max-width: 359px) {
  .login-card.card {
    padding: var(--hs-space-6) var(--hs-space-4);
  }
}

/* Logo block */
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--hs-space-2);
  text-align: center;
}

.login-logo__mascot {
  font-size: clamp(2.5rem, 8vw, 4rem);
  line-height: 1;
  user-select: none;
  filter: drop-shadow(0 2px 8px rgba(255,157,0,0.25));
}

.login-logo__wordmark {
  font-size: clamp(1.6rem, 5vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.login-logo__hugging {
  color: var(--hs-text);
}

.login-logo__studio {
  color: var(--hs-orange);
  margin-left: 0.2ch;
}

.login-logo__tagline {
  margin: 0;
  font-size: var(--hs-text-sm);
  color: var(--hs-text-muted);
  max-width: 30ch;
  line-height: 1.5;
}

/* Divider */
.login-divider {
  border: none;
  border-top: 1px solid var(--hs-border);
  margin: 0;
}

/* Feature list */
.login-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--hs-space-3);
}

.login-feature {
  display: flex;
  align-items: flex-start;
  gap: var(--hs-space-3);
  font-size: var(--hs-text-sm);
  line-height: 1.5;
  color: var(--hs-text-muted);
}

.login-feature__icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  margin-top: 0.05em;
  user-select: none;
}

.login-feature__body {
  flex: 1;
}

.login-feature__title {
  color: var(--hs-text);
  font-weight: 600;
}

/* Actions */
.login-actions {
  display: flex;
  flex-direction: column;
  gap: var(--hs-space-3);
}

/* HF login button — yellow brand style */
.login-btn-hf {
  background-color: var(--hs-yellow);
  color: #111827;
  border: none;
  font-weight: 700;
  font-size: var(--hs-text-base);
  padding: var(--hs-space-3) var(--hs-space-5);
  border-radius: var(--hs-radius-lg, 8px);
  cursor: pointer;
  transition:
    background-color var(--hs-transition-fast),
    box-shadow var(--hs-transition-fast),
    transform var(--hs-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--hs-space-2);
  min-height: 2.75rem;
}

.login-btn-hf:hover:not(:disabled) {
  background-color: #f5c400;
  box-shadow: 0 4px 14px rgba(255,210,30,0.45);
}

.login-btn-hf:focus-visible {
  outline: 2px solid var(--hs-yellow);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(255,210,30,0.35);
}

.login-btn-hf:active:not(:disabled) {
  transform: translateY(1px);
}

.login-btn-hf:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.login-btn-hf__text {
  white-space: nowrap;
}

/* Ghost guest button */
.login-btn-guest {
  font-size: var(--hs-text-sm);
  color: var(--hs-text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  min-height: 2.25rem;
}

.login-btn-guest:hover {
  color: var(--hs-text);
}

/* Error banner */
.login-error {
  font-size: var(--hs-text-sm);
  color: var(--hs-error);
  background: var(--hs-error-bg);
  border: 1px solid var(--hs-error-border);
  border-radius: var(--hs-radius);
  padding: var(--hs-space-2) var(--hs-space-3);
  line-height: 1.5;
}

/* Footer */
.login-footer {
  margin-top: var(--hs-space-1);
}

.login-footer__text {
  margin: 0;
  font-size: var(--hs-text-xs);
  color: var(--hs-text-subtle);
  text-align: center;
  line-height: 1.6;
}

/* ── Dark mode overrides ── */
@media (prefers-color-scheme: dark) {
  .login-page {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hs-yellow) 6%, var(--hs-surface)) 0%,
      var(--hs-surface) 55%,
      color-mix(in srgb, var(--hs-orange) 5%, var(--hs-surface)) 100%
    );
  }
  .login-btn-hf {
    color: #111827; /* keep dark text even in dark mode for readability on yellow */
  }
}

[data-theme="dark"] .login-page {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--hs-yellow) 6%, var(--hs-surface)) 0%,
    var(--hs-surface) 55%,
    color-mix(in srgb, var(--hs-orange) 5%, var(--hs-surface)) 100%
  );
}

[data-theme="dark"] .login-btn-hf {
  color: #111827;
}
`;
  document.head.appendChild(style);
}

// ── Entry ──────────────────────────────────────────────────────────────────

/**
 * Render halaman login ke dalam `container`.
 * Container dikosongkan terlebih dahulu, lalu diisi dengan page wrapper + card.
 */
export function renderLoginPage(container: HTMLElement): void {
  injectStyles();

  // Wipe previous content
  container.innerHTML = '';

  const page = el('div', { className: 'login-page' });
  page.appendChild(buildCard());
  container.appendChild(page);
}
