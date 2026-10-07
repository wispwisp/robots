// Top bar: app name, the two step pills, RU | ҚАЗ, the theme toggle and «Новый проект».
import { onLangChange, t, type UiKey } from '../i18n';
import { newProject } from '../storage';
import { getState, subscribe, update } from './state';
import { currentTheme } from './theme';

export function renderHeader(root: HTMLElement): void {
  // Elements with data-text show that i18n key; the theme toggle's highlighted icon is pure CSS.
  root.innerHTML = `
    <div class="brand"><span class="brand-logo" aria-hidden="true">🤖</span><span data-text="appName"></span></div>
    <nav class="steps">
      <button type="button" class="step" data-testid="step-assembly" data-text="stepAssembly"></button>
      <button type="button" class="step" data-testid="step-program" data-text="stepProgram"></button>
    </nav>
    <div class="lang-switch">
      <button type="button" data-testid="lang-ru" data-text="langRu"></button>
      <span aria-hidden="true">|</span>
      <button type="button" data-testid="lang-kk" data-text="langKk"></button>
    </div>
    <button type="button" class="theme-toggle" data-testid="theme-toggle">
      <span class="sun" aria-hidden="true">☀️</span><span class="moon" aria-hidden="true">🌙</span>
    </button>
    <button type="button" class="new-project" data-testid="new-project" data-text="newProject"></button>`;

  const el = (id: string) => root.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
  el('step-assembly').onclick = () => update({ step: 'assembly' });
  el('step-program').onclick = () => update({ step: 'program' });
  el('lang-ru').onclick = () => update({ lang: 'ru' });
  el('lang-kk').onclick = () => update({ lang: 'kk' });
  el('theme-toggle').onclick = () => update({ theme: currentTheme() === 'dark' ? 'light' : 'dark' });
  el('new-project').onclick = () => {
    const { lang, theme } = getState();
    if (confirm(t('confirmNewProject'))) update(newProject(lang, theme));
  };

  const refresh = () => {
    const s = getState();
    for (const e of root.querySelectorAll<HTMLElement>('[data-text]')) e.textContent = t(e.dataset.text as UiKey);
    el('theme-toggle').title = t('themeToggle');
    el('step-assembly').ariaCurrent = s.step === 'assembly' ? 'step' : null;
    el('step-program').ariaCurrent = s.step === 'program' ? 'step' : null;
    el('lang-ru').ariaPressed = String(s.lang === 'ru');
    el('lang-kk').ariaPressed = String(s.lang === 'kk');
  };
  refresh();
  subscribe(refresh);
  onLangChange(refresh);
}
