import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/login/reset-password').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    canActivate: [authGuard],
    data: { reuse: true, requiresModuleAccess: true },
  },
  {
    path: 'chamada',
    loadComponent: () => import('./features/chamada/chamada.component').then(m => m.ChamadaComponent),
    canActivate: [authGuard],
    data: { reuse: true, requiresModuleAccess: true },
  },
  {
    path: 'planilhas',
    loadComponent: () => import('./features/planilhas/planilhas.component').then(m => m.PlanilhasComponent),
    canActivate: [authGuard],
    data: { reuse: true, requiresModuleAccess: true },
  },
  {
    path: 'alunos',
    loadComponent: () => import('./features/alunos/alunos.component').then(m => m.AlunosComponent),
    canActivate: [authGuard],
    data: { reuse: true, requiresModuleAccess: true },
  },
  { path: '**', redirectTo: 'login' },
];
