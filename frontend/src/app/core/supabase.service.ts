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
      // Google's token arrives only on the OAuth callback and is dropped on session
      // refresh; keep it for its real lifetime so Drive calls don't re-authorize hourly.
      if (session?.provider_token) {
        localStorage.setItem('anchor.gtoken', JSON.stringify({
          t: session.provider_token,
          e: Date.now() + 50 * 60_000
        }));
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
  }

  /**
   * Re-runs Google sign-in asking for Drive file access. Google shows the consent
   * screen only the first time; afterwards this is a silent redirect and back.
   */
  async connectDrive(): Promise<void> {
    const email = this.session()?.user?.email;
    await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        scopes: 'https://www.googleapis.com/auth/drive.file',
        queryParams: email ? { login_hint: email } : {}
      }
    });
  }

  /** Google's own access token: the live one, or the cached one while still valid. */
  providerToken(): string | null {
    const live = this.session()?.provider_token;
    if (live) return live;
    try {
      const cached = JSON.parse(localStorage.getItem('anchor.gtoken') ?? 'null');
      if (cached && cached.e > Date.now()) return cached.t as string;
    } catch {
      // Fall through.
    }
    return null;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async token(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
