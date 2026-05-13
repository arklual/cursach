import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Trigger, TriggerCreateRequest } from './api.models';

/**
 * REST-обёртка над /workflows/{id}/triggers, /triggers/{id} и /webhook/{token}.
 */
@Injectable({ providedIn: 'root' })
export class TriggerApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    list(workflowId: string): Observable<Trigger[]> {
        return this.http.get<Trigger[]>(`${this.base}/workflows/${workflowId}/triggers`);
    }

    create(workflowId: string, req: TriggerCreateRequest): Observable<Trigger> {
        return this.http.post<Trigger>(`${this.base}/workflows/${workflowId}/triggers`, req);
    }

    delete(triggerId: string): Observable<void> {
        return this.http.delete<void>(`${this.base}/triggers/${triggerId}`);
    }

    invokeWebhook(token: string, payload: unknown): Observable<void> {
        return this.http.post<void>(`${this.base}/webhook/${token}`, payload);
    }
}
