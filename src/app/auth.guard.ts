import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { getActiveTable, supabase, supabaseWithSessionStorage } from './supabase';

let cachedModuleAccess: { accessToken: string; table: string; allowed: boolean } | null = null;
const pendingModuleAccess = new Map<string, Promise<boolean>>();

export function rememberModuleAccess(accessToken: string | undefined, table: string, allowed: boolean): void {
  if (!accessToken) {
    return;
  }

  cachedModuleAccess = { accessToken, table, allowed };
}

async function hasModuleAccess(
  client: typeof supabase,
  accessToken: string,
  table: string,
): Promise<boolean> {
  if (cachedModuleAccess?.accessToken === accessToken && cachedModuleAccess.table === table) {
    return cachedModuleAccess.allowed;
  }

  const cacheKey = `${accessToken}:${table}`;
  const pendingRequest = pendingModuleAccess.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const accessRequest = Promise.resolve(client.rpc('tem_acesso', { nome_tabela: table }))
    .then(({ data, error }) => {
      const allowed = !error && data === true;
      cachedModuleAccess = { accessToken, table, allowed };
      return allowed;
    })
    .finally(() => {
      pendingModuleAccess.delete(cacheKey);
    });
  pendingModuleAccess.set(cacheKey, accessRequest);

  return accessRequest;
}

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
    const session = localData?.session ?? sessionData?.session;
    const client = localData?.session ? supabase : supabaseWithSessionStorage;
    const allowed = session?.access_token
      ? await hasModuleAccess(client, session.access_token, accessTable)
      : false;

    if (!allowed) {
      return router.parseUrl(`/login?accessDenied=true&module=${encodeURIComponent(accessTable)}`);
    }

  }

  return true;
}
