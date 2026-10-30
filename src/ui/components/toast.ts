/**
 * Toast notification system — HuggingStudio
 * Accessible, auto-dismissing toasts stacked bottom-right (bottom-center on mobile).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Identifier returned by `window.setTimeout`, used to cancel pending dismissals. */
type TimerId = number;

interface ToastItem {
  el: HTMLElement;
  timerId: TimerId;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 3500;

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

let container: HTMLElement | null = null;
const activeToasts: ToastItem[] = [];

function getContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;

  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('aria-label', 'Notifikasi');
  document.body.appendChild(container);
  return container;
}

function removeToast(item: ToastItem): void {
  clearTimeout(item.timerId);

  item.el.style.animation = 'hs-toast-out 0.25s ease forwards';

  item.el.addEventListener('animationend', () => {
    item.el.remove();
  }, { once: true });

  const idx = activeToasts.indexOf(item);
  if (idx !== -1) activeToasts.splice(idx, 1);
}

/**
 * Display a toast notification.
 * @param message  Text content to show.
 * @param type     Visual/semantic type of the notification.
 * @param duration Auto-dismiss delay in ms (default 3500). Pass 0 to persist.
 */
export function showToast(
  message: string,
  type: ToastType,
  duration: number = DEFAULT_DURATION,
): void {
  const c = getContainer();

  // Enforce max: remove oldest first.
  while (activeToasts.length >= MAX_TOASTS) {
    removeToast(activeToasts[0]);
  }

  const isAssertive = type === 'error';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', isAssertive ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');

  // Icon
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ICONS[type];

  // Message
  const msg = document.createElement('span');
  msg.className = 'toast-message';
  // Sanitize: set as textContent, not innerHTML.
  msg.textContent = message;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close btn btn-ghost btn-sm';
  closeBtn.setAttribute('aria-label', 'Tutup notifikasi');
  closeBtn.textContent = '×';

  toast.append(icon, msg, closeBtn);

  // Prepend so newest appears at top of the stack (visually bottom-most in column-reverse layout).
  c.prepend(toast);

  const item: ToastItem = {
    el: toast,
    timerId: 0,
  };
  activeToasts.push(item);

  closeBtn.addEventListener('click', () => removeToast(item), { once: true });

  if (duration > 0) {
    item.timerId = setTimeout(() => removeToast(item), duration);
  }
}
