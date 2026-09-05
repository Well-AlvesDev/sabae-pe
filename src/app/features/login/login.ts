import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    NgIf,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnInit {
  hidePassword = true;
  greeting = this.getGreeting();
  loginData = {
    email: '',
    password: '',
    remember: true,
  };
  authError: string | null = null;
  isSubmitting = false;

  constructor(private cdr: ChangeDetectorRef, private router: Router) {}

  private getGreeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'bom dia! ☀️';
    }

    if (hour < 18) {
      return 'boa tarde! 🌤️';
    }

    return 'boa noite! 🌙';
  }

  async ngOnInit(): Promise<void> {
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

      this.router.navigateByUrl('/home');
    } catch (exception) {
      console.error('Unexpected login exception', exception);
      this.authError = 'Erro inesperado ao conectar. Tente novamente.';
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }
}
