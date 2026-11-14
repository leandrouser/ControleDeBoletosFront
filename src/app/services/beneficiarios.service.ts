import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from './base.service';

@Injectable({
  providedIn: 'root'
})
export class BeneficiariosService extends BaseService {
  constructor(protected override http: HttpClient) {
    super(http);
  }

  buscar(termo: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/beneficiarios/busca`, {
      params: new HttpParams().set('q', termo)
    });
  }
}
