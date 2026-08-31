import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import type { User } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { AttendanceProgressDialogComponent, AttendanceSendConfirmDialogComponent } from './attendance-send-confirmation.dialog';
import { ensureTbdaCache, getAttendanceCache, getTbdaClassrooms, removeAttendanceCacheEntry, saveAttendanceCacheEntry, sendAttendanceCacheToTbda, supabase, supabaseWithSessionStorage, updateAttendanceCacheEntry, type AttendanceCacheEntry } from '../../supabase';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  public selectedSeries = '';
  public selectedClass = '';
  public selectedMonth = this.months[this.today.getMonth()];
  public selectedDay = String(this.today.getDate());
  public rooms: string[] = [];
  public students: StudentAttendance[] = [];
  public savedAttendances: AttendanceCacheEntry[] = [];
  public isAttendanceModalOpen = false;
  public isEditingAttendance = false;
  public editingAttendanceSavedAt: number | null = null;
  public readonly days = Array.from({ length: 31 }, (_, index) => String(index + 1));
  public userName = 'usuário';
  public userEmail = 'Obtendo usuário...';
  public avatarInitial = 'U';
  public isLoadingProfile = true;
  public isLoadingAttendanceData = true;
  public isSendingSavedAttendances = false;
  private authSub1: any;
  private authSub2: any;
  private _logoutDialogOpen = false;

  constructor(private router: Router, private cdr: ChangeDetectorRef, private dialog: MatDialog) {}

  async ngOnInit(): Promise<void> {
    this.loadSavedAttendances();

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
      this.loadSavedAttendances();
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
    this.isEditingAttendance = false;
    this.editingAttendanceSavedAt = null;

    const selectedRoom = this.selectedRoom.trim();
    this.selectedSeries = this.parseSeries(selectedRoom);
    this.selectedClass = this.parseClassName(selectedRoom);
    this.students = this.tbdaRows
      .filter(row => this.getRowText(row, 'TURMA') === selectedRoom)
      .map(row => ({
        name: this.getRowText(row, 'NOME'),
        registration: this.getRowText(row, 'MAT', 'MATRICULA', 'MATRÍCULA', 'mat', 'matricula', 'matrícula'),
        status: 'P' as const,
      }))
      .filter(student => student.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.isAttendanceModalOpen = true;
  }

  public openAttendanceModalForEdit(attendance: AttendanceCacheEntry): void {
    this.isEditingAttendance = true;
    this.editingAttendanceSavedAt = attendance.savedAt;
    this.selectedRoom = String(attendance.room ?? '').trim();
    this.selectedSeries = String(attendance.series ?? '').trim() || this.parseSeries(this.selectedRoom);
    this.selectedClass = String(attendance.className ?? '').trim() || this.parseClassName(this.selectedRoom);
    this.selectedMonth = this.getMonthNameByNumber(String(attendance.month ?? '')) || this.months[Number(attendance.month) - 1] || this.selectedMonth;
    this.selectedDay = String(attendance.day ?? '').trim() || this.selectedDay;

    this.students = Array.isArray(attendance.students) && attendance.students.length
      ? attendance.students.map(student => ({
          name: String(student?.name ?? '').trim(),
          registration: String(student?.registration ?? '').trim(),
          status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ' ? student.status : 'P',
        }))
      : this.tbdaRows
          .filter(row => this.getRowText(row, 'TURMA') === this.selectedRoom)
          .map(row => ({
            name: this.getRowText(row, 'NOME'),
            registration: this.getRowText(row, 'MAT', 'MATRICULA', 'MATRÍCULA', 'mat', 'matricula', 'matrícula'),
            status: 'P' as const,
          }))
          .filter(student => student.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    this.isAttendanceModalOpen = true;
  }

  public closeAttendanceModal(): void {
    this.isAttendanceModalOpen = false;
    this.isEditingAttendance = false;
    this.editingAttendanceSavedAt = null;
  }

  public saveAttendance(): void {
    const attendanceEntry = {
      room: this.selectedRoom.trim(),
      series: this.selectedSeries || this.parseSeries(this.selectedRoom),
      className: this.selectedClass || this.parseClassName(this.selectedRoom),
      month: this.selectedMonth,
      day: this.selectedDay,
      savedAt: this.isEditingAttendance && this.editingAttendanceSavedAt ? this.editingAttendanceSavedAt : Date.now(),
      students: this.students.map(student => ({
        name: student.name,
        registration: student.registration,
        status: student.status,
      })),
    };

    this.savedAttendances = this.isEditingAttendance && this.editingAttendanceSavedAt
      ? updateAttendanceCacheEntry(attendanceEntry)
      : saveAttendanceCacheEntry(attendanceEntry);
    this.closeAttendanceModal();
  }

  public deleteSavedAttendance(savedAt: number): void {
    this.savedAttendances = removeAttendanceCacheEntry(savedAt);
  }

  public async confirmAndSendSavedAttendances(): Promise<void> {
    if (!this.savedAttendances.length) {
      return;
    }

    const ref = this.dialog.open(AttendanceSendConfirmDialogComponent, {
      disableClose: true,
      hasBackdrop: true,
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'attendance-send-confirm-dialog',
    });

    const confirmed = await ref.afterClosed().toPromise();
    if (confirmed !== true) {
      return;
    }

    const progressRef = this.dialog.open(AttendanceProgressDialogComponent, {
      disableClose: true,
      hasBackdrop: true,
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'attendance-progress-dialog',
    });

    this.isSendingSavedAttendances = true;
    this.cdr.markForCheck();

    const startedAt = Date.now();
    const progressInstance = progressRef.componentInstance as AttendanceProgressDialogComponent;
    progressInstance.applyUpdate({
      total: this.savedAttendances.length,
      processed: 0,
      sent: 0,
      failed: 0,
      currentEntryLabel: 'Preparando envio...',
      sentEntries: [],
      failedEntries: [],
    });
    this.cdr.detectChanges();

    try {
      const result = await sendAttendanceCacheToTbda((update) => {
        progressInstance.applyUpdate({
          total: update.total,
          processed: update.processed,
          sent: update.sent,
          failed: update.failed,
          currentEntryLabel: update.currentEntryLabel || 'Processando...',
          sentEntries: update.sentEntries,
          failedEntries: update.failedEntries,
        });
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      });

      if (result.failed > 0 && result.success === 0) {
        console.error('[chamada] failed to send attendance cache', result.errors);
      }

      this.loadSavedAttendances();
      this.cdr.markForCheck();

      const minimumVisibleMs = 1200;
      const elapsed = Date.now() - startedAt;
      const remainingDelay = minimumVisibleMs - elapsed;
      if (remainingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }
    } catch (error) {
      console.error('[chamada] failed to send attendance cache', error);
    } finally {
      this.isSendingSavedAttendances = false;
      this.cdr.markForCheck();
      try {
        progressRef.close();
      } catch {}
    }
  }

  public loadSavedAttendances(): void {
    this.savedAttendances = getAttendanceCache().map(entry => ({
      ...entry,
      room: String(entry.room ?? '').trim(),
      series: String(entry.series ?? '').trim() || this.parseSeries(String(entry.room ?? '')),
      className: String(entry.className ?? '').trim() || this.parseClassName(String(entry.room ?? '')),
      students: Array.isArray(entry.students) ? entry.students.map(student => ({
        name: String(student?.name ?? '').trim(),
        registration: String(student?.registration ?? '').trim(),
        status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ' ? student.status : null,
      })) : [],
    }));
  }

  public getSavedAttendanceSummary(entry: AttendanceCacheEntry): { total: number; present: number; fnj: number; fj: number } {
    return entry.students.reduce(
      (summary, student) => {
        if (student.status === 'P') summary.present += 1;
        if (student.status === 'FNJ') summary.fnj += 1;
        if (student.status === 'FJ') summary.fj += 1;
        return summary;
      },
      { total: entry.students.length, present: 0, fnj: 0, fj: 0 },
    );
  }

  public getSavedAttendanceTitle(entry: AttendanceCacheEntry): string {
    const series = entry.series || entry.room || '';
    const className = entry.className || '';
    return `${series}${className ? ` ${className}` : ''}`.trim().toUpperCase();
  }

  public formatSavedAttendanceDate(entry: AttendanceCacheEntry): string {
    const day = String(entry.day || '').padStart(2, '0');
    const month = this.getMonthNumber(entry.month);
    return `${day}/${month}`;
  }

  public getAttendanceModalDateLabel(): string {
    const day = String(this.selectedDay || '').padStart(2, '0');
    const month = this.getMonthNumber(this.selectedMonth);
    return `${day}/${month}`;
  }

  public getAttendanceModalTitle(): string {
    return this.isEditingAttendance ? 'Editar chamada' : 'Registrar Chamada';
  }

  public formatSavedAttendanceTimestamp(savedAt: number): string {
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) {
      return 'Data indisponível';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
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

  private parseSeries(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      return trimmed;
    }

    return parts.slice(0, -1).join(' ');
  }

  private parseClassName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      return '';
    }

    return parts.at(-1) ?? '';
  }

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

  private getMonthNumber(monthName: string): string {
    const monthIndex = this.months.findIndex(month => month.toLowerCase() === String(monthName ?? '').trim().toLowerCase());
    if (monthIndex === -1) {
      return String(monthName ?? '').trim() || '00';
    }

    return String(monthIndex + 1).padStart(2, '0');
  }

  private getMonthNameByNumber(value: string): string {
    const monthNumber = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return '';
    }

    return this.months[monthNumber - 1] ?? '';
  }
}
