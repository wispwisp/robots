// Light or dark UI, set as <html data-theme>: the student's choice, otherwise the operating system's.
export type Theme = 'light' | 'dark';

const listeners = new Set<(theme: Theme) => void>();

export function applyTheme(saved: Theme | null): void {
  const theme = saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const html = document.documentElement;
  if (html.dataset.theme === theme) return;
  html.dataset.theme = theme;
  for (const cb of listeners) cb(theme);
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function onThemeChange(cb: (theme: Theme) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
