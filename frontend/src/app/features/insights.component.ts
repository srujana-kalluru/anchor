import { Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { StoreService } from '../core/store.service';
import { localIsoDate } from '../core/ageing';

@Component({
  selector: 'app-insights',
  template: `
    <div class="page">
      <div class="greet" style="font-size:23px">Insights</div>
      <div class="subline">What happened, never what didn't.</div>

      @if (store.insights(); as ins) {
        <div class="tile">
          <h5>This week</h5>
          <div class="three">
            <div>
              <div class="n">{{ ins.thisWeek.captured }}</div>
              <div class="l">captured</div>
              <div class="lw">{{ ins.lastWeek.captured }} last week</div>
            </div>
            <div>
              <div class="n">{{ ins.thisWeek.completed }}</div>
              <div class="l">completed</div>
              <div class="lw">{{ ins.lastWeek.completed }} last week</div>
            </div>
            <div>
              <div class="n">{{ ins.thisWeek.focusSessions }}</div>
              <div class="l">focus sessions</div>
              <div class="lw">{{ ins.lastWeek.focusSessions }} last week</div>
            </div>
          </div>
        </div>

        <div class="tile">
          <h5>Consistency</h5>
          <div style="font-size:16px;font-weight:500;margin-top:9px">
            Used {{ ins.daysUsedOfLast14 }} of the last 14 days
          </div>
          <div class="dots">
            @for (day of last14(); track day) {
              <i [class.off]="!activeSet().has(day)" [title]="day"></i>
            }
          </div>
        </div>

        <div class="tile">
          <h5>Flow</h5>
          @if (flowLabel(); as f) {
            <div class="flow">{{ f }}<small>median capture → done, last 4 weeks</small></div>
          } @else {
            <div class="flow" style="color:var(--ink3);font-weight:400">
              Nothing completed yet.<small>this fills in as tasks get done</small>
            </div>
          }
        </div>

        <div class="tile">
          <h5>Sources · 4 weeks</h5>
          @for (s of topSources(); track s.name) {
            <div class="bar">
              <div class="brow"><b>{{ s.name }}</b><span>{{ pct(s.count) }}%</span></div>
              <div class="track"><div class="fill" [style.width.%]="pct(s.count)" [style.opacity]="opacity($index)"></div></div>
            </div>
          } @empty {
            <div style="font-size:13.5px;color:var(--ink3);margin-top:8px">No captures in range yet.</div>
          }
        </div>

        <button class="tile" style="width:100%;text-align:left" (click)="goToday()">
          <h5>Simmering</h5>
          @if (ins.simmeringCount > 0) {
            <div class="flow">
              {{ ins.simmeringCount }} task{{ ins.simmeringCount === 1 ? '' : 's' }} simmering
              <small>oldest has waited {{ ins.oldestSimmeringDays }} days · tap to review</small>
            </div>
          } @else {
            <div class="flow" style="color:var(--ink3);font-weight:400">
              Nothing is simmering.<small>the ageing system is quiet</small>
            </div>
          }
        </button>
      } @else {
        <div class="empty">Insights appear after your first sync.</div>
      }
    </div>
  `
})
export class InsightsComponent implements OnInit {
  store = inject(StoreService);
  private router = inject(Router);

  ngOnInit(): void {
    void this.store.refreshInsights();
  }

  last14 = computed(() => {
    const days: string[] = [];
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      days.push(localIsoDate(new Date(now - i * 86_400_000)));
    }
    return days;
  });

  activeSet = computed(() => new Set(this.store.insights()?.activeDays ?? []));

  flowLabel = computed(() => {
    const s = this.store.insights()?.flowMedianSeconds;
    if (s == null) return null;
    const days = s / 86_400;
    if (days < 1) {
      const hours = Math.max(1, Math.round(s / 3600));
      return `Requests usually take you ${hours} hour${hours === 1 ? '' : 's'}.`;
    }
    const d = Math.round(days);
    return `Requests usually take you ${d} day${d === 1 ? '' : 's'}.`;
  });

  topSources = computed(() => (this.store.insights()?.sources ?? []).slice(0, 5));

  private total = computed(() => this.topSources().reduce((a, b) => a + b.count, 0) || 1);

  pct(count: number): number {
    return Math.round((count / this.total()) * 100);
  }

  opacity(index: number): number {
    return Math.max(0.35, 1 - index * 0.18);
  }

  goToday(): void {
    void this.router.navigate(['/today']);
  }
}
