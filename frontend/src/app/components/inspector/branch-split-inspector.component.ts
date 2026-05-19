import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowNode } from '../../models/workflow.model';

interface SplitVariantUi { key: string; label: string; weight: number; }
interface AttributeRuleUi { variant: string; field: string; op: string; value: string; }
type SplitConfig = {
    mode: 'split' | 'pick';
    strategy: 'random' | 'hash' | 'modulo' | 'attribute' | 'percentage' | 'stratified';
    variants: SplitVariantUi[];
    userIdField?: string;
    salt?: string;
    seed?: number;
    percentage?: number;
    rules?: AttributeRuleUi[];
    defaultVariant?: string;
    stratifyBy?: string;
};

@Component({
    selector: 'app-branch-split-inspector',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="branch-split-inspector">
        <h3>Split / A·B / Feature Flag</h3>

        <label>Режим:
            <select [(ngModel)]="config().mode" (ngModelChange)="emit()">
                <option value="split">Split поток</option>
                <option value="pick">Pick one branch</option>
            </select>
        </label>

        <label>Стратегия:
            <select [(ngModel)]="config().strategy" (ngModelChange)="emit()">
                <option value="random">Random (weighted)</option>
                <option value="hash">Hash sticky</option>
                <option value="modulo">Modulo by id</option>
                <option value="attribute">Attribute rules</option>
                <option value="percentage">Percentage rollout</option>
                <option value="stratified">Stratified</option>
            </select>
        </label>

        @if (needsUserIdField()) {
            <label>userIdField: <input [(ngModel)]="config().userIdField" (ngModelChange)="emit()" placeholder="user_id"></label>
        }
        @if (config().strategy === 'hash' || config().strategy === 'stratified') {
            <label>salt: <input [(ngModel)]="config().salt" (ngModelChange)="emit()" placeholder="exp-checkout"></label>
        }
        @if (config().strategy === 'random') {
            <label>seed: <input type="number" [(ngModel)]="config().seed" (ngModelChange)="emit()"></label>
        }
        @if (config().strategy === 'stratified') {
            <label>stratifyBy: <input [(ngModel)]="config().stratifyBy" (ngModelChange)="emit()" placeholder="country"></label>
        }
        @if (config().strategy === 'percentage') {
            <label>percentage: <input type="number" min="0" max="100" [(ngModel)]="config().percentage" (ngModelChange)="emit()"></label>
        }
        @if (config().strategy === 'attribute') {
            <div class="rules">
                <h4>Rules</h4>
                @for (rule of config().rules ?? []; track $index; let i = $index) {
                    <div class="rule">
                        <input [(ngModel)]="rule.variant" placeholder="variant key" (ngModelChange)="emit()">
                        <input [(ngModel)]="rule.field" placeholder="field" (ngModelChange)="emit()">
                        <select [(ngModel)]="rule.op" (ngModelChange)="emit()">
                            <option value="eq">eq</option><option value="ne">ne</option>
                            <option value="in">in</option>
                            <option value="gt">gt</option><option value="gte">gte</option>
                            <option value="lt">lt</option><option value="lte">lte</option>
                        </select>
                        <input [(ngModel)]="rule.value" placeholder="value (JSON for in)" (ngModelChange)="emit()">
                        <button type="button" (click)="removeRule(i)">×</button>
                    </div>
                }
                <button type="button" (click)="addRule()">+ rule</button>
            </div>
            <label>defaultVariant: <input [(ngModel)]="config().defaultVariant" (ngModelChange)="emit()"></label>
        }

        <h4>Variants</h4>
        @for (v of config().variants; track $index; let i = $index) {
            <div class="variant">
                <input [(ngModel)]="v.key" placeholder="key" (ngModelChange)="emit()">
                <input [(ngModel)]="v.label" placeholder="label" (ngModelChange)="emit()">
                <input type="number" [(ngModel)]="v.weight" (ngModelChange)="emit()">
                <button type="button" (click)="removeVariant(i)">×</button>
            </div>
        }
        <button type="button" (click)="addVariant()">+ variant</button>
    </section>
    `,
    styles: [`
        :host { display: block; width: 100%; min-width: 0; }
        .branch-split-inspector {
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
        .rules { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .rule {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 64px minmax(0, 1fr) 26px;
            gap: 4px;
            min-width: 0;
        }
        .variant {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) 56px 26px;
            gap: 4px;
            min-width: 0;
        }
        input, select {
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
        button {
            padding: 2px 6px;
            cursor: pointer;
            border: 1px solid var(--border);
            border-radius: 4px;
            background: transparent;
            color: var(--fg-secondary);
            font-size: 12px;
            box-sizing: border-box;
        }
        button:hover { background: var(--bg-secondary); color: var(--fg-primary); }
        h3 { margin: 0 0 8px; font-size: 14px; }
        h4 { margin: 8px 0 4px; font-size: 12px; color: var(--fg-secondary); }
    `]
})
export class BranchSplitInspectorComponent {
    node = input.required<WorkflowNode>();
    configChange = output<Record<string, unknown>>();

    readonly config = computed<SplitConfig>(() => {
        const raw = this.node().data.config as Partial<SplitConfig> | undefined;
        return {
            mode: raw?.mode ?? 'split',
            strategy: raw?.strategy ?? 'random',
            variants: raw?.variants ?? [
                { key: 'A', label: 'Control', weight: 50 },
                { key: 'B', label: 'Treatment', weight: 50 },
            ],
            userIdField: raw?.userIdField,
            salt: raw?.salt,
            seed: raw?.seed,
            percentage: raw?.percentage,
            rules: raw?.rules ?? [],
            defaultVariant: raw?.defaultVariant,
            stratifyBy: raw?.stratifyBy,
        };
    });

    needsUserIdField(): boolean {
        const s = this.config().strategy;
        return s === 'hash' || s === 'modulo' || s === 'stratified' || s === 'percentage';
    }

    addVariant(): void {
        const c = this.config();
        c.variants.push({ key: '', label: '', weight: 0 });
        this.emit();
    }

    removeVariant(i: number): void {
        const c = this.config();
        c.variants.splice(i, 1);
        this.emit();
    }

    addRule(): void {
        const c = this.config();
        (c.rules ??= []).push({ variant: '', field: '', op: 'eq', value: '' });
        this.emit();
    }

    removeRule(i: number): void {
        const c = this.config();
        c.rules?.splice(i, 1);
        this.emit();
    }

    emit(): void {
        this.configChange.emit({ ...this.config() } as Record<string, unknown>);
    }
}
