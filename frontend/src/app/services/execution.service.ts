import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { WorkflowService } from './workflow.service';
import {
  WorkflowExecution,
  NodeExecutionData,
  NodeExecutionStatus,
} from '../models/execution.model';
import { environment } from '../../environments/environment';

interface BackendExecutionResponse {
  status: 'running' | 'success' | 'error';
  workflowId: string;
  executionId: string;
  startedAt?: string;
  stoppedAt?: string;
  duration?: number;
  nodes: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: NodeExecutionStatus;
    startTime?: string;
    endTime?: string;
    duration?: number;
    inputData?: Array<{ json: Record<string, unknown> }>;
    outputData?: Array<{ json: Record<string, unknown> }>;
    error?: { message: string; details?: string; stack?: string };
    itemsCount?: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ExecutionService {
  private workflowService = inject(WorkflowService);
  private http = inject(HttpClient);

  private currentExecution = signal<WorkflowExecution | null>(null);
  private isExecuting = signal(false);
  private nodeStatuses = signal<Record<string, NodeExecutionStatus>>({});

  readonly execution = computed(() => this.currentExecution());
  readonly executing = computed(() => this.isExecuting());
  readonly nodeStatusesMap = computed(() => this.nodeStatuses());

  executeWorkflow(workflowId: string, fromNodeId?: string): Observable<WorkflowExecution | null> {
    this.isExecuting.set(true);

    const pending: Record<string, NodeExecutionStatus> = {};
    for (const node of this.workflowService.nodes()) {
      pending[node.id] = 'pending';
    }
    this.nodeStatuses.set(pending);
    this.currentExecution.set(null);

    const url = `${environment.apiBaseUrl}/executions`;
    const body = fromNodeId
      ? { workflowId, fromNodeId }
      : { workflowId };

    return this.http.post<BackendExecutionResponse>(url, body).pipe(
      tap(resp => this.applyExecutionResponse(resp)),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      tap(() => this.isExecuting.set(false)),
      catchError(err => {
        console.error('[execution] failed', err);
        this.isExecuting.set(false);
        const message = err?.error?.message ?? err?.message ?? 'Execution request failed';
        this.markAllPendingAsError(message);
        return of(null);
      }),
      // map to internal model
      tap(() => {}),
    ) as unknown as Observable<WorkflowExecution | null>;
  }

  /** Resync execution view from a previous run object (e.g. from history). */
  setExecution(exec: WorkflowExecution | null): void {
    this.currentExecution.set(exec);
    const statuses: Record<string, NodeExecutionStatus> = {};
    for (const n of exec?.nodes ?? []) {
      statuses[n.nodeId] = n.status;
    }
    this.nodeStatuses.set(statuses);
  }

  getNodeExecutionData(nodeId: string): NodeExecutionData | null {
    const exec = this.currentExecution();
    if (!exec) return null;
    return exec.nodes.find(n => n.nodeId === nodeId) ?? null;
  }

  clearExecution(): void {
    this.currentExecution.set(null);
    this.isExecuting.set(false);
    this.nodeStatuses.set({});
  }

  private applyExecutionResponse(resp: BackendExecutionResponse): void {
    const nodes: NodeExecutionData[] = resp.nodes.map(n => ({
      nodeId: n.nodeId,
      nodeName: n.nodeName,
      nodeType: n.nodeType,
      status: n.status,
      startTime: n.startTime,
      endTime: n.endTime,
      duration: n.duration,
      inputData: n.inputData,
      outputData: n.outputData,
      error: n.error,
      itemsCount: n.itemsCount,
    }));

    const statuses: Record<string, NodeExecutionStatus> = {};
    for (const n of nodes) {
      statuses[n.nodeId] = n.status;
    }
    this.nodeStatuses.set(statuses);

    this.currentExecution.set({
      id: resp.executionId,
      workflowId: resp.workflowId,
      status: resp.status,
      startedAt: resp.startedAt,
      stoppedAt: resp.stoppedAt,
      duration: resp.duration,
      nodes,
      nodesTotal: nodes.length,
      nodesExecuted: nodes.filter(n => n.status === 'success' || n.status === 'error').length,
    });
  }

  private markAllPendingAsError(message: string): void {
    const statuses = { ...this.nodeStatuses() };
    const nodes: NodeExecutionData[] = [];
    for (const node of this.workflowService.nodes()) {
      statuses[node.id] = 'error';
      nodes.push({
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: node.data.kind,
        status: 'error',
        error: { message },
      });
    }
    this.nodeStatuses.set(statuses);
    this.currentExecution.set({
      id: `local-error-${Date.now()}`,
      workflowId: '',
      status: 'error',
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
      nodes,
      nodesTotal: nodes.length,
      nodesExecuted: nodes.length,
    });
  }
}
