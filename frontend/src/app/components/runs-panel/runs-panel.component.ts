import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    inject,
    input,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin, interval, of, switchMap, takeWhile } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { RunApiService } from '../../core/api/run.api';
import type { NodeRun, WorkflowRun } from '../../core/api/api.models';

type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'unknown';

function normaliseStatus(s: string | undefined): RunStatus {
    const v = (s ?? '').toLowerCase();
    if (v === 'queued' || v === 'running' || v === 'success' || v === 'failed') {
        return v;
    }
    return 'unknown';
}

const TERMINAL: ReadonlySet<RunStatus> = new Set(['success', 'failed']);

@Component({
    selector: 'app-runs-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="runs-panel">
            <div class="runs-header">
                <h3>Запуски</h3>
                <button class="primary" (click)="onRun()" [disabled]="isRunning()">
                    {{ isRunning() ? '...' : '▶ Run' }}
                </button>
            </div>

            <details class="run-input">
                <summary>Input JSON (передаётся в workflow как input)</summary>
                <textarea rows="3" class="mono"
                          [(ngModel)]="inputJsonRaw"
                          placeholder='{"userId": "u-1", "amount": 200}'></textarea>
                @if (inputJsonError()) {
                    <p class="error">{{ inputJsonError() }}</p>
                }
            </details>

            @if (errorMessage()) {
                <div class="error">{{ errorMessage() }}</div>
            }

            <div class="runs-list">
                @for (run of runs(); track run.id) {
                    <div class="run-card" [class.selected]="selectedRunId() === run.id" (click)="selectRun(run.id!)">
                        <div class="run-line">
                            <span class="run-id">{{ shortId(run.id) }}</span>
                            <span class="status" [class]="normalise(run.status)">{{ run.status ?? '?' }}</span>
                        </div>
                        <div class="run-meta">
                            <span>started: {{ formatTime(run.startedAt) }}</span>
                            @if (run.finishedAt) {
                                <span>· finished: {{ formatTime(run.finishedAt) }}</span>
                            }
                        </div>
                    </div>
                } @empty {
                    <div class="empty">Запусков пока нет.</div>
                }
            </div>

            @if (selectedRunNodes().length > 0) {
                <div class="node-runs">
                    <h4>Ноды</h4>
                    @for (nr of selectedRunNodes(); track nr.id) {
                        <div class="node-run">
                            <div class="nr-head">
                                <strong>{{ nr.nodeId }}</strong>
                                <span class="status" [class]="normalise(nr.status)">{{ nr.status ?? '?' }}</span>
                            </div>
                            @if (nr.errorMessage) {
                                <pre class="err">{{ nr.errorMessage }}</pre>
                            }
                            @if (nr.output) {
                                <details>
                                    <summary>output</summary>
                                    <pre>{{ formatJson(nr.output) }}</pre>
                                </details>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styles: [`
        .runs-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; height: 100%; overflow-y: auto; }
        .runs-header { display: flex; justify-content: space-between; align-items: center; }
        .runs-header h3 { margin: 0; font-size: 14px; }
        button.primary { background: #6366f1; color: white; border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
        .run-input summary { cursor: pointer; font-size: 12px; color: #475569; user-select: none; }
        .run-input textarea { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 6px; border: 1px solid #e2e8f0; border-radius: 6px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
        .mono { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
        .error { background: #fee2e2; color: #b91c1c; padding: 8px; border-radius: 6px; font-size: 12px; }
        .runs-list { display: flex; flex-direction: column; gap: 6px; }
        .run-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
        .run-card.selected { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
        .run-line { display: flex; justify-content: space-between; align-items: center; }
        .run-id { font-family: monospace; font-size: 12px; color: #475569; }
        .status { font-size: 11px; padding: 2px 8px; border-radius: 999px; text-transform: lowercase; }
        .status.queued { background: #fef3c7; color: #92400e; }
        .status.running { background: #dbeafe; color: #1d4ed8; }
        .status.success { background: #dcfce7; color: #15803d; }
        .status.failed { background: #fee2e2; color: #b91c1c; }
        .status.unknown { background: #f1f5f9; color: #475569; }
        .run-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
        .empty { color: #94a3b8; font-size: 13px; padding: 8px; }
        .node-runs h4 { margin: 8px 0 6px; font-size: 12px; color: #475569; text-transform: uppercase; }
        .node-run { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; }
        .nr-head { display: flex; justify-content: space-between; align-items: center; }
        .err { background: #fef2f2; color: #b91c1c; padding: 4px 6px; border-radius: 4px; font-size: 11px; white-space: pre-wrap; }
        details summary { cursor: pointer; font-size: 11px; color: #64748b; }
        pre { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 6px; border-radius: 4px; overflow-x: auto; max-height: 160px; }
    `]
})
export class RunsPanelComponent implements OnInit {
    private readonly runApi = inject(RunApiService);
    private readonly destroyRef = inject(DestroyRef);

    readonly workflowId = input.required<string>();

    readonly runs = signal<WorkflowRun[]>([]);
    readonly selectedRunId = signal<string | null>(null);
    readonly selectedRunNodes = signal<NodeRun[]>([]);
    readonly errorMessage = signal<string | null>(null);
    readonly inputJsonError = signal<string | null>(null);
    readonly isRunning = signal(false);
    /** Сырой JSON-input для следующего запуска. */
    inputJsonRaw = '';

    private pollSub?: Subscription;

    ngOnInit(): void {
        this.refresh();
        interval(5000)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.refresh());
    }

    onRun(): void {
        if (this.isRunning()) {
            return;
        }
        this.errorMessage.set(null);
        this.inputJsonError.set(null);

        let payload: Record<string, unknown> = {};
        const trimmed = this.inputJsonRaw.trim();
        if (trimmed.length > 0) {
            try {
                payload = JSON.parse(trimmed);
            } catch (e) {
                this.inputJsonError.set('Невалидный JSON: ' + (e as Error).message);
                return;
            }
        }

        this.isRunning.set(true);
        this.runApi.enqueue(this.workflowId(), payload as never)
            .pipe(
                finalize(() => this.isRunning.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: run => {
                    this.refresh();
                    if (run.id) {
                        this.selectRun(run.id);
                    }
                },
                error: err => {
                    console.error('enqueue failed', err);
                    this.errorMessage.set('Не удалось запустить workflow.');
                },
            });
    }

    selectRun(runId: string): void {
        this.selectedRunId.set(runId);
        this.pollSub?.unsubscribe();
        this.pollSub = interval(1500).pipe(
            switchMap(() => this.runApi.get(runId)),
            takeWhile(run => !TERMINAL.has(normaliseStatus(run.status)), true),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: run => {
                this.runs.update(list => list.map(r => (r.id === run.id ? run : r)));
                this.loadNodeRunsFor(run);
            },
            error: err => console.error('run polling failed', err),
        });
    }

    private loadNodeRunsFor(run: WorkflowRun): void {
        const nodeRunIds = (run as unknown as { nodeRunIds?: string[] }).nodeRunIds ?? [];
        if (nodeRunIds.length === 0) {
            return;
        }
        forkJoin(
            nodeRunIds.map(id => this.runApi.getNodeRun(id).pipe(
                catchError(() => of(null as NodeRun | null)),
            )),
        )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(results => {
                this.selectedRunNodes.set(results.filter((r): r is NodeRun => r !== null));
            });
    }

    private refresh(): void {
        this.runApi.list(this.workflowId())
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: list => this.runs.set(list),
                error: err => {
                    console.error('list runs failed', err);
                    this.errorMessage.set('Не удалось загрузить запуски.');
                },
            });
    }

    normalise = (s: string | undefined): RunStatus => normaliseStatus(s);

    shortId(id: string | undefined): string {
        return (id ?? '').slice(0, 8);
    }

    formatTime(iso: string | undefined): string {
        if (!iso) {
            return '—';
        }
        const date = new Date(iso);
        return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
    }

    formatJson(obj: unknown): string {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    }
}
