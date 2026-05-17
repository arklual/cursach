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
import { prettyOutput } from '../../core/pretty-output';

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
                    {{ isRunning() ? '...' : '' }}
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:4px;">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Run
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
                            <span class="run-title">{{ formatRunTitle(run) }}</span>
                            <span class="status" [class]="normalise(run.status)">{{ statusLabel(run.status) }}</span>
                        </div>
                        <div class="run-meta">
                            <span>{{ formatDuration(run) }}</span>
                            @if (hasInputPreview(run)) {
                                <span class="dot">·</span>
                                <span class="input-preview" [title]="formatJson(run.input)">{{ inputPreview(run) }}</span>
                            }
                            <span class="run-id-ref" title="ID запуска">#{{ run.id }}</span>
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
        .icon {
            display: block;
            color: inherit;
            vertical-align: middle;
        }
        .runs-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; height: 100%; overflow-y: auto; }
        .runs-header { display: flex; justify-content: space-between; align-items: center; }
        .runs-header h3 { margin: 0; font-size: 14px; color: var(--fg-primary); }
        button.primary { background: var(--accent); color: white; border: none; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
        .run-input summary { cursor: pointer; font-size: 12px; color: var(--fg-secondary); user-select: none; }
        .run-input textarea { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-mono); font-size: 12px; background: var(--bg-secondary); color: var(--fg-primary); }
        .mono { font-family: var(--font-mono); font-size: 12px; }
        .error { background: var(--danger-bg); color: var(--danger); padding: 8px; border-radius: 6px; font-size: 12px; }
        .runs-list { display: flex; flex-direction: column; gap: 6px; }
        .run-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
        .run-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
        .run-line { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .run-title { font-size: 13px; font-weight: 500; color: var(--fg-primary); }
        .run-meta { font-size: 11px; color: var(--fg-muted); margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .run-meta .dot { color: var(--fg-muted); }
        .run-meta .input-preview { font-family: var(--font-mono); color: var(--fg-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .run-meta .run-id-ref { margin-left: auto; font-family: var(--font-mono); color: var(--fg-muted); font-size: 10px; }
        .status { font-size: 11px; padding: 2px 8px; border-radius: 999px; text-transform: none; }
        .status.queued { background: var(--warning-bg); color: var(--warning); }
        .status.running { background: var(--accent-glow); color: var(--accent); }
        .status.success { background: var(--success-bg); color: var(--success); }
        .status.failed { background: var(--danger-bg); color: var(--danger); }
        .status.unknown { background: var(--bg-tertiary); color: var(--fg-muted); }
        .empty { color: var(--fg-muted); font-size: 13px; padding: 8px; }
        .node-runs h4 { margin: 8px 0 6px; font-size: 12px; color: var(--fg-secondary); text-transform: uppercase; }
        .node-run { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; }
        .nr-head { display: flex; justify-content: space-between; align-items: center; }
        .err { background: var(--danger-bg); color: var(--danger); padding: 4px 6px; border-radius: 4px; font-size: 11px; white-space: pre-wrap; }
        details summary { cursor: pointer; font-size: 11px; color: var(--fg-muted); }
        pre { font-family: var(--font-mono); font-size: 11px; background: var(--bg-primary); padding: 6px; border-radius: 4px; overflow-x: auto; max-height: 160px; color: var(--fg-secondary); }
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

    statusLabel(s: string | undefined): string {
        switch (normaliseStatus(s)) {
            case 'queued': return 'В очереди';
            case 'running': return 'Выполняется';
            case 'success': return 'Успех';
            case 'failed': return 'Ошибка';
            default: return s ?? '—';
        }
    }

    /**
     * Заголовок карточки: дата+время старта в локальной TZ. Если запуск ещё в очереди и не стартовал,
     * показываем «В очереди» (бейдж справа уже расскажет про статус, но без даты ID было бы немо).
     */
    formatRunTitle(run: WorkflowRun): string {
        if (!run.startedAt) {
            return 'Ожидает запуска';
        }
        const date = new Date(run.startedAt);
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).format(date);
    }

    /** «3 мс», «1.2 с», «Выполняется…», «—» для очереди. */
    formatDuration(run: WorkflowRun): string {
        const status = normaliseStatus(run.status);
        if (!run.startedAt) {
            return '—';
        }
        if (!run.finishedAt) {
            return status === 'running' ? 'Выполняется…' : '—';
        }
        const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
        if (ms < 0) return '—';
        if (ms < 1000) return `${ms} мс`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} с`;
        return `${Math.floor(ms / 60_000)} мин ${Math.floor((ms % 60_000) / 1000)} с`;
    }

    hasInputPreview(run: WorkflowRun): boolean {
        const input = run.input;
        if (input == null) return false;
        if (typeof input === 'object' && Object.keys(input as object).length === 0) return false;
        return true;
    }

    inputPreview(run: WorkflowRun): string {
        try {
            const s = JSON.stringify(run.input);
            return s.length > 60 ? s.slice(0, 57) + '…' : s;
        } catch {
            return '';
        }
    }

    formatJson(obj: unknown): string {
        return prettyOutput(obj);
    }
}
