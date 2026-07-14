import { Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { SupabaseService } from './core/supabase.service';
import { StoreService } from './core/store.service';
import { LoginComponent } from './features/login.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginComponent],
  template: `
    @if (!supabase.ready()) {
      <div class="empty">Loading…</div>
    } @else if (!supabase.session()) {
      <app-login />
    } @else {
      @if (showChrome()) {
        <div class="syncdot">
          <span class="d" [class.off]="store.syncState() === 'offline'" [class.spin]="store.syncState() === 'syncing'"></span>
          {{ syncLabel() }}
        </div>
      }
      <router-outlet />
      @if (showChrome()) {
        <nav class="tabbar">
          <button class="tab" [class.on]="url().startsWith('/today') || url().startsWith('/task')" (click)="go('/today')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>
            Today
          </button>
          <button class="tab" [class.on]="url().startsWith('/breaks')" (click)="go('/breaks')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8z"/><path d="M16 9h1.6a2.4 2.4 0 0 1 0 4.8H16"/></svg>
            Breaks
          </button>
          <button class="tab" [class.on]="url().startsWith('/insights')" (click)="go('/insights')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V11M12 19V5M19 19v-8"/></svg>
            Insights
          </button>
          <button class="tab" [class.on]="url().startsWith('/settings')" (click)="go('/settings')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 19.4a7.6 7.6 0 0 1 14.4 0"/></svg>
            Profile
          </button>
        </nav>
      }
    }
  `
})
export class AppComponent {
  supabase = inject(SupabaseService);
  store = inject(StoreService);
  private router = inject(Router);

  url = signal('/today');
  showChrome = computed(() => !this.url().startsWith('/focus'));
  syncLabel = computed(() => {
    const s = this.store.syncState();
    return s === 'offline' ? 'Offline' : s === 'syncing' ? 'Saving' : 'Saved';
  });

  private swUpdate = inject(SwUpdate);
  private initialised = false;

  constructor() {
    this.setupAutoUpdate();
    this.router.events.subscribe(e => {
      if (e instanceof NavigationEnd) {
        this.url.set(e.urlAfterRedirects);
        sessionStorage.removeItem('anchor.chunkReload');
      }
      if (e instanceof NavigationError) {
        // A route chunk that fails to download otherwise fails silently; reload once to recover.
        const msg = String((e.error as Error | undefined)?.message ?? e.error ?? '');
        console.error('navigation failed:', msg);
        if (/dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg)
            && !sessionStorage.getItem('anchor.chunkReload')) {
          sessionStorage.setItem('anchor.chunkReload', '1');
          location.reload();
        }
      }
    });
    effect(() => {
      if (this.supabase.session() && !this.initialised) {
        this.initialised = true;
        void this.store.init();
      }
    });
  }

  go(path: string): void {
    void this.router.navigateByUrl(path);
  }

  // When a new version finishes downloading, swap to it automatically instead of
  // waiting for a second manual refresh.
  private setupAutoUpdate(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.applyUpdateQuietly());
    // Long-lived tabs (an installed PWA left open for days) still learn about new versions.
    setInterval(() => void this.swUpdate.checkForUpdate().catch(() => undefined), 30 * 60_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.swUpdate.checkForUpdate().catch(() => undefined);
    });
  }

  private applyUpdateQuietly(): void {
    const typing = document.activeElement instanceof HTMLInputElement
      || document.activeElement instanceof HTMLTextAreaElement;
    const inFocusSession = this.url().startsWith('/focus');
    if (!typing && !inFocusSession) {
      location.reload();
    } else {
      // Mid-capture or mid-focus is sacred; swap versions when the user looks away.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) location.reload();
      }, { once: true });
    }
  }
}
