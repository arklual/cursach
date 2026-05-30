import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
    Workflow,
    WorkflowCreateRequest,
    WorkflowGraph,
    WorkflowMeta,
    WorkflowMetaUpdateRequest,
    WorkflowVersion,
} from './api.models';

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
    private readonly http = inject(HttpClient);
    private readonly base = environment.apiBaseUrl;

    list(): Observable<WorkflowMeta[]> {
        return this.http.get<WorkflowMeta[]>(`${this.base}/workflows`);
    }

    get(workflowId: string): Observable<Workflow> {
        return this.http.get<Workflow>(`${this.base}/workflows/${workflowId}`);
    }

    create(req: WorkflowCreateRequest): Observable<Workflow> {
        return this.http.post<Workflow>(`${this.base}/workflows`, req);
    }

    updateMeta(workflowId: string, req: WorkflowMetaUpdateRequest): Observable<WorkflowMeta> {
        return this.http.put<WorkflowMeta>(`${this.base}/workflows/${workflowId}`, req);
    }

    delete(workflowId: string): Observable<void> {
        return this.http.delete<void>(`${this.base}/workflows/${workflowId}`);
    }

    listVersions(workflowId: string): Observable<WorkflowVersion[]> {
        return this.http.get<WorkflowVersion[]>(`${this.base}/workflows/${workflowId}/versions`);
    }

    createVersion(workflowId: string): Observable<WorkflowVersion> {
        return this.http.post<WorkflowVersion>(`${this.base}/workflows/${workflowId}/versions`, {});
    }

    putGraph(versionId: string, graph: WorkflowGraph): Observable<WorkflowGraph> {
        return this.http.put<WorkflowGraph>(`${this.base}/workflow-versions/${versionId}/graph`, graph);
    }
}
