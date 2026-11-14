import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type DashboardPeriod = 'dia' | 'semana' | 'mes';
export type DashboardSituation = 'pago' | 'vencido' | 'a-vencer';

export interface DashboardOverviewResponse {
  cards: {
    valorEmAberto: number;
    quantidadeEmAberto: number;
    valorVencido: number;
    quantidadeVencidos: number;
    valorVencendoEmSeteDias: number;
    quantidadeVencendoEmSeteDias: number;
    valorPagoNoMes: number;
    quantidadePagosNoMes: number;
  };
  vencimentos: {
    chave: string;
    rotulo: string;
    rotuloPeriodo: string;
    valor: number;
    percentual: number;
  }[];
  categorias: {
    nome: string;
    valor: number;
    percentual: number;
  }[];
  proximosVencimentos: {
    id: number;
    codigoBarras: string | null;
    linhaDigitavel: string | null;
    beneficiario: string | null;
    categoriaNome: string;
    dataVencimento: string;
    valor: number;
    situacao: DashboardSituation;
  }[];
}

@Injectable({ providedIn: 'root' })
export class DashboardOverviewService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/billets/visao-geral`;

  getOverview(periodo: DashboardPeriod): Observable<DashboardOverviewResponse> {
    return this.http.get<DashboardOverviewResponse>(this.apiUrl, {
      params: new HttpParams().set('periodo', periodo)
    });
  }
}
