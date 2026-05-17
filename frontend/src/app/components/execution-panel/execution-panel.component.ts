import { Component, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionService } from '../../services/execution.service';

@Component({
  selector: 'app-execution-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="execution-panel">
      @if (nodeExecution(); as exec) {
        <div class="panel-header">
          <div class="header-title">
            <span class="title-label">Node</span>
            <h3>{{ exec.nodeName }}</h3>
            <span class="node-type">{{ exec.nodeType }}</span>
          </div>
          <div class="header-actions">
            <div class="status-badge" [class]="'status-' + exec.status">
              {{ statusLabel(exec.status) }}
            </div>
            <button class="reset-btn" (click)="reset.emit()" title="Reset">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="io-grid">
          <section class="io-pane">
            <header class="io-header in">
              <span class="io-dot"></span>
              <span class="io-title">Input</span>
              <span class="io-count">{{ exec.inputData?.length ?? 0 }} item(s)</span>
            </header>
            <div class="io-body">
              @if (exec.inputData?.length) {
                @for (item of exec.inputData; track $index) {
                  <div class="io-item">
                    @if ((exec.inputData?.length ?? 0) > 1) {
                      <div class="io-item-idx">#{{ $index }}</div>
                    }
                    <pre class="io-json">{{ pretty(item.json) }}</pre>
                  </div>
                }
              } @else {
                <div class="io-empty">No input data</div>
              }
            </div>
          </section>

          <section class="io-pane">
            <header class="io-header out" [class.error]="exec.status === 'error'">
              <span class="io-dot"></span>
              <span class="io-title">{{ exec.status === 'error' ? 'Error' : 'Output' }}</span>
              @if (exec.status !== 'error') {
                <span class="io-count">{{ exec.outputData?.length ?? 0 }} item(s)</span>
              }
            </header>
            <div class="io-body">
              @if (exec.status === 'error' && exec.error) {
                <div class="error-card">
                  <div class="error-message">{{ exec.error.message }}</div>
                  @if (exec.error.details) {
                    <pre class="error-details">{{ exec.error.details }}</pre>
                  }
                  @if (exec.error.stack) {
                    <details>
                      <summary>Stack trace</summary>
                      <pre class="error-stack">{{ exec.error.stack }}</pre>
                    </details>
                  }
                </div>
              } @else if (exec.outputData?.length) {
                @for (item of exec.outputData; track $index) {
                  <div class="io-item">
                    @if ((exec.outputData?.length ?? 0) > 1) {
                      <div class="io-item-idx">#{{ $index }}</div>
                    }
                    <pre class="io-json">{{ pretty(item.json) }}</pre>
                  </div>
                }
              } @else if (exec.status === 'pending' || exec.status === 'running') {
                <div class="io-empty">Waiting for execution…</div>
              } @else {
                <div class="io-empty">No output</div>
              }
            </div>
          </section>
        </div>

        @if (exec.duration != null || exec.startTime) {
          <footer class="panel-footer">
            @if (exec.duration != null) {
              <span>Duration: <strong>{{ exec.duration | number:'1.0-0' }} ms</strong></span>
            }
            @if (exec.startTime) {
              <span>Started: <strong>{{ formatTime(exec.startTime) }}</strong></span>
            }
            @if (exec.itemsCount != null) {
              <span>Items: <strong>{{ exec.itemsCount }}</strong></span>
            }
          </footer>
        }
      } @else {
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <h3>Нет данных о запуске</h3>
          <p>Нажмите <b>Execute</b>, чтобы запустить workflow.</p>
          <p class="hint">Затем кликните по ноде, чтобы увидеть её входной и выходной JSON.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .execution-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--panel);
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    .header-title {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .title-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fg-muted);
      font-weight: 600;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      color: var(--fg-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .node-type {
      font-size: 11px;
      color: var(--fg-muted);
      font-family: var(--font-mono);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.status-pending { background: var(--bg-tertiary); color: var(--fg-muted); }
    .status-badge.status-running { background: var(--accent-glow); color: var(--accent); }
    .status-badge.status-success { background: var(--success-bg); color: var(--success); }
    .status-badge.status-error { background: var(--danger-bg); color: var(--danger); }
    .status-badge.status-skipped { background: var(--bg-tertiary); color: var(--fg-muted); }

    .reset-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      cursor: pointer;
      display: grid;
      place-items: center;
    }

    .reset-btn:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .io-grid {
      flex: 1;
      display: grid;
      grid-template-rows: 1fr 1fr;
      gap: 0;
      overflow: hidden;
      min-height: 0;
    }

    .io-pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-bottom: 1px solid var(--border);
    }

    .io-pane:last-child {
      border-bottom: none;
    }

    .io-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: 600;
    }

    .io-header .io-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .io-header.in .io-dot { background: var(--accent); }
    .io-header.out .io-dot { background: var(--success); }
    .io-header.out.error .io-dot { background: var(--danger); }
    .io-header.out.error { color: var(--danger); }

    .io-title {
      color: var(--fg-primary);
      flex: 1;
    }

    .io-header.out.error .io-title { color: var(--danger); }

    .io-count {
      font-size: 11px;
      color: var(--fg-muted);
      font-weight: 500;
      background: var(--bg-tertiary);
      padding: 2px 8px;
      border-radius: 10px;
    }

    .io-body {
      flex: 1;
      overflow: auto;
      padding: 12px;
      background: var(--bg-primary);
    }

    .io-item + .io-item {
      margin-top: 8px;
    }

    .io-item-idx {
      font-size: 10px;
      color: var(--fg-muted);
      font-family: var(--font-mono);
      margin-bottom: 4px;
    }

    .io-json {
      margin: 0;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    .io-empty {
      padding: 24px 0;
      text-align: center;
      color: var(--fg-muted);
      font-size: 12px;
    }

    .error-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .error-message {
      background: var(--danger-bg);
      border: 1px solid var(--danger);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--danger);
      font-size: 13px;
      font-weight: 600;
    }

    .error-details, .error-stack {
      margin: 0;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 240px;
      overflow: auto;
    }

    details summary {
      cursor: pointer;
      font-size: 12px;
      color: var(--fg-muted);
      padding: 4px 0;
    }

    .panel-footer {
      padding: 8px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--fg-muted);
      flex-wrap: wrap;
    }

    .panel-footer strong {
      color: var(--fg-primary);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 40px 20px;
      text-align: center;
      color: var(--fg-muted);
    }

    .empty-icon {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--accent-glow);
      color: var(--accent);
      margin-bottom: 16px;
    }

    .empty-icon svg {
      display: block;
    }

    .empty-state h3 {
      margin: 0 0 8px;
      font-size: 16px;
      color: var(--fg-secondary);
    }

    .empty-state p {
      margin: 4px 0;
      font-size: 13px;
    }

    .empty-state .hint {
      font-size: 12px;
      color: var(--fg-muted);
    }
  `]
})
export class ExecutionPanelComponent {
  private executionService = inject(ExecutionService);

  nodeId = input<string | null>(null);
  close = output<void>();
  reset = output<void>();

  nodeExecution = computed(() => {
    const id = this.nodeId();
    if (!id) return null;
    return this.executionService.getNodeExecutionData(id);
  });

  pretty(data: unknown): string {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      success: 'Success',
      error: 'Error',
      skipped: 'Skipped',
    };
    return labels[status] ?? status;
  }

  formatTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  }
}
