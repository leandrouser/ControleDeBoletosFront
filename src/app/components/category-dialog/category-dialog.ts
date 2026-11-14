import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category, CategoriesService, ExpenseType } from '../../services/category.service';

@Component({
  selector: 'app-category-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './category-dialog.html',
  styleUrls: ['./category-dialog.scss']
})
export class CategoryDialogComponent {
  private readonly service = inject(CategoriesService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Emite a categoria criada/atualizada depois de salvar. */
  readonly saved = output<Category>();

  readonly editing = signal<Category | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly expenseTypes: { value: ExpenseType; label: string }[] = [
    { value: 'PESSOAL', label: 'Pessoal' },
    { value: 'EMPRESARIAL', label: 'Empresarial' }
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    expenseType: ['PESSOAL' as ExpenseType, Validators.required]
  });

  open(category?: Category): void {
    this.editing.set(category ?? null);
    this.formError.set(null);
    this.form.reset({
      name: category?.name ?? '',
      expenseType: category?.expenseType ?? 'PESSOAL'
    });
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: Category = this.form.getRawValue();
    const current = this.editing();
    const request$ =
      current?.id != null
        ? this.service.update(current.id, payload)
        : this.service.create(payload);

    this.saving.set(true);
    this.formError.set(null);
    request$.subscribe({
      next: (category) => {
        this.saving.set(false);
        this.close();
        this.saved.emit(category);
      },
      error: (err) => {
        console.error('Erro ao salvar categoria:', err);
        this.saving.set(false);
        this.formError.set('Não foi possível salvar a categoria. Confira os dados e tente novamente.');
      }
    });
  }
}
