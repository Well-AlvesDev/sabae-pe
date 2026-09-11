import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { getActiveTable, supabase, supabaseWithSessionStorage } from './supabase';

export async function authGuard(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
  const router = inject(Router);

  const [{ data: localData, error: localError }, { data: sessionData, error: sessionError }] =
    await Promise.all([
      supabase.auth.getSession(),
      supabaseWithSessionStorage.auth.getSession(),
    ]);

  const hasSession = localData?.session || sessionData?.session;
  const hasError = localError && !localData?.session && sessionError;

  if (!hasSession || hasError) {
    return router.parseUrl('/login');
  }

  if (route.data['requiresModuleAccess']) {
    const accessTable = getActiveTable();
    const client = localData?.session ? supabase : supabaseWithSessionStorage;
    const { data, error } = await client.rpc('tem_acesso', { nome_tabela: accessTable });

    if (error || data !== true) {
      return router.parseUrl(`/login?accessDenied=true&module=${encodeURIComponent(accessTable)}`);
    }
  }

  return true;
}
