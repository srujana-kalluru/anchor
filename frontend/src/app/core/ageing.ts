import { Task } from './models';

const DAY_MS = 86_400_000;

export function ageBasis(t: Task): number {
  const captured = Date.parse(t.capturedAt);
  const acted = t.lastActedAt ? Date.parse(t.lastActedAt) : 0;
  return Math.max(captured, acted);
}

/** A task with a future due date is scheduled, not stale; it does not age until the date arrives. */
export function isAgeingSuspended(t: Task, now = new Date()): boolean {
  if (!t.dueDate) return false;
  return t.dueDate > localIsoDate(now);
}

export function ageDays(t: Task, now = Date.now()): number {
  if (isAgeingSuspended(t, new Date(now))) return 0;
  return Math.floor((now - ageBasis(t)) / DAY_MS);
}

export type AgeBand = 'fresh' | 'labelled' | 'amber' | 'simmering';

export function ageBand(t: Task, now = Date.now()): AgeBand {
  const d = ageDays(t, now);
  if (d >= 14) return 'simmering';
  if (d >= 7) return 'amber';
  if (d >= 3) return 'labelled';
  return 'fresh';
}

export function ageLabel(t: Task, now = Date.now()): string | null {
  const d = ageDays(t, now);
  return d >= 3 ? `${d} days` : null;
}

export function capturedLabel(t: Task, now = Date.now()): string {
  const d = Math.floor((now - Date.parse(t.capturedAt)) / DAY_MS);
  if (d <= 0) return 'Captured today';
  if (d === 1) return 'Captured yesterday';
  return `Captured ${d} days ago`;
}

export function dueLabel(t: Task, now = new Date()): { text: string; over: boolean } | null {
  if (!t.dueDate || t.status === 'done') return null;
  const today = localIsoDate(now);
  const tomorrow = localIsoDate(new Date(now.getTime() + DAY_MS));
  if (t.dueDate < today) return { text: 'Overdue', over: true };
  if (t.dueDate === today) return { text: 'Due today', over: false };
  if (t.dueDate === tomorrow) return { text: 'Due tomorrow', over: false };
  return null;
}

export function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
