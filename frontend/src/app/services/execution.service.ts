import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, Subject, Subscription, catchError, interval, of, switchMap, takeUntil, takeWhile, tap } from 'rxjs';
import { WorkflowService } from './workflow.service';
import { RunApiService } from '../core/api/run.api';
import type { NodeRun, WorkflowRun } from '../core/api/api.models';
import {
  WorkflowExecution,
  NodeExecutionData,
  NodeExecutionStatus,
  ExecutionStatus,
} from '../models/execution.model';

@Injectable({ providedIn: 'root' })
export class ExecutionService {
  private workflowService = inject(WorkflowService);
  private runApi = inject(RunApiService);

  private currentExecution = signal<WorkflowExecution | null>(null);
  private isExecuting = signal(false);
  private nodeStatuses = signal<Record<string, NodeExecutionStatus>>({});

  readonly execution = computed(() => this.currentExecution());
  readonly executing = computed(() => this.isExecuting());
  readonly nodeStatusesMap = computed(() => this.nodeStatuses());

  private stopPolling$ = new Subject<void>();
  private pollSub?: Subscription;

  executeWorkflow(workflowId: string, fromNodeId?: string, input?: unknown): Observable<WorkflowExecution | null> {
    this.cancelPolling();
    this.isExecuting.set(true);

    const pending: Record<string, NodeExecutionStatus> = {};
    for (const node of this.workflowService.nodes()) {
      pending[node.id] = 'pending';
    }
    this.nodeStatuses.set(pending);
    this.currentExecution.set(null);

    const result = new Subject<WorkflowExecution | null>();

    const payload = (input ?? {}) as never;
    this.runApi.enqueue(workflowId, payload, fromNodeId).subscribe({
      next: run => {
        const runId = run.id;
        if (!runId) {
          this.markAllPendingAsError('Backend did not return run id');
          this.isExecuting.set(false);
          result.next(null);
          result.complete();
          return;
        }
        this.applyRun(run);
        this.startPolling(runId, result);
      },
      error: err => {
        console.error('[execution] enqueue failed', err);
        const message = err?.error?.message ?? err?.message ?? 'Execution request failed';
        this.markAllPendingAsError(message);
        this.isExecuting.set(false);
        result.next(null);
        result.complete();
      },
    });

    return result.asObservable();
  }

  setExecution(exec: WorkflowExecution | null): void {
    this.cancelPolling();
    this.currentExecution.set(exec);
    const statuses: Record<string, NodeExecutionStatus> = {};
    for (const n of exec?.nodes ?? []) {
      statuses[n.nodeId] = n.status;
    }
    this.nodeStatuses.set(statuses);
    this.isExecuting.set(false);
  }

  setExecutionFromRun(run: WorkflowRun): void {
    this.cancelPolling();
    this.applyRun(run);
    this.isExecuting.set(false);
  }

  applyRunEvent(evt: { event: string; nodeId?: string; status?: string }): void {
    if (evt.event === 'workflow_started') {
      this.isExecuting.set(true);
      return;
    }
    if (evt.event === 'workflow_finished') {
      this.isExecuting.set(false);
      return;
    }
    if (!evt.nodeId) {
      return;
    }
    const statuses = { ...this.nodeStatuses() };
    statuses[evt.nodeId] = evt.event === 'node_exited'
      ? mapNodeRunStatus(evt.status)
      : 'running';
    this.nodeStatuses.set(statuses);
  }

  setDebugNodeResult(res: { nodeId: string; status: string; input?: unknown; output?: unknown; errorMessage?: string }): void {
    this.cancelPolling();
    const status: NodeExecutionStatus = res.status === 'success' ? 'success' : 'error';
    const graphNode = this.workflowService.nodes().find(n => n.id === res.nodeId);
    const node: NodeExecutionData = {
      nodeId: res.nodeId,
      nodeName: graphNode?.data?.label ?? res.nodeId,
      nodeType: graphNode?.data?.kind ?? '',
      status,
      inputData: toExecutionItems(res.input),
      outputData: toExecutionItems(res.output),
      error: res.errorMessage ? { message: res.errorMessage } : undefined,
    };
    this.nodeStatuses.set({ [res.nodeId]: status });
    this.currentExecution.set({
      id: 'debug',
      workflowId: '',
      status: status === 'success' ? 'success' : 'error',
      nodes: [node],
      nodesTotal: 1,
      nodesExecuted: 1,
    });
    this.isExecuting.set(false);
  }

