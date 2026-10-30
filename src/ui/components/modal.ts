/**
 * Modal dialog component — HuggingStudio
 * Fully accessible, focus-trapped, stackable modals with no browser alert/confirm.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalActionVariant = 'primary' | 'danger' | 'secondary';

export interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: ModalActionVariant;
  /** Close the modal automatically after onClick fires. Default true. */
  closeOnClick?: boolean;
}

export interface ModalOptions {
  title: string;
  content: string | HTMLElement;
  actions?: ModalAction[];
  onClose?: () => void;
  size?: ModalSize;
  returnFocus?: HTMLElement | null;
}

/** Function that programmatically closes the modal. */
export type ModalCloseFn = () => void;

// ─── Focus Trap Engine ─────────────────────────────────────────────────────────

export const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),'
  + 'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function isElementVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (el.offsetParent === null) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }
  return window.getComputedStyle(el).visibility !== 'hidden';
}

/** Query all visible, interactive elements participating in tab order. */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.closest('[aria-hidden="true"]') && isElementVisible(el));
}

export interface FocusTrapOptions {
  container: HTMLElement;
  initialFocus?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  onEscape?: () => void;
  lockScroll?: boolean;
}

export interface FocusTrap {
  deactivate: () => void;
}

interface ActiveTrap {
  container: HTMLElement;
  triggerEl: HTMLElement | null;
  onEscape?: () => void;
  lockScroll: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
}

const activeTraps: ActiveTrap[] = [];

/** Check if any focus-trapped modal/dialog is currently open. */
export function isAnyModalOpen(): boolean {
  return activeTraps.length > 0;
}

/**
 * Creates and activates a robust focus trap inside `opts.container`.
 * Automatically traps Tab / Shift+Tab, intercepts Escape, locks body scroll,
 * and restores focus to `returnFocus` upon deactivation.
 */
export function createFocusTrap(opts: FocusTrapOptions): FocusTrap {
  const triggerEl =
    opts.returnFocus ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const lockScroll = opts.lockScroll !== false;
  if (lockScroll) {
    document.body.style.overflow = 'hidden';
  }

  function handleKeyDown(e: KeyboardEvent): void {
    // Only topmost active trap handles keyboard events
    if (activeTraps.length === 0 || activeTraps[activeTraps.length - 1].container !== opts.container) {
      return;
    }

    if (e.key === 'Escape') {
      if (opts.onEscape) {
        e.preventDefault();
        e.stopPropagation();
        opts.onEscape();
      }
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements(opts.container);
      if (focusables.length === 0) {
        e.preventDefault();
        opts.container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift + Tab: backwards
        if (active === first || active === opts.container || !opts.container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: forwards
        if (active === last || active === opts.container || !opts.container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  const trapRecord: ActiveTrap = {
    container: opts.container,
    triggerEl,
    onEscape: opts.onEscape,
    lockScroll,
    onKeyDown: handleKeyDown,
  };

  activeTraps.push(trapRecord);
  document.addEventListener('keydown', handleKeyDown, true);

  // Set initial focus after render
  requestAnimationFrame(() => {
    if (opts.initialFocus && opts.container.contains(opts.initialFocus) && isElementVisible(opts.initialFocus)) {
      opts.initialFocus.focus();
      return;
    }
    const autoFocusEl = opts.container.querySelector<HTMLElement>('[autofocus]');
    if (autoFocusEl && isElementVisible(autoFocusEl)) {
      autoFocusEl.focus();
      return;
    }
    const focusables = getFocusableElements(opts.container);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      if (!opts.container.hasAttribute('tabindex')) {
        opts.container.tabIndex = -1;
      }
      opts.container.focus();
    }
  });

  let deactivated = false;
  function deactivate(): void {
    if (deactivated) return;
    deactivated = true;

    document.removeEventListener('keydown', handleKeyDown, true);
    const idx = activeTraps.indexOf(trapRecord);
    if (idx !== -1) {
      activeTraps.splice(idx, 1);
    }

    // Restore body scroll if no active traps require lock
    const anyLocked = activeTraps.some((t) => t.lockScroll);
    if (!anyLocked) {
      document.body.style.overflow = '';
    }

    // Restore focus to trigger element if still in DOM
    if (triggerEl && typeof triggerEl.focus === 'function' && document.body.contains(triggerEl)) {
      try {
        triggerEl.focus();
      } catch {
        // Fallback
      }
    } else if (activeTraps.length > 0) {
      // Restore focus to previous parent trap container in stack
      const top = activeTraps[activeTraps.length - 1];
      const focusables = getFocusableElements(top.container);
      (focusables[0] ?? top.container).focus();
    }
  }

  return { deactivate };
}

/** Backward-compatible helper for Tab key handling */
export function handleFocusTrap(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) { e.preventDefault(); root.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first || !root.contains(document.activeElement)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last || !root.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open a modal dialog.
 * @returns A `ModalCloseFn` that programmatically closes this modal.
 */
export function openModal(opts: ModalOptions): ModalCloseFn {
  const { title, content, actions = [], onClose, size = 'md', returnFocus } = opts;
  const triggerEl = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  // Unique ID for aria-labelledby.
  const titleId = `hs-modal-title-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // ── Overlay ──────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = String(300 + activeTraps.length * 10);
  overlay.setAttribute('aria-hidden', 'false');

  // ── Dialog ───────────────────────────────────────────────────────────────
  const dialog = document.createElement('div');
  dialog.className = `modal modal-${size}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.tabIndex = -1;

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('h2');
  titleEl.id = titleId;
  titleEl.className = 'modal-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close btn btn-ghost btn-sm';
  closeBtn.setAttribute('aria-label', 'Tutup dialog');
  closeBtn.textContent = '×';

  header.append(titleEl, closeBtn);

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'modal-body';

  if (typeof content === 'string') {
    // Sanitize: treat as plain text.
    body.textContent = content;
  } else {
    body.appendChild(content);
  }

  // ── Footer / Actions ─────────────────────────────────────────────────────
  let footer: HTMLElement | null = null;
  if (actions.length > 0) {
    footer = document.createElement('div');
    footer.className = 'modal-footer';

    for (const action of actions) {
      const btn = document.createElement('button');
      const variant = action.variant ?? 'secondary';
      btn.className = `btn btn-${variant}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick();
        if (action.closeOnClick !== false) close();
      });
      footer.appendChild(btn);
    }
  }

  dialog.append(header, body);
  if (footer) dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  // ── Focus Trap ───────────────────────────────────────────────────────────
  const trap = createFocusTrap({
    container: dialog,
    returnFocus: triggerEl,
    onEscape: () => close(),
  });

  // ── Event handlers ───────────────────────────────────────────────────────
  function onBackdropClick(e: MouseEvent): void {
    if (e.target === overlay) close();
  }

  overlay.addEventListener('click', onBackdropClick);
  closeBtn.addEventListener('click', () => close(), { once: true });

  // ── Close logic ──────────────────────────────────────────────────────────
  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;

    overlay.removeEventListener('click', onBackdropClick);
    trap.deactivate();

    // Animate out.
    overlay.classList.add('modal-closing');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
    }, { once: true });

    onClose?.();
  }

  return close;
}
