import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import type { User } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { ensureTbdaCache, getTbdaClassrooms, supabase, supabaseWithSessionStorage } from '../../supabase';

type AttendanceStatus = 'P' | 'FNJ' | 'FJ' | null;

type StudentAttendance = {
  name: string;
  registration: string;
  status: AttendanceStatus;
};

@Component({
  selector: 'app-chamada',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatProgressSpinnerModule, MatSelectModule],
  templateUrl: './chamada.html',
  styleUrls: ['./chamada.scss'],
})
export class ChamadaComponent implements OnInit, OnDestroy {
  public isMenuOpen = false;
  private readonly today = new Date();
  public readonly months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  public selectedRoom = '';
  public selectedMonth = this.months[this.today.getMonth()];
  public selectedDay = String(this.today.getDate());
  public rooms: string[] = [];
  public students: StudentAttendance[] = [];
  public isAttendanceModalOpen = false;
  public readonly days = Array.from({ length: 31 }, (_, index) => String(index + 1));
  public userName = 'usuário';
  public userEmail = 'Obtendo usuário...';
  public avatarInitial = 'U';
  public isLoadingProfile = true;
  public isLoadingAttendanceData = true;
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

      const session = localSessionData?.session || sessionSessionData?.session;
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);

      let user: User | null = localData?.user || sessionData?.user || session?.user || null;
      if (!user) {
        const tryParseStorage = (storage: Storage) => {
          for (const key of Object.keys(storage)) {
            try {
              const value = storage.getItem(key);
              if (!value) continue;

              const parsed = JSON.parse(value) as {
                user?: unknown;
                currentSession?: { user?: unknown };
              };
              if (parsed.user) return parsed.user;
              if (parsed.currentSession?.user) return parsed.currentSession.user;
            } catch {}
          }
          return null;
        };

        user = (tryParseStorage(localStorage) || tryParseStorage(sessionStorage)) as User | null;
      }

      if (user) {
        this.updateProfile(user);
      }

      const rows = await ensureTbdaCache(!!sessionSessionData?.session && !localSessionData?.session);
      this.tbdaRows = rows;
      this.rooms = getTbdaClassrooms(rows);
    } catch {
      // Keep the fallback profile when authentication data is unavailable.
    } finally {
      this.isLoadingProfile = false;
      this.isLoadingAttendanceData = false;
      this.cdr.detectChanges();
    }

    try {
      const { data: d1 } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub1 = d1?.subscription;
    } catch {}

    try {
      const { data: d2 } = supabaseWithSessionStorage.auth.onAuthStateChange((_event: any, session: any) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub2 = d2?.subscription;
    } catch {}
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  public closeMenu(): void {
    this.isMenuOpen = false;
  }

  public goToHome(): void {
    this.closeMenu();
    this.router.navigateByUrl('/home');
  }

  public openAttendanceModal(): void {
    const selectedRoom = this.selectedRoom.trim();
    this.students = this.tbdaRows
      .filter(row => this.getRowText(row, 'TURMA') === selectedRoom)
      .map(row => ({
        name: this.getRowText(row, 'NOME'),
        registration: this.getRowText(row, 'MATRICULA', 'MATRÍCULA'),
        status: 'P' as const,
      }))
      .filter(student => student.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.isAttendanceModalOpen = true;
  }

  public closeAttendanceModal(): void {
    this.isAttendanceModalOpen = false;
  }

  public setAttendanceStatus(student: StudentAttendance, status: Exclude<AttendanceStatus, null>): void {
    student.status = status;
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

  private updateProfile(user: any): void {
    this.userName = this.formatUserName(user);
    this.userEmail = user.email || this.userEmail;
    this.avatarInitial = this.getAvatarInitial(this.userName);
    this.cdr.detectChanges();
  }

  private tbdaRows: Record<string, unknown>[] = [];

  private getRowText(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const value = row[key] ?? row[key.toLowerCase()];
      if (value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }

  private formatUserName(user: any): string {
    const metadata = user?.user_metadata || {};
    return metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'usuário';
  }

  private getAvatarInitial(name: string): string {
    return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }
}
