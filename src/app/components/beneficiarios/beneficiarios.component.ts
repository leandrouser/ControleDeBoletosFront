import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, merge, of, startWith, switchMap, tap } from 'rxjs';
import { BeneficiariosService } from '../../services/beneficiarios.service';

@Component({
  selector: 'app-beneficiarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './beneficiarios.component.html',
  styleUrls: ['./beneficiarios.component.scss']
})
export class BeneficiariosComponent implements OnInit {
  private readonly beneficiariosService = inject(BeneficiariosService);
  private readonly fb = inject(FormBuilder);
  private readonly searchTerms = new Subject<string>();
  private readonly refreshTerms = new Subject<string>();
  private readonly editDialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  readonly beneficiarios = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly page = signal(0);
  readonly pageSize = 10;
  readonly totalElements = signal(0);
  readonly totalPages = signal(1);
  readonly rangeLabel = computed(() => {
    const total = this.totalElements();
    if (!total) return '0 resultados';
    const start = this.page() * this.pageSize + 1;
    const end = Math.min(start + this.beneficiarios().length - 1, total);
    return `${start}–${end} de ${total}`;
  });
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly editingBeneficiary = signal<string | null>(null);
  readonly toDelete = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]]
  });

  ngOnInit(): void {
    merge(
      this.searchTerms.pipe(
        startWith(''),
        debounceTime(250),
        distinctUntilChanged()
      ),
      this.refreshTerms.pipe(map(() => this.search().trim()))
    ).pipe(
      tap(() => {
        this.loading.set(true);
        this.error.set(null);
      }),
      switchMap((termo) =>
        this.beneficiariosService.buscar(termo, this.page(), this.pageSize).pipe(
          catchError((err: unknown) => {
            console.error('Erro ao carregar beneficiários:', err);
            this.error.set('Não foi possível carregar os beneficiários. Tente novamente.');
            return of(null);
          })
        )
      )
    ).subscribe((beneficiarios) => {
      if (!beneficiarios) {
        this.beneficiarios.set([]);
        this.totalElements.set(0);
        this.totalPages.set(1);
        this.loading.set(false);
        return;
      }

      if (this.page() >= beneficiarios.totalPages && this.page() > 0) {
        this.page.set(Math.max(0, beneficiarios.totalPages - 1));
        this.load();
        return;
      }

      this.beneficiarios.set(beneficiarios.content);
      this.totalElements.set(beneficiarios.totalElements);
      this.totalPages.set(Math.max(1, beneficiarios.totalPages));
      this.loading.set(false);
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(0);
    this.searchTerms.next(value.trim());
  }

  load(): void {
    this.refreshTerms.next(this.search().trim());
  }

  previousPage(): void {
    if (this.page() === 0) return;
    this.page.update((current) => current - 1);
    this.load();
  }

  nextPage(): void {
    if (this.page() + 1 >= this.totalPages()) return;
    this.page.update((current) => current + 1);
    this.load();
  }

  openEdit(name: string): void {
    this.editingBeneficiary.set(name);
    this.formError.set(null);
    this.form.reset({ name });
    this.editDialog().nativeElement.showModal();
  }

  closeEdit(): void {
    this.editDialog().nativeElement.close();
    this.editingBeneficiary.set(null);
  }

  saveEdit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentName = this.editingBeneficiary();
    if (!currentName) return;

    this.saving.set(true);
    this.formError.set(null);
    this.beneficiariosService.rename(currentName, this.form.controls.name.value.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEdit();
        this.load();
      },
      error: (err: unknown) => {
        console.error('Erro ao editar beneficiário:', err);
        this.saving.set(false);
        this.formError.set('Não foi possível editar o beneficiário. Confira o nome e tente novamente.');
      }
    });
  }

  askDelete(name: string): void {
    this.toDelete.set(name);
    this.deleteError.set(null);
    this.deleteDialog().nativeElement.showModal();
  }

  cancelDelete(): void {
    this.deleteDialog().nativeElement.close();
    this.toDelete.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const name = this.toDelete();
    if (!name) return;

    this.saving.set(true);
    this.deleteError.set(null);
    this.beneficiariosService.archive(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelDelete();
        this.load();
      },
      error: (err: unknown) => {
        console.error('Erro ao excluir beneficiário:', err);
        this.saving.set(false);
        this.deleteError.set('Não foi possível excluir o beneficiário. Tente novamente.');
      }
    });
  }
}
