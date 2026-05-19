import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    CreateSnapshotRequest,
    WorkflowSnapshot,
    WorkflowSnapshotApiService,
} from '../../core/api/snapshot.api';

/**
 * Панель снепшотов: создать снепшот текущего графа, увидеть список, удалить,
 * откатить workflow на состояние снепшота. Подразумевается, что компонент
 * рендерится внутри модалки и работает с конкретным workflowId.
 */
@Component({
    selector: 'app-snapshots-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, DatePipe],
    template: `
        <div class="snapshots">
            <p class="lead">
                Снепшот фиксирует текущий граф под именем. История автосейва остаётся как была — это
                просто метка, к которой можно вернуться. Откат не удаляет историю: текущая ревизия
                становится частью прошлого, а граф восстанавливается до состояния снепшота.
            </p>

            <section class="create">
                <div class="row">
                    <input
                        class="text-input"
                        type="text"
                        placeholder="Имя снепшота, например «перед релизом v1.2»"
                        [(ngModel)]="newName"
                        (keydown.enter)="create()" />
                    <button class="primary" (click)="create()" [disabled]="creating() || !newName().trim()">
                        @if (creating()) {
                            Сохранение…
                        } @else {
                            Создать снепшот
                        }
                    </button>
                </div>
                <textarea
                    class="text-input"
                    rows="2"
                    placeholder="Описание (необязательно)"
                    [(ngModel)]="newDescription"></textarea>
                @if (error()) {
                    <p class="error">{{ error() }}</p>
                }
            </section>

            <section class="list">
                <header class="list-header">
                    <h3>История снимков</h3>
                    <button class="ghost" (click)="refresh()" [disabled]="loading()">
                        @if (loading()) {
                            Обновление…
                        } @else {
                            Обновить
                        }
                    </button>
                </header>
                @if (loading() && items().length === 0) {
                    <p class="muted">Загружаем…</p>
                } @else if (items().length === 0) {
                    <p class="muted empty">
                        Ещё нет ни одного снепшота. Создайте первый — это как git-коммит,
                        но для графа workflow.
                    </p>
                } @else {
                    <ul>
                        @for (snap of items(); track snap.id) {
                            <li class="snapshot">
                                <div class="snapshot-main">
                                    <div class="snapshot-name">{{ snap.name }}</div>
                                    @if (snap.description) {
                                        <div class="snapshot-desc">{{ snap.description }}</div>
                                    }
                                    <div class="snapshot-date">
                                        {{ snap.createdAt | date: 'dd MMM yyyy, HH:mm' }}
                                    </div>
                                </div>
                                <div class="snapshot-actions">
                                    <button
                                        class="restore"
                                        (click)="confirmRestore(snap)"
                                        [disabled]="busyId() === snap.id">
                                        Откатить
                                    </button>
                                    <button
                                        class="ghost danger"
                                        (click)="confirmDelete(snap)"
                                        [disabled]="busyId() === snap.id">
                                        Удалить
                                    </button>
                                </div>
                            </li>
                        }
                    </ul>
                }
            </section>
        </div>
    `,
    styles: [
        `
            .snapshots {
                display: flex;
                flex-direction: column;
                gap: 18px;
                color: var(--fg-primary);
            }
            .lead {
                margin: 0;
                font-size: 13px;
                color: var(--fg-secondary);
                line-height: 1.55;
            }
            .create {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 14px;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: 12px;
            }
            .row {
                display: flex;
                gap: 8px;
                align-items: stretch;
            }
            .text-input {
                width: 100%;
                padding: 8px 10px;
                border-radius: 8px;
                border: 1px solid var(--border);
                background: var(--panel);
                color: var(--fg-primary);
                font-size: 13px;
                outline: none;
                font-family: inherit;
                resize: vertical;
            }
            .text-input:focus {
                border-color: var(--accent);
                box-shadow: 0 0 0 2px var(--accent-glow);
            }
            .primary {
                flex-shrink: 0;
                padding: 8px 14px;
                background: var(--accent);
                color: var(--accent-ink);
                border: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            }
            .primary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .ghost {
                padding: 6px 10px;
                background: transparent;
                color: var(--fg-secondary);
                border: 1px solid var(--border);
                border-radius: 8px;
                font-size: 12px;
                cursor: pointer;
            }
            .ghost:hover {
                background: var(--bg-secondary);
                color: var(--fg-primary);
            }
            .ghost.danger:hover {
                color: var(--danger);
                border-color: var(--danger);
            }
            .restore {
                padding: 6px 12px;
                background: transparent;
                border: 1px solid var(--accent);
                color: var(--accent);
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            }
            .restore:hover {
                background: var(--accent-glow);
            }
            .restore:disabled,
            .ghost:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .error {
                margin: 0;
                font-size: 12px;
                color: var(--danger);
            }
            .list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .list-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
            }
            .muted {
                margin: 0;
                color: var(--fg-muted);
                font-size: 13px;
            }
            .empty {
                padding: 16px;
                background: var(--bg-secondary);
                border: 1px dashed var(--border);
                border-radius: 12px;
                text-align: center;
            }
            ul {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 360px;
                overflow: auto;
            }
            .snapshot {
                display: flex;
                gap: 12px;
                align-items: center;
                justify-content: space-between;
                padding: 12px 14px;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: 10px;
            }
            .snapshot-main {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
                flex: 1 1 auto;
            }
            .snapshot-name {
                font-weight: 600;
                font-size: 14px;
            }
            .snapshot-desc {
                font-size: 12px;
                color: var(--fg-secondary);
                white-space: pre-wrap;
            }
            .snapshot-date {
                font-size: 11px;
                color: var(--fg-muted);
            }
            .snapshot-actions {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
            }
        `,
    ],
})
export class SnapshotsPanelComponent implements OnInit {
    private readonly api = inject(WorkflowSnapshotApiService);

