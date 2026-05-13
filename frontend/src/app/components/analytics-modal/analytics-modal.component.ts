import { Component, input, output, ElementRef, viewChild, effect, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';
import { WorkflowNode } from '../../models/workflow.model';
import { Chart, ChartConfiguration } from 'chart.js/auto';

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
      background: #fdfdff;
    }

    .analytics-card h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
    }

    .analytics-card p {
      margin: 4px 0;
      font-size: 13px;
    }

    .hint {
      color: var(--muted);
      font-size: 11px;
    }

    h4 {
      margin: 16px 0 8px;
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
    }

    button.secondary {
      background: #0f172a;
      color: white;
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
    }
  `]
})
export class AnalyticsModalComponent {
  private platformId = inject(PLATFORM_ID);

  node = input<WorkflowNode | null>(null);
  close = output<void>();

  funnelCanvas = viewChild<ElementRef<HTMLCanvasElement>>('funnelCanvas');
  cumulativeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('cumulativeCanvas');
  latencyCanvas = viewChild<ElementRef<HTMLCanvasElement>>('latencyCanvas');

  private funnelChart: Chart | null = null;
  private cumulativeChart: Chart | null = null;
  private latencyChart: Chart | null = null;

  constructor() {
    effect(() => {
      const n = this.node();
      if (n && isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.initCharts(n), 0);
      }
    });
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
      const points = n.data.metrics.users || [];
      this.cumulativeChart = new Chart(cumulativeEl, {
        type: 'line',
        data: {
          labels: points.map((_, idx) => idx + 1),
          datasets: [{
            label: 'p̂(t)',
            data: points.map((_, idx) => Math.min(1, n.data.metrics.converted / (idx + 1))),
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
            data: [4, 6, 3, 1].map(v => v * Math.random()),
            backgroundColor: '#f97316'
          }]
        },
        options: { plugins: { legend: { display: false } } }
      });
    }
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
