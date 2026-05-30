import { Injectable, NgZone, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import type { WorkflowGraph } from '../api/api.models';

/** События жизненного цикла исполнения workflow, транслируемые сервером по STOMP. */
export type RunEventType =
    | 'workflow_started'
    | 'node_reached'
    | 'node_action'
    | 'node_exited'
    | 'workflow_finished';

export interface RunEvent {
    workflowId: string;
    event: RunEventType;
    runId: number;
    nodeId?: string;
    status: string;
    ts?: string;
}

/**
 * STOMP-клиент над тем же `/ws` SockJS-эндпоинтом, что и бэк (см. `ws/WebSocketConfig.kt`).
 * Подписывается на `/topic/workflows/{id}/graph`; при обновлении графа другим клиентом (или REST putGraph,
 * после правки бэка по фазе 4) выпускает событие.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowWsService {
    private readonly zone = inject(NgZone);

    private client: Client | null = null;
    private subscriptions: StompSubscription[] = [];
    /** Подписки, которые надо переподнять при каждом успешном (re)connect. */
    private resubscribers = new Set<() => void>();
    private readonly graph$ = new Subject<{ workflowId: string; graph: WorkflowGraph }>();
    private readonly runEvents$ = new Subject<RunEvent>();

    /** Один глобальный поток обновлений графа. Каждое событие — `{ workflowId, graph }`. */
    readonly graphUpdates = this.graph$.asObservable();

    /**
     * Поток событий исполнения workflow (workflow_started / node_reached / node_action /
     * node_exited / workflow_finished), приходящих в тот же топик `/topic/workflows/{id}/graph`.
     */
    readonly runEvents = this.runEvents$.asObservable();

    /** Подключиться один раз на всё приложение. Если уже подключён — no-op. */
    connect(): void {
        if (this.client?.active) {
            return;
        }
        this.client = new Client({
            webSocketFactory: () => new SockJS(environment.wsUrl),
            reconnectDelay: 3000,
            heartbeatIncoming: 10_000,
            heartbeatOutgoing: 10_000,
        });
        this.client.onConnect = () => {
            // При каждом подключении (включая reconnect) переподнимаем активные подписки.
            this.resubscribers.forEach(fn => {
                try { fn(); } catch (err) { console.error('WS resubscribe failed', err); }
            });
        };
        this.client.onStompError = frame => {
            console.error('STOMP broker error', frame.headers['message'], frame.body);
        };
        this.client.onWebSocketError = evt => {
            console.warn('WebSocket error', evt);
        };
        this.client.activate();
    }

    /** Подписаться на обновления конкретного workflow. Возвращает функцию отписки. */
    subscribeToWorkflow(workflowId: string): () => void {
        this.connect();
        let stompSub: StompSubscription | null = null;
        const topic = `/topic/workflows/${workflowId}/graph`;

        const attach = () => {
            if (!this.client?.connected) {
                return;
            }
            stompSub = this.client.subscribe(topic, (msg: IMessage) => {
                try {
                    const payload = JSON.parse(msg.body) as Record<string, unknown>;
                    // Сообщения исполнения несут поле `event`; сообщения синхронизации графа — нет.
                    if (typeof payload['event'] === 'string') {
                        const evt = payload as unknown as RunEvent;
                        this.zone.run(() => this.runEvents$.next(evt));
                    } else {
                        const graph = payload as unknown as WorkflowGraph;
                        this.zone.run(() => this.graph$.next({ workflowId, graph }));
                    }
                } catch (err) {
                    console.warn('WS: failed to parse message', err);
                }
            });
            if (stompSub) {
                this.subscriptions.push(stompSub);
            }
        };

        this.resubscribers.add(attach);
        attach();

        return () => {
            this.resubscribers.delete(attach);
            if (stompSub) {
                stompSub.unsubscribe();
                this.subscriptions = this.subscriptions.filter(s => s !== stompSub);
                stompSub = null;
            }
        };
    }

    disconnect(): void {
        this.resubscribers.clear();
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];
        this.client?.deactivate();
        this.client = null;
    }
}
