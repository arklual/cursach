import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AbAnalyticsResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    getAbAnalytics(workflowId: string, abNodeId: string): Observable<AbAnalyticsResponse> {
        return this.http.get<AbAnalyticsResponse>(
            `${this.base}/workflows/${workflowId}/ab-analytics`,
            { params: { abNodeId } },
        );
    }
}
