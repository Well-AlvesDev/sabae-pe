import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, RouteReuseStrategy } from '@angular/router';

import { AppRouteReuseStrategy } from './app-route-reuse-strategy';
import { routes } from './app.routes';
import { refreshActiveModuleCaches, supabase, supabaseWithSessionStorage } from './supabase';

async function refreshCacheAfterPageLoad(): Promise<void> {
  const [{ data: localData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getSession(),
    supabaseWithSessionStorage.auth.getSession(),
  ]);

  if (!localData?.session && !sessionData?.session) {
    return;
  }

  await refreshActiveModuleCaches(!localData?.session && !!sessionData?.session);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideRouter(routes),
    provideAppInitializer(() => refreshCacheAfterPageLoad().catch(error => {
      console.error('[app] failed to refresh active module cache after page load', error);
    })),
    { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy },
  ],
};
