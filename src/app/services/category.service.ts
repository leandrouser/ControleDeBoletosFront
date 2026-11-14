import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseService } from './base.service';

export interface Category {
  id?: number;
  name: string;
  expenseType: ExpenseType;

}

export type ExpenseType = 'PESSOAL' | 'EMPRESARIAL';

@Injectable({
  providedIn: 'root'
})
export class CategoriesService extends BaseService {

  constructor(protected override http: HttpClient) {
    super(http);
  }

  getAll(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  getById(id: number): Observable<Category> {
    return this.http.get<Category>(`${this.apiUrl}/categories/${id}`);
  }

  create(category: Category): Observable<Category> {
    return this.http.post<Category>(`${this.apiUrl}/categories`, category);
  }

  update(id: number, category: Category): Observable<Category> {
    return this.http.put<Category>(`${this.apiUrl}/categories/${id}`, category);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/categories/${id}`);
  }
}
