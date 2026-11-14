import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  // Reaproveita o visual da tela de login
  styleUrls: ['../login/login.component.scss']
})
export class ResetPasswordComponent {
  token: string | null;
  newPassword = '';
  confirmPassword = '';

  error = signal<string | null>(null);
  isSubmitting = signal(false);
  done = signal(false);
  showPassword = signal(false);

  constructor(private authService: AuthService, route: ActivatedRoute) {
    this.token = route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.error.set('Link inválido. Solicite uma nova recuperação de senha.');
    }
  }

  get passwordsMatch(): boolean {
    return this.newPassword === this.confirmPassword;
  }

  get passwordValid(): boolean {
    return this.newPassword.length >= 8 && this.newPassword.length <= 72;
  }

  onSubmit(): void {
    if (this.isSubmitting() || !this.token) {
      return;
    }
    if (!this.passwordValid) {
      this.error.set('A senha deve ter entre 8 e 72 caracteres.');
      return;
    }
    if (!this.passwordsMatch) {
      this.error.set('As senhas não conferem.');
      return;
    }

    this.error.set(null);
    this.isSubmitting.set(true);

    this.authService.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.done.set(true);
        this.isSubmitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 0) {
          this.error.set('Não foi possível conectar ao servidor. Tente novamente em instantes.');
        } else if (error.status === 400) {
          this.error.set('Este link é inválido ou expirou. Solicite uma nova recuperação de senha.');
        } else {
          this.error.set('Não foi possível redefinir a senha. Tente novamente mais tarde.');
        }
        this.isSubmitting.set(false);
      }
    });
  }
}
