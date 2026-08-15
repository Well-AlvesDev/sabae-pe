import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  getTbdaCache,
  getTbdaLastSearchLabel,
  setTbdaLastSearchLabel,
  syncTbdaCache,
  supabase,
  supabaseWithSessionStorage,
} from '../../supabase';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, RouterLink, RouterLinkActive, MatDialogModule, MatProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrls: ['./home.scss', './home-classroom.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  public userName: string = 'usuário';
  public userEmail: string = 'example@gmail.com';
  public avatarInitial: string = 'U';
  public isLoadingProfile = true;
  public isLoadingAttendanceScore = true;
  public isMenuOpen = false;
  public drawerBackgroundUrl = '/lines.png';
  public averageScore: number = 0;
  public performanceLabel: string = 'Carregando...';
  public performanceClass: 'good' | 'warning' | 'danger' | 'neutral' = 'neutral';
  public lastSearchLabel = '';
  public isRefreshingAttendance = false;
  public attendanceSummary = {
    totalCount: 0,
    present: 0,
    fnj: 0,
    fj: 0,
    presentPct: 0,
    fnjPct: 0,
    fjPct: 0,
  };
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
  private _logoutDialogOpen = false;

  constructor(private router: Router, private cdr: ChangeDetectorRef, private ngZone: NgZone, private dialog: MatDialog) {}

  async ngOnInit(): Promise<void> {
    this.isLoadingProfile = true;
    this.isLoadingAttendanceScore = true;
    this.loadingStart = Date.now();
    this.lastSearchLabel = getTbdaLastSearchLabel();

    try {
      const cachedRows = getTbdaCache();
      console.debug('[home] cachedRows', { cachedRows });
      if (cachedRows && cachedRows.length) {
        this.averageScore = this.computeAttendanceScore(cachedRows);
        this.setPerformanceState(this.averageScore);
        console.debug('[home] loaded TBDA from cache before auth check', { averageScore: this.averageScore });
      }

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
          const cachedRows = getTbdaCache();
          console.debug('[home] cachedRows', { cachedRows });
          if (cachedRows && cachedRows.length) {
            this.averageScore = this.computeAttendanceScore(cachedRows);
            this.setPerformanceState(this.averageScore);
            console.debug('[home] loaded TBDA from cache', { averageScore: this.averageScore, cachedRows });
          } else {
            const useSessionStorage = !!sessionData?.user && !localData?.user;
            const rows = await syncTbdaCache(useSessionStorage);
            this.averageScore = this.computeAttendanceScore(rows);
            this.setPerformanceState(this.averageScore);
            this.lastSearchLabel = setTbdaLastSearchLabel();
            console.debug('[home] TBDA cache synced successfully', { averageScore: this.averageScore, rows });
          }
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
    const counts = this.extractAttendanceCounts(rows);
    this.updateAttendanceSummary(counts);
    this.classroomSummary = this.buildClassroomSummary(rows);

    const totalForScore = counts.present + counts.fnj;
    if (totalForScore === 0) {
      return 0;
    }

   const score = (counts.present / totalForScore) * 10;
    return Math.floor(score * 100) / 100;
  }

  private buildClassroomSummary(rows: Record<string, unknown>[]) {
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

        const tokens = String(value)
          .toUpperCase()
          .split(/[^A-Z0-9]+/)
          .filter(Boolean);

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
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  private getTurmaValue(row: Record<string, unknown>): string {
    const rawValue = row['TURMA'] ?? row['turma'] ?? 'Sem turma';
    const normalized = String(rawValue).trim();
    return normalized || 'Sem turma';
  }

  private extractAttendanceCounts(rows: Record<string, unknown>[]) {
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

          const tokens = String(value)
            .toUpperCase()
            .split(/[^A-Z0-9]+/)
            .filter(Boolean);

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
      try {
        localStorage.removeItem('sabae.tbda.cache');
      } catch {}

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

  async logout(): Promise<void> {
    if (this._logoutDialogOpen) {
      return;
    }

    this._logoutDialogOpen = true;
    try {
      const { LogoutConfirmDialogComponent } = await import('./logout-confirm.dialog');
      const ref = this.dialog.open(LogoutConfirmDialogComponent, {
        disableClose: true,
        hasBackdrop: true,
        width: '340px',
        panelClass: 'legacy-logout-dialog',
      });

      try {
        await ref.afterClosed().toPromise();
      } catch {}
    } finally {
      this._logoutDialogOpen = false;
    }
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
