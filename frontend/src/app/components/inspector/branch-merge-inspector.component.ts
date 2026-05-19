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
        <table class="sources">
            <thead><tr><th>upstream node</th><th>variant</th></tr></thead>
            <tbody>
                @for (s of sources(); track s.depId) {
                    <tr><td>{{ s.depId }}</td><td>{{ s.variant ?? '—' }}</td></tr>
                }
                @if (sources().length === 0) {
                    <tr><td colspan="2" class="empty">нет входящих рёбер</td></tr>
                }
            </tbody>
        </table>
    </section>
    `,
    styles: [`
        .branch-merge-inspector { display: flex; flex-direction: column; gap: 8px; }
        label { display: flex; flex-direction: column; font-size: 12px; }
        label.checkbox { flex-direction: row; align-items: center; gap: 8px; }
        input[type="text"], input:not([type]) { padding: 4px; font-size: 12px; border: 1px solid var(--border); border-radius: 4px; }
        table { width: 100%; font-size: 12px; border-collapse: collapse; }
        th, td { text-align: left; padding: 4px; border-bottom: 1px solid var(--border); }
        td.empty { text-align: center; color: var(--fg-muted); }
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
