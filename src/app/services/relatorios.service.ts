import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, forkJoin, map, reduce } from 'rxjs';
import { Billets, BilletsService, Page } from './billets.service';
import { Category, CategoriesService } from './category.service';

type ReportStatus = 'Pendente' | 'Vencido' | 'Pago';
export type ReportPeriod = 'dia' | 'semana' | 'mes';

export interface ReportDateFilter {
  dueFrom?: string;
  dueTo?: string;
}

interface DateRange {
  start: string;
  end: string;
}

interface ReportTotals {
  quantidade: number;
  centavos: number;
}

interface ReportAggregation {
  totalBillets: number;
  valorTotalCentavos: number;
  totaisPorPeriodoCentavos: Record<ReportPeriod, number>;
  porCategoria: Map<number | null, ReportTotals>;
  porStatus: Record<ReportStatus, ReportTotals>;
}

export interface Relatorio {
  totalBillets: number;
  valorTotal: number;
  totaisPorPeriodo: Record<ReportPeriod, number>;
  billetsPorCategoria: {
    categoria: string;
    quantidade: number;
    valor: number;
  }[];
  billetsPorStatus: {
    status: ReportStatus;
    quantidade: number;
    valor: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  private readonly billetsService = inject(BilletsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly pageSize = 100;

  getRelatorio(filters: ReportDateFilter = {}): Observable<Relatorio> {
    return forkJoin({
      aggregation: this.getBilletsAggregation(filters),
      categories: this.categoriesService.getAll()
    }).pipe(
      map(({ aggregation, categories }) => this.createReport(aggregation, categories))
    );
  }

  private getBilletsAggregation(filters: ReportDateFilter): Observable<ReportAggregation> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = this.dateKey(today);
    const dateRanges = this.getPeriodDateRanges(today);

    return this.billetsService.getAll(filters, 0, this.pageSize).pipe(
      expand((page) =>
        page.last
          ? EMPTY
          : this.billetsService.getAll(filters, page.number + 1, this.pageSize)
      ),
      reduce(
        (aggregation, page) =>
          this.aggregatePage(aggregation, page, todayKey, dateRanges),
        this.createAggregation()
      )
    );
  }

  private createAggregation(): ReportAggregation {
    return {
      totalBillets: 0,
      valorTotalCentavos: 0,
      totaisPorPeriodoCentavos: {
        dia: 0,
        semana: 0,
        mes: 0
      },
      porCategoria: new Map(),
      porStatus: {
        Pendente: { quantidade: 0, centavos: 0 },
        Vencido: { quantidade: 0, centavos: 0 },
        Pago: { quantidade: 0, centavos: 0 }
      }
    };
  }

  private aggregatePage(
    aggregation: ReportAggregation,
    page: Page<Billets>,
    today: string,
    dateRanges: Record<ReportPeriod, DateRange>
  ): ReportAggregation {
    for (const billet of page.content) {
      const centavos = Math.round(billet.amount * 100);
      const dueDate = billet.dueDate.slice(0, 10);
      const validDueDate = !Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime());
      const isOverdue =
        billet.status === 'PENDING' &&
        validDueDate &&
        dueDate < today;
      const status: ReportStatus =
        billet.status === 'PAID' ? 'Pago' : isOverdue ? 'Vencido' : 'Pendente';

      aggregation.totalBillets += 1;
      aggregation.valorTotalCentavos += centavos;
      this.addToTotals(aggregation.porStatus[status], centavos);

      if (validDueDate) {
        for (const period of ['dia', 'semana', 'mes'] as const) {
          const range = dateRanges[period];
          if (dueDate >= range.start && dueDate <= range.end) {
            aggregation.totaisPorPeriodoCentavos[period] += centavos;
          }
        }
      }

      const categoryTotals = aggregation.porCategoria.get(billet.categoryId) ?? {
        quantidade: 0,
        centavos: 0
      };
      this.addToTotals(categoryTotals, centavos);
      aggregation.porCategoria.set(billet.categoryId, categoryTotals);
    }

    return aggregation;
  }

  private addToTotals(totals: ReportTotals, centavos: number): void {
    totals.quantidade += 1;
    totals.centavos += centavos;
  }

  private getPeriodDateRanges(today: Date): Record<ReportPeriod, DateRange> {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    return {
      dia: { start: this.dateKey(today), end: this.dateKey(today) },
      semana: { start: this.dateKey(weekStart), end: this.dateKey(weekEnd) },
      mes: { start: this.dateKey(monthStart), end: this.dateKey(monthEnd) }
    };
  }

  private dateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private createReport(
    aggregation: ReportAggregation,
    categories: Category[]
  ): Relatorio {
    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name])
    );

    const billetsPorCategoria = Array.from(aggregation.porCategoria.entries())
      .map(([categoryId, totals]) => ({
        categoria:
          categoryId == null
            ? 'Sem categoria'
            : categoryNames.get(categoryId) ?? `Categoria ${categoryId}`,
        quantidade: totals.quantidade,
        valor: totals.centavos / 100
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR'));

    const billetsPorStatus = (['Pendente', 'Vencido', 'Pago'] as const).map(
      (status) => ({
        status,
        quantidade: aggregation.porStatus[status].quantidade,
        valor: aggregation.porStatus[status].centavos / 100
      })
    );

    return {
      totalBillets: aggregation.totalBillets,
      valorTotal: aggregation.valorTotalCentavos / 100,
      totaisPorPeriodo: {
        dia: aggregation.totaisPorPeriodoCentavos.dia / 100,
        semana: aggregation.totaisPorPeriodoCentavos.semana / 100,
        mes: aggregation.totaisPorPeriodoCentavos.mes / 100
      },
      billetsPorCategoria,
      billetsPorStatus
    };
  }
}
