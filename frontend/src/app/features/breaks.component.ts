import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';
import { MENU_COURSES, MenuCourse, MenuItem } from '../core/models';

interface RunningBreak {
  itemId: string;
  label: string;
  course: MenuCourse;
  endsAt: number | null;
  totalMs: number | null;
}

const LS_BREAK = 'anchor.break';
const LS_DESSERTS = 'anchor.dessertStreak';
const THREE_HOURS = 3 * 3600_000;

@Component({
  selector: 'app-breaks',
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="greet" style="font-size:23px">{{ heading() }}</div>
      @if (afterSession()) {
        <div class="subline">Pick a reward. You've got {{ store.user()?.breakMinutes ?? 5 }} minutes.</div>
      }

      @for (course of courses; track course.key) {
        <div class="menucat">
          <h4>{{ course.label }} <span>{{ course.hint }}</span></h4>
          @for (item of itemsFor(course.key); track item.id) {
            <div class="mitem">
              @if (editing()) {
                <input [ngModel]="item.label" (ngModelChange)="drafts[item.id] = $event" (blur)="rename(item)" style="flex:1" />
                <button class="del" (click)="remove(item)">Delete</button>
              } @else {
                <span style="flex:1">{{ item.label }}</span>
                @if (item.durationMinutes) {
                  <span class="dur">{{ item.durationMinutes }} min{{ item.course === 'dessert' ? ' cap' : '' }}</span>
                }
                <button class="go" (click)="start(item)">▶</button>
              }
            </div>
          }
          @if (editing()) {
            <div class="mitem" style="border-style:dashed">
              <input [(ngModel)]="newLabels[course.key]" placeholder="Add an idea…" (keydown.enter)="add(course.key)" style="flex:1" />
              <input [(ngModel)]="newDurations[course.key]" placeholder="min" type="number" style="width:52px;text-align:right" />
              <button class="go" (click)="add(course.key)">＋</button>
            </div>
          }
        </div>
      }

      <button class="quietlink" style="margin-top:22px" (click)="editing.set(!editing())">
        {{ editing() ? 'Done editing' : 'Edit menu' }}
      </button>
    </div>

    @if (showTip()) {
      <div class="tipbox">Feeling stuck? <b>Move your body first.</b></div>
    }

    @if (running(); as r) {
      <div class="takeover" [style.background]="r.course === 'dessert' ? 'var(--indigo-deep)' : 'var(--indigo)'">
        @if (!breakOver()) {
          <div class="kicker">{{ r.label }}</div>
          <div class="big">{{ clock() }}</div>
          @if (r.course === 'dessert') {
            <div class="lab">Hard limit. No pause, no extend.</div>
          } @else if (r.endsAt) {
            <div class="lab">Enjoy it properly.</div>
            <button class="btn" (click)="endEarly()">Done early</button>
          } @else {
            <div class="lab">Open-ended. Come back when you're ready.</div>
            <button class="btn" (click)="endEarly()">I'm back</button>
          }
        } @else {
          <div class="kicker">Break over</div>
          <div class="big">0:00</div>
          <div class="lab">That was {{ r.totalMs ? minutes(r.totalMs) : 'your break' }}{{ r.course === 'dessert' ? ' - nice, you stopped.' : '.' }}</div>
          <button class="btn" (click)="backToTask()">Back to task</button>
        }
      </div>
    }
  `
})
export class BreaksComponent implements OnDestroy {
  store = inject(StoreService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  courses = MENU_COURSES;
  editing = signal(false);
  drafts: Record<string, string> = {};
  newLabels: Partial<Record<MenuCourse, string>> = {};
  newDurations: Partial<Record<MenuCourse, number | null>> = {};

  afterSession = signal(this.route.snapshot.queryParamMap.get('after') === 'session');
  running = signal<RunningBreak | null>(restore());
  breakOver = signal(false);
  now = signal(Date.now());

  private tick = setInterval(() => {
    this.now.set(Date.now());
    const r = this.running();
    if (r?.endsAt && Date.now() >= r.endsAt && !this.breakOver()) {
      this.breakOver.set(true);
    }
  }, 500);

  heading = computed(() => (this.afterSession() ? 'Session done.' : 'Breaks'));

  showTip = computed(() => {
    if (this.running()) return false;
    const idle = Date.now() - this.store.lastProgressAt() > THREE_HOURS;
    const desserts = Number(localStorage.getItem(LS_DESSERTS) ?? '0') >= 3;
    return idle || desserts;
  });

  clock = computed(() => {
    const r = this.running();
    this.now();
    if (!r?.endsAt) return '· · ·';
    const left = Math.max(0, r.endsAt - Date.now());
    const m = Math.floor(left / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  ngOnDestroy(): void {
    clearInterval(this.tick);
  }

  itemsFor(course: MenuCourse): MenuItem[] {
    return this.store.menuItems().filter(m => m.course === course).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  start(item: MenuItem): void {
    const totalMs = item.durationMinutes ? item.durationMinutes * 60_000 : null;
    const r: RunningBreak = {
      itemId: item.id,
      label: item.label,
      course: item.course,
      endsAt: totalMs ? Date.now() + totalMs : null,
      totalMs
    };
    // Dessert runs feed the stuck-tip trigger (three in a row); anything else resets it.
    const streak = item.course === 'dessert' ? Number(localStorage.getItem(LS_DESSERTS) ?? '0') + 1 : 0;
    localStorage.setItem(LS_DESSERTS, String(streak));
    localStorage.setItem(LS_BREAK, JSON.stringify(r));
    this.breakOver.set(false);
    this.running.set(r);
  }

  endEarly(): void {
    localStorage.removeItem(LS_BREAK);
    this.running.set(null);
  }

  backToTask(): void {
    localStorage.removeItem(LS_BREAK);
    this.running.set(null);
    const last = localStorage.getItem('anchor.lastTask');
    if (last && this.store.taskById(last) && this.store.taskById(last)!.status !== 'done') {
      void this.router.navigate(['/task', last]);
    } else {
      void this.router.navigate(['/today']);
    }
  }

  minutes(ms: number): string {
    const m = Math.round(ms / 60_000);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }

  rename(item: MenuItem): void {
    const draft = this.drafts[item.id];
    if (draft !== undefined && draft.trim() && draft !== item.label) {
      void this.store.patchMenuItem(item.id, { label: draft.trim() });
    }
    delete this.drafts[item.id];
  }

  remove(item: MenuItem): void {
    void this.store.deleteMenuItem(item.id);
  }

  add(course: MenuCourse): void {
    const label = (this.newLabels[course] ?? '').trim();
    if (!label) return;
    const duration = this.newDurations[course] ?? null;
    void this.store.addMenuItem({
      course,
      label,
      durationMinutes: duration ? Number(duration) : null,
      sortOrder: this.itemsFor(course).length
    });
    this.newLabels[course] = '';
    this.newDurations[course] = null;
  }
}

function restore(): RunningBreak | null {
  try {
    const raw = localStorage.getItem(LS_BREAK);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunningBreak;
    // An expired open-ended break just clears; an expired timed break shows its end screen once.
    if (r.endsAt && Date.now() > r.endsAt + 30 * 60_000) {
      localStorage.removeItem(LS_BREAK);
      return null;
    }
    return r;
  } catch {
    return null;
  }
}
