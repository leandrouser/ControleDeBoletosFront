import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  // Reaproveita o visual da tela de login
  styleUrls: ['../login/login.component.scss']
})
export class ForgotPasswordComponent {
  email = '';

  error = signal<string | null>(null);
  isSubmitting = signal(false);
  sent = signal(false);

  constructor(private authService: AuthService) {}

  onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.error.set(null);
    this.isSubmitting.set(true);

    this.authService.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        // A API responde igual exista o e-mail ou não
        this.sent.set(true);
        this.isSubmitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 0) {
          this.error.set('Não foi possível conectar ao servidor. Tente novamente em instantes.');
        } else if (error.status === 400) {
          this.error.set('Informe um e-mail válido.');
        } else {
          this.error.set('Não foi possível processar o pedido. Tente novamente mais tarde.');
        }
        this.isSubmitting.set(false);
      }
    });
  }
}
