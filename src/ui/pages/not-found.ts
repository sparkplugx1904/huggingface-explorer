/**
 * 404 Not Found Page — HuggingStudio
 */

import { navigate } from '../../router';
import { t } from '../../i18n';

export function renderNotFoundPage(container: HTMLElement): void {
  container.innerHTML = '';

  const el = document.createElement('div');
  el.className = 'empty-state';
  el.style.minHeight = '60vh';

  const emoji = document.createElement('div');
  emoji.className = 'empty-state-icon';
  emoji.textContent = '🔍';

  const title = document.createElement('h1');
  title.className = 'empty-state-title';
  title.textContent = '404 — Page Not Found';

  const desc = document.createElement('p');
  desc.className = 'empty-state-desc';
  desc.textContent = t('errors.notFound');

  const action = document.createElement('div');
  action.className = 'empty-state-action';

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.textContent = t('nav.home');
  btn.addEventListener('click', () => navigate('/'));

  action.appendChild(btn);
  el.append(emoji, title, desc, action);
  container.appendChild(el);
}
