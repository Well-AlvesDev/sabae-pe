import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { take } from 'rxjs';
import type { StudentOperation } from '../../../features/alunos/student-operation.dialog';
import { LayoutRefreshService } from '../layout-refresh.service';
import {
  attendanceCacheCount as savedAttendanceCount,
  getActiveModuleLabel,
  getActiveStudentFunctionRules,
  hydrateStudentFunctionRulesFromIndexedDb,
  supabase,
  supabaseWithSessionStorage,
} from '../../../supabase';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatProgressSpinnerModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss'],
})
export class MainLayoutComponent implements OnInit {
  public readonly schoolName = getActiveModuleLabel();
  public readonly savedAttendanceCount = savedAttendanceCount;
  public readonly isMenuOpen = signal(false);
  public readonly isLoadingProfile = signal(true);
  public readonly userEmail = signal('Obtendo usuário...');
  public readonly avatarInitial = signal('U');
  public readonly userName = signal('usuário');
  private readonly studentOperationDialogComponentPromise = import('../../../features/alunos/student-operation.dialog')
    .then(({ StudentOperationDialogComponent }) => StudentOperationDialogComponent);
  private readonly logoutDialogComponentPromise = import('../../../features/home/logout-confirm.dialog')
    .then(({ LogoutConfirmDialogComponent }) => LogoutConfirmDialogComponent);

  constructor(
    private readonly router: Router,
    private readonly dialog: MatDialog,
    private readonly layoutRefresh: LayoutRefreshService,
  ) {}

  public async ngOnInit(): Promise<void> {
    await hydrateStudentFunctionRulesFromIndexedDb();

    try {
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);
      const user = localData?.user || sessionData?.user;
      if (user) {
        const name = this.formatUserName(user);
        this.userName.set(name);
        this.userEmail.set(user.email || 'Obtendo usuário...');
        this.avatarInitial.set(name.charAt(0).toUpperCase() || 'U');
      }
    } finally {
      this.isLoadingProfile.set(false);
    }
  }

  public getActiveFunctionCount(): number {
    return getActiveStudentFunctionRules().length;
  }

  public toggleMenu(): void {
    this.isMenuOpen.update(isOpen => !isOpen);
  }

  public closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  public onSidebarSubmenuToggle(event: Event): void {
    const current = event.currentTarget as HTMLDetailsElement | null;
    if (!current?.open || !current.parentElement) {
      return;
    }

    current.parentElement.querySelectorAll('details.drawer-submenu').forEach(detail => {
      if (detail !== current) {
        (detail as HTMLDetailsElement).open = false;
      }
    });
  }

  public async openStudentOperation(operation: StudentOperation): Promise<void> {
    this.closeMenu();
    const StudentOperationDialogComponent = await this.studentOperationDialogComponentPromise;
    const dialogRef = this.dialog.open(StudentOperationDialogComponent, {
      data: { operation },
      autoFocus: false,
      maxWidth: 'calc(100vw - 20px)',
    });
    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (result === true) {
        this.layoutRefresh.requestRefresh();
      }
    });
  }

  public async logout(): Promise<void> {
    this.closeMenu();
    const LogoutConfirmDialogComponent = await this.logoutDialogComponentPromise;
    this.dialog.open(LogoutConfirmDialogComponent, {
      disableClose: true,
      hasBackdrop: true,
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'legacy-logout-dialog',
    });
  }

  private formatUserName(user: { user_metadata?: Record<string, unknown>; email?: string }): string {
    const metadata = user.user_metadata ?? {};
    const rawName = metadata['full_name'] ?? metadata['name'] ?? metadata['nome'];
    const name = String(rawName ?? '').trim();
    if (name) {
      return name.split(/\s+/)[0];
    }

    return user.email?.split('@')[0] || 'usuário';
  }
}
