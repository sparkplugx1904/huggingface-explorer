/**
 * Avatar component — HuggingStudio
 * Shows a user photo or a coloured-initial fallback with lazy loading.
 */

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarUser {
  name: string;
  login: string;
  avatarUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive two uppercase initials from a display name or login.
 * "Hugging Face" → "HF", "jane" → "JA", "j" → "J"
 */
function getInitials(name: string, login: string): string {
  const src = name.trim() || login.trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

/**
 * Deterministic hue (0–359) derived from a string, used for the fallback
 * avatar background so each user always gets the same colour.
 */
function stringToHue(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

// Palette: distinct, accessible hues that look good on white initials.
const HUE_SATURATION = 65;
const HUE_LIGHTNESS  = 42;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create an avatar element for the given user.
 * @param user  User info; `avatarUrl` is optional.
 * @param size  Visual size variant (default 'md').
 */
export function createAvatar(user: AvatarUser, size: AvatarSize = 'md'): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `avatar avatar-${size}`;
  wrapper.setAttribute('aria-hidden', 'true'); // decorative; label provided by context

  const initials = getInitials(user.name, user.login);
  const hue      = stringToHue(user.login || user.name);

  if (user.avatarUrl) {
    const img = document.createElement('img');
    img.alt     = user.name || user.login;
    img.loading = 'lazy'; // native lazy load
    img.decoding = 'async';

    // Show initials fallback if image fails to load.
    img.addEventListener('error', () => {
      img.remove();
      wrapper.appendChild(buildInitialsEl(initials, hue));
    }, { once: true });

    img.src = user.avatarUrl;
    wrapper.appendChild(img);
  } else {
    wrapper.appendChild(buildInitialsEl(initials, hue));
  }

  return wrapper;
}

function buildInitialsEl(initials: string, hue: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'avatar-initials';
  el.textContent = initials;
  el.style.backgroundColor = `hsl(${hue} ${HUE_SATURATION}% ${HUE_LIGHTNESS}%)`;
  el.style.color = '#ffffff';
  return el;
}
