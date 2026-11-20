import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ManagedUser, UserRole, UserService, UserStatusFilter } from '../../services/user.service';

interface UserFormModel {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
}

const emptyForm = (): UserFormModel => ({ name: '', email: '', phone: '', role: 'USER', password: '' });

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly search$ = new Subject<string>();

  readonly currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  readonly statusOptions: { key: UserStatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Ativos' },
    { key: 'inactive', label: 'Inativos' }
  ];
  readonly skeletonRows = [1, 2, 3, 4, 5];

  // List state
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);
  readonly pageSize = 10;
  searchTerm = '';
  statusFilter: UserStatusFilter = 'all';

  // Create/edit dialog state
  readonly formOpen = signal(false);
  readonly editing = signal<ManagedUser | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  form: UserFormModel = emptyForm();

  // Activate/deactivate confirmation dialog state
  readonly toggleTarget = signal<ManagedUser | null>(null);
  readonly toggling = signal(false);
  readonly toggleError = signal<string | null>(null);

  // Password reset dialog state
  readonly passwordTarget = signal<ManagedUser | null>(null);
  readonly resettingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  newPassword = '';


  constructor() {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(0);
        this.load();
      });
  }

  ngOnInit(): void {
    this.load();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.passwordTarget()) {
      this.closePasswordReset();
    } else if (this.toggleTarget()) {
      this.cancelToggle();
    } else if (this.formOpen()) {
      this.closeForm();
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.userService
      .list({ search: this.searchTerm, status: this.statusFilter, page: this.page(), size: this.pageSize })
      .subscribe({
        next: (result) => {
          this.users.set(result.items);
          this.totalPages.set(result.totalPages);
          this.totalElements.set(result.totalElements);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Não foi possível carregar os usuários. Tente novamente.');
          this.loading.set(false);
        }
      });
  }

  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.search$.next(term.trim());
  }

  onStatusChange(status: UserStatusFilter): void {
    if (this.statusFilter === status) return;
    this.statusFilter = status;
    this.page.set(0);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  isSelf(user: ManagedUser): boolean {
    return user.id === this.currentUser()?.id;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  // ---- Create / edit ----

  openCreate(): void {
    this.editing.set(null);
    this.form = emptyForm();
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openEdit(user: ManagedUser): void {
    this.editing.set(user);
    this.form = {
      name: user.name,
      email: user.email ?? '',
      phone: user.phone,
      role: user.role,
      password: ''
    };
    this.formError.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
  }

  save(f: NgForm): void {
    if (this.saving() || f.invalid) return;

    this.saving.set(true);
    this.formError.set(null);

    const editing = this.editing();
    const request$ = editing
      ? this.userService.update(editing.id, {
          name: this.form.name,
          email: this.form.email,
          phone: this.form.phone,
          role: this.form.role
        })
      : this.userService.create({ ...this.form });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(this.toMessage(err));
      }
    });
  }

  openPasswordReset(user: ManagedUser): void {
    this.newPassword = '';
    this.passwordError.set(null);
    this.passwordTarget.set(user);
  }

  closePasswordReset(): void {
    if (this.resettingPassword()) return;
    this.passwordTarget.set(null);
  }

  submitPasswordReset(f: NgForm): void {
    const user = this.passwordTarget();
    if (!user || this.resettingPassword() || f.invalid) return;

    this.resettingPassword.set(true);
    this.passwordError.set(null);

    this.userService.resetPassword(user.id, this.newPassword).subscribe({
      next: () => {
        this.resettingPassword.set(false);
        this.passwordTarget.set(null);
        this.notice.set(`Senha de ${user.name} redefinida com sucesso.`);
        setTimeout(() => this.notice.set(null), 5000);
      },
      error: (err: HttpErrorResponse) => {
        this.resettingPassword.set(false);
        this.passwordError.set(this.toMessage(err));
      }
    });
  }

  // ---- Activate / deactivate ----

  requestToggle(user: ManagedUser): void {
    this.toggleError.set(null);
    this.toggleTarget.set(user);
  }

  cancelToggle(): void {
    if (this.toggling()) return;
    this.toggleTarget.set(null);
  }

  confirmToggle(): void {
    const user = this.toggleTarget();
    if (!user || this.toggling()) return;

    this.toggling.set(true);
    this.toggleError.set(null);

    this.userService.setActive(user.id, !user.active).subscribe({
      next: () => {
        this.toggling.set(false);
        this.toggleTarget.set(null);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.toggling.set(false);
        this.toggleError.set(this.toMessage(err));
      }
    });
  }

  private toMessage(err: HttpErrorResponse): string {
    const serverMessage = typeof err.error?.message === 'string' ? err.error.message : null;
    if (serverMessage) return serverMessage;

    switch (err.status) {
      case 0:
        return 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
      case 400:
        return 'Dados inválidos. Confira os campos e tente novamente.';
      case 403:
        return 'Você não tem permissão para esta ação.';
      case 409:
        return 'E-mail, telefone ou nome já cadastrado.';
      default:
        return 'Não foi possível concluir a operação. Tente novamente mais tarde.';
    }
  }
}