  getNodeExecutionData(nodeId: string): NodeExecutionData | null {
    const exec = this.currentExecution();
    if (!exec) return null;
    return exec.nodes.find(n => n.nodeId === nodeId) ?? null;
  }

  clearExecution(): void {
    this.cancelPolling();
    this.currentExecution.set(null);
    this.isExecuting.set(false);
    this.nodeStatuses.set({});
  }

  private startPolling(runId: string, result: Subject<WorkflowExecution | null>): void {
    const POLL_MS = 800;
    this.pollSub = interval(POLL_MS).pipe(
      switchMap(() => this.runApi.get(runId).pipe(
        catchError(err => {
          console.warn('[execution] poll failed (will retry)', err);
          return of(null as WorkflowRun | null);
        }),
      )),
      tap(run => {
        if (run) {
          this.applyRun(run);
        }
      }),
      takeWhile(run => {
        if (!run) return true;
        const s = (run.status ?? '').toLowerCase();
        return s !== 'success' && s !== 'failed';
      }, true),
      takeUntil(this.stopPolling$),
    ).subscribe({
      next: () => { },
      complete: () => {
        this.isExecuting.set(false);
        result.next(this.currentExecution());
        result.complete();
      },
      error: err => {
        console.error('[execution] polling stopped on error', err);
        this.isExecuting.set(false);
        result.next(this.currentExecution());
        result.complete();
      },
    });
  }

  private cancelPolling(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = undefined;
    }
    this.stopPolling$.next();
  }

  private applyRun(run: WorkflowRun): void {
    const nodes: NodeExecutionData[] = this.mapNodes(run.nodes ?? []);
    const statuses: Record<string, NodeExecutionStatus> = {};
    for (const n of nodes) {
      statuses[n.nodeId] = n.status;
    }
    for (const node of this.workflowService.nodes()) {
      if (!(node.id in statuses)) {
        statuses[node.id] = 'pending';
      }
    }
    this.nodeStatuses.set(statuses);

    const execStatus = mapRunStatus(run.status);
    this.currentExecution.set({
      id: run.id ?? '',
      workflowId: run.workflowId ?? '',
      status: execStatus,
      startedAt: run.startedAt,
      stoppedAt: run.finishedAt,
      duration: run.durationMs ?? undefined,
      nodes,
      nodesTotal: nodes.length,
      nodesExecuted: nodes.filter(n => n.status === 'success' || n.status === 'error' || n.status === 'skipped').length,
    });
  }

  private mapNodes(runNodes: NodeRun[]): NodeExecutionData[] {
    const graphById = new Map(this.workflowService.nodes().map(n => [n.id, n]));
    return runNodes.map(nr => {
      const graphNode = graphById.get(nr.nodeId ?? '');
      const status = mapNodeRunStatus(nr.status);
      const startTime = nr.startedAt ?? undefined;
      const endTime = nr.finishedAt ?? undefined;
      const duration = computeDuration(startTime, endTime);
      const inputData = toExecutionItems(nr.input);
      const outputData = toExecutionItems(nr.output);
      const error = nr.errorMessage ? { message: nr.errorMessage } : undefined;
      return {
        nodeId: nr.nodeId ?? '',
        nodeName: graphNode?.data?.label ?? nr.nodeId ?? '',
        nodeType: graphNode?.data?.kind ?? '',
        status,
        startTime,
        endTime,
        duration,
        inputData,
        outputData,
        error,
        itemsCount: outputData?.length,
      } satisfies NodeExecutionData;
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

function toExecutionItems(value: unknown): NodeExecutionData['inputData'] {
  if (value == null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(v => ({ json: wrapAsRecord(v) }));
  }
  return [{ json: wrapAsRecord(value) }];
}

function wrapAsRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return { value: v };
}

function mapRunStatus(raw: string | undefined): ExecutionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'queued': return 'pending';
    case 'running': return 'running';
    case 'success': return 'success';
    case 'failed': return 'error';
    case 'waiting': return 'waiting';
    default: return 'pending';
  }
}

function mapNodeRunStatus(raw: string | undefined): NodeExecutionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'queued': return 'pending';
    case 'running': return 'running';
    case 'success': return 'success';
    case 'failed': return 'error';
    case 'skipped': return 'skipped';
    default: return 'pending';
  }
}

function computeDuration(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.max(0, b - a);
}
