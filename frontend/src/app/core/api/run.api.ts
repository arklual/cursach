import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { EnqueueRunInput, NodeRun, WorkflowRun } from './api.models';

/**
 * REST-обёртка над запусками workflow.
 *   POST /workflows/{id}/runs       — enqueue (202)
 *   GET  /workflows/{id}/runs       — список запусков
 *   GET  /workflow-runs/{runId}     — статус запуска
 *   GET  /node-runs/{nodeRunId}     — input/output одной ноды
 */
@Injectable({ providedIn: 'root' })
export class RunApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    enqueue(workflowId: string, input: EnqueueRunInput): Observable<WorkflowRun> {
        return this.http.post<WorkflowRun>(`${this.base}/workflows/${workflowId}/runs`, input);
    }

    list(workflowId: string): Observable<WorkflowRun[]> {
        return this.http.get<WorkflowRun[]>(`${this.base}/workflows/${workflowId}/runs`);
    }

    get(runId: string): Observable<WorkflowRun> {
        return this.http.get<WorkflowRun>(`${this.base}/workflow-runs/${runId}`);
    }

    getNodeRun(nodeRunId: string): Observable<NodeRun> {
        return this.http.get<NodeRun>(`${this.base}/node-runs/${nodeRunId}`);
    }
}
