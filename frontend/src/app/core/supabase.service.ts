import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        // PKCE returns via ?code= in the query string, which does not collide with hash routing
        // on GitHub Pages the way implicit-flow #access_token fragments do.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    this.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.ready.set(true);
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  async signInWithGoogle(): Promise<void> {
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
  }

  /** Re-runs Google sign-in asking for Drive file access; used by backup. */
  async connectDrive(): Promise<void> {
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        scopes: 'https://www.googleapis.com/auth/drive.file',
        queryParams: { prompt: 'consent' }
      }
    });
  }

  /** Google's own access token; present only while the OAuth grant is fresh. */
  providerToken(): string | null {
    return this.session()?.provider_token ?? null;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async token(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
