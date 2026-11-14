import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from './base.service';

export type BilletStatus = 'PENDING' | 'PAID';

export interface Billets {
  id?: number;
  barcode?: string | null;
  beneficiary: string;
  dueDate: string;
  amount: number;
  categoryId: number | null;
  status: BilletStatus;
  paymentDate?: string | null;
}

export interface BilletsSummary {
  todos: number;
  pendente: number;
  vencido: number;
  pago: number;
  openTotal: number;
}

export interface BilletsFilter {
  status?: BilletStatus;
  categoryId?: number;
  dueFrom?: string;
  dueTo?: string;
  dueToday?: boolean;
  overdue?: boolean;
  q?: string;
}

export interface BilletWeek {
  id: number;
  barcode: string | null;
  beneficiary: string;
  dueDate: string;
  amount: number;
  status: 'PENDING' | 'PAID';
  categoryId: number;
  categoryName: string;
  daysUntilDue: number;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class BilletsService extends BaseService {

  constructor(protected override http: HttpClient) {
    super(http);
  }

  getAll(
  filter: BilletsFilter = {},
  page = 0,
  size = 10
): Observable<Page<Billets>> {
  let params = new HttpParams()
    .set('page', page)
    .set('size', size);

  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }

  return this.http.get<Page<Billets>>(
    `${this.apiUrl}/billets`,
    { params }
  );
}

  getById(id: number): Observable<Billets> {
    return this.http.get<Billets>(`${this.apiUrl}/billets/${id}`);
  }

  getSummary(
    q?: string,
    categoryId?: number
  ): Observable<BilletsSummary> {
    let params = new HttpParams();

    if (q?.trim()) {
      params = params.set('q', q.trim());
    }

    if (categoryId != null) {
      params = params.set('categoryId', categoryId);
    }

    return this.http.get<BilletsSummary>(
      `${this.apiUrl}/billets/summary`,
      { params }
    );
  }

  create(billets: Billets): Observable<Billets> {
    return this.http.post<Billets>(`${this.apiUrl}/billets`, billets);
  }

  update(id: number, billets: Billets): Observable<Billets> {
    return this.http.put<Billets>(`${this.apiUrl}/billets/${id}`, billets);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/billets/${id}`);
  }

  /** Consulta o beneficiário pelo código de barras (44 dígitos). 204 chega como null. */
  findBeneficiary(barcode: string): Observable<{ beneficiary: string } | null> {
    return this.http.get<{ beneficiary: string } | null>(
      `${this.apiUrl}/billets/beneficiary`,
      { params: new HttpParams().set('barcode', barcode) }
    );
  }

  getDueThisWeek(page = 0, size = 20): Observable<Page<BilletWeek>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<BilletWeek>>(`${this.apiUrl}/billets/due-this-week`, { params });
  }
}
