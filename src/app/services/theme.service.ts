import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly mediaQuery = this.window?.matchMedia('(prefers-color-scheme: dark)');
  private hasUserPreference = false;

  readonly theme = signal<Theme>('light');

  constructor() {
    const savedTheme = this.readSavedTheme();
    this.hasUserPreference = savedTheme !== null;
    this.theme.set(savedTheme ?? (this.mediaQuery?.matches ? 'dark' : 'light'));
    this.applyTheme(this.theme());
    this.mediaQuery?.addEventListener('change', this.onSystemThemeChange);
  }

  toggle(): void {
    const nextTheme = this.theme() === 'dark' ? 'light' : 'dark';
    this.hasUserPreference = true;
    this.theme.set(nextTheme);
    this.applyTheme(nextTheme);
    this.saveTheme(nextTheme);
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onSystemThemeChange);
  }

  private readonly onSystemThemeChange = (event: MediaQueryListEvent): void => {
    if (this.hasUserPreference) return;
    const theme = event.matches ? 'dark' : 'light';
    this.theme.set(theme);
    this.applyTheme(theme);
  };

  private readSavedTheme(): Theme | null {
    try {
      const savedTheme = this.window?.localStorage.getItem('controle-de-boletos-theme');
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null;
    } catch (error) {
      console.warn('Não foi possível ler a preferência de tema salva.', error);
      return null;
    }
  }

  private saveTheme(theme: Theme): void {
    try {
      this.window?.localStorage.setItem('controle-de-boletos-theme', theme);
    } catch (error) {
      console.warn('Não foi possível salvar a preferência de tema.', error);
    }
  }

  private applyTheme(theme: Theme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }
}
