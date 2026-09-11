import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ACCESS_MODULES, setActiveTable, supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    NgIf,
    NgOptimizedImage,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnInit {
  readonly accessModules = ACCESS_MODULES;
  hidePassword = true;
  showForgotPassword = false;
  greeting = this.getGreeting();
  loginData = {
    email: '',
    password: '',
    accessModule: '',
    remember: true,
  };
  authError: string | null = null;
  resetMessage: string | null = null;
  isResetSubmitting = false;
  isSubmitting = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private router: Router,
    private activatedRoute: ActivatedRoute,
  ) {}

  private getGreeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'bom dia!';
    }

    if (hour < 18) {
      return 'boa tarde!';
    }

    return 'boa noite!';
  }

  async ngOnInit(): Promise<void> {
    const accessDenied = this.activatedRoute.snapshot.queryParamMap.get('accessDenied') === 'true';
    if (accessDenied) {
      this.authError = 'Este módulo de acesso não pertence a este usuário.';
      return;
    }

    if (this.activatedRoute.snapshot.queryParamMap.get('reset') === 'true') {
      this.showForgotPassword = true;
      this.loginData.email = this.activatedRoute.snapshot.queryParamMap.get('email') ?? '';
    }

    const [{ data: localData }, { data: sessionData }] = await Promise.all([
      supabase.auth.getSession(),
      supabaseWithSessionStorage.auth.getSession(),
    ]);

    const hasSession = localData?.session || sessionData?.session;

    if (hasSession) {
      this.router.navigateByUrl('/home');
    }
  }

  async submit(): Promise<void> {
    this.authError = null;

    if (!this.loginData.accessModule) {
      this.authError = 'Selecione o módulo de acesso para continuar.';
      return;
    }

    setActiveTable(this.loginData.accessModule);

    this.isSubmitting = true;

    const client = this.loginData.remember
      ? supabase
      : supabaseWithSessionStorage;

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: this.loginData.email,
        password: this.loginData.password,
      });

      console.debug('[login] signInWithPassword result', { data, error });

      if (error) {
        console.error('Supabase login error', error);
        const invalidCredentials =
          error.status === 400 ||
          error.message?.toLowerCase().includes('invalid') ||
          error.message?.toLowerCase().includes('incorrect');

        this.authError = invalidCredentials
          ? 'Credenciais inválidas. Verifique seu e-mail e senha.'
          : error.message || 'Erro ao fazer login. Verifique suas credenciais.';
        return;
      }

      // Ensure session is persisted before navigating to /home
      if (!data?.session) {
        const maxAttempts = 20;
        let found = false;
        for (let i = 0; i < maxAttempts; i++) {
          // eslint-disable-next-line no-await-in-loop
          const { data: sessionData } = await client.auth.getSession();
          console.debug('[login] poll session attempt', i, { sessionData });
          if (sessionData?.session) {
            found = true;
            break;
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!found) {
          // fallback: give a brief delay
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      const { data: hasAccess, error: accessError } = await client.rpc('tem_acesso', {
        nome_tabela: this.loginData.accessModule,
      });

      if (accessError || hasAccess !== true) {
        await client.auth.signOut();
        this.authError = 'Este módulo de acesso não pertence a este usuário.';
        return;
      }

      this.router.navigateByUrl('/home');
    } catch (exception) {
      console.error('Unexpected login exception', exception);
      this.authError = 'Erro inesperado ao conectar. Tente novamente.';
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  openForgotPassword(event: Event): void {
    event.preventDefault();
    this.authError = null;
    this.resetMessage = null;
    this.showForgotPassword = true;
  }

  closeForgotPassword(): void {
    this.authError = null;
    this.resetMessage = null;
    this.showForgotPassword = false;
  }

  async requestPasswordReset(): Promise<void> {
    this.authError = null;
    this.resetMessage = null;

    const email = this.loginData.email.trim();
    if (!email) {
      this.authError = 'Informe o e-mail cadastrado para continuar.';
      return;
    }

    this.isResetSubmitting = true;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Supabase password reset error', error);
        this.authError = 'Não foi possível enviar o link. Verifique o e-mail e tente novamente.';
        return;
      }

      this.resetMessage = 'Link enviado. Verifique a caixa de entrada e a pasta de spam.';
    } catch (exception) {
      console.error('Unexpected password reset exception', exception);
      this.authError = 'Erro inesperado ao enviar o link. Tente novamente.';
    } finally {
      this.isResetSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}
