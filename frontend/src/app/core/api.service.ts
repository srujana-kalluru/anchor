import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { idb, QueuedOp } from './idb';

export class ConflictError extends Error {
  constructor(public readonly current: unknown) {
    super('conflict');
  }
}

export class QueuedOffline extends Error {
  constructor() {
    super('queued offline');
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private supabase = inject(SupabaseService);

  readonly online = signal(navigator.onLine);
  readonly syncing = signal(false);
  readonly queueSize = signal(0);

  private replaying = false;

  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.replay();
    });
    window.addEventListener('offline', () => this.online.set(false));
    void idb.queueAll().then(q => this.queueSize.set(q.length));
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.send('GET', path, undefined);
    return res.json();
  }

  /**
   * Writes are optimistic-by-queue: a network failure stores the operation in IndexedDB and
   * throws QueuedOffline so callers keep their local state; replay() drains the queue in order.
   */
  async write<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    try {
      const res = await this.send(method, path, body);
      if (res.status === 204) return undefined as T;
      return await res.json();
    } catch (e) {
      if (e instanceof ConflictError) throw e;
      if (this.isNetworkError(e)) {
        await idb.queuePush({ method, path, body });
        this.queueSize.update(n => n + 1);
        this.online.set(false);
        throw new QueuedOffline();
      }
      throw e;
    }
  }

  async replay(): Promise<boolean> {
    if (this.replaying) return false;
    this.replaying = true;
    this.syncing.set(true);
    let progressed = false;
    try {
      const ops = await idb.queueAll();
      for (const op of ops) {
        try {
          await this.send(op.method, op.path, op.body);
          await idb.queueDelete(op.seq!);
          progressed = true;
        } catch (e) {
          if (e instanceof ConflictError) {
            // The server's copy is newer; drop the stale op and let delta sync repair local state.
            await idb.queueDelete(op.seq!);
            progressed = true;
            continue;
          }
          if (this.isNetworkError(e)) {
            this.online.set(false);
            break;
          }
          // A non-retryable rejection (validation, missing row) would wedge the queue forever.
          await idb.queueDelete(op.seq!);
          console.warn('dropped queued op after server rejection', op.path, e);
        }
      }
      const remaining = await idb.queueAll();
      this.queueSize.set(remaining.length);
      return progressed;
    } finally {
      this.replaying = false;
      this.syncing.set(false);
    }
  }

  private async send(method: string, path: string, body: unknown): Promise<Response> {
    const token = await this.supabase.token();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(environment.apiUrl + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new TypeError('network unreachable');
    }
    this.online.set(true);
    if (res.status === 409) {
      throw new ConflictError(await res.json().catch(() => null));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed: ${res.status} ${detail}`);
    }
    return res;
  }

  private isNetworkError(e: unknown): boolean {
    return e instanceof TypeError;
  }
}
