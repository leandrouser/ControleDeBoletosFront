import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, map } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface LoginRequest {
  login: string; // e-mail, telefone ou nome
  password: string;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresIn: number; // segundos até expirar
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
}

// Formato real devolvido por POST /api/auth/login
interface BackendLoginResponse {
  token: string;
  tipo: string;
  expiraEm: string;
  usuario: {
    id: number;
    nome: string;
    email: string | null;
    telefone: string | null;
    role: 'ADMIN' | 'USER';
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private sessionExpiryHandled = false;
  private currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(this.getStoredUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<BackendLoginResponse>(`${this.apiUrl}/login`, {
        login: credentials.login,
        senha: credentials.password
      })
      .pipe(
        map((r): LoginResponse => ({
          token: r.token,
          tokenType: r.tipo,
          expiresIn: Math.max(0, Math.floor((Date.parse(r.expiraEm) - Date.now()) / 1000)),
          user: {
            id: r.usuario.id,
            name: r.usuario.nome,
            phone: r.usuario.telefone ?? '',
            email: r.usuario.email,
            role: r.usuario.role
          }
        }))
      );
  }
  
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, {
      token,
      novaSenha: newPassword
    });
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  expireSession(): void {
    this.clearSession();
    if (this.sessionExpiryHandled) return;

    this.sessionExpiryHandled = true;
    this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
  }

  private clearSession(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiresAt');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    const expiresAt = Number(localStorage.getItem('tokenExpiresAt'));
    return !expiresAt || Date.now() < expiresAt;
  }

  isAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'ADMIN';
  }

  saveSession(response: LoginResponse): void {
    this.sessionExpiryHandled = false;
    localStorage.setItem('token', response.token);
    localStorage.setItem('tokenExpiresAt', String(Date.now() + response.expiresIn * 1000));
    localStorage.setItem('currentUser', JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  private getStoredUser(): AuthenticatedUser | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthenticatedUser;
    } catch {
      localStorage.removeItem('currentUser');
      return null;
    }
  }


}
