import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DebugFailedNode {
    nodeId: string;
    message: string;
}

export interface DebugSessionDto {
    sessionId: string;
    workflowId: string;
    versionId: string;
    status: 'ready' | 'stepping' | 'done' | 'failed';
    input: unknown;
    outputs: Record<string, unknown>;
    completed: string[];
    skipped: string[];
    failed: DebugFailedNode[];
    ready: string[];
    createdAt: string;
    updatedAt: string;
    readyInputs: Record<string, unknown>;
}

export interface DebugStartRequest {
    input?: unknown;
    startNodeId?: string;
}

export interface DebugStepRequest {
    nodeId?: string;
}

export interface DebugNodeRunResult {
    runId: string;
    workflowId: string;
    nodeId: string;
    status: 'success' | 'failed';
    input?: unknown;
    output?: unknown;
    errorMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class DebugApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    runNode(workflowId: string, nodeId: string, input: unknown): Observable<DebugNodeRunResult> {
        return this.http.post<DebugNodeRunResult>(
            `${this.base}/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}/debug-run`,
            { input },
        );
    }

    start(workflowId: string, body: DebugStartRequest = {}): Observable<DebugSessionDto> {
        return this.http.post<DebugSessionDto>(
            `${this.base}/workflows/${workflowId}/debug-sessions`,
            body,
        );
    }

    get(sessionId: string): Observable<DebugSessionDto> {
        return this.http.get<DebugSessionDto>(`${this.base}/debug-sessions/${sessionId}`);
    }

    step(sessionId: string, nodeId?: string): Observable<DebugSessionDto> {
        return this.http.post<DebugSessionDto>(
            `${this.base}/debug-sessions/${sessionId}/step`,
            { nodeId } as DebugStepRequest,
        );
    }

    runToEnd(sessionId: string): Observable<DebugSessionDto> {
        return this.http.post<DebugSessionDto>(
            `${this.base}/debug-sessions/${sessionId}/run-to-end`,
            {},
        );
    }

    close(sessionId: string): Observable<void> {
        return this.http.delete<void>(`${this.base}/debug-sessions/${sessionId}`);
    }
}
