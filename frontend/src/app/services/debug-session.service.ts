import { Injectable, inject, signal, computed } from '@angular/core';
import { catchError, EMPTY, finalize, tap } from 'rxjs';
import { DebugApiService, DebugSessionDto } from '../core/api/debug.api';

/**
 * Состояние пошагового дебаггера. Тонкая обёртка над DebugApiService — хранит
 * активную сессию как Angular signal, чтобы все панели реактивно обновлялись
 * после каждого шага.
 */
@Injectable({ providedIn: 'root' })
export class DebugSessionService {
    private readonly api = inject(DebugApiService);

    private readonly _session = signal<DebugSessionDto | null>(null);
    private readonly _busy = signal(false);
    private readonly _error = signal<string | null>(null);

    readonly session = this._session.asReadonly();
    readonly busy = this._busy.asReadonly();
    readonly error = this._error.asReadonly();

    readonly isActive = computed(() => this._session() !== null);
    readonly canStep = computed(() => {
        const s = this._session();
        return !!s && s.status !== 'done' && s.status !== 'failed' && s.ready.length > 0;
    });
    readonly isDone = computed(() => {
        const s = this._session();
        return !!s && (s.status === 'done' || s.status === 'failed');
    });

    start(workflowId: string, input?: unknown, startNodeId?: string): void {
        this._busy.set(true);
        this._error.set(null);
        this.api.start(workflowId, { input, startNodeId })
            .pipe(
                tap(s => this._session.set(s)),
                catchError(err => {
                    this._error.set(this.toMessage(err));
                    return EMPTY;
                }),
                finalize(() => this._busy.set(false)),
            )
            .subscribe();
    }

    step(nodeId?: string): void {
        const s = this._session();
        if (!s) return;
        this._busy.set(true);
        this.api.step(s.sessionId, nodeId)
            .pipe(
                tap(next => this._session.set(next)),
                catchError(err => {
                    this._error.set(this.toMessage(err));
                    return EMPTY;
                }),
                finalize(() => this._busy.set(false)),
            )
            .subscribe();
    }

    runToEnd(): void {
        const s = this._session();
        if (!s) return;
        this._busy.set(true);
        this.api.runToEnd(s.sessionId)
            .pipe(
                tap(next => this._session.set(next)),
                catchError(err => {
                    this._error.set(this.toMessage(err));
                    return EMPTY;
                }),
                finalize(() => this._busy.set(false)),
            )
            .subscribe();
    }

    stop(): void {
        const s = this._session();
        if (!s) {
            this._session.set(null);
            return;
        }
        this.api.close(s.sessionId).subscribe({
            complete: () => {
                this._session.set(null);
                this._error.set(null);
            },
            error: () => {
                this._session.set(null);
                this._error.set(null);
            },
        });
    }

    private toMessage(err: unknown): string {
        if (err && typeof err === 'object' && 'error' in err) {
            const body = (err as { error?: { message?: string } }).error;
            if (body?.message) return body.message;
        }
        return (err as Error)?.message ?? 'Unexpected error';
    }
}
