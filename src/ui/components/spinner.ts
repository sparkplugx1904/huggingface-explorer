/**
 * Spinner component — HuggingStudio
 * Wraps the .spinner CSS class with optional size variants.
 */

export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Create a loading spinner element.
 * @param size  Visual size variant (default 'md').
 */
export function createSpinner(size: SpinnerSize = 'md'): HTMLElement {
  const el = document.createElement('span');
  el.className = `spinner spinner-${size}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Memuat…');

  // Hidden text for screen readers.
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = 'Memuat…';
  el.appendChild(sr);

  return el;
}
