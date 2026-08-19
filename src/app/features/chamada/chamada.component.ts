import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { User } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-chamada',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './chamada.html',
  styleUrls: ['./chamada.scss'],
})
export class ChamadaComponent implements OnInit, OnDestroy {
  public isMenuOpen = false;
  public userName = 'usuário';
  public userEmail = 'example@gmail.com';
  public avatarInitial = 'U';
  public isLoadingProfile = true;
  private authSub1: any;
  private authSub2: any;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    const loadingStart = Date.now();

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
    } catch {
      // Keep the fallback profile when authentication data is unavailable.
    } finally {
      const elapsed = Date.now() - loadingStart;
      if (elapsed < 1000) {
        await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed));
      }

      this.isLoadingProfile = false;
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

  public async logout(): Promise<void> {
    try {
      await Promise.all([supabase.auth.signOut(), supabaseWithSessionStorage.auth.signOut()]);
    } catch {
      // ignore
    }

    this.router.navigateByUrl('/login');
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

  private formatUserName(user: any): string {
    const metadata = user?.user_metadata || {};
    return metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'usuário';
  }

  private getAvatarInitial(name: string): string {
    return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }
}
