import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { type StudentOperation } from '../alunos/student-operation.dialog';
import {
  clearTbdaCache,
  ensureTbdaCache,
  getActiveModuleLabel,
  attendanceCacheCount as savedAttendanceCount,
  getTbdaLastSearchLabel,
  setTbdaLastSearchLabel,
  syncTbdaCache,
  supabase,
  supabaseWithSessionStorage,
} from '../../supabase';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, RouterLink, RouterLinkActive, MatDialogModule, MatProgressSpinnerModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss', './home-classroom.scss', './home-summary.scss', './home-monthly.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  public readonly schoolName = getActiveModuleLabel();
  public userName: string = 'usuário';
  public userEmail: string = 'Obtendo usuário...';
  public avatarInitial: string = 'U';
  public isLoadingProfile = true;
  public isLoadingAttendanceScore = true;
  public isMenuOpen = false;
  public drawerBackgroundUrl = '';
  public averageScore: number = 0;
  public performanceLabel: string = 'Carregando...';
  public performanceClass: 'good' | 'warning' | 'danger' | 'neutral' = 'neutral';
  public lastSearchLabel = '';
  public isRefreshingAttendance = false;
  public readonly savedAttendanceCount = savedAttendanceCount;
  public attendanceSummary = {
    totalCount: 0,
    present: 0,
    fnj: 0,
    fj: 0,
    presentPct: 0,
    fnjPct: 0,
    fjPct: 0,
  };
  public monthlyAttendanceSummary: Array<{ month: number; label: string; presentPct: number; total: number }> = [];
  public monthlyClassroomOptions: string[] = [];
  public selectedMonthlyClassroom = 'all';
  public selectedMonthlyIndex: number | null = null;
  public classroomMonthOptions: Array<{ value: string; label: string }> = [];
  public selectedClassroomMonth = String(new Date().getMonth() + 1);
  public selectedSummaryMonth = String(new Date().getMonth() + 1);
  private readonly monthLabels = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];
  private readonly fullMonthLabels = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  public classroomSummary: Array<{
    name: string;
    total: number;
    present: number;
    fnj: number;
    fj: number;
    presentPct: number;
    fnjPct: number;
    fjPct: number;
  }> = [];
  private readonly tbdaColumns = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
  private authSub1: any;
  private authSub2: any;
  private loadingStart = Date.now();
  private attendanceRows: Record<string, unknown>[] = [];
  private _logoutDialogOpen = false;
  private readonly logoutDialogComponentPromise = import('./logout-confirm.dialog')
    .then(({ LogoutConfirmDialogComponent }) => LogoutConfirmDialogComponent);
  private readonly studentOperationDialogComponentPromise = import('../alunos/student-operation.dialog')
    .then(({ StudentOperationDialogComponent }) => StudentOperationDialogComponent);

  constructor(private router: Router, private cdr: ChangeDetectorRef, private ngZone: NgZone, private dialog: MatDialog) {}

  async ngOnInit(): Promise<void> {
    this.isLoadingProfile = true;
    this.isLoadingAttendanceScore = true;
    this.loadingStart = Date.now();
    this.lastSearchLabel = getTbdaLastSearchLabel();

    try {
      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);

      console.debug('[home] getUser results', { localData, sessionData });

      let user = localData?.user || sessionData?.user;
      if (!user) {
        // fallback: try to parse stored auth tokens directly
        const tryParseStorage = (storage: Storage) => {
          for (const k of Object.keys(storage)) {
            try {
              const v = storage.getItem(k);
              if (!v) continue;
              const parsed = JSON.parse(v);
              if (parsed && parsed.user) return parsed.user;
              // sometimes wrapped under 'currentSession' or similar
              if (parsed && parsed.currentSession && parsed.currentSession.user) return parsed.currentSession.user;
            } catch (e) {
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
        console.debug('[home] resolved userName', this.userName);

        try {
          const useSessionStorage = !!sessionData?.user && !localData?.user;
          const rows = await ensureTbdaCache(useSessionStorage);
          this.averageScore = this.computeAttendanceScore(rows);
          this.setPerformanceState(this.averageScore);
          this.lastSearchLabel = getTbdaLastSearchLabel();
          console.debug('[home] TBDA cache ensured successfully', { averageScore: this.averageScore, rows });
        } catch (tbdaError) {
          console.error('[home] failed to sync TBDA cache', tbdaError);
          this.performanceLabel = 'Não foi possível carregar a frequência';
          this.performanceClass = 'neutral';
        }
      }
    } catch (err) {
      console.debug('[home] getUser error', err);
    } finally {
      const elapsed = Date.now() - this.loadingStart;
      if (elapsed < 1000) {
        await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed));
      }
      try {
        this.ngZone.run(() => {
          this.isLoadingProfile = false;
          this.isLoadingAttendanceScore = false;
        });
        this.cdr.detectChanges();
      } catch {}
      setTimeout(() => {
        try {
          this.ngZone.run(() => {});
        } catch {}
      }, 16);
    }

    // also listen for auth state changes so name updates if session is set after navigation
    try {
      const { data: d1 } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        console.debug('[home] supabase onAuthStateChange event', _event, { session });
        const user = session?.user;
        if (user) {
          this.userName = this.formatUserName(user);
          console.debug('[home] supabase updated userName', this.userName);
        }
      });
      this.authSub1 = d1?.subscription;
    } catch {}

    try {
      const { data: d2 } = supabaseWithSessionStorage.auth.onAuthStateChange((_event: any, session: any) => {
        console.debug('[home] supabaseWithSessionStorage onAuthStateChange event', _event, { session });
        const user = session?.user;
        if (user) {
          this.userName = this.formatUserName(user);
          console.debug('[home] supabaseWithSessionStorage updated userName', this.userName);
        }
      });
      this.authSub2 = d2?.subscription;
    } catch {}
  }

  public calcDashArray(score: number): string {
    const r = 15.5;
    const circumference = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(10, Number(score || 0)));
    const filled = (clamped / 10) * circumference;
    // return filled length then the remaining length so stroke-dasharray shows a partial arc
    return `${filled} ${circumference}`;
  }

  private computeAttendanceScore(rows: Record<string, unknown>[]): number {
    this.attendanceRows = rows;
    const counts = this.extractAttendanceCounts(rows);
    this.monthlyClassroomOptions = this.buildMonthlyClassroomOptions(rows);
    if (this.selectedMonthlyClassroom !== 'all' && !this.monthlyClassroomOptions.includes(this.selectedMonthlyClassroom)) {
      this.selectedMonthlyClassroom = 'all';
    }
    this.monthlyAttendanceSummary = this.buildMonthlyAttendanceSummary(rows, new Date().getMonth() + 1, this.selectedMonthlyClassroom);
    this.classroomMonthOptions = this.buildClassroomMonthOptions();
    if (this.selectedClassroomMonth !== 'all' && !this.classroomMonthOptions.some(option => option.value === this.selectedClassroomMonth)) {
      this.selectedClassroomMonth = 'all';
    }
    if (this.selectedSummaryMonth !== 'all' && !this.classroomMonthOptions.some(option => option.value === this.selectedSummaryMonth)) {
      this.selectedSummaryMonth = String(new Date().getMonth() + 1);
    }
    this.updateAttendanceSummary(this.extractAttendanceCounts(rows, this.selectedSummaryMonth));
    this.classroomSummary = this.buildClassroomSummary(rows, this.selectedClassroomMonth);

    const totalForScore = counts.present + counts.fnj;
    if (totalForScore === 0) {
      return 0;
    }

   const score = (counts.present / totalForScore) * 10;
    return Math.floor(score * 100) / 100;
  }

  private buildMonthlyAttendanceSummary(
    rows: Record<string, unknown>[],
    currentMonth = new Date().getMonth() + 1,
    classroom = 'all',
  ): Array<{ month: number; label: string; presentPct: number; total: number }> {
    const countsByMonth = Array.from({ length: currentMonth }, (_, index) => ({
      month: index + 1,
      present: 0,
      total: 0,
    }));

    for (const row of rows) {
      if (classroom !== 'all' && this.getTurmaValue(row) !== classroom) {
        continue;
      }

      const valuesToCheck: unknown[] = [];

      for (const column of this.tbdaColumns) {
        if (Object.prototype.hasOwnProperty.call(row, column)) {
          valuesToCheck.push(row[column]);
        }
      }

      if (!valuesToCheck.length) {
        valuesToCheck.push(...Object.values(row).slice(0, this.tbdaColumns.length));
      }

      for (const value of valuesToCheck) {
        for (const match of String(value ?? '').toUpperCase().matchAll(/\b(P|FNJ|FJ):(\d{1,2})\b/g)) {
          const month = Number(match[2]);
          const monthCounts = countsByMonth[month - 1];
          if (!monthCounts) {
            continue;
          }

          monthCounts.total += 1;
          if (match[1] === 'P') {
            monthCounts.present += 1;
          }
        }
      }
    }

    return countsByMonth.map(({ month, present, total }) => ({
      month,
      label: this.monthLabels[month - 1],
      presentPct: total ? Math.round((present / total) * 100) : 0,
      total,
    }));
  }

  private buildMonthlyClassroomOptions(rows: Record<string, unknown>[]): string[] {
    return Array.from(new Set(rows.map(row => this.getTurmaValue(row))))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  public setMonthlyClassroomFilter(classroom: string): void {
    this.selectedMonthlyClassroom = classroom || 'all';
    this.monthlyAttendanceSummary = this.buildMonthlyAttendanceSummary(
      this.attendanceRows,
      new Date().getMonth() + 1,
      this.selectedMonthlyClassroom,
    );
    this.selectedMonthlyIndex = null;
  }

  public setClassroomMonthFilter(month: string): void {
    this.selectedClassroomMonth = month || 'all';
    this.classroomSummary = this.buildClassroomSummary(this.attendanceRows, this.selectedClassroomMonth);
  }

  public setSummaryMonthFilter(month: string): void {
    this.selectedSummaryMonth = month || 'all';
    this.updateAttendanceSummary(this.extractAttendanceCounts(this.attendanceRows, this.selectedSummaryMonth));
  }

  private buildClassroomMonthOptions(): Array<{ value: string; label: string }> {
    const currentMonth = new Date().getMonth() + 1;
    return Array.from({ length: currentMonth }, (_, index) => ({
      value: String(index + 1),
      label: this.fullMonthLabels[index],
    }));
  }

  public getMonthlyChartX(index: number): number {
    const chartWidth = 538;
    const chartStart = 42;
    const lastIndex = this.monthlyAttendanceSummary.length - 1;
    return lastIndex > 0 ? chartStart + (index / lastIndex) * chartWidth : chartStart + chartWidth / 2;
  }

  public getMonthlyChartY(presentPct: number): number {
    return 178 - (presentPct / 100) * 145;
  }

  public getMonthlyTrend(index: number): 'up' | 'down' | 'same' {
    if (index <= 0) {
      return 'same';
    }

    const current = this.monthlyAttendanceSummary[index]?.presentPct ?? 0;
    const previous = this.monthlyAttendanceSummary[index - 1]?.presentPct ?? 0;
    if (current > previous) {
      return 'up';
    }

    return current < previous ? 'down' : 'same';
  }

  public hasMonthlyNoData(index: number): boolean {
    if (index <= 0) {
      return false;
    }

    return (this.monthlyAttendanceSummary[index]?.total ?? 0) === 0;
  }

  public hasMonthlyPointNoData(index: number): boolean {
    return (this.monthlyAttendanceSummary[index]?.total ?? 0) === 0;
  }

  public showMonthlyDetails(index: number): void {
    this.selectedMonthlyIndex = index;
  }

  public clearMonthlyDetails(): void {
    this.selectedMonthlyIndex = null;
  }

  public getMonthlyVariation(index: number): number | null {
    if (index <= 0) {
      return null;
    }

    return (this.monthlyAttendanceSummary[index]?.presentPct ?? 0)
      - (this.monthlyAttendanceSummary[index - 1]?.presentPct ?? 0);
  }

  public getMonthlyVariationLabel(index: number): string {
    const variation = this.getMonthlyVariation(index);
    if (variation === null) {
      return 'Sem comparação';
    }

    return `${variation > 0 ? '+' : ''}${variation}%`;
  }

  public getMonthlyFullLabel(index: number): string {
    return this.fullMonthLabels[this.monthlyAttendanceSummary[index]?.month - 1] ?? 'Mês';
  }

  private buildClassroomSummary(rows: Record<string, unknown>[], month = 'all') {
    const summaryByClassroom = new Map<string, { present: number; fnj: number; fj: number }>();

    for (const row of rows) {
      const turma = this.getTurmaValue(row);
      if (!summaryByClassroom.has(turma)) {
        summaryByClassroom.set(turma, { present: 0, fnj: 0, fj: 0 });
      }

      const counts = summaryByClassroom.get(turma)!;
      const valuesToCheck: unknown[] = [];

      for (const column of this.tbdaColumns) {
        if (Object.prototype.hasOwnProperty.call(row, column)) {
          valuesToCheck.push(row[column]);
        }
      }

      if (!valuesToCheck.length) {
        const allValues = Object.entries(row)
          .filter(([key]) => key !== 'TURMA' && key !== 'turma')
          .map(([, value]) => value);
        valuesToCheck.push(...allValues);
      }

      for (const value of valuesToCheck) {
        if (value === null || value === undefined) {
          continue;
        }

        const tokens = month === 'all'
          ? this.extractStatusTokens(value)
          : this.extractStatusTokensForMonth(value, Number(month));

        for (const token of tokens) {
          if (token === 'P') counts.present += 1;
          if (token === 'FNJ') counts.fnj += 1;
          if (token === 'FJ') counts.fj += 1;
        }
      }
    }

    return Array.from(summaryByClassroom.entries())
      .map(([name, counts]) => {
        const total = counts.present + counts.fnj + counts.fj;
        const presentPct = total ? Math.round((counts.present / total) * 100) : 0;
        const fnjPct = total ? Math.round((counts.fnj / total) * 100) : 0;
        const fjPct = total ? Math.round((counts.fj / total) * 100) : 0;

        return {
          name,
          total,
          present: counts.present,
          fnj: counts.fnj,
          fj: counts.fj,
          presentPct,
          fnjPct,
          fjPct,
        };
      })
      .sort((a, b) => {
        if (b.presentPct !== a.presentPct) {
          return b.presentPct - a.presentPct;
        }

        if (a.fnjPct !== b.fnjPct) {
          return a.fnjPct - b.fnjPct;
        }

        if (a.fjPct !== b.fjPct) {
          return a.fjPct - b.fjPct;
        }

        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  private getTurmaValue(row: Record<string, unknown>): string {
    const rawValue = row['TURMA'] ?? row['turma'] ?? 'Sem turma';
    const normalized = String(rawValue).trim();
    return normalized || 'Sem turma';
  }

  private extractAttendanceCounts(rows: Record<string, unknown>[], month = 'all') {
    return rows.reduce(
      (acc: { present: number; fnj: number; fj: number }, row) => {
        const valuesToCheck: unknown[] = [];

        for (const column of this.tbdaColumns) {
          if (Object.prototype.hasOwnProperty.call(row, column)) {
            valuesToCheck.push(row[column]);
          }
        }

        if (!valuesToCheck.length) {
          const allValues = Object.values(row).slice(0, this.tbdaColumns.length);
          valuesToCheck.push(...allValues);
        }

        for (const value of valuesToCheck) {
          if (value === null || value === undefined) {
            continue;
          }

          const tokens = month === 'all'
            ? this.extractStatusTokens(value)
            : this.extractStatusTokensForMonth(value, Number(month));

          for (const token of tokens) {
            if (token === 'P') {
              acc.present += 1;
            }
            if (token === 'FNJ') {
              acc.fnj += 1;
            }
            if (token === 'FJ') {
              acc.fj += 1;
            }
          }
        }

        return acc;
      },
      { present: 0, fnj: 0, fj: 0 },
    );
  }

  private extractStatusTokens(value: unknown): string[] {
    const text = String(value ?? '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) {
      return [];
    }

    const matches = text.match(/\b(P|FNJ|FJ):/g) ?? [];
    return matches.map(match => match.replace(':', '').trim());
  }

  private updateAttendanceSummary(counts: { present: number; fnj: number; fj: number }): void {
    const totalCount = counts.present + counts.fnj + counts.fj;
    const presentPct = totalCount ? Math.round((counts.present / totalCount) * 100) : 0;
    const fnjPct = totalCount ? Math.round((counts.fnj / totalCount) * 100) : 0;
    const fjPct = totalCount ? Math.round((counts.fj / totalCount) * 100) : 0;

    this.attendanceSummary = {
      totalCount,
      present: counts.present,
      fnj: counts.fnj,
      fj: counts.fj,
      presentPct,
      fnjPct,
      fjPct,
    };
  }

  private setPerformanceState(score: number): void {
    if (score >= 8) {
      this.performanceLabel = 'Bom desempenho';
      this.performanceClass = 'good';
      return;
    }

    if (score >= 7) {
      this.performanceLabel = 'Médio desempenho';
      this.performanceClass = 'warning';
      return;
    }

    this.performanceLabel = 'Baixo desempenho';
    this.performanceClass = 'danger';
  }

  public async refreshAttendanceData(): Promise<void> {
    this.isRefreshingAttendance = true;
    this.isLoadingAttendanceScore = true;
    try {
      clearTbdaCache();

      const [{ data: localData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabaseWithSessionStorage.auth.getUser(),
      ]);

      const useSessionStorage = !!sessionData?.user && !localData?.user;
      const rows = await syncTbdaCache(useSessionStorage);
      this.averageScore = this.computeAttendanceScore(rows);
      this.setPerformanceState(this.averageScore);
      this.lastSearchLabel = setTbdaLastSearchLabel();
    } catch (error) {
      console.error('[home] failed to refresh attendance data', error);
      this.performanceLabel = 'Não foi possível carregar a frequência';
      this.performanceClass = 'neutral';
    } finally {
      this.isRefreshingAttendance = false;
      this.isLoadingAttendanceScore = false;
      try {
        this.ngZone.run(() => {
          this.cdr.detectChanges();
        });
      } catch {}
    }
  }

  public formatNumber(value: number): string {
    return Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  private extractStatusTokensForMonth(value: unknown, month: number): string[] {
    const normalizedText = String(value ?? '').toUpperCase();
    const monthPattern = new RegExp(`\\b(P|FNJ|FJ):${month}\\b`, 'g');
    return Array.from(normalizedText.matchAll(monthPattern), match => match[1]);
  }

  public getSummaryDisplayValue(value: number, isLoading: boolean, suffix: string = ''): string {
    if (isLoading) {
      return 'Calculando...';
    }

    const formattedValue = this.formatNumber(value);
    return suffix ? `${formattedValue}${suffix}` : formattedValue;
  }

  public getClassroomStatusLabel(classroom: { presentPct: number; fnjPct: number; fjPct: number }): string {
    if (classroom.presentPct >= 84) return 'Ótimo';
    if (classroom.presentPct >= 80) return 'Bom';
    if (classroom.presentPct >= 76) return 'Regular';
    return 'Atenção';
  }

  public get attendancePieStyle(): Record<string, string> {
    const { presentPct, fnjPct, fjPct } = this.attendanceSummary;
    const total = presentPct + fnjPct + fjPct;
    if (!total) {
      return {
        'background-image': 'radial-gradient(circle at center, rgba(15, 77, 145, 0.08) 30%, transparent 31%), conic-gradient(#cbd5e1 0deg 360deg)',
      };
    }
    return {
      'background-image': `radial-gradient(circle at center, #ffffff 36%, transparent 37%), conic-gradient(#16a34a 0deg ${presentPct * 3.6}deg, #ea580c ${presentPct * 3.6}deg ${presentPct * 3.6 + fnjPct * 3.6}deg, #2563eb ${presentPct * 3.6 + fnjPct * 3.6}deg 360deg)`,
    };
  }

  public formatScore(value: number): string {
    return Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  public toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  public closeMenu(): void {
    this.isMenuOpen = false;
  }

  public goToChamada(): void {
    this.closeMenu();
    this.router.navigateByUrl('/chamada');
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

  async logout(): Promise<void> {
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

  /**
   * Calcula as classes de layout responsivo para um card baseado em sua posição
   * Implementa as regras:
   * - Mobile (2 cards/linha): ímpar ocupa 2 espaços
   * - Tablet (3 cards/linha): 2 na última linha ocupam 3; 1 na última linha + 1 da anterior
   * - Desktop (4 cards/linha): 1 na última linha + 1 da anterior; 2 na última linha + 1 da anterior
   */
  public getClassroomItemClasses(index: number, totalCards: number): Record<string, boolean> {
    const positionFromEnd = totalCards - index;
    
    // Calcular restos para determinar quantos cards ficam na última linha de cada breakpoint
    const remainderMobile = totalCards % 2; // 0 = par (normal), 1 = ímpar (último estica)
    const remainderTablet = totalCards % 3; // 0 = normal, 1 = 1 card solitário, 2 = 2 cards solitários
    const remainderDesktop = totalCards % 4; // 0 = normal, 1 = 1 card, 2 = 2 cards, 3 = 3 cards

    return {
      'classroom-item': true,
      
      // MOBILE: Se total é ímpar, o último card ocupa 2 colunas
      'mobile-last-odd': remainderMobile === 1 && positionFromEnd === 1,
      
      // TABLET: Se há 2 cards na última linha, ambos ocupam 3 colunas (flex: 1)
      'tablet-last-pair': remainderTablet === 2 && (positionFromEnd === 1 || positionFromEnd === 2),
      
      // TABLET: Se há 1 card na última linha, 1 desce da anterior (3 cards anteriores no grid)
      // Os 3 cards devem redistribuir horizontalmente, e os últimos 2 vão para a próxima linha
      'tablet-last-single-pull': remainderTablet === 1 && positionFromEnd === 3,
      'tablet-last-single-bottom': remainderTablet === 1 && (positionFromEnd === 1 || positionFromEnd === 2),
      
      // DESKTOP: Se há 1 card na última linha, 1 desce da anterior
      'desktop-last-single-pull': remainderDesktop === 1 && (positionFromEnd === 4 || positionFromEnd === 3 || positionFromEnd === 2),
      'desktop-last-single-bottom': remainderDesktop === 1 && positionFromEnd === 1,
      
      // DESKTOP: Se há 2 cards na última linha, 1 desce da anterior
      'desktop-last-pair-pull': remainderDesktop === 2 && (positionFromEnd === 3 || positionFromEnd === 2),
      'desktop-last-pair-bottom': remainderDesktop === 2 && positionFromEnd === 1,
      
      // DESKTOP: Se há 3 cards na última linha, todos se reajustam
      'desktop-last-triple': remainderDesktop === 3 && (positionFromEnd === 4 || positionFromEnd === 3 || positionFromEnd === 2 || positionFromEnd === 1),
    };
  }

  ngOnDestroy(): void {
    try { this.authSub1?.unsubscribe?.(); } catch {}
    try { this.authSub2?.unsubscribe?.(); } catch {}
  }

  private formatUserName(user: any): string {
    try {
      const meta: any = user.user_metadata || {};
      if (meta.full_name) return meta.full_name;
      if (meta.name) return meta.name;
      if (user.email) return String(user.email).split('@')[0];
    } catch (e) {
      // ignore
    }
    return 'usuário';
  }

  private getAvatarInitial(name: string): string {
    return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }
}
