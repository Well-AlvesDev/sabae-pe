import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseWithSessionStorage } from '../../supabase';

const RELATORIOS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw6oIY48yjGPDiPAAqWM3Sk1m26LN0rKVA5OcdyD6wVVgvNNuSb3959gDUkA3rtKMWN/exec';

const REPORT_MONTHS = [
  { value: 'Janeiro', label: 'Janeiro' },
  { value: 'Fevereiro', label: 'Fevereiro' },
  { value: 'Março', label: 'Março' },
  { value: 'Abril', label: 'Abril' },
  { value: 'Maio', label: 'Maio' },
  { value: 'Junho', label: 'Junho' },
  { value: 'Julho', label: 'Julho' },
  { value: 'Agosto', label: 'Agosto' },
  { value: 'Setembro', label: 'Setembro' },
  { value: 'Outubro', label: 'Outubro' },
  { value: 'Novembro', label: 'Novembro' },
  { value: 'Dezembro', label: 'Dezembro' },
] as const;

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './relatorios.html',
  styleUrls: ['./relatorios.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelatoriosComponent implements OnInit, OnDestroy {
  public isMenuOpen = false;
  public isLoadingProfile = true;
  public isSyncingReport = false;
  public reportStatus = '';
  public readonly reportMonths = REPORT_MONTHS;
  public selectedMonth = '';
  public userEmail = 'Obtendo usuário...';
  public avatarInitial = 'U';
  private authSub1: any;
  private authSub2: any;
  private _logoutDialogOpen = false;

  constructor(private router: Router, private cdr: ChangeDetectorRef, private dialog: MatDialog) {}

  async ngOnInit(): Promise<void> {
    try {
      const [{ data: localSessionData }, { data: sessionSessionData }] = await Promise.all([
        supabase.auth.getSession(),
        supabaseWithSessionStorage.auth.getSession(),
      ]);
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);
      const user: User | null = localData?.user || sessionData?.user || localSessionData?.session?.user || sessionSessionData?.session?.user || null;

      if (user) {
        this.userEmail = user.email || this.userEmail;
        const name = this.formatUserName(user);
        this.avatarInitial = name.charAt(0).toUpperCase() || 'U';
      }

    } catch (error) {
      console.error('[relatorios] failed to load profile', error);
    } finally {
      this.isLoadingProfile = false;
      this.cdr.detectChanges();
    }

    try {
      const { data } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub1 = data?.subscription;
    } catch {}

    try {
      const { data } = supabaseWithSessionStorage.auth.onAuthStateChange((_event: any, session: any) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub2 = data?.subscription;
    } catch {}
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  public closeMenu(): void {
    this.isMenuOpen = false;
  }

  public onMonthChange(event: Event): void {
    this.selectedMonth = (event.target as HTMLSelectElement).value;
  }

  public async enviar(): Promise<void> {
    if (this.isSyncingReport) {
      return;
    }

    this.isSyncingReport = true;
    this.reportStatus = 'Atualizando a planilha...';
    this.cdr.markForCheck();

    try {
      if (!RELATORIOS_SCRIPT_WEB_APP_URL.startsWith('https://script.google.com/macros/s/')) {
        throw new Error('Configure a URL do Web App em relatorios.component.ts.');
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
      let response: Response;

      try {
        response = await fetch(RELATORIOS_SCRIPT_WEB_APP_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'sincronizarChamadas', month: this.selectedMonth }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (response.type === 'opaque') {
        this.reportStatus = 'Solicitação enviada. A planilha está sendo atualizada.';
      } else {
        const result = await response.json() as { success?: boolean; message?: string };
        if (!response.ok || result.success !== true) {
          throw new Error(result.message || `O Web App retornou HTTP ${response.status}.`);
        }
        this.reportStatus = result.message || 'Planilha atualizada com sucesso.';
      }
    } catch (error) {
      console.error('[relatorios] failed to sync attendance data', error);
      this.reportStatus = error instanceof Error
        ? error.message
        : 'Não foi possível atualizar a planilha.';
    } finally {
      this.isSyncingReport = false;
      this.cdr.detectChanges();
    }
  }

  public goToHome(): void {
    this.closeMenu();
    this.router.navigateByUrl('/home');
  }

  public async logout(): Promise<void> {
    if (this._logoutDialogOpen) {
      return;
    }

    this._logoutDialogOpen = true;
    try {
      const { LogoutConfirmDialogComponent } = await import('../home/logout-confirm.dialog');
      const ref = this.dialog.open(LogoutConfirmDialogComponent, {
        disableClose: true,
        hasBackdrop: true,
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'legacy-logout-dialog',
      });

      try {
        const confirmed = await ref.afterClosed().toPromise();
        if (confirmed === true) {
          this.closeMenu();
        }
      } catch {}
    } finally {
      this._logoutDialogOpen = false;
    }
  }

  ngOnDestroy(): void {
    try { this.authSub1?.unsubscribe?.(); } catch {}
    try { this.authSub2?.unsubscribe?.(); } catch {}
  }

  private updateProfile(user: User): void {
    this.userEmail = user.email || this.userEmail;
    const name = this.formatUserName(user);
    this.avatarInitial = name.charAt(0).toUpperCase() || 'U';
    this.cdr.detectChanges();
  }

  private formatUserName(user: User): string {
    const metadata = user.user_metadata || {};
    return String(metadata['full_name'] || metadata['name'] || user.email?.split('@')[0] || 'usuário');
  }

}
