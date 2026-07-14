import { Component, inject, output, signal } from '@angular/core';
import { StoreService } from '../core/store.service';
import { STARTER_MENU, STARTER_SOURCES } from '../core/models';

@Component({
  selector: 'app-starter-sheet',
  template: `
    <div class="scrim" (click)="skip()"></div>
    <div class="sheet">
      <div class="grab"></div>
      <div style="font-size:20px;font-weight:600;letter-spacing:-.01em">First one's in.</div>
      <div style="font-size:14.5px;color:var(--ink2);margin-top:6px;line-height:1.5">
        Want a head start? Everything below is editable, deletable, and entirely yours. This sheet never appears again.
      </div>
      <div class="sechead" style="margin-top:18px">Sources</div>
      <div class="chips" style="padding-top:2px">
        @for (s of sources; track s) {
          <button class="chip" [class.on]="pickedSources().has(s)" (click)="toggleSource(s)">{{ s }}</button>
        }
      </div>
      <div class="sechead" style="margin-top:14px">Break ideas</div>
      <div class="chips" style="padding-top:2px">
        @for (m of menu; track m.label) {
          <button class="chip" [class.on]="pickedMenu().has(m.label)" (click)="toggleMenu(m.label)">{{ m.label }}</button>
        }
      </div>
      <button class="bigbtn" (click)="accept()">Add these</button>
      <button class="bigbtn quiet" (click)="skip()">Skip</button>
    </div>
  `
})
export class StarterSheetComponent {
  private store = inject(StoreService);
  done = output();

  sources = STARTER_SOURCES;
  menu = STARTER_MENU;

  pickedSources = signal(new Set(STARTER_SOURCES));
  pickedMenu = signal(new Set(STARTER_MENU.map(m => m.label)));

  toggleSource(s: string): void {
    this.pickedSources.update(set => {
      const next = new Set(set);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  toggleMenu(label: string): void {
    this.pickedMenu.update(set => {
      const next = new Set(set);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  accept(): void {
    const items = this.menu.filter(m => this.pickedMenu().has(m.label));
    void this.store.submitStarter([...this.pickedSources()], items);
    this.done.emit();
  }

  skip(): void {
    void this.store.submitStarter([], []);
    this.done.emit();
  }
}
