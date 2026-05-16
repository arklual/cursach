import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionService } from '../../services/execution.service';
import { NodeExecutionData } from '../../models/execution.model';

type TabType = 'input' | 'output' | 'json' | 'error';

@Component({
  selector: 'app-execution-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="execution-panel">
      @if (nodeExecution()) {
        <div class="panel-header">
          <div class="header-title">
            <span class="title-label">Execution Details</span>
            <h3>{{ nodeExecution()!.nodeName }}</h3>
          </div>
          <div class="header-actions">
            <div class="status-badge" [class]="'status-' + nodeExecution()!.status">
              {{ getStatusText(nodeExecution()!.status) }}
            </div>
            <button class="reset-btn" (click)="resetExecution()" title="Reset execution">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="tabs">
          @if (nodeExecution()!.inputData?.length) {
            <button 
              class="tab" 
              [class.active]="activeTab() === 'input'"
              (click)="activeTab.set('input')">
              Input ({{ nodeExecution()!.inputData!.length }})
            </button>
          }
          @if (nodeExecution()!.outputData?.length) {
            <button 
              class="tab" 
              [class.active]="activeTab() === 'output'"
              (click)="activeTab.set('output')">
              Output ({{ nodeExecution()!.outputData!.length }})
            </button>
          }
          <button 
            class="tab" 
            [class.active]="activeTab() === 'json'"
            (click)="activeTab.set('json')">
            JSON
          </button>
          @if (nodeExecution()!.error) {
            <button 
              class="tab error-tab" 
              [class.active]="activeTab() === 'error'"
              (click)="activeTab.set('error')">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:4px;">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              Error
            </button>
          }
        </div>

        <div class="panel-content">
          @switch (activeTab()) {
            @case ('input') {
              <div class="data-viewer">
                <div class="data-header">
                  <span>Input Data</span>
                  <span class="badge">{{ nodeExecution()!.inputData!.length }} items</span>
                </div>
                @for (item of nodeExecution()!.inputData; track $index) {
                  <div class="data-item">
                    <div class="item-index">#{{ $index }}</div>
                    <pre class="json-data">{{ formatJson(item.json) }}</pre>
                  </div>
                }
              </div>
            }
            @case ('output') {
              <div class="data-viewer">
                <div class="data-header">
                  <span>Output Data</span>
                  <span class="badge">{{ nodeExecution()!.outputData!.length }} items</span>
                </div>
                @for (item of nodeExecution()!.outputData; track $index) {
                  <div class="data-item">
                    <div class="item-index">#{{ $index }}</div>
                    <pre class="json-data">{{ formatJson(item.json) }}</pre>
                  </div>
                }
              </div>
            }
            @case ('json') {
              <div class="data-viewer">
                <div class="data-header">
                  <span>Full Execution JSON</span>
                </div>
                <pre class="json-data full-json">{{ formatFullJson() }}</pre>
              </div>
            }
            @case ('error') {
              <div class="error-viewer">
                <div class="error-message">
                  <strong>Error:</strong> {{ nodeExecution()!.error?.message }}
                </div>
                @if (nodeExecution()!.error?.details) {
                  <div class="error-details">{{ nodeExecution()!.error!.details }}</div>
                }
                @if (nodeExecution()!.error?.stack) {
                  <pre class="error-stack">{{ nodeExecution()!.error!.stack }}</pre>
                }
              </div>
            }
          }
        </div>

        @if (nodeExecution()!.duration) {
          <div class="panel-footer">
            <span>⏱ Duration: <strong>{{ nodeExecution()!.duration | number:'1.0-0' }}ms</strong></span>
            @if (nodeExecution()!.startTime) {
              <span>🕐 Started: <strong>{{ formatTime(nodeExecution()!.startTime!) }}</strong></span>
            }
          </div>
        }
      } @else {
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <h3>No execution data</h3>
          <p>Select a node to view execution details</p>
          <p class="hint">Run the workflow to see execution results</p>
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
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .reset-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      font-size: 16px;
      cursor: pointer;
      display: grid;
      place-items: center;
    }

    .reset-btn:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .icon {
      display: block;
      color: inherit;
      vertical-align: middle;
    }

    .status-badge {
      padding: 4px 12px;
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

    .close-btn {
      background: transparent;
      border: none;
      color: var(--fg-muted);
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      display: grid;
      place-items: center;
    }

    .close-btn:hover {
      color: var(--fg-primary);
      background: var(--bg-tertiary);
      border-radius: 4px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    .tab {
      padding: 8px 16px;
      background: transparent;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      color: var(--fg-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .tab:hover {
      background: var(--bg-tertiary);
      color: var(--fg-primary);
    }

    .tab.active {
      background: var(--accent);
      color: white;
    }

    .tab.error-tab.active {
      background: var(--danger);
    }

    .panel-content {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }

    .data-viewer {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .data-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    .data-header span:first-child {
      font-weight: 600;
      color: var(--fg-primary);
      font-size: 13px;
    }

    .badge {
      background: var(--bg-tertiary);
      color: var(--fg-secondary);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
    }

    .data-item {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }

    .item-index {
      font-size: 11px;
      color: var(--fg-muted);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .json-data {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      max-height: 400px;
      overflow: auto;
      line-height: 1.5;
    }

    .full-json {
      max-height: none;
    }

    .error-viewer {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .error-message {
      background: var(--danger-bg);
      border: 1px solid var(--danger);
      border-radius: 8px;
      padding: 12px;
      color: var(--danger);
      font-size: 13px;
    }

    .error-message strong {
      display: block;
      margin-bottom: 4px;
    }

    .error-details {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      color: var(--fg-secondary);
    }

    .error-stack {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--fg-muted);
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      max-height: 300px;
      overflow: auto;
    }

    .panel-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      display: flex;
      gap: 24px;
      font-size: 12px;
      color: var(--fg-muted);
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
      padding: 40px;
      text-align: center;
      color: var(--fg-muted);
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h3 {
      margin: 0 0 8px;
      font-size: 16px;
      color: var(--fg-secondary);
    }

    .empty-state p {
      margin: 0;
      font-size: 13px;
    }

    .empty-state .hint {
      margin-top: 8px;
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

  activeTab = signal<TabType>('output');

  nodeExecution = computed(() => {
    const nodeId = this.nodeId();
    if (!nodeId) return null;
    return this.executionService.getNodeExecutionData(nodeId);
  });

  resetExecution(): void {
    this.reset.emit();
  }

  formatJson(data: Record<string, unknown>): string {
    return JSON.stringify(data, null, 2);
  }

  formatFullJson(): string {
    const exec = this.nodeExecution();
    if (!exec) return '{}';
    
    return JSON.stringify({
      nodeId: exec.nodeId,
      nodeName: exec.nodeName,
      nodeType: exec.nodeType,
      status: exec.status,
      startTime: exec.startTime,
      endTime: exec.endTime,
      duration: exec.duration,
      inputData: exec.inputData,
      outputData: exec.outputData,
      error: exec.error
    }, null, 2);
  }

  getStatusText(status: string): string {
    const map: Record<string, string> = {
      'pending': 'Pending',
      'running': 'Running',
      'success': 'Success',
      'error': 'Error',
      'skipped': 'Skipped'
    };
    return map[status] || status;
  }

  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('ru-RU');
  }
}
