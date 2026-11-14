import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

// Rotas públicas da API: não devem receber o token nem derrubar a sessão em caso de 401.
// Importante: um token vencido enviado a uma rota pública faz o backend responder 401.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isPublic = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));
  const token = auth.getToken();

  const authReq =
    token && !isPublic && req.url.startsWith(environment.apiUrl)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isPublic) {
        auth.expireSession();
      }
      return throwError(() => err);
    })
  );
};
