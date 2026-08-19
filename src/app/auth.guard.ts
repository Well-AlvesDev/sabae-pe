import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { ensureTbdaCache, supabase, supabaseWithSessionStorage } from './supabase';

export async function authGuard(): Promise<boolean | UrlTree> {
  const router = inject(Router);

  const [{ data: localData, error: localError }, { data: sessionData, error: sessionError }] =
    await Promise.all([
      supabase.auth.getSession(),
      supabaseWithSessionStorage.auth.getSession(),
    ]);

  const hasSession = localData?.session || sessionData?.session;
  const hasError = localError && !localData?.session && sessionError;

  if (!hasSession || hasError) {
    return router.parseUrl('/');
  }

  void ensureTbdaCache(!!sessionData?.session && !localData?.session).catch(error => {
    console.error('[authGuard] failed to ensure TBDA cache', error);
  });

  return true;
}
