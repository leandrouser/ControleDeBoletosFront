import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DashboardOverviewResponse,
  DashboardOverviewService,
  DashboardPeriod
} from '../../services/dashboard-overview.service';

type DashboardStatus =
  | DashboardOverviewResponse['proximosVencimentos'][number]['situacao']
  | 'vence-hoje'
  | 'vence-amanha';

const STATUS_LABEL: Record<DashboardStatus, string> = {
  pago: 'Pago',
  vencido: 'Vencido',
  'vence-hoje': 'Vence hoje',
  'vence-amanha': 'Vence amanhã',
  'a-vencer': 'A vencer'
};

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-dashboard-overview',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-overview.component.html',
  styleUrls: ['./dashboard-overview.component.scss']
})
export class DashboardOverviewComponent implements OnInit {
  private readonly overviewService = inject(DashboardOverviewService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly overview = signal<DashboardOverviewResponse | null>(null);
  readonly chartBuckets = signal<DashboardOverviewResponse['vencimentos']>([]);
  readonly chartLoading = signal(false);
  readonly chartError = signal<string | null>(null);
  readonly chartPeriod = signal<DashboardPeriod>('semana');
  readonly statusLabel = STATUS_LABEL;
  private chartRequestId = 0;

  readonly chartPeriods: { key: DashboardPeriod; label: string }[] = [
    { key: 'dia', label: 'Dia' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mês' }
  ];

  ngOnInit(): void {
    this.load();
  }

  setChartPeriod(period: DashboardPeriod): void {
    if (this.chartPeriod() === period) return;
    this.chartPeriod.set(period);
    this.loadChart(period);
  }

  retryChart(): void {
    this.loadChart(this.chartPeriod());
  }

  upcomingStatus(
    billet: DashboardOverviewResponse['proximosVencimentos'][number]
  ): DashboardStatus {
    if (billet.situacao !== 'a-vencer') return billet.situacao;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = billet.dataVencimento.slice(0, 10);
    if (dueDate === dateKey(today)) return 'vence-hoje';

    today.setDate(today.getDate() + 1);
    return dueDate === dateKey(today) ? 'vence-amanha' : 'a-vencer';
  }

  load(): void {
    this.chartRequestId++;
    this.loading.set(true);
    this.error.set(null);
    this.overviewService.getOverview(this.chartPeriod()).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.chartBuckets.set(overview.vencimentos);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        console.error('Erro ao carregar visão geral:', err);
        this.error.set('Não foi possível carregar a visão geral. Tente novamente.');
        this.loading.set(false);
      }
    });
  }

  private loadChart(period: DashboardPeriod): void {
    const requestId = ++this.chartRequestId;
    this.chartLoading.set(true);
    this.chartError.set(null);
    this.overviewService.getOverview(period).subscribe({
      next: (overview) => {
        if (requestId !== this.chartRequestId) return;
        this.chartBuckets.set(overview.vencimentos);
        this.chartLoading.set(false);
      },
      error: (err: unknown) => {
        if (requestId !== this.chartRequestId) return;
        console.error('Erro ao carregar gráfico de vencimentos:', err);
        this.chartError.set('Não foi possível atualizar o gráfico. Tente novamente.');
        this.chartLoading.set(false);
      }
    });
  }
}
