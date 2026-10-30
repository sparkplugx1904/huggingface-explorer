/**
 * Empty-state component — HuggingStudio
 * Renders a centred empty-state block with icon, title, optional description
 * and optional call-to-action button.
 */

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateOptions {
  /** Emoji character or raw SVG markup string. */
  icon: string;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

/**
 * Create an empty-state element.
 * @param opts  Display options (icon, title, description, action).
 */
export function createEmptyState(opts: EmptyStateOptions): HTMLElement {
  const { icon, title, description, action } = opts;

  const root = document.createElement('div');
  root.className = 'empty-state';

  // ── Icon ─────────────────────────────────────────────────────────────────
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'empty-state-icon';
  iconWrapper.setAttribute('aria-hidden', 'true');

  // Detect SVG vs emoji/text: if it starts with '<' treat as markup.
  if (icon.trimStart().startsWith('<')) {
    iconWrapper.innerHTML = icon; // SVG strings are author-controlled, not user data
  } else {
    iconWrapper.textContent = icon;
  }

  // ── Title ─────────────────────────────────────────────────────────────────
  const titleEl = document.createElement('p');
  titleEl.className = 'empty-state-title';
  titleEl.textContent = title;

  root.append(iconWrapper, titleEl);

  // ── Description (optional) ────────────────────────────────────────────────
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'empty-state-desc';
    desc.textContent = description;
    root.appendChild(desc);
  }

  // ── Action button (optional) ──────────────────────────────────────────────
  if (action) {
    const actionWrapper = document.createElement('div');
    actionWrapper.className = 'empty-state-action';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);

    actionWrapper.appendChild(btn);
    root.appendChild(actionWrapper);
  }

  return root;
}
