import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { AnalyticsApiService } from '../../core/api/analytics.api';
import { WorkflowService } from '../../services/workflow.service';
import type { AbAnalyticsResponse, AbVariantRow } from '../../core/api/api.models';

@Component({
    selector: 'app-analytics-panel',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <section class="analytics-panel">
        <header class="ap-header">
            <label class="ap-experiment">
                Эксперимент:
                <select [ngModel]="selectedAbNodeId()" (ngModelChange)="selectAbNode($event)"
                        [disabled]="abNodes().length === 0">
                    @for (n of abNodes(); track n.id) {
                        <option [value]="n.id">{{ n.data.label || n.id }}</option>
                    }
                </select>
            </label>
            <span class="ap-period">All time</span>
            <button type="button" class="ap-refresh" (click)="refresh()" [disabled]="loading()"
                    title="Refresh"
                    aria-label="Refresh">↻</button>
        </header>

        @if (abNodes().length === 0) {
            <div class="ap-empty">В этом workflow нет A/B-нод. Добавьте ноду «Split / A·B» из палитры.</div>
        } @else if (error()) {
            <div class="ap-error">{{ error() }}</div>
        } @else if (!response()) {
            <div class="ap-empty">Загрузка…</div>
        } @else if (response()!.totalRuns === 0) {
            <div class="ap-empty">Запусков с этим экспериментом ещё не было.</div>
        } @else {
            <section class="ap-section">
                <h4>Traffic distribution ({{ response()!.totalRuns }} runs)</h4>
                @for (v of response()!.variants; track v.key) {
                    <div class="ap-row">
                        <span class="ap-dot" [style.background]="v.color"></span>
                        <span class="ap-key">{{ v.key }}</span>
                        <span class="ap-pct">{{ v.trafficPct | number:'1.0-1' }}%</span>
                        <span class="ap-count">({{ v.trafficCount }})</span>
                        @if (v.weight != null) {
                            <span class="ap-expected">expected {{ v.weight }}%</span>
                        }
                    </div>
                }
                <div class="ap-bar">
                    @for (v of response()!.variants; track v.key) {
                        <span class="ap-bar-seg"
                              [style.width.%]="v.trafficPct"
                              [style.background]="v.color"
                              [title]="v.key + ': ' + (v.trafficPct | number:'1.0-1') + '%'"></span>
                    }
                </div>
            </section>

            @if (response()!.mode === 'pick') {
                <section class="ap-section">
                    <h4>Conversion (run-success)</h4>
                    <table class="ap-table">
                        <thead>
                            <tr><th>Variant</th><th>Reached</th><th>Converted</th><th>p̂</th><th>95% CI</th><th>Variance</th><th>p</th></tr>
                        </thead>
                        <tbody>
                            @for (v of response()!.variants; track v.key) {
                                <tr [class.ap-recommended]="v.key === recommendedKey()">
                                    <td>
                                        <span class="ap-dot" [style.background]="v.color"></span>
                                        {{ v.key }}
                                        @if (v.isBaseline) { <span class="ap-baseline">baseline</span> }
                                        @if (v.key === recommendedKey()) { <span class="ap-best" title="Статистически значимо лучший вариант">★ best</span> }
                                    </td>
                                    <td>{{ v.runs }}</td>
                                    <td>{{ v.conversions != null ? v.conversions : '—' }}</td>
                                    <td>{{ v.conversionPct != null ? (v.conversionPct | number:'1.0-1') + '%' : '—' }}</td>
                                    <td>
                                        @if (v.ciLow != null) {
                                            {{ v.ciLow | number:'1.0-1' }}–{{ v.ciHigh | number:'1.0-1' }}
                                        } @else { — }
                                    </td>
                                    <td>{{ variance(v) != null ? (variance(v) | number:'1.0-4') : '—' }}</td>
                                    <td>
                                        @if (v.pValue != null) {
                                            {{ v.pValue | number:'1.0-3' }}
                                            @if (v.isSignificant) { <span class="ap-sig" title="p<0.05, n≥30">✰</span> }
                                        } @else { — }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    <canvas #abChart class="ap-chart" aria-label="Сравнение конверсий вариантов"></canvas>
                </section>
            } @else {
                <div class="ap-hint">Conversion недоступна для split-mode.</div>
            }

            @if (response()!.warnings.length > 0) {
                <ul class="ap-warnings">
                    @for (w of response()!.warnings; track $index) { <li>{{ w }}</li> }
                </ul>
            }
        }
    </section>
    `,
    styles: [`
        :host { display: block; width: 100%; height: 100%; min-height: 0; }
        .analytics-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; min-width: 0; height: 100%; box-sizing: border-box; overflow: auto; }
        .ap-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ap-experiment { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .ap-experiment select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; min-width: 0; }
        .ap-period { color: var(--fg-muted); font-size: 12px; }
        .ap-refresh { margin-left: auto; padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: transparent; cursor: pointer; }
        .ap-refresh:disabled { opacity: 0.5; cursor: default; }
        .ap-section h4 { margin: 0 0 6px; font-size: 13px; color: var(--fg-secondary); }
        .ap-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
        .ap-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .ap-key { font-weight: 600; min-width: 28px; }
        .ap-pct { font-variant-numeric: tabular-nums; }
        .ap-count, .ap-expected { color: var(--fg-muted); font-size: 11px; }
        .ap-bar { display: flex; height: 10px; border-radius: 4px; overflow: hidden; margin-top: 4px; background: var(--bg-tertiary); }
        .ap-bar-seg { display: block; height: 100%; }
        .ap-table { width: 100%; font-size: 12px; border-collapse: collapse; }
        .ap-table th, .ap-table td { padding: 4px 6px; text-align: left; border-bottom: 1px solid var(--border); }
        .ap-table th { color: var(--fg-secondary); font-weight: 600; }
        .ap-baseline { font-size: 10px; color: var(--fg-muted); margin-left: 4px; }
        .ap-sig { color: var(--success, #34c97c); margin-left: 4px; }
        .ap-table tr.ap-recommended td { background: rgba(52, 201, 124, 0.08); }
        .ap-table tr.ap-recommended td:first-child { box-shadow: inset 3px 0 0 var(--success, #34c97c); }
        .ap-table tr.ap-recommended { outline: 2px solid var(--success, #34c97c); }
        .ap-best { font-size: 10px; color: var(--success, #34c97c); margin-left: 6px; font-weight: 700; }
        .ap-chart { display: block; width: 100%; max-height: 220px; margin-top: 10px; }
        .ap-empty, .ap-error, .ap-hint { color: var(--fg-muted); font-size: 12px; padding: 8px 0; }
        .ap-error { color: var(--danger); }
        .ap-warnings { margin: 0; padding-left: 16px; font-size: 11px; color: var(--fg-muted); }
    `]
})
export class AnalyticsPanelComponent {
    readonly workflowId = input.required<string>();
    private readonly api = inject(AnalyticsApiService);
    private readonly ws = inject(WorkflowService);

    readonly selectedAbNodeId = signal<string | null>(null);
    readonly response = signal<AbAnalyticsResponse | null>(null);
    readonly loading = signal<boolean>(false);
    readonly error = signal<string | null>(null);

    readonly abNodes = computed(() =>
        this.ws.nodes().filter(n => n.data.kind === 'ab')
    );

    readonly recommendedKey = computed<string | null>(() => {
        const resp = this.response();
        if (!resp || resp.mode !== 'pick') {
            return null;
        }
        const best = resp.variants
            .filter(v => v.isSignificant && v.conversionPct != null)
            .sort((a, b) => (b.conversionPct ?? 0) - (a.conversionPct ?? 0))[0];
        return best?.key ?? null;
    });

    private readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('abChart');
    private chart: Chart | null = null;

    variance(v: AbVariantRow): number | null {
        if (v.conversionPct == null || !v.runs) {
            return null;
        }
        const p = v.conversionPct / 100;
        return (p * (1 - p)) / v.runs;
    }

    constructor() {
        effect(() => {
            const list = this.abNodes();
            const current = this.selectedAbNodeId();
            if (list.length === 0) {
                if (current !== null) this.selectedAbNodeId.set(null);
                this.response.set(null);
                return;
            }
            if (!current || !list.find(n => n.id === current)) {
                this.selectedAbNodeId.set(list[0].id);
            }
        }, { allowSignalWrites: true });

        effect(() => {
            const wfId = this.workflowId();
            const nodeId = this.selectedAbNodeId();
            if (!nodeId) return;
            this.fetch(wfId, nodeId);
        });

        effect(() => {
            const resp = this.response();
            this.renderChart(resp);
        });
    }

    private renderChart(resp: AbAnalyticsResponse | null): void {
        const canvas = this.chartCanvas()?.nativeElement;
        if (!canvas) {
            return;
        }
        try {
            this.chart?.destroy();
            this.chart = null;
            if (!resp || resp.mode !== 'pick') {
                return;
            }
            const rows = resp.variants.filter(v => v.conversionPct != null);
            if (rows.length === 0) {
                return;
            }
            const recommended = this.recommendedKey();
            const success = '#34c97c';
            this.chart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: rows.map(v => v.key),
                    datasets: [{
                        label: 'Конверсия, %',
                        data: rows.map(v => v.conversionPct ?? 0),
                        backgroundColor: rows.map(v => (v.key === recommended ? success : (v.color || '#888'))),
                    }],
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                afterLabel: (ctx) => {
                                    const v = rows[ctx.dataIndex];
                                    if (v?.ciLow != null && v?.ciHigh != null) {
                                        return `95% CI: ${v.ciLow.toFixed(1)}–${v.ciHigh.toFixed(1)}`;
                                    }
                                    return '';
                                },
                            },
                        },
                    },
                    scales: { y: { beginAtZero: true, title: { display: true, text: '%' } } },
                },
            });
        } catch {
        }
    }

    selectAbNode(id: string): void {
        this.selectedAbNodeId.set(id);
    }

    refresh(): void {
        const wfId = this.workflowId();
        const nodeId = this.selectedAbNodeId();
        if (!nodeId) return;
        this.fetch(wfId, nodeId);
    }

    private fetch(workflowId: string, abNodeId: string): void {
        this.loading.set(true);
        this.error.set(null);
        this.api.getAbAnalytics(workflowId, abNodeId).subscribe({
            next: (resp) => { this.response.set(resp); this.loading.set(false); },
            error: (err) => {
                this.error.set(err?.error?.message || err?.message || 'Не удалось загрузить аналитику');
                this.loading.set(false);
            },
        });
    }
}
