import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isLogin = req.url.includes('/auth/login');
  const token = auth.getToken();

  const authReq =
    token && !isLogin && req.url.startsWith(environment.apiUrl)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isLogin) {
        auth.expireSession();
      }
      return throwError(() => err);
    })
  );
};
