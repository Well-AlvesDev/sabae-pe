import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout';
import { LoginComponent } from './features/login/login';
import { HomeComponent } from './features/home/home.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: LoginComponent },
      { path: 'home', component: HomeComponent, canActivate: [authGuard] },
      { path: '**', redirectTo: '' },
    ],
  },
];
