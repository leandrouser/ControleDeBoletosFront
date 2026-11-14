import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, LoginRequest } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  credentials: LoginRequest = {
    login: '',
    password: ''
  };

  error = signal<string | null>(null);
  isSubmitting = signal(false);
  showPassword = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    route: ActivatedRoute
  ) {
    if (route.snapshot.queryParamMap.get('sessionExpired') === 'true') {
      this.error.set('Sua sessão expirou. Faça login novamente para continuar.');
    }
  }

  onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.error.set(null);
    this.isSubmitting.set(true);
    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        this.authService.saveSession(response);
        this.router.navigate(['/dashboard']);
        this.isSubmitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 0) {
          this.error.set('Não foi possível conectar ao servidor. Tente novamente em instantes.');
        } else if (error.status === 403) {
          this.error.set('O servidor bloqueou esta origem. Acesse por http://localhost:4200 ou solicite a liberação no backend.');
        } else if (error.status === 400 || error.status === 401) {
          this.error.set('Usuário ou senha inválidos.');
        } else {
          this.error.set('O servidor não conseguiu processar o login. Tente novamente mais tarde.');
        }
        console.error('Login failed:', error);
        this.isSubmitting.set(false);
      }
    });
  }
}