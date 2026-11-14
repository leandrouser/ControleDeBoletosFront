import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  link: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  imports: [RouterLink, RouterLinkActive, RouterOutlet]
})
export class DashboardComponent {
  private authService = inject(AuthService);

  readonly user = toSignal(this.authService.currentUser$, { initialValue: null });
  readonly menuOpen = signal(false);
  readonly initial = computed(() => (this.user()?.name?.charAt(0) || 'U').toUpperCase());
  private pinned = false;

  // recolhimento automático da sidebar (desktop)
  readonly collapsed = signal(false);
  private readonly collapseDelayMs = 4000;
  private collapseTimer?: ReturnType<typeof setTimeout>;

  readonly icons = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    logo: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4',
    chevronLeft: 'M15 18l-6-6 6-6',
    chevronRight: 'M9 18l6-6-6-6'
  };

  readonly nav: NavItem[] = [
    { label: 'Visão geral', link: '/dashboard', exact: true,
      icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { label: 'Boletos', link: '/dashboard/billets',
      icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8' },
    { label: 'Beneficiários', link: '/dashboard/beneficiarios',
      icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { label: 'Categories', link: '/dashboard/categories',
      icon: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01' },
    { label: 'Relatórios', link: '/dashboard/relatorios',
      icon: 'M3 3v18h18M7 16V9M12 16V5M17 16v-4' }
  ];

  constructor() {
    this.scheduleCollapse();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.collapseTimer));
  }

  expand(): void {
    if (this.pinned) return;
    clearTimeout(this.collapseTimer);
    this.collapsed.set(false);
  }

  scheduleCollapse(): void {
    if (this.pinned) return;
    clearTimeout(this.collapseTimer);
    this.collapseTimer = setTimeout(() => this.collapsed.set(true), this.collapseDelayMs);
  }

  toggleCollapse(): void {
    clearTimeout(this.collapseTimer);
    this.pinned = true;
    this.collapsed.update((v) => !v);
  }
  closeMenu(): void { this.menuOpen.set(false); }
  logout(): void { this.authService.logout(); }
}
