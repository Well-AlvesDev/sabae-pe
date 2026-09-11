import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
        <div class="reset-loading" *ngIf="isLoading; else resetContent" role="status" aria-live="polite">
          <mat-spinner diameter="36"></mat-spinner>
          <span>Carregando...</span>
        </div>
        <ng-template #resetContent>
          <ng-container *ngIf="isLinkExpired; else passwordFormContent">
            <mat-card-header>
              <h1 class="reset-title">Link expirado</h1>
              <mat-card-subtitle class="expired-message">Este link de redefinição de senha expirou. Solicite um novo link para continuar.</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content class="expired-actions">
              <button mat-raised-button color="primary" class="full-width submit-button" type="button"
                (click)="requestNewLink()">
                Solicitar novo link
              </button>
              <button mat-button class="full-width back-button" type="button" (click)="goToLogin()">
                Voltar para o login
              </button>
            </mat-card-content>
          </ng-container>
          <ng-template #passwordFormContent>
            <mat-card-header>
              <h1 class="reset-title">Redefinir senha</h1>
              <mat-card-subtitle>Escolha uma nova senha para <strong class="account-email">{{ accountEmail || 'sua conta.'
                  }}</strong>.</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form class="reset-form" (ngSubmit)="updatePassword()" #passwordForm="ngForm">
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
          </ng-template>
        </ng-template>
      </mat-card>
    </div>
  `,
  styles: [`
    .reset-shell { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 32px 16px 18px; }
    .reset-logo { display: block; width: 200px; height: auto; margin: 0 auto 16px; }
    .reset-card { width: min(420px, 100%); padding: 24px 20px; }
    .reset-loading { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
    .reset-card mat-card-header { display: flex !important; flex-direction: column !important; align-items: center; text-align: center; padding: 0 0 18px; }
    .reset-card mat-card-header > .reset-title { order: -1 !important; margin: 0 0 12px; font-size: 1.5rem; line-height: 1.25; }
    .reset-card mat-card-header > mat-card-subtitle { order: 0 !important; }
    .expired-message { color: #b3261e; }
    .account-email { color: #0f4d91; font-weight: 700; }
    .reset-form { display: grid; gap: 14px; }
    .expired-actions { display: grid; gap: 8px; }
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
  isLoading = true;
  isSubmitting = false;
  isLinkExpired = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router,
    private activatedRoute: ActivatedRoute,
  ) {}

  private get isDevelopmentRoute(): boolean {
    return this.activatedRoute.snapshot.data['developmentOnly'] === true;
  }

  private get isExpiredDevelopmentRoute(): boolean {
    return this.activatedRoute.snapshot.data['expiredLink'] === true;
  }

  async ngOnInit(): Promise<void> {
    try {
      if (this.isExpiredDevelopmentRoute) {
        this.isLinkExpired = true;
        return;
      }

      if (this.isDevelopmentRoute) {
        this.accountEmail = 'usuario@desenvolvimento.local';
        return;
      }

      if (this.hasExpiredResetErrorInUrl()) {
        this.isLinkExpired = true;
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user?.email) {
        if (this.isExpiredResetError(error)) {
          this.isLinkExpired = true;
        } else {
          this.errorMessage = 'Não foi possível identificar a conta. Solicite um novo link de redefinição.';
        }
        return;
      }

      this.accountEmail = data.user.email;
    } catch (exception) {
      console.error('Unexpected password reset initialization exception', exception);
      this.errorMessage = 'Não foi possível carregar os dados da conta. Solicite um novo link de redefinição.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  requestNewLink(): void {
    this.router.navigate(['/login'], {
      queryParams: {
        reset: 'true',
        email: this.accountEmail || null,
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }

  private hasExpiredResetErrorInUrl(): boolean {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return this.isExpiredResetErrorCode(queryParams.get('error_code') ?? queryParams.get('error'))
      || this.isExpiredResetErrorCode(hashParams.get('error_code') ?? hashParams.get('error'));
  }

  private isExpiredResetError(error: { code?: string; message?: string } | null): boolean {
    return this.isExpiredResetErrorCode(error?.code) || error?.message?.toLowerCase().includes('expired') === true;
  }

  private isExpiredResetErrorCode(value: string | null | undefined): boolean {
    return value?.toLowerCase() === 'otp_expired';
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
      if (!this.isDevelopmentRoute) {
        setTimeout(() => this.router.navigateByUrl('/login'), 1200);
      } else {
        this.successMessage = 'Senha atualizada com sucesso.';
      }
    } catch (exception) {
      console.error('Unexpected password update exception', exception);
      this.errorMessage = 'Erro inesperado ao atualizar a senha. Tente novamente.';
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}