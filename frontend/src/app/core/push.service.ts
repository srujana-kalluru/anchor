import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { idb } from './idb';

@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(ApiService);

  get available(): boolean {
    return this.swPush.isEnabled && !!environment.vapidPublicKey;
  }

  async enable(): Promise<void> {
    if (!this.available) {
      throw new Error('Push is available once the app is installed and served over HTTPS.');
    }
    const sub = await this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const saved = await this.api.write<{ id: string; endpoint: string }>('POST', '/api/v1/push/subscriptions', {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    });
    await idb.kvSet('pushSubscriptionId', saved.id);
  }

  async disable(): Promise<void> {
    const id = await idb.kvGet<string>('pushSubscriptionId');
    if (id) {
      await this.api.write('DELETE', `/api/v1/push/subscriptions/${id}`).catch(() => undefined);
      await idb.kvSet('pushSubscriptionId', null);
    }
    await this.swPush.unsubscribe().catch(() => undefined);
  }
}
