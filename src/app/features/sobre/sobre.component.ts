import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { StudentOperation } from '../alunos/student-operation.dialog';
import { getActiveModuleLabel, supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, MatProgressSpinnerModule],
  templateUrl: './sobre.html',
  styleUrls: ['../home/home.scss', './sobre.scss'],
})
export class PerfilComponent implements OnInit {
  public readonly schoolName = getActiveModuleLabel();
  public readonly appVersion = '1.0.0';
  public userName = 'Obtendo usuário...';
  public userEmail = 'Obtendo e-mail...';
  public avatarInitial = 'U';
  public isMenuOpen = false;
  public isLoadingProfile = true;
  public isEditingDisplayName = false;
  public isSavingDisplayName = false;
  public displayNameInput = '';
  public displayNameError = '';
  public drawerBackgroundUrl = '';
  private loadingStart = Date.now();
  private _logoutDialogOpen = false;
  private readonly logoutDialogComponentPromise = import('../home/logout-confirm.dialog')
    .then(({ LogoutConfirmDialogComponent }) => LogoutConfirmDialogComponent);
  private readonly studentOperationDialogComponentPromise = import('../alunos/student-operation.dialog')
    .then(({ StudentOperationDialogComponent }) => StudentOperationDialogComponent);

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly dialog: MatDialog,
  ) {}

  public async ngOnInit(): Promise<void> {
    this.loadingStart = Date.now();

    try {
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);

      let user = localData?.user || sessionData?.user;

      if (!user) {
        const tryParseStorage = (storage: Storage) => {
          for (const key of Object.keys(storage)) {
            try {
              const value = storage.getItem(key);
              if (!value) continue;

              const parsed = JSON.parse(value);
              if (parsed && parsed.user) {
                return parsed.user;
              }

              if (parsed && parsed.currentSession && parsed.currentSession.user) {
                return parsed.currentSession.user;
              }
            } catch {
              // ignore parse errors
            }
          }

          return null;
        };

        user = tryParseStorage(localStorage) || tryParseStorage(sessionStorage) || undefined;
      }

      if (user) {
        this.userName = this.formatUserName(user);
        this.userEmail = user.email || this.userEmail;
        this.avatarInitial = this.getAvatarInitial(this.userName);
        this.displayNameInput = this.userName;
      }

    } catch {
      this.userEmail = 'Não foi possível carregar o perfil';
    } finally {
      const elapsed = Date.now() - this.loadingStart;
      if (elapsed < 1000) {
        await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed));
      }

      this.ngZone.run(() => {
        this.isLoadingProfile = false;
      });
      this.cdr.detectChanges();
    }
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  public closeMenu(): void {
    this.isMenuOpen = false;
  }

  public async openStudentOperation(operation: StudentOperation): Promise<void> {
    this.closeMenu();
    const StudentOperationDialogComponent = await this.studentOperationDialogComponentPromise;
    this.dialog.open(StudentOperationDialogComponent, {
      data: { operation },
      autoFocus: false,
      maxWidth: 'calc(100vw - 20px)',
    });
  }

  public async logout(): Promise<void> {
    if (this._logoutDialogOpen) {
      return;
    }

    this._logoutDialogOpen = true;
    try {
      const LogoutConfirmDialogComponent = await this.logoutDialogComponentPromise;
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

  public startEditingDisplayName(): void {
    this.displayNameError = '';
    this.displayNameInput = this.userName;
    this.isEditingDisplayName = true;
  }

  public cancelEditingDisplayName(): void {
    this.displayNameError = '';
    this.displayNameInput = this.userName;
    this.isEditingDisplayName = false;
  }

  public async saveDisplayName(): Promise<void> {
    const trimmedName = this.displayNameInput.trim();

    if (!trimmedName) {
      this.displayNameError = 'Informe um nome para continuar.';
      return;
    }

    this.isSavingDisplayName = true;
    this.displayNameError = '';
    this.cdr.detectChanges();

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: trimmedName },
      });

      if (error) {
        throw error;
      }

      const nextUser = data?.user;
      this.userName = this.formatUserName(nextUser ?? { email: this.userEmail, user_metadata: { full_name: trimmedName } });
      this.avatarInitial = this.getAvatarInitial(this.userName);
      this.displayNameInput = this.userName;
      this.isEditingDisplayName = false;
    } catch {
      this.displayNameError = 'Não foi possível atualizar o nome do usuário.';
    } finally {
      this.isSavingDisplayName = false;
      this.cdr.detectChanges();
    }
  }

  private formatUserName(user: any): string {
    try {
      const meta: any = user.user_metadata || {};
      if (meta.full_name) return meta.full_name;
      if (meta.name) return meta.name;
      if (user.email) return String(user.email).split('@')[0];
    } catch {
      // ignore
    }

    return 'usuário';
  }

  private getAvatarInitial(name: string): string {
    return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }
}
