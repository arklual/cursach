import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { WorkflowGraph } from './api.models';

/**
 * Именованные снепшоты графа workflow поверх автосейва.
 * Контракт описан в backend/swagger.yaml -> /workflows/{id}/snapshots*.
 */
export interface WorkflowSnapshot {
    id: string;
    workflowId: string;
    name: string;
    description?: string | null;
    createdAt: string;
}

export interface CreateSnapshotRequest {
    name: string;
    description?: string | null;
}

@Injectable({ providedIn: 'root' })
export class WorkflowSnapshotApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    list(workflowId: string): Observable<WorkflowSnapshot[]> {
        return this.http.get<WorkflowSnapshot[]>(`${this.base}/workflows/${workflowId}/snapshots`);
    }

    create(workflowId: string, req: CreateSnapshotRequest): Observable<WorkflowSnapshot> {
        return this.http.post<WorkflowSnapshot>(
            `${this.base}/workflows/${workflowId}/snapshots`,
            req,
        );
    }

    delete(workflowId: string, snapshotId: string): Observable<void> {
        return this.http.delete<void>(
            `${this.base}/workflows/${workflowId}/snapshots/${snapshotId}`,
        );
    }

    restore(workflowId: string, snapshotId: string): Observable<WorkflowGraph> {
        return this.http.post<WorkflowGraph>(
            `${this.base}/workflows/${workflowId}/snapshots/${snapshotId}/restore`,
            {},
        );
    }
}
