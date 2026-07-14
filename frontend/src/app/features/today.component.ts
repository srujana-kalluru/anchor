import { Component, computed, inject, signal } from '@angular/core';
import { StoreService } from '../core/store.service';
import { Task } from '../core/models';
import { ageBand, ageBasis, localIsoDate } from '../core/ageing';
import { TaskCardComponent } from './task-card.component';
import { CaptureSheetComponent } from './capture-sheet.component';

@Component({
  selector: 'app-today',
  imports: [TaskCardComponent, CaptureSheetComponent],
  template: `
    <div class="page">
      <div class="greet">{{ greeting() }}</div>
      <div class="subline">{{ countLine() }}</div>
      @if (daysUsed() !== null) {
        <div class="chip-flame">
          <svg width="12" height="14" viewBox="0 0 24 28" fill="var(--amber-text)" style="flex:none">
            <path d="M12 0c1.6 5.4-4.8 8.2-4.8 14.6a7.3 7.3 0 0 0 14.6 0c0-3.4-1.7-6-3.6-8.4-.4 2.4-1.3 3.7-3 4.3C16 6.2 14.6 2.4 12 0zM9.8 19.8c0-2.4 1.5-3.5 2.3-5.5.9 2 2.1 3.1 2.1 5.5a2.2 2.2 0 0 1-4.4 0z"/>
          </svg>
          Used {{ daysUsed() }} of the last 14 days
        </div>
      }

      @if (simmering().length) {
        <div class="sechead amber">Simmering</div>
        @for (t of visibleSimmering(); track t.id) {
          <app-task-card [task]="t" />
        }
        @if (simmering().length > 3 && !simmerExpanded()) {
          <button class="morelink" (click)="simmerExpanded.set(true)">+ {{ simmering().length - 3 }} more waiting</button>
        }
      }

      <div class="sechead">Today</div>
      @for (t of todayTasks(); track t.id) {
        <app-task-card [task]="t" />
      } @empty {
        @if (!upNext().length && !simmering().length && !doneToday().length) {
          <div class="empty">
            <div style="font-size:16px;max-width:220px;line-height:1.5">Nothing here yet. Type your first task below.</div>
            <div class="arrow">↓</div>
          </div>
        } @else {
          <div style="font-size:15px;color:var(--ink3);padding:6px 2px">Nothing scheduled for today.</div>
        }
      }

      @if (upNext().length) {
        <div class="sechead">Up next</div>
        @for (t of visibleUpNext(); track t.id) {
          <app-task-card [id]="'t-' + t.id" [task]="t" [ghost]="true" />
        }
        @if (upNext().length > 5 && !upNextExpanded()) {
          <button class="quietlink" (click)="upNextExpanded.set(true)">View all {{ upNext().length }}</button>
        }
      }

      @if (doneToday().length) {
        <div class="sechead">Done today</div>
        @for (t of doneToday(); track t.id) {
          <app-task-card [task]="t" />
        }
      }
    </div>

    @if (!captureOpen()) {
      <button class="qadd" (click)="captureOpen.set(true)">
        Add a task or request…
        <span class="plus">+</span>
      </button>
    }
    @if (captureOpen()) {
      <app-capture-sheet (close)="captureOpen.set(false)" (saved)="onCaptured()" />
    }
  `
})
export class TodayComponent {
  store = inject(StoreService);

  captureOpen = signal(false);
  simmerExpanded = signal(false);
  upNextExpanded = signal(false);

  private active = computed(() => this.store.tasks().filter(t => !t.deletedAt && t.status !== 'done'));

  simmering = computed(() =>
    this.active()
      .filter(t => ageBand(t) === 'simmering')
      .sort((a, b) => ageBasis(a) - ageBasis(b))
  );
  visibleSimmering = computed(() => (this.simmerExpanded() ? this.simmering() : this.simmering().slice(0, 3)));

  todayTasks = computed(() =>
    this.active()
      .filter(t => (t.status === 'today' || t.status === 'in_progress') && ageBand(t) !== 'simmering')
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );

  upNext = computed(() =>
    this.active()
      .filter(t => t.status === 'backlog' && ageBand(t) !== 'simmering')
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
  );
  visibleUpNext = computed(() => (this.upNextExpanded() ? this.upNext() : this.upNext().slice(0, 5)));

  doneToday = computed(() => {
    const today = localIsoDate();
    return this.store.tasks().filter(
      t => !t.deletedAt && t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) === today
    );
  });

  daysUsed = computed(() => this.store.insights()?.daysUsedOfLast14 ?? null);

  greeting = computed(() => {
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const name = this.store.user()?.displayName;
    return `Good ${part}${name ? ', ' + name : ''}.`;
  });

  countLine = computed(() => {
    const n = this.todayTasks().length;
    if (n === 0) return this.active().length ? 'A clear slate today.' : 'Nothing here yet.';
    return `${n} thing${n === 1 ? '' : 's'} today. You've got this.`;
  });

  onCaptured(): void {
    // Bring the new task into view.
    setTimeout(() => {
      const newest = this.upNext()[0];
      if (newest) {
        document.getElementById('t-' + newest.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 90);
  }
}
