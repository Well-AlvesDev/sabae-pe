import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { getTbdaCache, syncTbdaCache, supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, RouterLink, RouterLinkActive],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
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
  public attendanceSummary = {
    totalCount: 0,
    present: 0,
    fnj: 0,
    fj: 0,
    presentPct: 0,
    fnjPct: 0,
    fjPct: 0,
  };
  private readonly tbdaColumns = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
  private authSub1: any;
  private authSub2: any;
  private loadingStart = Date.now();

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    this.isLoadingProfile = true;
    this.isLoadingAttendanceScore = true;
    this.loadingStart = Date.now();

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
      this.isLoadingProfile = false;
      this.isLoadingAttendanceScore = false;
      try { this.cdr.detectChanges(); } catch {}
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

    const totalForScore = counts.present + counts.fnj;
    if (totalForScore === 0) {
      return 0;
    }

   const score = (counts.present / totalForScore) * 10;
    return Math.floor(score * 100) / 100;
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

  public formatNumber(value: number): string {
    return Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
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
    try {
      await Promise.all([
        supabase.auth.signOut(),
        supabaseWithSessionStorage.auth.signOut(),
      ]);
    } catch {}
    try {
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.removeItem('supabase.auth.token');
    } catch {}
    this.router.navigate(['/login']);
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
