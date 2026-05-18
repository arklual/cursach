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

/**
 * Единый сервис исполнения workflow поверх DB-пайплайна (`POST /workflows/{id}/runs` + polling).
 *
 * Раньше Execute сверху и Run снизу жили в двух разных пайплайнах (in-memory `/executions` vs.
 * persisted `workflow_run`), поэтому история запусков «снизу» всегда была пустой относительно
 * того, что нажималось «сверху». Теперь это один путь: enqueue → polling → один источник истины.
 */
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

  /** Сигнал останова текущего polling-цикла. Новый запуск отменяет предыдущий. */
  private stopPolling$ = new Subject<void>();
  private pollSub?: Subscription;

  executeWorkflow(workflowId: string, fromNodeId?: string): Observable<WorkflowExecution | null> {
    this.cancelPolling();
    this.isExecuting.set(true);

    const pending: Record<string, NodeExecutionStatus> = {};
    for (const node of this.workflowService.nodes()) {
      pending[node.id] = 'pending';
    }
    this.nodeStatuses.set(pending);
    this.currentExecution.set(null);

    const result = new Subject<WorkflowExecution | null>();

    this.runApi.enqueue(workflowId, {} as never, fromNodeId).subscribe({
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

  /** Resync execution view from a previous run object (e.g. selected from history). */
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

  /** Маппит «сырой» WorkflowRun из API сразу в UI-модель и кладёт в текущее состояние. */
  setExecutionFromRun(run: WorkflowRun): void {
    this.cancelPolling();
    this.applyRun(run);
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
        // Транзиентные ошибки на polling-tick'е не должны рвать observable — пропускаем tick.
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
      next: () => { /* состояние уже применено в tap */ },
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

  /** Маппит WorkflowRun (DB-shape) в UI-модель WorkflowExecution. */
  private applyRun(run: WorkflowRun): void {
    const nodes: NodeExecutionData[] = this.mapNodes(run.nodes ?? []);
    const statuses: Record<string, NodeExecutionStatus> = {};
    for (const n of nodes) {
      statuses[n.nodeId] = n.status;
    }
    // Ноды графа, для которых backend ещё не создал node_run (например, run только-только в queued),
    // оставляем в pending — иначе UI забудет про них.
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
    // Лейблы/типы лежат на графе, а не в node_run — берём из workflowService.
    const graphById = new Map(this.workflowService.nodes().map(n => [n.id, n]));
    return runNodes.map(nr => {
      const graphNode = graphById.get(nr.nodeId ?? '');
      const status = mapNodeRunStatus(nr.status);
      const startTime = nr.startedAt ?? undefined;
      const endTime = nr.finishedAt ?? undefined;
      const duration = computeDuration(startTime, endTime);
      const inputData: NodeExecutionData['inputData'] = nr.input != null
        ? [{ json: nr.input as Record<string, unknown> }]
        : undefined;
      const outputData: NodeExecutionData['outputData'] = nr.output != null
        ? [{ json: nr.output as Record<string, unknown> }]
        : undefined;
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
