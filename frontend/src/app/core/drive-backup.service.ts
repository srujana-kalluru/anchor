import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SupabaseService } from './supabase.service';
import { localIsoDate } from './ageing';

const LS_ENABLED = 'anchor.driveBackup';
const LS_LAST = 'anchor.driveBackupAt';
export const LS_PENDING = 'anchor.pendingDriveBackup';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Anchor Backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Writes a dated, complete export of the account into the user's Google Drive.
 * Google's access token only lives while a session is fresh, so a backup that
 * finds no token asks the user to reconnect rather than failing silently.
 */
@Injectable({ providedIn: 'root' })
export class DriveBackupService {
  private api = inject(ApiService);
  private supabase = inject(SupabaseService);

  readonly enabled = signal(localStorage.getItem(LS_ENABLED) === 'on');
  readonly lastBackupAt = signal<number>(Number(localStorage.getItem(LS_LAST) ?? 0));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  get tokenAvailable(): boolean {
    return !!this.supabase.providerToken();
  }

  setEnabled(on: boolean): void {
    this.enabled.set(on);
    localStorage.setItem(LS_ENABLED, on ? 'on' : 'off');
  }

  async maybeAutoBackup(): Promise<void> {
    if (!this.enabled() || this.busy() || !this.tokenAvailable) return;
    if (Date.now() - this.lastBackupAt() < 20 * 3600_000) return;
    await this.backupNow().catch(() => undefined);
  }

  async backupNow(): Promise<void> {
    const token = this.supabase.providerToken();
    if (!token) throw new Error('RECONNECT');
    this.busy.set(true);
    this.error.set(null);
    try {
      const data = await this.api.get<Record<string, unknown>>(
        '/api/v1/sync/delta?since=1970-01-01T00:00:00Z');
      const body = JSON.stringify({ app: 'anchor', exportedAt: new Date().toISOString(), ...data });
      const folderId = await this.ensureFolder(token);
      const name = `anchor-backup-${localIsoDate()}.json`;
      const existingId = await this.findFile(token, folderId, name);
      await this.upload(token, folderId, name, body, existingId);
      const now = Date.now();
      this.lastBackupAt.set(now);
      localStorage.setItem(LS_LAST, String(now));
    } catch (e) {
      const msg = e instanceof Error && e.message === 'RECONNECT'
        ? 'RECONNECT'
        : 'Backup failed. Try again in a moment.';
      this.error.set(msg === 'RECONNECT' ? null : msg);
      throw new Error(msg);
    } finally {
      this.busy.set(false);
    }
  }

  private async drive(token: string, path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` }
    });
    if (res.status === 401 || res.status === 403) throw new Error('RECONNECT');
    if (!res.ok) throw new Error(`drive ${res.status}`);
    return res;
  }

  private async ensureFolder(token: string): Promise<string> {
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
    const found = await this.drive(token, `${DRIVE}/files?q=${q}&fields=files(id)`)
      .then(r => r.json());
    if (found.files?.length) return found.files[0].id;
    const created = await this.drive(token, `${DRIVE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
    }).then(r => r.json());
    return created.id;
  }

  private async findFile(token: string, folderId: string, name: string): Promise<string | null> {
    const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
    const found = await this.drive(token, `${DRIVE}/files?q=${q}&fields=files(id)`)
      .then(r => r.json());
    return found.files?.[0]?.id ?? null;
  }

  private async upload(token: string, folderId: string, name: string, content: string,
                       existingId: string | null): Promise<void> {
    if (existingId) {
      await this.drive(token, `${DRIVE_UPLOAD}/files/${existingId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content
      });
      return;
    }
    const boundary = 'anchor' + Math.random().toString(36).slice(2);
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [folderId] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      content + `\r\n--${boundary}--`;
    await this.drive(token, `${DRIVE_UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart
    });
  }
}
