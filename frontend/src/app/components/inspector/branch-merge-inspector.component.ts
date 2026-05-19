import { Component, input, output, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowNode } from '../../models/workflow.model';
import { WorkflowService } from '../../services/workflow.service';

@Component({
    selector: 'app-branch-merge-inspector',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="branch-merge-inspector">
        <h3>Merge</h3>
        <label>tagField:
            <input [(ngModel)]="tagField" (ngModelChange)="emit()" placeholder="_variant">
        </label>
        <label class="checkbox">
            <input type="checkbox" [(ngModel)]="preserveExistingTag" (ngModelChange)="emit()">
            preserveExistingTag
        </label>

        <h4>Источники → variant</h4>
        <div class="sources-wrapper">
            <table class="sources">
                <thead><tr><th>upstream node</th><th>variant</th></tr></thead>
                <tbody>
                    @for (s of sources(); track s.depId) {
                        <tr>
                            <td [title]="s.depId">{{ s.depId }}</td>
                            <td>{{ s.variant ?? '—' }}</td>
                        </tr>
                    }
                    @if (sources().length === 0) {
                        <tr><td colspan="2" class="empty">нет входящих рёбер</td></tr>
                    }
                </tbody>
            </table>
        </div>
    </section>
    `,
    styles: [`
        :host { display: block; width: 100%; min-width: 0; }
        .branch-merge-inspector {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }
        label {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 12px;
            min-width: 0;
        }
        label.checkbox { flex-direction: row; align-items: center; gap: 8px; }
        input[type="text"], input:not([type]) {
            width: 100%;
            min-width: 0;
            padding: 4px 6px;
            font-size: 12px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background: var(--bg-secondary, transparent);
            color: var(--fg-primary, inherit);
            box-sizing: border-box;
        }
        .sources-wrapper {
            width: 100%;
            min-width: 0;
            overflow-x: auto;
        }
        table { width: 100%; font-size: 12px; border-collapse: collapse; table-layout: fixed; }
        th, td {
            text-align: left;
            padding: 4px;
            border-bottom: 1px solid var(--border);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        th:first-child, td:first-child { width: 65%; }
        th:last-child, td:last-child { width: 35%; }
        td.empty { text-align: center; color: var(--fg-muted); white-space: normal; }
        h3 { margin: 0 0 8px; font-size: 14px; }
        h4 { margin: 8px 0 4px; font-size: 12px; color: var(--fg-secondary); }
    `]
})
export class BranchMergeInspectorComponent {
    node = input.required<WorkflowNode>();
    configChange = output<Record<string, unknown>>();
    private ws = inject(WorkflowService);

    tagField = signal<string>('_variant');
    preserveExistingTag = signal<boolean>(true);

    readonly sources = computed(() => {
        const nodeId = this.node().id;
        return this.ws.edges()
            .filter(e => e.target === nodeId)
            .map(e => ({ depId: e.source, variant: e.data?.variant ?? null }));
    });

    constructor() {
        effect(() => {
            const cfg = this.node().data.config as { tagField?: string; preserveExistingTag?: boolean } | undefined;
            if (cfg?.tagField !== undefined) {
                this.tagField.set(cfg.tagField);
            }
            if (cfg?.preserveExistingTag !== undefined) {
                this.preserveExistingTag.set(cfg.preserveExistingTag);
            }
        }, { allowSignalWrites: true });
    }

    emit(): void {
        this.configChange.emit({
            tagField: this.tagField(),
            preserveExistingTag: this.preserveExistingTag(),
        });
    }
}
