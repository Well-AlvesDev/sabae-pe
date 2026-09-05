import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import type { User } from '@supabase/supabase-js';
import * as XLSX from 'xlsx-js-style';
import {
  ensureTbdaCache,
  getAttendanceCache,
  getTbdaClassrooms,
  normalizeAttendanceMonth,
  supabase,
  supabaseWithSessionStorage,
} from '../../supabase';

type ReportRow = Record<string, string>;

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatProgressSpinnerModule, MatSelectModule, RouterLink],
  templateUrl: './relatorios.html',
  styleUrls: ['./relatorios.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelatoriosComponent implements OnInit, OnDestroy {
  public readonly months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  public readonly shifts = ['Manhã', 'Tarde', 'Noite'];
  public readonly days = Array.from({ length: 31 }, (_, index) => String(index + 1));
  public selectedMonth = '';
  public selectedShift = '';
  public selectedRoom = '';
  public registrations = '';
  public rooms: string[] = [];
  public isMenuOpen = false;
  public isLoadingProfile = true;
  public isLoadingAttendanceData = true;
  public isGeneratingReport = false;
  public userEmail = 'Obtendo usuário...';
  public avatarInitial = 'U';
  private tbdaRows: Record<string, unknown>[] = [];
  private authSub1: any;
  private authSub2: any;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

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

      const useSessionStorage = !!sessionSessionData?.session && !localSessionData?.session;
      const rows = await ensureTbdaCache(useSessionStorage);
      this.tbdaRows = rows;
      this.rooms = getTbdaClassrooms(rows);
    } catch (error) {
      console.error('[relatorios] failed to load report data', error);
    } finally {
      this.isLoadingProfile = false;
      this.isLoadingAttendanceData = false;
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

  public goToHome(): void {
    this.closeMenu();
    this.router.navigateByUrl('/home');
  }

  public generateReport(): void {
    if (!this.canGenerateReport) {
      return;
    }

    this.isGeneratingReport = true;

    try {
      const month = normalizeAttendanceMonth(this.selectedMonth);
      const requestedRegistrations = this.getRequestedRegistrations();
      const filteredRows = this.tbdaRows
        .filter(row => this.matchesShift(this.getRowText(row, 'TURNO'), this.selectedShift))
        .filter(row => !this.selectedRoom || this.matchesText(this.getRowText(row, 'TURMA'), this.selectedRoom))
        .filter(row => !requestedRegistrations.size || requestedRegistrations.has(this.normalizeText(this.getRowText(row, 'MAT', 'MATRICULA', 'MATRÍCULA', 'mat', 'matricula', 'matrícula'))))
        .map(row => this.createReportRow(row, month));
      const orderedRows = this.orderRowsByRegistration(filteredRows);
      const headers = ['MATRÍCULA', 'NOME', 'TURMA', 'TURNO', 'STATUS', ...this.days];
      const worksheet = XLSX.utils.aoa_to_sheet([
        headers,
        ...orderedRows.map(row => headers.map(header => row[header] ?? '')),
      ]);

      const borderStyle = {
        style: 'thin',
        color: { rgb: '000000' },
      };

      const getCellFontSize = (header: string): number => {
        if (header === 'MATRÍCULA') {
          return 11;
        }
        if (header === 'NOME') {
          return 14;
        }
        if (['TURMA', 'TURNO', 'STATUS', ...this.days].includes(header)) {
          return 9;
        }
        return 10;
      };

      const getCellHorizontalAlignment = (header: string): 'center' | 'left' => {
        if (header === 'NOME') {
          return 'left';
        }
        return 'center';
      };

      for (let rowIndex = 0; rowIndex <= orderedRows.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
          const header = headers[columnIndex];
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = worksheet[cellAddress];
          if (!cell) {
            continue;
          }

          const targetFontSize = rowIndex === 0 ? 10 : getCellFontSize(header);
          const targetAlignment = rowIndex === 0 ? 'center' : getCellHorizontalAlignment(header);

          cell.s = {
            ...(cell.s ?? {}),
            font: {
              ...(cell.s?.font ?? {}),
              name: 'Arial',
              sz: targetFontSize,
            },
            border: {
              top: borderStyle,
              right: borderStyle,
              bottom: borderStyle,
              left: borderStyle,
            },
            alignment: {
              ...(cell.s?.alignment ?? {}),
              horizontal: targetAlignment,
            },
          };
        }
      }

      worksheet['!cols'] = headers.map(header => {
        if (header === 'NOME') {
          return { wch: Math.round(40 * 1.35) };
        }
        if (this.days.includes(header)) {
          return { wch: 6 };
        }
        return { wch: 12 };
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Chamada');
      const roomSuffix = this.selectedRoom ? `-${this.slugify(this.selectedRoom)}` : '';
      XLSX.writeFile(workbook, `chamada-${this.slugify(this.selectedMonth)}-${this.slugify(this.selectedShift)}${roomSuffix}.xlsx`);
    } finally {
      this.isGeneratingReport = false;
    }
  }

  public get canGenerateReport(): boolean {
    return Boolean(this.selectedMonth && this.selectedShift && !this.isGeneratingReport);
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

  private createReportRow(row: Record<string, unknown>, month: string): ReportRow {
    const reportRow: ReportRow = {
      'MATRÍCULA': this.getRowText(row, 'MAT', 'MATRICULA', 'MATRÍCULA', 'mat', 'matricula', 'matrícula'),
      'NOME': this.getRowText(row, 'NOME'),
      'TURMA': this.getRowText(row, 'TURMA'),
      'TURNO': this.getRowText(row, 'TURNO'),
      'STATUS': this.getRowText(row, 'STATUS'),
    };

    for (const day of this.days) {
      reportRow[day] = this.getAttendanceStatus(row[day], month);
    }

    const localEntries = getAttendanceCache().filter(entry =>
      entry.room === reportRow['TURMA'] && entry.month === month,
    );
    for (const entry of localEntries) {
      const student = entry.students.find(candidate => candidate.registration === reportRow['MATRÍCULA']);
      if (student?.status) {
        reportRow[entry.day] = student.status;
      }
    }

    return reportRow;
  }

  private orderRowsByRegistration(rows: ReportRow[]): ReportRow[] {
    const requestedOrder = [...this.getRequestedRegistrations()];

    if (!requestedOrder.length) {
      return rows.sort((a, b) => a['TURMA'].localeCompare(b['TURMA'], 'pt-BR') || a['NOME'].localeCompare(b['NOME'], 'pt-BR'));
    }

    const order = new Map(requestedOrder.map((registration, index) => [registration, index]));
    return rows.sort((a, b) => {
      const positionA = order.get(this.normalizeText(a['MATRÍCULA'])) ?? Number.MAX_SAFE_INTEGER;
      const positionB = order.get(this.normalizeText(b['MATRÍCULA'])) ?? Number.MAX_SAFE_INTEGER;
      return positionA - positionB || a['NOME'].localeCompare(b['NOME'], 'pt-BR');
    });
  }

  private getRequestedRegistrations(): Set<string> {
    return new Set(
      this.registrations
        .split(/[\s,;]+/)
        .map(registration => this.normalizeText(registration))
        .filter(Boolean),
    );
  }

  private matchesShift(rowShift: string, selectedShift: string): boolean {
    const aliases: Record<string, string[]> = {
      manha: ['manha', 'm', 'matutino', 'matutina'],
      tarde: ['tarde', 't', 'vespertino', 'vespertina'],
      noite: ['noite', 'n', 'noturno', 'noturna'],
    };
    const selected = this.normalizeText(selectedShift);
    const value = this.normalizeText(rowShift);
    return value === selected || (aliases[selected] ?? [selected]).includes(value);
  }

  private matchesText(value: string, expected: string): boolean {
    return this.normalizeText(value) === this.normalizeText(expected);
  }

  private normalizeText(value: string): string {
    return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private getAttendanceStatus(value: unknown, month: string): string {
    const monthNumber = normalizeAttendanceMonth(month);
    const tokenPattern = new RegExp(`(?:^|,)\\s*(P|FNJ|FJ):${monthNumber}(?:\\s*,|$)`);
    return String(value ?? '').match(tokenPattern)?.[1] ?? '';
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

  private slugify(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
