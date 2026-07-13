import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';
import { PushService } from '../core/push.service';
import { SupabaseService } from '../core/supabase.service';
import { MENU_COURSES, MenuCourse, MenuItem } from '../core/models';

type Panel = 'main' | 'categories' | 'sources' | 'requestors' | 'menu';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="page">
      @if (panel() === 'main') {
        <div class="greet" style="font-size:23px">Settings</div>

        <div class="sechead">Notifications</div>
        <div class="setrow">
          <span>Daily Ageing Digest</span>
          <button class="switch" [class.on]="user()?.digestEnabled" (click)="toggleDigest()"></button>
        </div>
        @if (pushError()) {
          <div style="font-size:12.5px;color:var(--amber-text);padding:8px 2px">{{ pushError() }}</div>
        }
        @if (user()?.digestEnabled) {
          <div class="setrow">
            <span>Delivery time</span>
            <input type="time" style="width:auto;font-weight:500" [ngModel]="user()?.digestTime"
                   (ngModelChange)="setDigestTime($event)" />
          </div>
        }

        <div class="sechead">Focus</div>
        <div class="setrow">
          <span>Session length</span>
          <span class="stepper">
            <button (click)="bumpFocus(-5)">−</button>
            <span>{{ user()?.focusMinutes }} min</span>
            <button (click)="bumpFocus(5)">＋</button>
          </span>
        </div>
        <div class="setrow">
          <span>Break length</span>
          <span class="stepper">
            <button (click)="bumpBreak(-1)">−</button>
            <span>{{ user()?.breakMinutes }} min</span>
            <button (click)="bumpBreak(1)">＋</button>
          </span>
        </div>
        <div class="setrow">
          <span>Keep screen on during focus</span>
          <button class="switch" [class.on]="user()?.keepScreenOn" (click)="toggleWakeLock()"></button>
        </div>

        <div class="sechead">Lists</div>
        <button class="setrow" (click)="panel.set('categories')">
          <span>Categories</span><span class="r">{{ store.categories().length }} ›</span>
        </button>
        <button class="setrow" (click)="panel.set('sources')">
          <span>Sources</span><span class="r">{{ store.sources().length }} ›</span>
        </button>
        <button class="setrow" (click)="panel.set('requestors')">
          <span>Who-asked names</span><span class="r">{{ store.requestors().length }} ›</span>
        </button>
        <button class="setrow" (click)="panel.set('menu')">
          <span>Dopamine Menu</span><span class="r">{{ store.menuItems().length }} ›</span>
        </button>

        <div class="sechead">Account</div>
        <div class="setrow">
          <span style="color:var(--ink2)">Name</span>
          <input style="text-align:right;font-weight:500;width:180px" [ngModel]="user()?.displayName"
                 (ngModelChange)="nameDraft.set($event)" (blur)="saveName()" />
        </div>
        <div class="setrow">
          <span style="color:var(--ink2)">{{ user()?.email }}</span>
          <button style="color:var(--indigo-deep);font-weight:500" (click)="signOut()">Sign out</button>
        </div>
        <button class="bigbtn danger" style="margin-top:30px" (click)="deleteAccount()">
          {{ confirmDelete() ? 'Tap again to permanently delete everything' : 'Delete account data' }}
        </button>
        <div style="font-size:12px;color:var(--ink3);margin-top:10px;line-height:1.5">
          Removes every task, list, and session from the server. The Google sign-in itself is managed in Supabase.
        </div>
      }

      @if (panel() === 'categories') {
        <div class="navrow"><button class="back" (click)="panel.set('main')">‹ Settings</button></div>
        <div class="greet" style="font-size:23px">Categories</div>
        @for (c of store.categories(); track c.id) {
          <div class="setrow">
            <span style="display:flex;align-items:center;gap:10px;flex:1">
              <input type="color" [ngModel]="c.colourHex" (ngModelChange)="store.patchCategory(c.id, { colourHex: $event })"
                     style="width:26px;height:26px;border:none;border-radius:6px;padding:0;background:none" />
              <input [ngModel]="c.name" (ngModelChange)="drafts[c.id] = $event" (blur)="renameCategory(c.id)" style="flex:1" />
            </span>
            <button style="color:var(--red);font-size:13.5px;font-weight:500" (click)="store.deleteCategory(c.id)">Delete</button>
          </div>
        } @empty {
          <div style="font-size:14px;color:var(--ink3);padding:10px 2px">
            None yet. Categories emerge from your own vocabulary.
          </div>
        }
        <div class="addstep" style="margin-top:14px">
          <span>＋</span>
          <input [(ngModel)]="newName" placeholder="New category…" (keydown.enter)="addCategory()" />
        </div>
      }

      @if (panel() === 'sources') {
        <div class="navrow"><button class="back" (click)="panel.set('main')">‹ Settings</button></div>
        <div class="greet" style="font-size:23px">Sources</div>
        @for (s of store.sources(); track s.id) {
          <div class="setrow">
            <input [ngModel]="s.name" (ngModelChange)="drafts[s.id] = $event" (blur)="renameSource(s.id)" style="flex:1" />
            <button style="color:var(--red);font-size:13.5px;font-weight:500" (click)="store.deleteSource(s.id)">Delete</button>
          </div>
        } @empty {
          <div style="font-size:14px;color:var(--ink3);padding:10px 2px">No sources defined.</div>
        }
        <div class="addstep" style="margin-top:14px">
          <span>＋</span>
          <input [(ngModel)]="newName" placeholder="New source…" (keydown.enter)="addSource()" />
        </div>
      }

      @if (panel() === 'menu') {
        <div class="navrow"><button class="back" (click)="panel.set('main')">‹ Settings</button></div>
        <div class="greet" style="font-size:23px">Dopamine Menu</div>
        <div class="subline">The category names are fixed; the contents are entirely yours.</div>
        @for (course of menuCourses; track course.key) {
          <div class="menucat">
            <h4>{{ course.label }} <span>{{ course.hint }}</span></h4>
            @for (item of menuItemsFor(course.key); track item.id) {
              <div class="mitem">
                <input [ngModel]="item.label" (ngModelChange)="drafts[item.id] = $event" (blur)="renameMenuItem(item)" style="flex:1" />
                <input [ngModel]="item.durationMinutes" (ngModelChange)="durationDrafts[item.id] = $event"
                       (blur)="saveMenuDuration(item)" type="number" placeholder="min" style="width:52px;text-align:right" />
                <button class="del" (click)="store.deleteMenuItem(item.id)">Delete</button>
              </div>
            }
            <div class="mitem" style="border-style:dashed">
              <input [(ngModel)]="newMenuLabels[course.key]" placeholder="Add an idea…" (keydown.enter)="addMenuItem(course.key)" style="flex:1" />
              <input [(ngModel)]="newMenuDurations[course.key]" placeholder="min" type="number" style="width:52px;text-align:right" />
              <button class="go" (click)="addMenuItem(course.key)">＋</button>
            </div>
          </div>
        }
      }

      @if (panel() === 'requestors') {
        <div class="navrow"><button class="back" (click)="panel.set('main')">‹ Settings</button></div>
        <div class="greet" style="font-size:23px">Who-asked names</div>
        <div class="subline">Rename to fix a typo everywhere; remove to drop from autocomplete.</div>
        @for (r of store.requestors(); track r.id) {
          <div class="setrow">
            <input [ngModel]="r.name" (ngModelChange)="drafts[r.id] = $event" (blur)="renameRequestor(r.id)" style="flex:1" />
            <span class="r">{{ r.useCount }}×</span>
            <button style="color:var(--red);font-size:13.5px;font-weight:500" (click)="store.deleteRequestor(r.id)">Remove</button>
          </div>
        } @empty {
          <div style="font-size:14px;color:var(--ink3);padding:10px 2px">Names appear here as you capture.</div>
        }
      }
    </div>
  `
})
export class SettingsComponent {
  store = inject(StoreService);
  private push = inject(PushService);
  private supabase = inject(SupabaseService);

  panel = signal<Panel>('main');
  user = computed(() => this.store.user());
  pushError = signal<string | null>(null);
  confirmDelete = signal(false);
  nameDraft = signal<string | null>(null);
  drafts: Record<string, string> = {};
  durationDrafts: Record<string, number | null> = {};
  newName = '';

  menuCourses = MENU_COURSES;
  newMenuLabels: Partial<Record<MenuCourse, string>> = {};
  newMenuDurations: Partial<Record<MenuCourse, number | null>> = {};

  menuItemsFor(course: MenuCourse): MenuItem[] {
    return this.store.menuItems().filter(m => m.course === course).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  renameMenuItem(item: MenuItem): void {
    const draft = this.drafts[item.id];
    if (draft !== undefined && draft.trim() && draft !== item.label) {
      void this.store.patchMenuItem(item.id, { label: draft.trim() });
    }
    delete this.drafts[item.id];
  }

  saveMenuDuration(item: MenuItem): void {
    const draft = this.durationDrafts[item.id];
    if (draft !== undefined) {
      const minutes = draft === null || (draft as unknown as string) === '' ? null : Number(draft);
      if (minutes !== item.durationMinutes) {
        void this.store.patchMenuItem(item.id, { durationMinutes: minutes });
      }
    }
    delete this.durationDrafts[item.id];
  }

  addMenuItem(course: MenuCourse): void {
    const label = (this.newMenuLabels[course] ?? '').trim();
    if (!label) return;
    const duration = this.newMenuDurations[course] ?? null;
    void this.store.addMenuItem({
      course,
      label,
      durationMinutes: duration ? Number(duration) : null,
      sortOrder: this.menuItemsFor(course).length
    });
    this.newMenuLabels[course] = '';
    this.newMenuDurations[course] = null;
  }

  async toggleDigest(): Promise<void> {
    const u = this.user();
    if (!u) return;
    this.pushError.set(null);
    if (!u.digestEnabled) {
      try {
        // The permission prompt fires here and only here (PRD 4.5): the single moment Anchor asks.
        await this.push.enable();
        await this.store.patchUser({ digestEnabled: true });
      } catch (e) {
        this.pushError.set(e instanceof Error ? e.message : 'Notification permission was not granted.');
      }
    } else {
      await this.push.disable();
      await this.store.patchUser({ digestEnabled: false });
    }
  }

  setDigestTime(time: string): void {
    if (time) void this.store.patchUser({ digestTime: time });
  }

  bumpFocus(delta: number): void {
    const u = this.user();
    if (u) void this.store.patchUser({ focusMinutes: Math.max(5, Math.min(120, u.focusMinutes + delta)) });
  }

  bumpBreak(delta: number): void {
    const u = this.user();
    if (u) void this.store.patchUser({ breakMinutes: Math.max(1, Math.min(60, u.breakMinutes + delta)) });
  }

  toggleWakeLock(): void {
    const u = this.user();
    if (u) void this.store.patchUser({ keepScreenOn: !u.keepScreenOn });
  }

  saveName(): void {
    const draft = this.nameDraft();
    if (draft !== null && draft.trim()) {
      void this.store.patchUser({ displayName: draft.trim() });
    }
    this.nameDraft.set(null);
  }

  signOut(): void {
    void this.supabase.signOut().then(() => location.reload());
  }

  async deleteAccount(): Promise<void> {
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      setTimeout(() => this.confirmDelete.set(false), 4000);
      return;
    }
    await this.store.deleteAccount();
    await this.supabase.signOut();
    location.reload();
  }

  renameCategory(id: string): void {
    const draft = this.drafts[id];
    if (draft?.trim()) void this.store.patchCategory(id, { name: draft.trim() });
    delete this.drafts[id];
  }

  renameSource(id: string): void {
    const draft = this.drafts[id];
    if (draft?.trim()) void this.store.patchSource(id, draft.trim());
    delete this.drafts[id];
  }

  renameRequestor(id: string): void {
    const draft = this.drafts[id];
    if (draft?.trim()) void this.store.patchRequestor(id, draft.trim());
    delete this.drafts[id];
  }

  addCategory(): void {
    const name = this.newName.trim();
    if (!name) return;
    const palette = ['#2D9960', '#B08A2E', '#4B79D4', '#C2543F', '#7E57C2', '#00838F'];
    void this.store.addCategory(name, palette[this.store.categories().length % palette.length]);
    this.newName = '';
  }

  addSource(): void {
    const name = this.newName.trim();
    if (!name) return;
    void this.store.addSource(name);
    this.newName = '';
  }
}
