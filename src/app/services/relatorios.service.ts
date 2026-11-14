import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from './base.service';

export interface Relatorio {
  totalBillets: number;
  valorTotal: number;
  billetsPorCategoria: {
    categoria: string;
    quantidade: number;
    valor: number;
  }[];
  billetsPorStatus: {
    status: string;
    quantidade: number;
    valor: number;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class RelatoriosService extends BaseService {

  constructor(protected override http: HttpClient) {
    super(http);
  }

  getRelatorio(): Observable<Relatorio> {
    return this.http.get<Relatorio>(`${this.apiUrl}/relatorios`);
  }
}
