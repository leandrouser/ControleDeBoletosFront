import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from './base.service';

export interface BeneficiariosPage {
  content: string[];
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
export class BeneficiariosService extends BaseService {
  constructor(protected override http: HttpClient) {
    super(http);
  }

  buscar(termo: string, page = 0, size = 10): Observable<BeneficiariosPage> {
    return this.http.get<BeneficiariosPage>(`${this.apiUrl}/beneficiarios/busca`, {
      params: new HttpParams()
        .set('q', termo)
        .set('page', page)
        .set('size', size)
    });
  }

  rename(currentName: string, newName: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/beneficiarios`, { currentName, newName });
  }

  archive(name: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/beneficiarios`, {
      params: new HttpParams().set('nome', name)
    });
  }
}