    workflowId = input.required<string>();
    /** Эмитим после restore — родительский компонент должен перезагрузить граф из бэкенда. */
    readonly restored = output<void>();

    readonly items = signal<WorkflowSnapshot[]>([]);
    readonly loading = signal(false);
    readonly creating = signal(false);
    readonly busyId = signal<string | null>(null);
    readonly error = signal<string | null>(null);

    readonly newName = signal('');
    readonly newDescription = signal('');

    readonly hasItems = computed(() => this.items().length > 0);

    ngOnInit(): void {
        this.refresh();
    }

    refresh(): void {
        this.loading.set(true);
        this.error.set(null);
        this.api.list(this.workflowId()).subscribe({
            next: list => {
                this.items.set(list);
                this.loading.set(false);
            },
            error: err => {
                console.error('[snapshots] list failed', err);
                this.error.set('Не удалось получить список снепшотов.');
                this.loading.set(false);
            },
        });
    }

    create(): void {
        const name = this.newName().trim();
        if (!name) {
            return;
        }
        this.creating.set(true);
        this.error.set(null);
        const req: CreateSnapshotRequest = {
            name,
            description: this.newDescription().trim() || undefined,
        };
        this.api.create(this.workflowId(), req).subscribe({
            next: snap => {
                this.items.update(list => [snap, ...list]);
                this.newName.set('');
                this.newDescription.set('');
                this.creating.set(false);
            },
            error: err => {
                console.error('[snapshots] create failed', err);
                this.error.set('Не удалось создать снепшот.');
                this.creating.set(false);
            },
        });
    }

    confirmDelete(snap: WorkflowSnapshot): void {
        if (typeof window === 'undefined' || !window.confirm(`Удалить снепшот «${snap.name}»?`)) {
            return;
        }
        this.busyId.set(snap.id);
        this.api.delete(this.workflowId(), snap.id).subscribe({
            next: () => {
                this.items.update(list => list.filter(s => s.id !== snap.id));
                this.busyId.set(null);
            },
            error: err => {
                console.error('[snapshots] delete failed', err);
                this.error.set('Не удалось удалить снепшот.');
                this.busyId.set(null);
            },
        });
    }

    confirmRestore(snap: WorkflowSnapshot): void {
        if (
            typeof window === 'undefined' ||
            !window.confirm(
                `Откатить workflow к снепшоту «${snap.name}»? Текущий граф будет заменён содержимым снепшота. История не теряется.`,
            )
        ) {
            return;
        }
        this.busyId.set(snap.id);
        this.api.restore(this.workflowId(), snap.id).subscribe({
            next: () => {
                this.busyId.set(null);
                this.restored.emit();
            },
            error: err => {
                console.error('[snapshots] restore failed', err);
                this.error.set('Не удалось восстановить снепшот.');
                this.busyId.set(null);
            },
        });
    }
}
