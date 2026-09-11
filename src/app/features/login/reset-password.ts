import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { supabase } from '../../supabase';

@Component({
  selector: 'app-reset-password',
  imports: [
    CommonModule,
    NgIf,
    NgOptimizedImage,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="reset-shell">
      <img class="reset-logo" ngSrc="sabae-max2.webp" width="200" height="67" priority alt="SABAE-PE Logo" />
      <mat-card class="reset-card">
        <mat-card-header>
          <mat-card-title>Redefinir senha</mat-card-title>
          <mat-card-subtitle>Escolha uma nova senha para sua conta.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form class="reset-form" (ngSubmit)="updatePassword()" #passwordForm="ngForm">
            <mat-form-field appearance="outline" class="full-width" hideRequiredMarker>
              <mat-label>Conta</mat-label>
              <input matInput type="email" name="accountEmail" [value]="accountEmail || 'Carregando...'"
                readonly autocomplete="username" />
              <mat-icon matSuffix>email</mat-icon>
              <mat-hint>Esta é a conta que terá a senha alterada.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width" hideRequiredMarker>
              <mat-label>Nova senha</mat-label>
              <input matInput [type]="hidePassword ? 'password' : 'text'" name="password"
                [(ngModel)]="password" required minlength="6" autocomplete="new-password" />
              <button mat-icon-button matSuffix type="button" (click)="hidePassword = !hidePassword"
                [attr.aria-label]="hidePassword ? 'Mostrar senha' : 'Ocultar senha'">
                <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width" hideRequiredMarker>
              <mat-label>Confirmar nova senha</mat-label>
              <input matInput type="password" name="confirmation" [(ngModel)]="confirmation" required
                autocomplete="new-password" />
            </mat-form-field>
            <button mat-raised-button color="primary" class="full-width submit-button" type="submit"
              [disabled]="isSubmitting || passwordForm.invalid">
              <span *ngIf="!isSubmitting">Salvar nova senha</span>
              <span class="button-content" *ngIf="isSubmitting">
                <mat-spinner diameter="20" strokeWidth="2"></mat-spinner>
                Salvando...
              </span>
            </button>
            <div class="auth-success" *ngIf="successMessage" role="status">{{ successMessage }}</div>
            <div class="auth-error" *ngIf="errorMessage" role="alert">{{ errorMessage }}</div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .reset-shell { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 32px 16px 18px; }
    .reset-logo { display: block; width: 200px; height: auto; margin: 0 auto 16px; }
    .reset-card { width: min(420px, 100%); padding: 24px 20px; }
    .reset-card mat-card-header { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 0 18px; }
    .reset-form { display: grid; gap: 14px; }
    .full-width { width: 100%; }
    .submit-button { min-height: 44px; }
    .button-content { display: inline-flex; align-items: center; gap: 8px; }
    .auth-success, .auth-error { margin-top: 6px; text-align: center; font-size: .875rem; }
    .auth-success { color: #267346; }
    .auth-error { color: #b3261e; }
  `],
})
export class ResetPasswordComponent implements OnInit {
  accountEmail = '';
  password = '';
  confirmation = '';
  hidePassword = true;
  isSubmitting = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  constructor(private cdr: ChangeDetectorRef, private router: Router) {}

  async ngOnInit(): Promise<void> {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      this.errorMessage = 'Não foi possível identificar a conta. Solicite um novo link de redefinição.';
      this.cdr.detectChanges();
      return;
    }

    this.accountEmail = data.user.email;
    this.cdr.detectChanges();
  }

  async updatePassword(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;

    if (this.password !== this.confirmation) {
      this.errorMessage = 'As senhas não conferem.';
      return;
    }

    this.isSubmitting = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: this.password });
      if (error) {
        this.errorMessage = 'Não foi possível atualizar a senha. Solicite um novo link.';
        return;
      }

      this.successMessage = 'Senha atualizada com sucesso. Redirecionando para o login...';
      setTimeout(() => this.router.navigateByUrl('/login'), 1200);
    } catch (exception) {
      console.error('Unexpected password update exception', exception);
      this.errorMessage = 'Erro inesperado ao atualizar a senha. Tente novamente.';
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}