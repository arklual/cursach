import { Injectable, NgZone, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import type { WorkflowGraph } from '../api/api.models';

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

@Injectable({ providedIn: 'root' })
export class WorkflowWsService {
    private readonly zone = inject(NgZone);

    private client: Client | null = null;
    private subscriptions: StompSubscription[] = [];
    private resubscribers = new Set<() => void>();
    private readonly graph$ = new Subject<{ workflowId: string; graph: WorkflowGraph }>();
    private readonly runEvents$ = new Subject<RunEvent>();

    readonly graphUpdates = this.graph$.asObservable();

    readonly runEvents = this.runEvents$.asObservable();

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
