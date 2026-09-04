import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import type { User } from '@supabase/supabase-js';
import {
  ensureTbdaCache,
  getTbdaClassrooms,
  supabase,
  supabaseWithSessionStorage,
} from '../../supabase';

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
  public selectedMonth = '';
  public selectedShift = '';
  public selectedRoom = '';
  public registrations = '';
  public rooms: string[] = [];
  public isMenuOpen = false;
  public isLoadingProfile = true;
  public isLoadingAttendanceData = true;
  public userEmail = 'Obtendo usuário...';
  public avatarInitial = 'U';
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
  }

  public get canGenerateReport(): boolean {
    return Boolean(this.selectedMonth && this.selectedShift);
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
