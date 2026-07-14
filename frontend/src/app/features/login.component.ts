import { Component, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="login-wrap">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6B5DE8" stroke-width="1.7">
        <circle cx="12" cy="5.5" r="2.2"/>
        <path d="M12 8v11M12 19c-3.8 0-6.5-2.3-7-5l2.2 1M12 19c3.8 0 6.5-2.3 7-5l-2.2 1M8 10.5h8"/>
      </svg>
      <h1 style="font-size:30px;font-weight:600;letter-spacing:-.02em;margin-top:20px">Anchor</h1>
      <p style="color:var(--ink2);font-size:16px;margin-top:8px;max-width:280px;line-height:1.5">
        Capture requests before they're forgotten. Make time visible.
      </p>
      <button class="gbtn" (click)="signIn()">
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.7-.2-3.3-.5-4.9H24v9.3h12.7c-.6 3-2.3 5.6-4.8 7.3l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
          <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/>
          <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.5-5.8c-2 1.4-4.7 2.2-7.8 2.2-6.3 0-11.7-3.9-13.6-9.5l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
        Continue with Google
      </button>
      <p style="color:var(--ink3);font-size:13px;margin-top:22px;max-width:280px;line-height:1.5">
        One account, every device. Your tasks live on your own server and nowhere else.
      </p>
    </div>
  `
})
export class LoginComponent {
  private supabase = inject(SupabaseService);

  signIn(): void {
    void this.supabase.signInWithGoogle();
  }
}
