import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, RouterLink, RouterLinkActive],
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent implements OnInit, OnDestroy {
  public userName: string = 'usuário';
  public avatarInitial: string = 'U';
  public isLoadingProfile = true;
  private authSub1: any;
  private authSub2: any;
  private loadingStart = Date.now();

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    this.isLoadingProfile = true;
    this.loadingStart = Date.now();

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
        this.avatarInitial = this.getAvatarInitial(this.userName);
        console.debug('[home] resolved userName', this.userName);
      }
    } catch (err) {
      console.debug('[home] getUser error', err);
    } finally {
      const elapsed = Date.now() - this.loadingStart;
      if (elapsed < 1000) {
        await new Promise<void>(resolve => setTimeout(resolve, 1000 - elapsed));
      }
      this.isLoadingProfile = false;
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
