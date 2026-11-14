import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category, CategoriesService, ExpenseType } from '../../services/category.service';
import { CategoryDialogComponent } from '../category-dialog/category-dialog';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CategoryDialogComponent],
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss']
})
export class CategoriesComponent implements OnInit {
  private readonly categoryService = inject(CategoriesService);
  private readonly fb = inject(FormBuilder);
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  private readonly categoryDialog = viewChild.required(CategoryDialogComponent);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly search = signal('');
  readonly toDelete = signal<Category | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    expenseType: ['PESSOAL' as ExpenseType, Validators.required]
  });

  readonly expenseTypes: { value: ExpenseType; label: string }[] = [
    { value: 'PESSOAL', label: 'Pessoal' },
    { value: 'EMPRESARIAL', label: 'Empresarial' }
  ];

  expenseLabel(value: ExpenseType): string {
    return this.expenseTypes.find((t) => t.value === value)?.label ?? value;
  }

  readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.categories()
      .filter((category) => category.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.categoryService.getAll().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar categorias:', err);
        this.error.set('Não foi possível carregar as categorias. Tente novamente.');
        this.loading.set(false);
      }
    });
  }

  askDelete(category: Category): void {
    this.toDelete.set(category);
    this.formError.set(null);
    this.deleteDialog().nativeElement.showModal();
  }

  cancelDelete(): void {
    this.deleteDialog().nativeElement.close();
    this.toDelete.set(null);
  }

  confirmDelete(): void {
    const category = this.toDelete();
    if (category?.id == null) {
      this.formError.set('Não foi possível identificar a categoria para exclusão.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.categoryService.delete(category.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelDelete();
        this.load();
      },
      error: (err) => {
        console.error('Erro ao excluir categoria:', err);
        this.saving.set(false);
        this.formError.set('Não foi possível excluir a categoria. Tente novamente.');
      }
    });
  }
    openForm(category?: Category): void {
      this.categoryDialog().open(category);
    }
}
