import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { lockAttendanceCache, lockTbdaCache, supabase, supabaseWithSessionStorage } from './supabase';
import { SessionConflictDialogComponent, type SessionConflictAction } from './session-conflict.dialog';

@Injectable({ providedIn: 'root' })
export class SessionConflictService {
  private isDialogOpen = false;
  private hasObservedSession = false;
  private lastKnownEmail = '';
  private intentionalSignOut = false;

  constructor(private readonly router: Router, private readonly dialog: MatDialog) {
    this.watchAuthClient(supabase);
    this.watchAuthClient(supabaseWithSessionStorage);
    if (typeof window !== 'undefined') {
      window.addEventListener('sabae:session-rejected', this.handleSessionRejectedEvent);
    }
  }

  private readonly handleSessionRejectedEvent = (): void => {
    if (!this.isLoginRoute()) {
      void this.show(this.lastKnownEmail);
    }
  };

  private watchAuthClient(client: typeof supabase): void {
    client.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        this.hasObservedSession = true;
        this.lastKnownEmail = session.user.email ?? this.lastKnownEmail;
        return;
      }

      if (event === 'SIGNED_OUT' && this.hasObservedSession && !this.intentionalSignOut && !this.isLoginRoute()) {
        void this.show(this.lastKnownEmail);
      }
    });
  }

  private isLoginRoute(): boolean {
    return this.router.url === '/' || this.router.url.startsWith('/login');
  }

  markIntentionalLogout(): void {
    this.intentionalSignOut = true;
  }

  isSessionRejected(error: unknown): boolean {
    const candidate = error as { status?: number; code?: string; message?: string } | null;
    const message = candidate?.message?.toLowerCase() ?? '';
    return candidate?.status === 401
      || candidate?.status === 403
      || candidate?.code === 'refresh_token_not_found'
      || message.includes('invalid jwt')
      || message.includes('refresh token');
  }

  async show(email?: string): Promise<void> {
    if (this.isDialogOpen) {
      return;
    }

    this.isDialogOpen = true;
    this.intentionalSignOut = true;
    try {
      await Promise.allSettled([
        supabase.auth.signOut(),
        supabaseWithSessionStorage.auth.signOut(),
      ]);
      lockAttendanceCache();
      lockTbdaCache();

      const ref = this.dialog.open(SessionConflictDialogComponent, {
        disableClose: true,
        data: { email },
        maxWidth: 'calc(100vw - 32px)',
      });
      const action = await ref.afterClosed().toPromise();
      const target = action === ('reset' satisfies SessionConflictAction)
        ? `/login?reset=true${email ? `&email=${encodeURIComponent(email)}` : ''}`
        : '/login';
      await this.router.navigateByUrl(target);
    } finally {
      this.isDialogOpen = false;
      this.intentionalSignOut = false;
      this.hasObservedSession = false;
    }
  }
}