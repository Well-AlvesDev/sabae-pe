import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { attendanceCacheCount as savedAttendanceCount, ensureTbdaCache, getActiveModuleLabel, supabase, supabaseWithSessionStorage } from '../../supabase';
import { AlunoAttendanceDialogComponent, type AttendanceDay } from './aluno-attendance.dialog';
import { type StudentOperation } from './student-operation.dialog';

type AttendanceStatus = 'P' | 'FNJ' | 'FJ';

type StudentAbsence = {
  name: string;
  registration: string;
  room: string;
  unjustified: number;
  justified: number;
  total: number;
};

@Component({
  selector: 'app-alunos',
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatListModule, MatProgressSpinnerModule, MatSelectModule, RouterLink, RouterLinkActive],
  templateUrl: './alunos.html',
  styleUrl: './alunos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunosComponent implements OnInit, OnDestroy {
  public readonly schoolName = getActiveModuleLabel();
  public readonly months = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];
  public readonly selectedMonth = signal(String(new Date().getMonth() + 1));
  public readonly selectedRoom = signal('all');
  public readonly rooms = signal<string[]>([]);
  public readonly students = signal<StudentAbsence[]>([]);
  public readonly isLoading = signal(true);
  public readonly hasError = signal(false);
  public readonly isMenuOpen = signal(false);
  public readonly currentPage = signal(1);
  public readonly pageSize = 12;
  public readonly totalPages = computed(() => Math.max(1, Math.ceil(this.students().length / this.pageSize)));
  public readonly paginatedStudents = computed(() => {
    const startIndex = (this.currentPage() - 1) * this.pageSize;
    return this.students().slice(startIndex, startIndex + this.pageSize);
  });
  public readonly userName = signal('usuário');
  public readonly userEmail = signal('Obtendo usuário...');
  public readonly avatarInitial = signal('U');
  public readonly isLoadingProfile = signal(true);
  public readonly savedAttendanceCount = savedAttendanceCount;

  private rows: Record<string, unknown>[] = [];
  private authSub1: { unsubscribe?: () => void } | undefined;
  private authSub2: { unsubscribe?: () => void } | undefined;
  private logoutDialogOpen = false;
  private readonly logoutDialogComponentPromise = import('../home/logout-confirm.dialog')
    .then(({ LogoutConfirmDialogComponent }) => LogoutConfirmDialogComponent);
  private readonly studentOperationDialogComponentPromise = import('./student-operation.dialog')
    .then(({ StudentOperationDialogComponent }) => StudentOperationDialogComponent);

  constructor(private readonly router: Router, private readonly dialog: MatDialog) {}

  public async ngOnInit(): Promise<void> {
    await this.loadProfile();
    try {
      this.rows = await ensureTbdaCache();
      this.rooms.set(Array.from(new Set(this.rows.map(row => this.getValue(row, 'TURMA')).filter(Boolean)))
        .sort((first, second) => first.localeCompare(second, 'pt-BR', { numeric: true })));
      this.updateStudents();
    } catch {
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  public setMonth(value: string): void {
    this.selectedMonth.set(value);
    this.currentPage.set(1);
    this.updateStudents();
  }

  public setRoom(value: string): void {
    this.selectedRoom.set(value);
    this.currentPage.set(1);
    this.updateStudents();
  }

  public goToPage(page: number): void {
    this.currentPage.set(Math.max(1, Math.min(page, this.totalPages())));
  }

  public previousPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  public nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  public openStudentDetails(student: StudentAbsence): void {
    const row = this.rows.find(candidate =>
      this.getValue(candidate, 'NOME') === student.name
      && this.getValue(candidate, 'TURMA') === student.room
      && this.getValue(candidate, 'MAT', 'MATRICULA', 'MATRÍCULA') === student.registration,
    );

    if (!row) {
      return;
    }

    const month = Number(this.selectedMonth());
    const days = this.buildAttendanceDays(row, month);
    this.dialog.open(AlunoAttendanceDialogComponent, {
      data: {
        name: student.name,
        room: student.room,
        registration: student.registration,
        monthLabel: this.monthLabel(),
        days,
        present: days.filter(day => day.status === 'P').length,
        unjustified: student.unjustified,
        justified: student.justified,
      },
      maxWidth: 'calc(100vw - 20px)',
      panelClass: 'student-attendance-dialog-panel',
    });
  }

  public toggleMenu(): void {
    this.isMenuOpen.update(isOpen => !isOpen);
  }

  public closeMenu(): void {
    this.isMenuOpen.set(false);
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
    if (this.logoutDialogOpen) {
      return;
    }

    this.logoutDialogOpen = true;
    try {
      const LogoutConfirmDialogComponent = await this.logoutDialogComponentPromise;
      const ref = this.dialog.open(LogoutConfirmDialogComponent, {
        disableClose: true,
        hasBackdrop: true,
        maxWidth: 'calc(100vw - 32px)',
        panelClass: 'legacy-logout-dialog',
      });
      const confirmed = await ref.afterClosed().toPromise();
      if (confirmed === true) {
        this.closeMenu();
      }
    } finally {
      this.logoutDialogOpen = false;
    }
  }

  public ngOnDestroy(): void {
    this.authSub1?.unsubscribe?.();
    this.authSub2?.unsubscribe?.();
  }

  public monthLabel(): string {
    return this.months.find(month => month.value === this.selectedMonth())?.label ?? 'mês selecionado';
  }

  private updateStudents(): void {
    const month = Number(this.selectedMonth());
    const room = this.selectedRoom();
    const students = this.rows
      .filter(row => this.getValue(row, 'STATUS').toLocaleUpperCase() !== 'TRANSFERIDO')
      .filter(row => room === 'all' || this.getValue(row, 'TURMA') === room)
      .map(row => this.toStudentAbsence(row, month))
      .filter(student => student.total > 2)
      .sort((first, second) => second.total - first.total || first.name.localeCompare(second.name, 'pt-BR'));

    this.students.set(students);
  }

  private toStudentAbsence(row: Record<string, unknown>, month: number): StudentAbsence {
    let unjustified = 0;
    let justified = 0;

    for (let day = 1; day <= 31; day += 1) {
      const value = String(row[String(day)] ?? '').toUpperCase();
      const matches = value.matchAll(new RegExp(`\\b(FNJ|FJ):${month}\\b`, 'g'));
      for (const match of matches) {
        const status = match[1] as AttendanceStatus;
        if (status === 'FNJ') {
          unjustified += 1;
        } else if (status === 'FJ') {
          justified += 1;
        }
      }
    }

    return {
      name: this.getValue(row, 'NOME') || 'Aluno sem nome',
      registration: this.getValue(row, 'MAT', 'MATRICULA', 'MATRÍCULA'),
      room: this.getValue(row, 'TURMA') || 'Turma não informada',
      unjustified,
      justified,
      total: unjustified,
    };
  }

  private buildAttendanceDays(row: Record<string, unknown>, month: number): AttendanceDay[] {
    const year = new Date().getFullYear();
    const dayCount = new Date(year, month, 0).getDate();
    const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    return Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0 || date.getDay() === 6) {
        return null;
      }

      const value = String(row[String(day)] ?? '').toUpperCase();
      const match = value.match(new RegExp(`\\b(P|FNJ|FJ):${month}\\b`));
      return {
        day,
        weekday: weekdays[date.getDay()],
        status: (match?.[1] as AttendanceDay['status']) || null,
      };
    }).filter((day): day is AttendanceDay => day !== null);
  }

  private getValue(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }

  private async loadProfile(): Promise<void> {
    try {
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);
      const user = localData?.user || sessionData?.user;
      if (user) {
        this.updateProfile(user);
      }

      const { data: localAuth } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub1 = localAuth?.subscription;

      const { data: sessionAuth } = supabaseWithSessionStorage.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          this.updateProfile(session.user);
        }
      });
      this.authSub2 = sessionAuth?.subscription;
    } catch {
      // Keep the fallback profile when authentication data is unavailable.
    } finally {
      this.isLoadingProfile.set(false);
    }
  }

  private updateProfile(user: { email?: string; user_metadata?: Record<string, unknown> }): void {
    const metadata = user.user_metadata ?? {};
    const name = String(metadata['full_name'] || metadata['name'] || user.email?.split('@')[0] || 'usuário');
    this.userName.set(name);
    this.userEmail.set(user.email || 'Obtendo usuário...');
    this.avatarInitial.set(name.trim().charAt(0).toUpperCase() || 'U');
  }
}
