import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login';
import { HomeComponent } from './features/home/home.component';
import { ChamadaComponent } from './features/chamada/chamada.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [authGuard],
    data: { reuse: true },
  },
  {
    path: 'chamada',
    component: ChamadaComponent,
    canActivate: [authGuard],
    data: { reuse: true },
  },
  { path: '**', redirectTo: 'login' },
];
