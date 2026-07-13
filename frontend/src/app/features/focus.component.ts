import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StoreService } from '../core/store.service';

interface PersistedSession {
  sessionId: string;
  taskId: string;
  startedAt: number;
  endsAt: number;
}

const LS_KEY = 'anchor.focus';
const LS_LAST_TASK = 'anchor.lastTask';

@Component({
  selector: 'app-focus',
  template: `
    @if (task(); as t) {
      <div class="page no-tabs" style="display:flex;flex-direction:column;align-items:center">
        <div style="font-size:20px;font-weight:600;text-align:center;margin-top:34px;letter-spacing:-.01em;max-width:320px">
          {{ t.title }}
        </div>

        <div style="margin-top:30px;position:relative">
          <svg width="210" height="210" viewBox="0 0 210 210">
            <circle cx="105" cy="105" r="94" fill="none" stroke="var(--indigo-tint)" stroke-width="10" />
            <circle cx="105" cy="105" r="94" fill="none" stroke="var(--indigo)" stroke-width="10"
                    stroke-linecap="round" [attr.stroke-dasharray]="circumference"
                    [attr.stroke-dashoffset]="dashOffset()" transform="rotate(-90 105 105)"
                    style="transition:stroke-dashoffset 0.5s linear" />
          </svg>
        </div>
        <div style="font-size:15px;color:var(--ink2);font-weight:500;margin-top:6px">{{ remainingLabel() }}</div>

        <div style="width:100%;max-width:420px;margin-top:24px">
          @for (s of t.steps; track s.id) {
            <button class="stepline" style="width:100%"
                 [class.done]="s.complete"
                 [class.now]="s.id === currentStepId()"
                 [class.dim]="!s.complete && s.id !== currentStepId()"
                 (click)="toggleStep(s.id, !s.complete)">
              <span class="sq"></span>{{ s.title }}
            </button>
          } @empty {
            <div style="text-align:center;color:var(--ink3);font-size:13.5px;padding:8px">
              No steps written for this task.
            </div>
          }
        </div>

        @if (allStepsDone() && t.steps.length) {
          <button class="bigbtn" style="max-width:420px" (click)="finishEarly()">Mark task done</button>
        }

        <div class="pillrow" style="display:flex;gap:10px;margin-top:22px;width:100%;max-width:420px">
          <button style="flex:1;height:46px;border-radius:13px;border:1px solid var(--hair);font-size:14.5px;font-weight:500"
                  (click)="pause()">Pause</button>
          <button style="flex:1;height:46px;border-radius:13px;border:1px solid var(--hair);font-size:14.5px;font-weight:500"
                  (click)="needBreak()">Need a break</button>
        </div>
      </div>
    }
  `
})
export class FocusComponent implements OnInit, OnDestroy {
  private store = inject(StoreService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly circumference = 2 * Math.PI * 94;

  private taskId = this.route.snapshot.paramMap.get('id') ?? '';
  task = computed(() => this.store.tasks().find(t => t.id === this.taskId));

  private sessionId = '';
  private totalMs = 25 * 60_000;
  private endsAt = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private finished = false;

  remainingMs = signal(0);
  dashOffset = computed(() => {
    const frac = Math.min(1, Math.max(0, this.remainingMs() / this.totalMs));
    return this.circumference * (1 - frac);
  });
  remainingLabel = computed(() => {
    const mins = Math.ceil(this.remainingMs() / 60_000);
    return mins > 1 ? `${mins} min left` : 'Under a minute';
  });
  currentStepId = computed(() => this.task()?.steps.find(s => !s.complete)?.id ?? null);
  allStepsDone = computed(() => {
    const t = this.task();
    return !!t && t.steps.length > 0 && t.steps.every(s => s.complete);
  });

  async ngOnInit(): Promise<void> {
    localStorage.setItem(LS_LAST_TASK, this.taskId);
    const minutes = this.store.user()?.focusMinutes ?? 25;
    this.totalMs = minutes * 60_000;

    // The end timestamp is persisted the moment a session starts, so the countdown survives
    // screen lock, tab switches, or a killed browser (PRD 4.3, timer resilience).
    const saved = read();
    if (saved && saved.taskId === this.taskId && saved.endsAt > Date.now()) {
      this.sessionId = saved.sessionId;
      this.endsAt = saved.endsAt;
      this.totalMs = saved.endsAt - saved.startedAt;
    } else {
      this.sessionId = await this.store.startSession(this.taskId);
      const startedAt = Date.now();
      this.endsAt = startedAt + this.totalMs;
      write({ sessionId: this.sessionId, taskId: this.taskId, startedAt, endsAt: this.endsAt });
    }

    this.remainingMs.set(Math.max(0, this.endsAt - Date.now()));
    this.tick = setInterval(() => {
      const left = Math.max(0, this.endsAt - Date.now());
      this.remainingMs.set(left);
      if (left <= 0) void this.complete();
    }, 500);

    if (this.store.user()?.keepScreenOn && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as Navigator & { wakeLock: { request(t: string): Promise<never> } })
          .wakeLock.request('screen');
      } catch {
        // Wake lock is best-effort; a denied request must not block the session.
      }
    }
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
    void this.wakeLock?.release().catch(() => undefined);
  }

  toggleStep(stepId: string, complete: boolean): void {
    void this.store.patchStep(this.taskId, stepId, { complete });
  }

  private async complete(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    if (this.tick) clearInterval(this.tick);
    clear();
    await this.store.endSession(this.sessionId, true);
    this.store.celebrate();
    void this.router.navigate(['/breaks'], { queryParams: { after: 'session' } });
  }

  async finishEarly(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clear();
    await this.store.endSession(this.sessionId, true);
    await this.store.patchTask(this.taskId, { status: 'done' });
    void this.router.navigate(['/breaks'], { queryParams: { after: 'session' } });
  }

  async pause(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clear();
    await this.store.endSession(this.sessionId, false);
    void this.router.navigate(['/task', this.taskId]);
  }

  async needBreak(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clear();
    await this.store.endSession(this.sessionId, false);
    void this.router.navigate(['/breaks']);
  }
}

function read(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function write(s: PersistedSession): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function clear(): void {
  localStorage.removeItem(LS_KEY);
}
