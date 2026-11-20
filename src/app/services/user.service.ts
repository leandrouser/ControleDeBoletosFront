import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type UserRole = 'ADMIN' | 'USER';
export type UserStatusFilter = 'all' | 'active' | 'inactive';

export interface ManagedUser {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  role: UserRole;
  active: boolean;
}

export interface UserPage {
  items: ManagedUser[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface UserListQuery {
  search: string;
  status: UserStatusFilter;
  page: number;
  size: number;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
}

// Real backend shapes
interface BackendUser {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  role: UserRole;
  ativo?: boolean; // POST /auth/register does not return it (new users are always active)
}

interface BackendPage {
  content: BackendUser[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

const toManagedUser = (u: BackendUser): ManagedUser => ({
  id: u.id,
  name: u.nome,
  email: u.email,
  phone: u.telefone ?? '',
  role: u.role,
  active: u.ativo ?? true
});

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiUrl}/users`;
  private readonly registerUrl = `${environment.apiUrl}/auth/register`;

  list(query: UserListQuery): Observable<UserPage> {
    let params = new HttpParams().set('page', query.page).set('size', query.size);

    const term = query.search.trim();
    if (term) {
      params = params.set('search', term);
    }
    if (query.status !== 'all') {
      params = params.set('ativo', query.status === 'active');
    }

    return this.http.get<BackendPage>(this.usersUrl, { params }).pipe(
      map((r): UserPage => ({
        items: r.content.map(toManagedUser),
        page: r.page.number,
        size: r.page.size,
        totalElements: r.page.totalElements,
        totalPages: r.page.totalPages
      }))
    );
  }

  create(payload: CreateUserPayload): Observable<ManagedUser> {
    return this.http
      .post<BackendUser>(this.registerUrl, {
        nome: payload.name.trim(),
        email: payload.email.trim(),
        telefone: payload.phone.trim() || null,
        senha: payload.password,
        role: payload.role
      })
      .pipe(map(toManagedUser));
  }

  update(id: number, payload: UpdateUserPayload): Observable<ManagedUser> {
    return this.http
      .put<BackendUser>(`${this.usersUrl}/${id}`, {
        nome: payload.name.trim(),
        email: payload.email.trim(),
        telefone: payload.phone.trim() || null,
        role: payload.role
      })
      .pipe(map(toManagedUser));
  }

  setActive(id: number, active: boolean): Observable<ManagedUser> {
    return this.http
      .patch<BackendUser>(`${this.usersUrl}/${id}/status`, { ativo: active })
      .pipe(map(toManagedUser));
  }

  resetPassword(id: number, password: string): Observable<void> {
    return this.http.patch<void>(`${this.usersUrl}/${id}/password`, { novaSenha: password });
  }
}
