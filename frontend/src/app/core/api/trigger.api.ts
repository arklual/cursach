import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { WebhookAccepted } from './api.models';

export interface Trigger {
    id: string;
    workflowId: string;
    nodeId: string;
    type: 'webhook' | 'cron' | 'interval';
    config?: Record<string, unknown> | null;
    token?: string | null;
}

/**
 * REST-обёртка над /workflows/{id}/triggers и /webhook/{token}.
 * Триггеры синхронизируются из графа на бэке (см. TriggerService.syncFromGraph),
 * так что фронт только читает список и опционально дёргает webhook.
 */
@Injectable({ providedIn: 'root' })
export class TriggerApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    list(workflowId: string): Observable<Trigger[]> {
        return this.http.get<Trigger[]>(`${this.base}/workflows/${workflowId}/triggers`);
    }

    invokeWebhook(token: string, payload: unknown): Observable<WebhookAccepted> {
        return this.http.post<WebhookAccepted>(`${this.base}/webhook/${token}`, payload);
    }
}
