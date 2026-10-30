/**
 * OAuth Callback Page — HuggingStudio
 * Ditampilkan saat browser kembali dari Hugging Face setelah login.
 * Menangani pertukaran code→token, lalu redirect ke '/'.
 */

import { handleCallback, tokenStore } from '../../auth';
import { navigate } from '../../router';
import { t } from '../../i18n';

// ── Style injection ────────────────────────────────────────────────────────

const CALLBACK_STYLE_ID = 'hs-callback-styles';

function injectStyles(): void {
  if (document.getElementById(CALLBACK_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CALLBACK_STYLE_ID;
  style.textContent = `
/* ──────────────────────────────────────────────────
   Callback Page — scoped styles
   ────────────────────────────────────────────────── */

.callback-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: var(--hs-space-6);
  background: var(--hs-surface);
  box-sizing: border-box;
}

.callback-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--hs-space-5);
  text-align: center;
  max-width: 360px;
  width: 100%;
  padding: var(--hs-space-8) var(--hs-space-6);
  background: var(--hs-surface);
  border: 1px solid var(--hs-border);
  border-radius: var(--hs-radius-xl);
  box-shadow: var(--hs-shadow-lg);
}

/* Large custom spinner for callback */
.callback-spinner {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: 4px solid var(--hs-surface-3);
  border-top-color: var(--hs-orange);
  animation: hs-spin 0.75s linear infinite;
  flex-shrink: 0;
}

.callback-title {
  margin: 0;
  font-size: var(--hs-text-xl);
  font-weight: 700;
  color: var(--hs-text);
}

.callback-desc {
  margin: 0;
  font-size: var(--hs-text-sm);
  color: var(--hs-text-muted);
  line-height: 1.6;
}

/* Error state */
.callback-error-icon {
  font-size: 3rem;
  line-height: 1;
  user-select: none;
}

.callback-error-box {
  width: 100%;
  background: var(--hs-error-bg);
  border: 1px solid var(--hs-error-border);
  border-radius: var(--hs-radius);
  padding: var(--hs-space-3) var(--hs-space-4);
  font-size: var(--hs-text-sm);
  color: var(--hs-error);
  line-height: 1.5;
  word-break: break-word;
}

.callback-actions {
  display: flex;
  flex-direction: column;
  gap: var(--hs-space-3);
  width: 100%;
}
`;
  document.head.appendChild(style);
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Loading state ──────────────────────────────────────────────────────────

function renderLoading(card: HTMLElement): void {
  card.innerHTML = '';

  const spinner = el('div', {
    className: 'callback-spinner',
    role: 'status',
    'aria-label': 'Memuat',
  });

  const title = el('h1', { className: 'callback-title' });
  title.textContent = 'Menyelesaikan login…';

  const desc = el('p', { className: 'callback-desc' });
  desc.textContent = 'Harap tunggu, sedang memverifikasi sesi Anda dengan Hugging Face.';

  card.append(spinner, title, desc);
}

// ── Error state ────────────────────────────────────────────────────────────

function renderError(card: HTMLElement, message: string): void {
  card.innerHTML = '';

  const icon = el('div', { className: 'callback-error-icon', 'aria-hidden': 'true' });
  icon.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--hs-error, #ef4444)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  `;

  const title = el('h1', { className: 'callback-title' });
  title.textContent = 'Login gagal';

  const errorBox = el('div', {
    className: 'callback-error-box',
    role: 'alert',
    'aria-live': 'assertive',
  });
  errorBox.textContent = message;

  const actions = el('div', { className: 'callback-actions' });

  // Retry → restart login flow
  const btnRetry = el('button', {
    className: 'btn btn-primary btn-block',
    type: 'button',
  });
  btnRetry.textContent = 'Coba masuk lagi';
  btnRetry.addEventListener('click', () => {
    navigate('/auth');
  });

  // Back home as guest
  const btnHome = el('button', {
    className: 'btn btn-ghost btn-block',
    type: 'button',
  });
  btnHome.textContent = t('auth.guestBrowse') + ' →';
  btnHome.addEventListener('click', () => {
    navigate('/explore');
  });

  actions.append(btnRetry, btnHome);
  card.append(icon, title, errorBox, actions);
}

// ── Entry ──────────────────────────────────────────────────────────────────

/**
 * Render halaman callback OAuth ke dalam `container`.
 * Memanggil handleCallback() secara async, lalu navigate sesuai hasil.
 */
export function renderCallbackPage(container: HTMLElement): void {
  injectStyles();

  container.innerHTML = '';

  const page = el('div', { className: 'callback-page' });
  const card = el('div', { className: 'callback-card card' });
  page.appendChild(card);
  container.appendChild(page);

  renderLoading(card);

  // Jika sesi sudah berhasil diautentikasi (misal saat boot via initAuth()), langsung arahkan
  const currentAuth = tokenStore.snapshot();
  if (currentAuth.token && currentAuth.user) {
    const returnTo = sessionStorage.getItem('hs:auth:return_to');
    sessionStorage.removeItem('hs:auth:return_to');
    const target = returnTo && returnTo !== '/callback' && returnTo !== '/auth' ? returnTo : '/';
    navigate(target);
    return;
  }

  handleCallback()
    .then((authState) => {
      if (authState && authState.user) {
        // Sukses — redirect ke returnTo atau halaman utama
        const returnTo = sessionStorage.getItem('hs:auth:return_to');
        sessionStorage.removeItem('hs:auth:return_to');
        const target = returnTo && returnTo !== '/callback' && returnTo !== '/auth' ? returnTo : '/';
        navigate(target);
      } else {
        // handleCallback() returned null/undefined (bukan halaman callback)
        // Atau tidak ada user — anggap gagal
        renderError(
          card,
          'Respons OAuth tidak valid atau sesi sudah kedaluwarsa. Silakan coba lagi.'
        );
      }
    })
    .catch((err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : t('errors.authError');
      renderError(card, msg);
    });
}
