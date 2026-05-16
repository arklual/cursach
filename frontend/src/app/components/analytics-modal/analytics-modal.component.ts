import { Component, OnDestroy, input, output, ElementRef, viewChild, effect, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';
import { WorkflowNode } from '../../models/workflow.model';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-analytics-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal [open]="!!node()" [title]="'Node Analytics · ' + (node()?.data?.label || '')" (close)="close.emit()">
      @if (node(); as n) {
        <div class="analytics-grid">
          <div class="analytics-card">
            <h4>Основные метрики</h4>
            <p>N₍reached₎ = {{ n.data.metrics.reached }}</p>
            <p>k₍converted₎ = {{ n.data.metrics.converted }}</p>
            <p>p̂ = {{ (n.data.metrics.pHat * 100).toFixed(1) }}%</p>
            <p>Var(p̂) = {{ n.data.metrics.variance.toFixed(4) }}</p>
            <p>CI95% = {{ formatCI(n.data.metrics.ci) }}</p>
            <p class="hint">Доверительный интервал = p̂ ± 1.96·√Var(p̂)</p>
          </div>
          <div class="analytics-card">
            <h4>Funnel position</h4>
            <canvas #funnelCanvas height="200"></canvas>
          </div>
          <div class="analytics-card">
            <h4>Cumulative conversion</h4>
            <canvas #cumulativeCanvas height="200"></canvas>
          </div>
          <div class="analytics-card">
            <h4>Latency histogram</h4>
            <canvas #latencyCanvas height="200"></canvas>
          </div>
        </div>
        <h4>Кто дошёл</h4>
        <table class="table">
          <thead>
            <tr><th>User</th><th>Variant</th><th>Timestamp</th><th>Payload</th></tr>
          </thead>
          <tbody>
            @for (entry of n.data.metrics.users.slice(0, 10); track entry.user + entry.timestamp) {
              <tr>
                <td>{{ entry.user }}</td>
                <td>{{ entry.variant || '—' }}</td>
                <td>{{ entry.timestamp }}</td>
                <td>
                  <button class="ghost" (click)="showPayload(entry.payload)">JSON</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <button class="secondary" (click)="exportEvents()">
          Export sample payloads / raw events
        </button>
      }
    </app-modal>
  `,
  styles: [`
    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .analytics-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: var(--panel);
    }

    .analytics-card h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: var(--fg-primary);
    }

    .analytics-card p {
      margin: 4px 0;
      font-size: 13px;
      color: var(--fg-secondary);
    }

    .hint {
      color: var(--fg-muted);
      font-size: 11px;
    }

    h4 {
      margin: 16px 0 8px;
      color: var(--fg-primary);
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }

    .table th,
    .table td {
      border-bottom: 1px solid var(--border);
      padding: 6px;
      text-align: left;
      font-size: 12px;
      color: var(--fg-secondary);
    }

    .table th {
      color: var(--fg-primary);
      font-weight: 600;
    }

    button.secondary {
      background: var(--bg-primary);
      color: var(--fg-primary);
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      cursor: pointer;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 11px;
      color: var(--fg-primary);
    }
  `]
})
export class AnalyticsModalComponent implements OnDestroy {
  private platformId = inject(PLATFORM_ID);

  node = input<WorkflowNode | null>(null);
  close = output<void>();

  funnelCanvas = viewChild<ElementRef<HTMLCanvasElement>>('funnelCanvas');
  cumulativeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('cumulativeCanvas');
  latencyCanvas = viewChild<ElementRef<HTMLCanvasElement>>('latencyCanvas');

  private funnelChart: Chart | null = null;
  private cumulativeChart: Chart | null = null;
  private latencyChart: Chart | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      const n = this.node();
      if (this.pendingTimer !== null) {
        clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
      if (!n) {
        this.destroyCharts();
        return;
      }
      if (isPlatformBrowser(this.platformId)) {
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          this.initCharts(n);
        }, 0);
        onCleanup(() => {
          if (this.pendingTimer !== null) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.destroyCharts();
  }

  private initCharts(n: WorkflowNode): void {
    this.destroyCharts();

    const funnelEl = this.funnelCanvas()?.nativeElement;
    if (funnelEl) {
      this.funnelChart = new Chart(funnelEl, {
        type: 'bar',
        data: {
          labels: ['Reached', 'Converted'],
          datasets: [{
            data: [n.data.metrics.reached, n.data.metrics.converted],
            backgroundColor: ['#94a3b8', '#22c55e']
          }]
        },
        options: { plugins: { legend: { display: false } } }
      });
    }

    const cumulativeEl = this.cumulativeCanvas()?.nativeElement;
    if (cumulativeEl) {
      const cumulative = this.buildCumulativeSeries(n);
      this.cumulativeChart = new Chart(cumulativeEl, {
        type: 'line',
        data: {
          labels: cumulative.map((_, idx) => idx + 1),
          datasets: [{
            label: 'p̂(t)',
            data: cumulative,
            borderColor: '#6366f1'
          }]
        },
        options: {
          scales: { y: { min: 0, max: 1 } },
          plugins: { legend: { display: false } }
        }
      });
    }

    const latencyEl = this.latencyCanvas()?.nativeElement;
    if (latencyEl) {
      this.latencyChart = new Chart(latencyEl, {
        type: 'bar',
        data: {
          labels: ['0-50', '50-100', '100-150', '150+'],
          datasets: [{
            data: this.buildLatencyHistogram(n),
            backgroundColor: '#f97316'
          }]
        },
        options: { plugins: { legend: { display: false } } }
      });
    }
  }

  private buildCumulativeSeries(n: WorkflowNode): number[] {
    const users = n.data.metrics.users ?? [];
    if (users.length === 0) {
      return [];
    }
    const reached = n.data.metrics.reached || users.length;
    const totalConverted = n.data.metrics.converted;
    const out: number[] = [];
    let convertedSoFar = 0;
    for (let i = 0; i < users.length; i++) {
      const seen = i + 1;
      const expectedConverted = (totalConverted * seen) / reached;
      convertedSoFar = Math.min(totalConverted, expectedConverted);
      out.push(Math.min(1, convertedSoFar / seen));
    }
    return out;
  }

  private buildLatencyHistogram(n: WorkflowNode): number[] {
    const events = (n.data.metrics.events ?? []) as Array<{ latencyMs?: number; payload_summary?: { latencyMs?: number } }>;
    const buckets = [0, 0, 0, 0];
    for (const ev of events) {
      const ms = ev.latencyMs ?? ev.payload_summary?.latencyMs;
      if (typeof ms !== 'number') {
        continue;
      }
      if (ms < 50) buckets[0]++;
      else if (ms < 100) buckets[1]++;
      else if (ms < 150) buckets[2]++;
      else buckets[3]++;
    }
    return buckets;
  }

  private destroyCharts(): void {
    this.funnelChart?.destroy();
    this.cumulativeChart?.destroy();
    this.latencyChart?.destroy();
    this.funnelChart = null;
    this.cumulativeChart = null;
    this.latencyChart = null;
  }

  formatCI(ci: [number, number]): string {
    return ci.map(v => v.toFixed(2)).join(' – ');
  }

  showPayload(payload: Record<string, unknown>): void {
    alert(JSON.stringify(payload, null, 2));
  }

  exportEvents(): void {
    const n = this.node();
    if (!n) return;
    const text = JSON.stringify(n.data.metrics.events.slice(0, 100), null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${n.id}_events.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
