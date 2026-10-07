import './styles.css';
import { getLang, onLangChange, setLang, t } from './i18n';
import type { SavedState } from './storage';
import { renderAssembly } from './ui/assembly';
import { renderHeader } from './ui/header';
import { getState, subscribe } from './ui/state';
import { applyTheme } from './ui/theme';

// The program screen follows layout option C: code on the left, the track on the right.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"></header>
  <main class="screens">
    <section class="screen screen-assembly" data-testid="screen-assembly"></section>
    <section class="screen screen-program" data-testid="screen-program">
      <div class="program-code"></div>
      <div class="program-track"></div>
    </section>
  </main>
  <div class="small-screen" data-testid="small-screen"><p></p></div>`;

const screens = {
  assembly: app.querySelector<HTMLElement>('.screen-assembly')!,
  program: app.querySelector<HTMLElement>('.screen-program')!,
};

function showLanguage(): void {
  document.documentElement.lang = getLang();
  document.title = t('appName');
  app.querySelector('.small-screen p')!.textContent = t('windowTooSmall');
}

function applyState(s: SavedState): void {
  setLang(s.lang);
  applyTheme(s.theme);
  screens.assembly.hidden = s.step !== 'assembly';
  screens.program.hidden = s.step !== 'program';
}

// Registered before the header's own listeners, so they see the language and theme already applied.
onLangChange(showLanguage);
subscribe(applyState);
applyState(getState());
showLanguage();
renderHeader(app.querySelector('.topbar')!);
renderAssembly(screens.assembly);
