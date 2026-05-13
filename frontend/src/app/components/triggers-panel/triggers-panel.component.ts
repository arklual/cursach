import {
    ChangeDetectionStrategy,
    Component,
    OnDestroy,
    OnInit,
    computed,
    inject,
    input,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { TriggerApiService } from '../../core/api/trigger.api';
import type { Trigger, TriggerCreateRequest } from '../../core/api/api.models';
import { environment } from '../../../environments/environment';

type TriggerType = 'webhook' | 'cron' | 'interval';

@Component({
    selector: 'app-triggers-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="triggers-panel">
            @if (errorMessage()) {
                <div class="error">{{ errorMessage() }}</div>
            }

            <div class="trigger-form">
                <h4>Создать триггер</h4>
                <div class="form-row">
                    <label>Тип</label>
                    <select [(ngModel)]="newType">
                        <option value="webhook">Webhook</option>
                        <option value="cron">Cron</option>
                        <option value="interval">Interval</option>
                    </select>
                </div>

                @if (newType() === 'cron') {
                    <div class="form-row">
                        <label>Cron expression</label>
                        <input type="text" [(ngModel)]="cronExpression" placeholder="0 */5 * * * *" />
                        <p class="hint">Формат Spring CronTrigger: sec min hour dom mon dow</p>
                    </div>
                }

                @if (newType() === 'interval') {
                    <div class="form-row">
                        <label>Каждые</label>
                        <input type="number" [(ngModel)]="intervalValue" min="1" />
                        <select [(ngModel)]="intervalUnit">
                            <option value="seconds">секунд</option>
                            <option value="minutes">минут</option>
                            <option value="hours">часов</option>
                        </select>
                    </div>
                }

                @if (newType() === 'webhook') {
                    <p class="hint">URL и токен сгенерируются автоматически.</p>
                }

                <button class="primary" (click)="createTrigger()">+ Создать</button>
            </div>

            <div class="triggers-list">
                <h4>Триггеры</h4>
                @for (trigger of triggers(); track trigger.id) {
                    <div class="trigger-card">
                        <div class="trigger-head">
                            <span class="type-badge" [class]="trigger.type">{{ trigger.type }}</span>
                            <span class="trigger-id">{{ shortId(trigger.id) }}</span>
                            <button class="ghost danger" (click)="removeTrigger(trigger.id!)">Удалить</button>
                        </div>
                        @if (trigger.type === 'webhook') {
                            <div class="webhook-url">
                                <code>{{ webhookUrl(trigger) }}</code>
                                <button class="ghost" (click)="copyToClipboard(webhookUrl(trigger))">Copy</button>
                            </div>
                        }
                        @if (trigger.config) {
                            <pre class="config">{{ formatJson(trigger.config) }}</pre>
                        }
                    </div>
                } @empty {
                    <div class="empty">Триггеров пока нет.</div>
                }
            </div>
        </div>
    `,
    styles: [`
        .triggers-panel { display: flex; flex-direction: column; gap: 16px; padding: 12px; height: 100%; overflow-y: auto; }
        .error { background: #fee2e2; color: #b91c1c; padding: 8px; border-radius: 6px; font-size: 12px; }
        h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #475569; }
        .trigger-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .form-row { display: flex; align-items: center; gap: 8px; }
        .form-row label { font-size: 12px; color: #475569; min-width: 80px; }
        .form-row select, .form-row input { padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; flex: 1; }
        .hint { font-size: 11px; color: #94a3b8; margin: 4px 0 0; }
        button.primary { background: #6366f1; color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; align-self: flex-start; }
        button.ghost { background: transparent; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
        button.ghost.danger:hover { border-color: #ef4444; color: #ef4444; }
        .triggers-list { display: flex; flex-direction: column; gap: 8px; }
        .trigger-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
        .trigger-head { display: flex; align-items: center; gap: 8px; }
        .type-badge { font-size: 10px; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
        .type-badge.webhook { background: #dbeafe; color: #1d4ed8; }
        .type-badge.cron { background: #fef3c7; color: #92400e; }
        .type-badge.interval { background: #dcfce7; color: #15803d; }
        .trigger-id { flex: 1; font-family: monospace; font-size: 11px; color: #64748b; }
        .webhook-url { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
        .webhook-url code { flex: 1; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; font-size: 11px; word-break: break-all; }
        .config { background: #f1f5f9; padding: 6px; border-radius: 4px; font-size: 11px; margin-top: 6px; max-height: 100px; overflow-y: auto; }
        .empty { color: #94a3b8; font-size: 13px; padding: 8px; }
    `]
})
export class TriggersPanelComponent implements OnInit, OnDestroy {
    private readonly triggerApi = inject(TriggerApiService);

    readonly workflowId = input.required<string>();

    readonly triggers = signal<Trigger[]>([]);
    readonly errorMessage = signal<string | null>(null);

    readonly newType = signal<TriggerType>('webhook');
    readonly cronExpression = signal<string>('0 */5 * * * *');
    readonly intervalValue = signal<number>(30);
    readonly intervalUnit = signal<'seconds' | 'minutes' | 'hours'>('seconds');

    private listSub?: Subscription;

    ngOnInit(): void {
        this.refresh();
        this.listSub = interval(10000).subscribe(() => this.refresh());
    }

    ngOnDestroy(): void {
        this.listSub?.unsubscribe();
    }

    createTrigger(): void {
        this.errorMessage.set(null);
        const req = this.buildRequest();
        this.triggerApi.create(this.workflowId(), req).subscribe({
            next: () => this.refresh(),
            error: err => {
                console.error('create trigger failed', err);
                this.errorMessage.set('Не удалось создать триггер.');
            },
        });
    }

    removeTrigger(triggerId: string): void {
        if (!confirm('Удалить триггер?')) {
            return;
        }
        this.triggerApi.delete(triggerId).subscribe({
            next: () => this.refresh(),
            error: err => {
                console.error('delete trigger failed', err);
                this.errorMessage.set('Не удалось удалить триггер.');
            },
        });
    }

    private buildRequest(): TriggerCreateRequest {
        const type = this.newType();
        let config: Record<string, unknown> = {};
        if (type === 'cron') {
            config = { expression: this.cronExpression() };
        } else if (type === 'interval') {
            config = { periodSeconds: this.toSeconds(this.intervalValue(), this.intervalUnit()) };
        }
        // openapi-typescript генерит config как Record<string, never>; в реальности это произвольный JSON.
        return { type, config: config as never };
    }

    private toSeconds(value: number, unit: 'seconds' | 'minutes' | 'hours'): number {
        if (unit === 'minutes') {
            return value * 60;
        }
        if (unit === 'hours') {
            return value * 3600;
        }
        return value;
    }

    private refresh(): void {
        this.triggerApi.list(this.workflowId()).subscribe({
            next: list => this.triggers.set(list),
            error: err => {
                console.error('list triggers failed', err);
                this.errorMessage.set('Не удалось загрузить триггеры.');
            },
        });
    }

    webhookUrl(trigger: Trigger): string {
        const token = (trigger.config as { token?: string } | undefined)?.token ?? '';
        const base = environment.apiBaseUrl.startsWith('http')
            ? environment.apiBaseUrl
            : `${window.location.origin}${environment.apiBaseUrl}`;
        return `${base}/webhook/${token}`;
    }

    copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text).catch(() => {
            // ignore — большинство браузеров требуют user-gesture, это и есть click
        });
    }

    shortId(id: string | undefined): string {
        return (id ?? '').slice(0, 8);
    }

    formatJson(obj: unknown): string {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    }
}
