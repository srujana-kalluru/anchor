import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { StoreService } from '../core/store.service';
import { Task } from '../core/models';
import { ageBand, ageLabel, dueLabel } from '../core/ageing';

@Component({
  selector: 'app-task-card',
  template: `
    <button class="card"
        [class.simmer]="!ghost() && band() === 'simmering'"
        [class.aged]="!ghost() && band() === 'amber'"
        [class.ghost]="ghost()"
        [class.done-row]="task().status === 'done'"
        (click)="open()">
      <span class="checkring" [class.filled]="task().status === 'done'" (click)="toggle($event)"></span>
      <span style="flex:1;min-width:0">
        <span class="t">{{ task().title }}</span>
        @if (hasMeta()) {
          <span class="meta">
            @if (category(); as c) {
              <span class="pill"><span class="cdot" [style.background]="c.colourHex"></span>{{ c.name }}</span>
            }
            @if (due(); as d) {
              <span class="due" [class.over]="d.over">{{ d.text }}</span>
            }
            @if (age(); as a) {
              <span class="age" [class.hot]="band() === 'amber' || band() === 'simmering'">{{ a }}</span>
            }
            @if (task().recurrence) {
              <span class="recur">↻</span>
            }
          </span>
        }
      </span>
    </button>
  `
})
export class TaskCardComponent {
  task = input.required<Task>();
  ghost = input(false);

  private store = inject(StoreService);
  private router = inject(Router);

  band = computed(() => ageBand(this.task()));
  age = computed(() => (this.task().status === 'done' ? null : ageLabel(this.task())));
  due = computed(() => dueLabel(this.task()));
  category = computed(() => this.store.categories().find(c => c.id === this.task().categoryId) ?? null);
  hasMeta = computed(() => !!(this.category() || this.due() || this.age() || this.task().recurrence));

  open(): void {
    void this.router.navigate(['/task', this.task().id]);
  }

  toggle(ev: Event): void {
    ev.stopPropagation();
    const done = this.task().status === 'done';
    void this.store.patchTask(this.task().id, { status: done ? 'today' : 'done' });
  }
}
