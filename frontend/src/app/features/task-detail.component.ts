import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDropList, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { StoreService } from '../core/store.service';
import { Recurrence } from '../core/models';
import { capturedLabel } from '../core/ageing';

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

@Component({
  selector: 'app-task-detail',
  imports: [FormsModule, CdkDropList, CdkDrag],
  template: `
    @if (task(); as t) {
      <div class="page">
        <div class="navrow">
          <button class="back" (click)="back()">‹ Today</button>
          <div style="position:relative">
            <button style="color:var(--ink3);font-weight:600;letter-spacing:.12em;font-size:16px;padding:4px 8px"
                    (click)="menuOpen.set(!menuOpen())">···</button>
            @if (menuOpen()) {
              <div class="overflow-menu">
                @if (t.status === 'backlog') {
                  <button (click)="setStatus('today')">Move to Today</button>
                } @else {
                  <button (click)="setStatus('backlog')">Move to backlog</button>
                }
                <button (click)="remove()">Delete task</button>
              </div>
            }
          </div>
        </div>

        <div style="display:flex;gap:13px;align-items:flex-start;margin-top:14px">
          <button class="checkring" [class.filled]="t.status === 'done'" style="margin-top:5px" (click)="toggleDone()"></button>
          <textarea rows="1" style="font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-.01em;resize:none;field-sizing:content"
                    [ngModel]="t.title" (ngModelChange)="titleDraft.set($event)" (blur)="saveTitle()"></textarea>
        </div>
        <div style="font-size:12.5px;color:var(--ink2);margin:8px 0 8px 36px">
          {{ captured() }}
        </div>

        <div class="drow">
          <span class="k">Who asked</span>
          <input style="text-align:right;font-weight:500" [ngModel]="t.requestorName ?? ''"
                 (ngModelChange)="whoDraft.set($event)" (blur)="saveWho()" placeholder="Nobody" list="requestor-names" />
          <datalist id="requestor-names">
            @for (r of store.requestors(); track r.id) {
              <option [value]="r.name"></option>
            }
          </datalist>
        </div>

        <button class="drow" (click)="srcOpen.set(!srcOpen())">
          <span class="k">Source</span>
          @if (source(); as s) {
            <span class="v">{{ s.name }}</span>
          } @else {
            <span class="v unset">None</span>
          }
        </button>
        @if (srcOpen()) {
          <div class="chips">
            <button class="chip" [class.on]="!t.sourceId" (click)="setSource(null)">None</button>
            @for (s of store.sources(); track s.id) {
              <button class="chip" [class.on]="t.sourceId === s.id" (click)="setSource(s.id)">{{ s.name }}</button>
            }
          </div>
        }

        <button class="drow" (click)="catOpen.set(!catOpen())">
          <span class="k">Category</span>
          @if (category(); as c) {
            <span class="v"><span class="cdot" [style.background]="c.colourHex" style="width:8px;height:8px;border-radius:50%"></span>{{ c.name }}</span>
          } @else {
            <span class="v unset">None</span>
          }
        </button>
        @if (catOpen()) {
          <div class="chips">
            <button class="chip" [class.on]="!t.categoryId" (click)="setCategory(null)">None</button>
            @for (c of store.categories(); track c.id) {
              <button class="chip" [class.on]="t.categoryId === c.id" (click)="setCategory(c.id)">{{ c.name }}</button>
            }
            <input style="width:130px;border:1.5px dashed var(--hair);border-radius:17px;padding:7px 14px;font-size:13px"
                   placeholder="New category" [(ngModel)]="newCategory" (keydown.enter)="addCategory()" />
          </div>
        }

        <div class="drow">
          <span class="k">Due</span>
          <span class="v" style="gap:10px">
            <input type="date" style="width:auto;font-weight:500;color:var(--indigo-deep)"
                   [ngModel]="t.dueDate" (ngModelChange)="setDue($event)" />
            @if (t.dueDate) {
              <button style="color:var(--ink3);font-size:13px" (click)="setDue(null)">Clear</button>
            }
          </span>
        </div>

        <button class="drow" (click)="repeatOpen.set(!repeatOpen())">
          <span class="k">Repeat</span>
          <span class="v" [class.unset]="!t.recurrence">{{ recurrenceLabel() }}</span>
        </button>
        @if (repeatOpen()) {
          <div class="chips">
            @for (o of recurrenceOptions; track o.label) {
              <button class="chip" [class.on]="t.recurrence === o.value" (click)="setRecurrence(o.value)">{{ o.label }}</button>
            }
          </div>
        }

        <div class="sechead">Steps</div>
        <div cdkDropList (cdkDropListDropped)="dropStep($event)">
          @for (s of t.steps; track s.id) {
            <div class="stepline" [class.done]="s.complete" cdkDrag>
              <button class="sq" [class.done]="s.complete" (click)="toggleStep(s.id, !s.complete)"
                      [style.background]="s.complete ? 'var(--indigo)' : ''" [style.borderColor]="s.complete ? 'var(--indigo)' : ''"></button>
              <input [ngModel]="s.title" (ngModelChange)="stepDrafts[s.id] = $event" (blur)="saveStep(s.id)" />
              <button style="color:var(--ink3);font-size:17px;padding:0 4px" (click)="removeStep(s.id)">×</button>
            </div>
          }
        </div>
        <div class="addstep">
          <span>＋</span>
          <input [(ngModel)]="newStep" placeholder="Add a step…" (keydown.enter)="addStep()" (blur)="addStep()" />
        </div>

        <button class="bigbtn" style="margin-top:26px" (click)="startFocus()">Start Focus</button>
      </div>
    } @else {
      <div class="page"><div class="empty">Task not found.</div></div>
    }
  `
})
export class TaskDetailComponent {
  store = inject(StoreService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  recurrenceOptions = RECURRENCE_OPTIONS;

  private id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  task = computed(() => this.store.tasks().find(t => t.id === this.id()));

  menuOpen = signal(false);
  srcOpen = signal(false);
  catOpen = signal(false);
  repeatOpen = signal(false);
  titleDraft = signal<string | null>(null);
  whoDraft = signal<string | null>(null);
  newCategory = '';
  newStep = '';
  stepDrafts: Record<string, string> = {};

  captured = computed(() => (this.task() ? capturedLabel(this.task()!) : ''));
  source = computed(() => this.store.sources().find(s => s.id === this.task()?.sourceId) ?? null);
  category = computed(() => this.store.categories().find(c => c.id === this.task()?.categoryId) ?? null);
  recurrenceLabel = computed(() =>
    RECURRENCE_OPTIONS.find(o => o.value === (this.task()?.recurrence ?? null))?.label ?? 'None');

  constructor() {
    this.route.paramMap.subscribe(p => this.id.set(p.get('id') ?? ''));
  }

  back(): void {
    void this.router.navigate(['/today']);
  }

  toggleDone(): void {
    const t = this.task();
    if (!t) return;
    const toDone = t.status !== 'done';
    void this.store.patchTask(t.id, { status: toDone ? 'done' : 'today' });
    if (toDone) this.back();
  }

  saveTitle(): void {
    const draft = this.titleDraft();
    const t = this.task();
    if (t && draft !== null && draft.trim() && draft !== t.title) {
      void this.store.patchTask(t.id, { title: draft.trim() });
    }
    this.titleDraft.set(null);
  }

  saveWho(): void {
    const draft = this.whoDraft();
    const t = this.task();
    if (t && draft !== null && draft.trim() !== (t.requestorName ?? '')) {
      void this.store.patchTask(t.id, { requestorName: draft.trim() || null });
    }
    this.whoDraft.set(null);
  }

  setSource(id: string | null): void {
    const t = this.task();
    if (t) void this.store.patchTask(t.id, { sourceId: id });
    this.srcOpen.set(false);
  }

  setCategory(id: string | null): void {
    const t = this.task();
    if (t) void this.store.patchTask(t.id, { categoryId: id });
    this.catOpen.set(false);
  }

  addCategory(): void {
    const name = this.newCategory.trim();
    const t = this.task();
    if (!name || !t) return;
    const palette = ['#2D9960', '#B08A2E', '#4B79D4', '#C2543F', '#7E57C2', '#00838F'];
    const colour = palette[this.store.categories().length % palette.length];
    void this.store.addCategory(name, colour).then(c => this.store.patchTask(t.id, { categoryId: c.id }));
    this.newCategory = '';
    this.catOpen.set(false);
  }

  setDue(date: string | null): void {
    const t = this.task();
    if (t) void this.store.patchTask(t.id, { dueDate: date || null });
  }

  setRecurrence(r: Recurrence): void {
    const t = this.task();
    if (t) void this.store.patchTask(t.id, { recurrence: r });
    this.repeatOpen.set(false);
  }

  setStatus(status: 'today' | 'backlog'): void {
    const t = this.task();
    if (t) void this.store.patchTask(t.id, { status });
    this.menuOpen.set(false);
  }

  remove(): void {
    const t = this.task();
    if (t) {
      void this.store.deleteTask(t.id);
      this.back();
    }
  }

  toggleStep(stepId: string, complete: boolean): void {
    const t = this.task();
    if (t) void this.store.patchStep(t.id, stepId, { complete });
  }

  saveStep(stepId: string): void {
    const draft = this.stepDrafts[stepId];
    const t = this.task();
    const step = t?.steps.find(s => s.id === stepId);
    if (t && step && draft !== undefined && draft.trim() && draft !== step.title) {
      void this.store.patchStep(t.id, stepId, { title: draft.trim() });
    }
    delete this.stepDrafts[stepId];
  }

  removeStep(stepId: string): void {
    const t = this.task();
    if (t) void this.store.deleteStep(t.id, stepId);
  }

  addStep(): void {
    const title = this.newStep.trim();
    const t = this.task();
    if (title && t) {
      void this.store.addStep(t.id, title);
      this.newStep = '';
    }
  }

  dropStep(event: CdkDragDrop<unknown>): void {
    const t = this.task();
    if (!t) return;
    const ids = t.steps.map(s => s.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    void this.store.reorderSteps(t.id, ids);
  }

  startFocus(): void {
    const t = this.task();
    if (t) void this.router.navigate(['/focus', t.id]);
  }
}
