import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    canActivate: [authGuard],
    data: { reuse: true },
  },
  {
    path: 'chamada',
    loadComponent: () => import('./features/chamada/chamada.component').then(m => m.ChamadaComponent),
    canActivate: [authGuard],
    data: { reuse: true },
  },
  { path: '**', redirectTo: 'login' },
];
