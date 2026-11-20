import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DashboardOverviewComponent } from './components/dashboard-overview/dashboard-overview.component';
import { BilletsComponent } from './components/billets/billets.component';
import { BeneficiariosComponent } from './components/beneficiarios/beneficiarios.component';
import { RelatoriosComponent } from './components/relatorios/relatorios.component';
import { authGuard } from './guards/auth.guard';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { CategoriesComponent } from './components/categories/categories.component';
import { UsersComponent } from './components/users/users.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'esqueci-senha', component: ForgotPasswordComponent },
  { path: 'redefinir-senha', component: ResetPasswordComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardOverviewComponent, pathMatch: 'full' },
      { path: 'billets', component: BilletsComponent },
      { path: 'beneficiarios', component: BeneficiariosComponent },
      { path: 'categories', component: CategoriesComponent },
      { path: 'relatorios', component: RelatoriosComponent },
      { path: 'usuarios', component: UsersComponent, canActivate: [authGuard] },
    ]
  },
  { path: '**', redirectTo: '/login' }
];
