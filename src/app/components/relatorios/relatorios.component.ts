import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import {
  RelatoriosService,
  Relatorio,
  ReportDateFilter,
  ReportPeriod
} from '../../services/relatorios.service';

const REPORT_PERIODS: ReportPeriod[] = ['dia', 'semana', 'mes'];
const PERIOD_LABELS: Record<ReportPeriod, string> = {
  dia: 'dia',
  semana: 'semana',
  mes: 'mês'
};

@Component({
  selector: 'app-relatorios',
  imports: [CommonModule],
  templateUrl: './relatorios.component.html',
  styleUrls: ['./relatorios.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelatoriosComponent implements OnInit {
  private readonly relatoriosService = inject(RelatoriosService);
  private lastLoadedFilters: ReportDateFilter | null = null;
  readonly relatorio = signal<Relatorio | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly filterError = signal<string | null>(null);
  readonly activeFilters = signal<ReportDateFilter>({});
  readonly period = signal<ReportPeriod>('dia');
  readonly periodLabel = computed(() => PERIOD_LABELS[this.period()]);
  readonly nextPeriodLabel = computed(() => {
    const index = REPORT_PERIODS.indexOf(this.period());
    return PERIOD_LABELS[REPORT_PERIODS[(index + 1) % REPORT_PERIODS.length]];
  });
  readonly periodTotal = computed(
    () => this.relatorio()?.totaisPorPeriodo[this.period()] ?? 0
  );

  ngOnInit(): void {
    this.loadRelatorio();
  }

  onDateFromChange(event: Event): void {
    this.dateFrom.set((event.target as HTMLInputElement).value);
  }

  onDateToChange(event: Event): void {
    this.dateTo.set((event.target as HTMLInputElement).value);
  }

  applyFilters(event: Event): void {
    event.preventDefault();

    const dueFrom = this.dateFrom() || undefined;
    const dueTo = this.dateTo() || undefined;
    if (dueFrom && dueTo && dueFrom > dueTo) {
      this.filterError.set('A data inicial deve ser anterior ou igual à data final.');
      return;
    }

    this.filterError.set(null);
    this.loadFilters({ dueFrom, dueTo });
  }

  clearFilters(): void {
    this.dateFrom.set('');
    this.dateTo.set('');
    this.filterError.set(null);
    this.loadFilters({});
  }

  cyclePeriod(): void {
    const index = REPORT_PERIODS.indexOf(this.period());
    this.period.set(REPORT_PERIODS[(index + 1) % REPORT_PERIODS.length]);
  }

  loadRelatorio(): void {
    const filters = this.activeFilters();
    this.loading.set(true);
    this.error.set(null);

    this.relatoriosService.getRelatorio(filters).subscribe({
      next: (data) => {
        this.relatorio.set(data);
        this.lastLoadedFilters = filters;
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('Erro ao carregar relatório:', error);
        this.error.set('Não foi possível carregar o relatório. Tente novamente.');
        this.loading.set(false);
      }
    });
  }

  private loadFilters(filters: ReportDateFilter): void {
    this.activeFilters.set(filters);
    if (this.lastLoadedFilters && this.sameFilters(filters, this.lastLoadedFilters)) {
      this.error.set(null);
      return;
    }
    this.loadRelatorio();
  }

  private sameFilters(a: ReportDateFilter, b: ReportDateFilter): boolean {
    return a.dueFrom === b.dueFrom && a.dueTo === b.dueTo;
  }
}