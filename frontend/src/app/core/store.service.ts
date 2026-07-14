import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, ConflictError, QueuedOffline } from './api.service';
import { idb } from './idb';
import { localIsoDate } from './ageing';
import { chime, confetti } from './feedback';
import {
  Category, Delta, InsightsSummary, MenuItem, Recurrence, Requestor, Source, Step, Task,
  TaskPatchResult, TaskStatus, User
} from './models';

interface Snapshot {
  tasks: Task[];
  categories: Category[];
  sources: Source[];
  requestors: Requestor[];
  menuItems: MenuItem[];
  user: User | null;
  insights: InsightsSummary | null;
  since: string;
}

@Injectable({ providedIn: 'root' })
export class StoreService {
  private api = inject(ApiService);

  readonly user = signal<User | null>(null);
  readonly tasks = signal<Task[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly sources = signal<Source[]>([]);
  readonly requestors = signal<Requestor[]>([]);
  readonly menuItems = signal<MenuItem[]>([]);
  readonly insights = signal<InsightsSummary | null>(null);
  readonly loaded = signal(false);
  readonly lastProgressAt = signal<number>(0);

  readonly syncState = computed<'synced' | 'syncing' | 'offline'>(() => {
    if (!this.api.online()) return 'offline';
    if (this.api.syncing() || this.api.queueSize() > 0) return 'syncing';
    return 'synced';
  });

  private since = new Date(0).toISOString();
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    const snap = await idb.kvGet<Snapshot>('snapshot');
    if (snap) {
      this.tasks.set(snap.tasks);
      this.categories.set(snap.categories);
      this.sources.set(snap.sources);
      this.requestors.set(snap.requestors);
      this.menuItems.set(snap.menuItems);
      this.user.set(snap.user);
      this.insights.set(snap.insights);
      this.since = snap.since;
      this.loaded.set(true);
    }
    this.lastProgressAt.set((await idb.kvGet<number>('lastProgressAt')) ?? 0);
    await this.refresh();
    this.loaded.set(true);
    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => void this.poll(), 30_000);
    }
  }

  // Resources load independently; a single failed request must never block the rest.
  // Anything that failed retries with backoff.
  async refresh(): Promise<void> {
    try {
      await this.api.replay();
    } catch {
      // Queue replay retries on the next poll.
    }
    const [user, tasks, categories, sources, requestors, menuItems, insights] = await Promise.allSettled([
      this.api.get<User>('/api/v1/users/me'),
      this.api.get<Task[]>('/api/v1/tasks'),
      this.api.get<Category[]>('/api/v1/categories'),
      this.api.get<Source[]>('/api/v1/sources'),
      this.api.get<Requestor[]>('/api/v1/requestors'),
      this.api.get<MenuItem[]>('/api/v1/dopamine-menu'),
      this.api.get<InsightsSummary>('/api/v1/insights/summary')
    ]);
    if (user.status === 'fulfilled') {
      this.user.set(user.value);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (user.value.timezone !== tz) {
        void this.patchUser({ timezone: tz });
      }
    }
    if (tasks.status === 'fulfilled') {
      this.tasks.set(tasks.value);
      this.since = new Date().toISOString();
      this.autoSurfaceDue();
    }
    if (categories.status === 'fulfilled') this.categories.set(categories.value);
    if (sources.status === 'fulfilled') this.sources.set(sources.value);
    if (requestors.status === 'fulfilled') this.requestors.set(requestors.value);
    if (menuItems.status === 'fulfilled') this.menuItems.set(menuItems.value);
    if (insights.status === 'fulfilled') this.insights.set(insights.value);
    const results = [user, tasks, categories, sources, requestors, menuItems, insights];
    if (results.some(r => r.status === 'fulfilled')) {
      void this.api.write('POST', '/api/v1/activity/ping', { date: localIsoDate() }).catch(() => undefined);
    }
    if (results.some(r => r.status === 'rejected')) {
      this.scheduleRefreshRetry();
    } else {
      this.refreshRetries = 0;
    }
    await this.persist();
  }

  private refreshRetries = 0;

  private scheduleRefreshRetry(): void {
    if (this.refreshRetries >= 5) return;
    const delay = Math.min(30_000, 3000 * 2 ** this.refreshRetries++);
    setTimeout(() => void this.refresh(), delay);
  }

  private async poll(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const progressed = await this.api.replay();
      if (!this.user()) {
        this.user.set(await this.api.get<User>('/api/v1/users/me'));
      }
      const delta = await this.api.get<Delta>(`/api/v1/sync/delta?since=${encodeURIComponent(this.since)}`);
      this.applyDelta(delta);
      this.autoSurfaceDue();
      if (progressed) {
        this.insights.set(await this.api.get<InsightsSummary>('/api/v1/insights/summary'));
      }
      await this.persist();
    } catch {
      // Next tick retries.
    }
  }

  async refreshInsights(): Promise<void> {
    try {
      this.insights.set(await this.api.get<InsightsSummary>('/api/v1/insights/summary'));
      await this.persist();
    } catch {
      // Keep the cached tiles.
    }
  }

  private applyDelta(d: Delta): void {
    this.since = d.serverTime;
    if (d.tasks.length) {
      this.tasks.update(list => mergeById(list, d.tasks));
    }
    if (d.steps.length) {
      this.tasks.update(list => list.map(t => {
        const mine = d.steps.filter(s => s.taskId === t.id);
        if (!mine.length) return t;
        return { ...t, steps: mergeById(t.steps, mine).sort((a, b) => a.sortOrder - b.sortOrder) };
      }));
    }
    if (d.categories.length) this.categories.update(list => mergeById(list, d.categories));
    if (d.sources.length) this.sources.update(list => mergeById(list, d.sources));
    if (d.requestors.length) {
      this.requestors.update(list => mergeById(list, d.requestors));
      // Apply cross-device requestor renames to the tasks that reference them.
      const names = new Map(this.requestors().map(r => [r.id, r.name]));
      this.tasks.update(list => list.map(t =>
        t.requestorId && names.has(t.requestorId) && names.get(t.requestorId) !== t.requestorName
          ? { ...t, requestorName: names.get(t.requestorId)! }
          : t));
    }
    if (d.menuItems.length) this.menuItems.update(list => mergeById(list, d.menuItems));
  }

  /** A task whose due date has arrived surfaces into Today. */
  private autoSurfaceDue(): void {
    const today = localIsoDate();
    for (const t of this.tasks()) {
      if (t.status === 'backlog' && t.dueDate && t.dueDate <= today && !t.deletedAt) {
        void this.patchTask(t.id, { status: 'today' });
      }
    }
  }

  // ---- tasks ----

  async createTask(input: { title: string; requestorName?: string; sourceId?: string }): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      categoryId: null,
      sourceId: input.sourceId ?? null,
      requestorId: null,
      requestorName: input.requestorName?.trim() || null,
      dueDate: null,
      recurrence: null,
      recurredFrom: null,
      status: 'backlog',
      capturedAt: now,
      lastActedAt: null,
      completedAt: null,
      sortOrder: Math.max(0, ...this.tasks().map(t => t.sortOrder)) + 1,
      updatedAt: now,
      deletedAt: null,
      steps: []
    };
    this.tasks.update(list => [...list, task]);
    void this.persist();
    try {
      const saved = await this.api.write<Task>('POST', '/api/v1/tasks', {
        id: task.id,
        title: task.title,
        sourceId: task.sourceId,
        requestorName: task.requestorName,
        capturedAt: task.capturedAt
      });
      this.upsertTask(saved);
    } catch (e) {
      this.swallowQueued(e);
    }
    return task;
  }

  async patchTask(id: string, patch: Partial<{
    title: string; categoryId: string | null; sourceId: string | null; requestorName: string | null;
    dueDate: string | null; recurrence: Recurrence; status: TaskStatus; sortOrder: number;
  }>): Promise<void> {
    const opTimestamp = new Date().toISOString();
    const before = this.tasks().find(t => t.id === id);
    if (!before) return;
    const local: Task = { ...before, ...patch as Partial<Task>, updatedAt: opTimestamp };
    if (patch.status && patch.status !== before.status) {
      local.lastActedAt = opTimestamp;
      if (patch.status === 'done') {
        local.completedAt = opTimestamp;
      } else {
        local.completedAt = null;
      }
    }
    this.upsertTask(local);
    if (patch.status === 'done' && before.status !== 'done') {
      this.celebrate();
    }
    try {
      const result = await this.api.write<TaskPatchResult>('PATCH', `/api/v1/tasks/${id}`, { ...patch, opTimestamp });
      this.upsertTask(result.task);
      if (result.nextInstance) {
        this.upsertTask(result.nextInstance);
      }
    } catch (e) {
      if (e instanceof ConflictError && e.current) {
        this.upsertTask(e.current as Task);
      } else {
        this.swallowQueued(e);
      }
    }
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.update(list => list.filter(t => t.id !== id));
    void this.persist();
    try {
      await this.api.write('DELETE', `/api/v1/tasks/${id}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async addStep(taskId: string, title: string): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    const step: Step = {
      id: crypto.randomUUID(),
      taskId,
      title: title.trim(),
      complete: false,
      sortOrder: task.steps.length,
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    this.upsertTask({ ...task, steps: [...task.steps, step] });
    try {
      await this.api.write('POST', `/api/v1/tasks/${taskId}/steps`, {
        id: step.id, title: step.title, sortOrder: step.sortOrder
      });
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async patchStep(taskId: string, stepId: string, patch: Partial<{ title: string; complete: boolean; sortOrder: number }>): Promise<void> {
    const opTimestamp = new Date().toISOString();
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    const steps = task.steps.map(s => (s.id === stepId ? { ...s, ...patch, updatedAt: opTimestamp } : s));
    const local: Task = { ...task, steps };
    if (patch.complete) {
      local.lastActedAt = opTimestamp;
      this.noteProgress();
    }
    this.upsertTask(local);
    try {
      await this.api.write('PATCH', `/api/v1/steps/${stepId}`, { ...patch, opTimestamp });
    } catch (e) {
      if (e instanceof ConflictError) return;
      this.swallowQueued(e);
    }
  }

  async deleteStep(taskId: string, stepId: string): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    this.upsertTask({ ...task, steps: task.steps.filter(s => s.id !== stepId) });
    try {
      await this.api.write('DELETE', `/api/v1/steps/${stepId}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async reorderSteps(taskId: string, orderedIds: string[]): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    const steps = orderedIds
      .map((id, i) => ({ ...task.steps.find(s => s.id === id)!, sortOrder: i }))
      .filter(Boolean);
    this.upsertTask({ ...task, steps });
    for (const [i, id] of orderedIds.entries()) {
      void this.patchStep(taskId, id, { sortOrder: i });
    }
  }

  // ---- focus sessions ----

  async startSession(taskId: string): Promise<string> {
    const id = crypto.randomUUID();
    try {
      await this.api.write('POST', '/api/v1/focus-sessions', { id, taskId, startedAt: new Date().toISOString() });
    } catch (e) {
      this.swallowQueued(e);
    }
    return id;
  }

  async endSession(id: string, completed: boolean): Promise<void> {
    if (completed) this.noteProgress();
    try {
      await this.api.write('PATCH', `/api/v1/focus-sessions/${id}`, {
        endedAt: new Date().toISOString(), completed
      });
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  // ---- lists ----

  async addCategory(name: string, colourHex: string): Promise<Category> {
    const cat: Category = { id: crypto.randomUUID(), name, colourHex, updatedAt: new Date().toISOString(), deletedAt: null };
    this.categories.update(l => [...l, cat]);
    try {
      await this.api.write('POST', '/api/v1/categories', { id: cat.id, name, colourHex });
    } catch (e) {
      this.swallowQueued(e);
    }
    return cat;
  }

  async patchCategory(id: string, patch: Partial<{ name: string; colourHex: string }>): Promise<void> {
    this.categories.update(l => l.map(c => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await this.api.write('PATCH', `/api/v1/categories/${id}`, patch);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    this.categories.update(l => l.filter(c => c.id !== id));
    try {
      await this.api.write('DELETE', `/api/v1/categories/${id}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async addSource(name: string): Promise<Source> {
    const src: Source = { id: crypto.randomUUID(), name, updatedAt: new Date().toISOString(), deletedAt: null };
    this.sources.update(l => [...l, src]);
    try {
      await this.api.write('POST', '/api/v1/sources', { id: src.id, name });
    } catch (e) {
      this.swallowQueued(e);
    }
    return src;
  }

  async patchSource(id: string, name: string): Promise<void> {
    this.sources.update(l => l.map(s => (s.id === id ? { ...s, name } : s)));
    try {
      await this.api.write('PATCH', `/api/v1/sources/${id}`, { name });
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async deleteSource(id: string): Promise<void> {
    this.sources.update(l => l.filter(s => s.id !== id));
    try {
      await this.api.write('DELETE', `/api/v1/sources/${id}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async patchRequestor(id: string, name: string): Promise<void> {
    this.requestors.update(l => l.map(r => (r.id === id ? { ...r, name } : r)));
    this.tasks.update(l => l.map(t => (t.requestorId === id ? { ...t, requestorName: name } : t)));
    try {
      await this.api.write('PATCH', `/api/v1/requestors/${id}`, { name });
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async deleteRequestor(id: string): Promise<void> {
    this.requestors.update(l => l.filter(r => r.id !== id));
    try {
      await this.api.write('DELETE', `/api/v1/requestors/${id}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async addMenuItem(item: Omit<MenuItem, 'id' | 'updatedAt' | 'deletedAt'>): Promise<void> {
    const m: MenuItem = { ...item, id: crypto.randomUUID(), updatedAt: new Date().toISOString(), deletedAt: null };
    this.menuItems.update(l => [...l, m]);
    try {
      await this.api.write('POST', '/api/v1/dopamine-menu', {
        id: m.id, course: m.course, label: m.label, durationMinutes: m.durationMinutes, sortOrder: m.sortOrder
      });
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async patchMenuItem(id: string, patch: Partial<{ label: string; durationMinutes: number | null; sortOrder: number }>): Promise<void> {
    this.menuItems.update(l => l.map(m => (m.id === id ? { ...m, ...patch } : m)));
    try {
      await this.api.write('PATCH', `/api/v1/dopamine-menu/${id}`, patch);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  async deleteMenuItem(id: string): Promise<void> {
    this.menuItems.update(l => l.filter(m => m.id !== id));
    try {
      await this.api.write('DELETE', `/api/v1/dopamine-menu/${id}`);
    } catch (e) {
      this.swallowQueued(e);
    }
  }

  // ---- user ----

  async patchUser(patch: Partial<{
    displayName: string; timezone: string; digestEnabled: boolean; digestTime: string;
    focusMinutes: number; breakMinutes: number; keepScreenOn: boolean;
  }>): Promise<void> {
    const u = this.user();
    if (u) this.user.set({ ...u, ...patch });
    try {
      const saved = await this.api.write<User>('PATCH', '/api/v1/users/me', patch);
      this.user.set(saved);
    } catch (e) {
      this.swallowQueued(e);
    }
    void this.persist();
  }

  async submitStarter(sources: string[], menuItems: { course: string; label: string; durationMinutes: number | null }[]): Promise<void> {
    const u = this.user();
    if (u) this.user.set({ ...u, starterOffered: true });
    try {
      await this.api.write('POST', '/api/v1/users/me/starter', { sources, menuItems });
      this.sources.set(await this.api.get<Source[]>('/api/v1/sources'));
      this.menuItems.set(await this.api.get<MenuItem[]>('/api/v1/dopamine-menu'));
    } catch (e) {
      this.swallowQueued(e);
    }
    void this.persist();
  }

  async deleteAccount(): Promise<void> {
    await this.api.write('DELETE', '/api/v1/users/me');
    await idb.queueClear();
    await idb.kvSet('snapshot', null);
  }

  celebrate(): void {
    confetti();
    chime();
    this.noteProgress();
  }

  noteProgress(): void {
    this.lastProgressAt.set(Date.now());
    void idb.kvSet('lastProgressAt', Date.now());
  }

  taskById(id: string): Task | undefined {
    return this.tasks().find(t => t.id === id);
  }

  private upsertTask(task: Task): void {
    this.tasks.update(list => {
      const idx = list.findIndex(t => t.id === task.id);
      if (task.deletedAt) return list.filter(t => t.id !== task.id);
      if (idx === -1) return [...list, task];
      const next = [...list];
      next[idx] = task;
      return next;
    });
    void this.persist();
  }

  private swallowQueued(e: unknown): void {
    if (!(e instanceof QueuedOffline)) {
      console.warn('write failed', e);
    }
  }

  private async persist(): Promise<void> {
    const snap: Snapshot = {
      tasks: this.tasks(),
      categories: this.categories(),
      sources: this.sources(),
      requestors: this.requestors(),
      menuItems: this.menuItems(),
      user: this.user(),
      insights: this.insights(),
      since: this.since
    };
    await idb.kvSet('snapshot', snap).catch(() => undefined);
  }
}

function mergeById<T extends { id: string; deletedAt?: string | null }>(list: T[], incoming: T[]): T[] {
  const map = new Map(list.map(x => [x.id, x]));
  for (const item of incoming) {
    if (item.deletedAt) {
      map.delete(item.id);
    } else {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...existing, ...item } : item);
    }
  }
  return [...map.values()];
}
