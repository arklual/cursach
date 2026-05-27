import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebugSessionService } from '../../services/debug-session.service';

/**
 * Панель пошагового дебаггера: показывает все «переменные» (выходы уже исполненных нод),
 * список готовых к шагу нод и превью того, что в них прилетит. Управление: Step / Run to End / Stop.
 *
 * Сама панель stateless по части executor-а — всё хранит [DebugSessionService] и шарит через signal.
 */
@Component({
    selector: 'app-debug-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="debug-panel">
            <header class="debug-header">
                <div class="left">
                    <h3>Debug</h3>
                    @if (session(); as s) {
                        <span class="status-pill" [class]="'status-' + s.status">{{ statusLabel(s.status) }}</span>
                    }
                </div>
                <div class="right">
                    @if (session()) {
                        <button class="primary"
                                [disabled]="!canStep() || busy()"
                                (click)="debug.step()">
                            Шаг ▶
                        </button>
                        <button class="ghost"
                                [disabled]="!canStep() || busy()"
                                (click)="debug.runToEnd()">
                            До конца
                        </button>
                        <button class="ghost danger" [disabled]="busy()" (click)="onStop()">Остановить</button>
                    } @else {
                        <button class="primary" [disabled]="!workflowId() || busy()" (click)="onStart()">
                            Старт отладки
                        </button>
                    }
                </div>
            </header>

            @if (error(); as err) {
                <p class="hint warn">{{ err }}</p>
            }

            @if (session(); as s) {
                <div class="debug-body">
                    <section class="ready-section">
                        <h4>Готовые ноды ({{ s.ready.length }})</h4>
                        @if (s.ready.length === 0) {
                            <p class="hint">Готово.</p>
                        } @else {
                            <ul class="ready-list">
                                @for (id of s.ready; track id) {
                                    <li class="ready-item" [class.selected]="id === selectedReady()">
                                        <button class="ready-btn"
                                                (click)="stepInto(id)"
                                                [disabled]="busy()">
                                            ▶ {{ id }}
                                        </button>
                                        <button class="ghost small" (click)="select(id)">Превью</button>
                                    </li>
                                }
                            </ul>
                            @if (selectedReadyInput(); as preview) {
                                <details open class="preview-details">
                                    <summary>Вход <code>{{ selectedReady() }}</code></summary>
                                    <pre class="mono">{{ preview }}</pre>
                                </details>
                            }
                        }
                    </section>

                    <section class="vars-section">
                        <h4>
                            Переменные ({{ variableEntries().length }})
                            <span class="counts">
                                <span class="dot ok"></span>{{ s.completed.length }}
                                @if (s.skipped.length) {
                                    <span class="dot skip"></span>{{ s.skipped.length }}
                                }
                                @if (s.failed.length) {
                                    <span class="dot err"></span>{{ s.failed.length }}
                                }
                            </span>
                        </h4>
                        @if (variableEntries().length === 0) {
                            <p class="hint">Пусто.</p>
                        }
                        <div class="vars-list">
                            @for (entry of variableEntries(); track entry.nodeId) {
                                <details class="var-card">
                                    <summary>
                                        <span class="var-name">{{ entry.nodeId }}</span>
                                        <code class="var-ref">inputs["{{ entry.nodeId }}"]</code>
                                        <button class="ghost small"
                                                (click)="copyRef(entry.nodeId); $event.stopPropagation(); $event.preventDefault()">
                                            Копировать
                                        </button>
                                    </summary>
                                    <pre class="mono">{{ pretty(entry.value) }}</pre>
                                </details>
                            }
                            @for (f of s.failed; track f.nodeId) {
                                <div class="var-card error">
                                    <strong>{{ f.nodeId }} — ошибка</strong>
                                    <p>{{ f.message }}</p>
                                </div>
                            }
                        </div>
                    </section>
                </div>
            } @else {
                <div class="empty">
                    <p>Отладка позволяет шагать по нодам по одной и видеть, что они получают и возвращают,
                       без фактического workflow-run в БД. Подходит, чтобы понять, как параметры передаются.</p>
                </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; height: 100%; }
        .debug-panel { display: flex; flex-direction: column; height: 100%; padding: 12px; gap: 12px; font-size: 13px; }
        .debug-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .debug-header h3 { margin: 0; font-size: 14px; }
        .debug-header .left { display: flex; align-items: center; gap: 8px; }
        .debug-header .right { display: flex; gap: 6px; }
        .status-pill {
            font-size: 11px; padding: 2px 8px; border-radius: 999px;
            background: var(--surface-2, #2a2f3a); color: var(--text-muted, #8a92a6);
        }
        .status-pill.status-ready { background: #1e3a8a55; color: #93c5fd; }
        .status-pill.status-stepping { background: #92400e55; color: #fbbf24; }
        .status-pill.status-done { background: #14532d55; color: #86efac; }
        .status-pill.status-failed { background: #7f1d1d55; color: #fca5a5; }
        button.primary {
            background: var(--accent, #3b82f6); color: white; border: none;
            padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 500;
        }
        button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
        button.ghost {
            background: transparent; color: var(--text, #d8dde9); border: 1px solid var(--border, #303644);
            padding: 6px 12px; border-radius: 6px; cursor: pointer;
        }
        button.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        button.ghost.small { padding: 2px 8px; font-size: 11px; }
        button.danger { color: #fca5a5; border-color: #7f1d1d; }
        .debug-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; overflow: hidden; flex: 1; }
        .ready-section, .vars-section { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .ready-section h4, .vars-section h4 {
            margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
            color: var(--text-muted, #8a92a6); display: flex; justify-content: space-between; align-items: center;
        }
        .ready-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .ready-item { display: flex; gap: 6px; align-items: center; }
        .ready-btn {
            flex: 1; text-align: left; background: var(--surface-2, #1f2330); color: var(--text, #e0e4ec);
            border: 1px solid var(--border, #303644); padding: 6px 10px; border-radius: 6px; cursor: pointer;
            font-family: monospace;
        }
        .ready-btn:hover:not(:disabled) { border-color: var(--accent, #3b82f6); }
        .ready-item.selected .ready-btn { border-color: var(--accent, #3b82f6); }
        .preview-details {
            margin-top: 8px; background: var(--surface-2, #1a1d28); border-radius: 6px;
            padding: 6px; max-height: 220px; overflow: auto;
        }
        .preview-details summary { cursor: pointer; font-size: 12px; color: var(--text-muted, #8a92a6); }
        .preview-details pre { margin: 6px 0 0 0; font-size: 11px; white-space: pre-wrap; word-break: break-all; }
        .vars-list { overflow: auto; display: flex; flex-direction: column; gap: 4px; }
        .var-card {
            background: var(--surface-2, #1f2330); border: 1px solid var(--border, #303644);
            border-radius: 6px; padding: 6px 8px;
        }
        .var-card.error { border-color: #7f1d1d; background: #7f1d1d22; }
        .var-card summary {
            cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 12px;
        }
        .var-name { font-weight: 500; }
        .var-ref { font-size: 11px; color: var(--text-muted, #8a92a6); }
        .var-card pre { margin: 6px 0 0 0; font-size: 11px; white-space: pre-wrap; word-break: break-all; }
        .counts { font-size: 11px; display: flex; gap: 6px; align-items: center; }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
        .dot.ok { background: #22c55e; }
        .dot.skip { background: #6b7280; }
        .dot.err { background: #ef4444; }
        .empty { padding: 12px; color: var(--text-muted, #8a92a6); }
        .hint { color: var(--text-muted, #8a92a6); font-size: 12px; margin: 4px 0; }
        .hint.warn { color: #fbbf24; }
        @media (max-width: 800px) {
            .debug-body { grid-template-columns: 1fr; }
        }
    `],
})
export class DebugPanelComponent {
    readonly debug = inject(DebugSessionService);
    private readonly destroyRef = inject(DestroyRef);

    readonly workflowId = input<string | null>(null);
    readonly inputPayload = input<unknown>(null);

    /**
     * Эмитим состояние, чтобы канвас мог подсветить ноды: ready=голубой, completed=зелёный,
     * skipped=серый, failed=красный.
     */
    readonly highlightChange = output<{ ready: string[]; completed: string[]; skipped: string[]; failed: string[] }>();

    private readonly selectedReadyId = signal<string | null>(null);

    readonly session = this.debug.session;
    readonly busy = this.debug.busy;
    readonly error = this.debug.error;
    readonly canStep = this.debug.canStep;
    readonly selectedReady = this.selectedReadyId.asReadonly();

    readonly variableEntries = computed(() => {
        const s = this.session();
        if (!s) return [];
        return Object.entries(s.outputs).map(([nodeId, value]) => ({ nodeId, value }));
    });

    readonly selectedReadyInput = computed(() => {
        const s = this.session();
        const id = this.selectedReadyId();
        if (!s || !id) return null;
        const preview = s.readyInputs?.[id];
        return preview === undefined ? null : this.pretty(preview);
    });

    constructor() {
        effect(() => {
            const s = this.session();
            if (s) {
                this.highlightChange.emit({
                    ready: s.ready,
                    completed: s.completed,
                    skipped: s.skipped,
                    failed: s.failed.map(f => f.nodeId),
                });
            } else {
                this.highlightChange.emit({ ready: [], completed: [], skipped: [], failed: [] });
            }
        });
    }

    select(id: string): void {
        this.selectedReadyId.set(id);
    }

    stepInto(id: string): void {
        this.selectedReadyId.set(id);
        this.debug.step(id);
    }

    onStart(): void {
        const id = this.workflowId();
        if (!id) return;
        this.debug.start(id, this.inputPayload() ?? undefined);
    }

    onStop(): void {
        this.debug.stop();
        this.selectedReadyId.set(null);
    }

    pretty(value: unknown): string {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    copyRef(nodeId: string): void {
        const text = `inputs["${nodeId}"]`;
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
    }

    statusLabel(status: string): string {
        switch (status) {
            case 'ready': return 'Готов к шагу';
            case 'stepping': return 'В процессе';
            case 'done': return 'Завершён';
            case 'failed': return 'Ошибка';
            default: return status;
        }
    }
}
