import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'app-capture-sheet',
  imports: [FormsModule],
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <div class="sheet">
      <div class="grab"></div>
      <div class="field">
        <span class="lab">Task</span>
        <input #titleInput [(ngModel)]="title" placeholder="What's the request?" (keydown.enter)="save()" autocomplete="off" />
      </div>
      <div class="field">
        <span class="lab">Who asked <span style="text-transform:none;font-weight:400">· optional</span></span>
        <input [(ngModel)]="who" placeholder="Name" autocomplete="off" (input)="whoTouched.set(true)" />
        @if (suggestions().length) {
          <div class="chips">
            @for (r of suggestions(); track r.id) {
              <button class="chip" [class.on]="who === r.name" (click)="who = r.name">{{ r.name }}</button>
            }
          </div>
        }
      </div>
      <div class="field" style="border-bottom:none">
        <span class="lab">Source <span style="text-transform:none;font-weight:400">· optional</span></span>
        <div class="chips" style="padding-top:4px">
          @for (s of store.sources(); track s.id) {
            <button class="chip" [class.on]="sourceId() === s.id" (click)="pick(s.id)">{{ s.name }}</button>
          }
          @if (!store.sources().length) {
            <span style="font-size:14px;color:var(--ink3)">No sources yet - add them in Settings.</span>
          }
        </div>
      </div>
      <button class="bigbtn" [disabled]="!title.trim()" (click)="save()">Add task</button>
    </div>
  `
})
export class CaptureSheetComponent {
  store = inject(StoreService);

  close = output();
  saved = output();

  title = '';
  who = '';
  whoTouched = signal(false);
  sourceId = signal<string | null>(null);

  titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  suggestions = computed(() => {
    const q = this.who.trim().toLowerCase();
    const all = this.store.requestors();
    const pool = q ? all.filter(r => r.name.toLowerCase().startsWith(q) && r.name.toLowerCase() !== q) : all;
    return pool.slice(0, 4);
  });

  ngAfterViewInit(): void {
    setTimeout(() => this.titleInput()?.nativeElement.focus(), 60);
  }

  pick(id: string): void {
    this.sourceId.update(cur => (cur === id ? null : id));
  }

  save(): void {
    const title = this.title.trim();
    if (!title) return;
    void this.store.createTask({
      title,
      requestorName: this.who.trim() || undefined,
      sourceId: this.sourceId() ?? undefined
    });
    this.saved.emit();
    this.close.emit();
  }
}
