import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap, tap } from 'rxjs';
import { BeneficiariosService } from '../../services/beneficiarios.service';

@Component({
  selector: 'app-beneficiarios',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './beneficiarios.component.html',
  styleUrls: ['./beneficiarios.component.scss']
})
export class BeneficiariosComponent implements OnInit {
  private readonly beneficiariosService = inject(BeneficiariosService);
  private readonly searchTerms = new Subject<string>();

  readonly beneficiarios = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');

  ngOnInit(): void {
    this.searchTerms.pipe(
      startWith(''),
      debounceTime(250),
      distinctUntilChanged(),
      tap(() => {
        this.loading.set(true);
        this.error.set(null);
      }),
      switchMap((termo) =>
        this.beneficiariosService.buscar(termo).pipe(
          catchError((err: unknown) => {
            console.error('Erro ao carregar beneficiários:', err);
            this.error.set('Não foi possível carregar os beneficiários. Tente novamente.');
            return of(null);
          })
        )
      )
    ).subscribe((beneficiarios) => {
      this.beneficiarios.set(beneficiarios ?? []);
      this.loading.set(false);
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.searchTerms.next(value.trim());
  }

  load(): void {
    this.searchTerms.next(this.search().trim());
  }
}
