import { Injectable, NgZone, inject } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import type { WorkflowGraph } from '../api/api.models';

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
    private readonly graph$ = new Subject<{ workflowId: string; graph: WorkflowGraph }>();

    /** Один глобальный поток обновлений графа. Каждое событие — `{ workflowId, graph }`. */
    readonly graphUpdates = this.graph$.asObservable();

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
        this.client.activate();
    }

    /** Подписаться на обновления конкретного workflow. Возвращает функцию отписки. */
    subscribeToWorkflow(workflowId: string): () => void {
        this.connect();
        let stompSub: StompSubscription | null = null;

        const tryAttach = () => {
            if (!this.client?.connected) {
                return;
            }
            const topic = `/topic/workflows/${workflowId}/graph`;
            stompSub = this.client.subscribe(topic, (msg: IMessage) => {
                try {
                    const payload = JSON.parse(msg.body) as WorkflowGraph;
                    // Маршалинг STOMP происходит вне Angular Zone — возвращаемся внутрь для change detection.
                    this.zone.run(() => this.graph$.next({ workflowId, graph: payload }));
                } catch (err) {
                    console.warn('WS: failed to parse message', err);
                }
            });
            if (stompSub) {
                this.subscriptions.push(stompSub);
            }
        };

        if (this.client?.connected) {
            tryAttach();
        } else if (this.client) {
            const prevConnect = this.client.onConnect;
            this.client.onConnect = frame => {
                prevConnect?.(frame);
                tryAttach();
            };
        }

        return () => {
            if (stompSub) {
                stompSub.unsubscribe();
                this.subscriptions = this.subscriptions.filter(s => s !== stompSub);
            }
        };
    }

    disconnect(): void {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];
        this.client?.deactivate();
        this.client = null;
    }
}
