import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeData } from '../../models/workflow.model';

type ExecutionStatus = 'pending' | 'running' | 'success' | 'error';

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="node-card"
         [style.borderColor]="data().color + '55'"
         [style.left.px]="x()"
         [style.top.px]="y()"
         [class.selected]="selected()"
         [class.executing]="executionStatus() === 'running'"
         [class.success]="executionStatus() === 'success'"
         [class.error]="executionStatus() === 'error'"
         (mousedown)="onMouseDown($event)">
      <div class="handle handle-left" (mousedown)="onHandleMouseDown($event, 'target')"></div>
      <header [style.background]="data().color + '16'">
        <span>{{ data().label }}</span>
        <div class="header-actions">
          <button class="ghost" (click)="openAnalytics.emit(); $event.stopPropagation()" title="Analytics">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
            </svg>
          </button>
          <button class="ghost" (click)="testNode.emit(); $event.stopPropagation()" title="Test">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="body">
        <div class="node-metric"><span>Reached</span><strong>{{ data().metrics.reached }}</strong></div>
        <div class="node-metric"><span>Clicked</span><strong>{{ data().metrics.converted }}</strong></div>
        <div class="node-metric"><span>p̂</span><strong>{{ data().metrics.pHat.toFixed(2) }}</strong></div>
        <div class="node-metric"><span>CI95%</span><strong>{{ formatCI(data().metrics.ci) }}</strong></div>
        @if (data().kind === 'ab') {
          <span class="badge-inline">Split {{ formatVariants(data().variants) }}</span>
        }
        @if (data().metrics.lastOutput) {
          <pre class="code-output">{{ data().metrics.lastOutput }}</pre>
        }
      </div>
      <div class="handle handle-right" (mousedown)="onHandleMouseDown($event, 'source')"></div>
    </div>
  `,
  styles: [`
    .icon {
      display: block;
      color: inherit;
      vertical-align: middle;
    }

    .node-card {
      position: absolute;
      min-width: 200px;
      background: var(--panel);
      border-radius: 12px;
      border: 2px solid var(--border);
      box-shadow: var(--shadow-lg);
      overflow: visible;
      font-size: 12px;
      cursor: grab;
      user-select: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .node-card.executing {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow), var(--shadow-lg);
      animation: pulse 1s ease-in-out infinite;
    }

    .node-card.success {
      border-color: var(--success);
      box-shadow: 0 0 0 3px var(--success-glow), var(--shadow-lg);
    }

    .node-card.error {
      border-color: var(--danger);
      box-shadow: 0 0 0 3px var(--danger-glow), var(--shadow-lg);
      animation: shake 0.5s ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { 
        transform: scale(1);
        box-shadow: 0 0 0 2px var(--accent-glow), var(--shadow-lg);
      }
      50% { 
        transform: scale(1.03);
        box-shadow: 0 0 0 6px var(--accent-glow), var(--shadow-lg);
      }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
  `]
})
export class WorkflowNodeComponent {
  data = input.required<NodeData>();
  x = input.required<number>();
  y = input.required<number>();
  selected = input<boolean>(false);
  executionStatus = input<ExecutionStatus>('pending');

  openAnalytics = output<void>();
  testNode = output<void>();
  onMouseDownEvent = output<MouseEvent>();
  onHandleMouseDownEvent = output<{ event: MouseEvent; type: 'source' | 'target' }>();

  private workflowService = inject(WorkflowService);

  private isDragging = signal(false);
  private dragStart = { x: 0, y: 0 };
  private nodeStart = { x: 0, y: 0 };

  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.isDragging.set(true);
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.nodeStart = { x: this.x(), y: this.y() };
    this.onMouseDownEvent.emit(event);
  }

  onHandleMouseDown(event: MouseEvent, type: 'source' | 'target'): void {
    event.stopPropagation();
    this.onHandleMouseDownEvent.emit({ event, type });
  }

  updatePosition(clientX: number, clientY: number, zoom: number): void {
    if (!this.isDragging()) return;
    const dx = (clientX - this.dragStart.x) / zoom;
    const dy = (clientY - this.dragStart.y) / zoom;
    this.workflowService.updateNodePosition(this.data().id, this.nodeStart.x + dx, this.nodeStart.y + dy);
  }

  stopDrag(): void {
    this.isDragging.set(false);
  }

  formatCI(ci: number[]): string {
    return `[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]`;
  }

  formatVariants(variants: { name: string }[]): string {
    return variants.map(v => v.name).join(' / ');
  }
}
    }

    .node-card.selected {
      box-shadow: 0 0 0 2px var(--accent), var(--shadow-lg);
    }

    .node-card:active {
      cursor: grabbing;
    }

    header {
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      border-radius: 11px 11px 0 0;
      color: var(--fg-primary);
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .body {
      padding: 10px 12px;
      color: var(--fg-muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .node-metric {
      display: flex;
      justify-content: space-between;
    }

    .node-metric strong {
      color: var(--fg-primary);
      font-family: var(--font-mono);
    }

    .badge-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      background: var(--success-bg);
      color: var(--success);
      padding: 2px 6px;
      border-radius: 6px;
      margin-top: 4px;
    }

    .handle {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid var(--panel);
      background: var(--accent);
      top: 50%;
      transform: translateY(-50%);
      cursor: crosshair;
    }

    .handle:hover {
      transform: translateY(-50%) scale(1.2);
      background: var(--accent-hover);
    }

    .handle-left {
      left: -7px;
    }

    .handle-right {
      right: -7px;
    }

    button.ghost {
      background: transparent;
      border: none;
      padding: 2px 6px;
      cursor: pointer;
      border-radius: 4px;
      color: var(--fg-secondary);
    }

    button.ghost:hover {
      background: var(--bg-tertiary);
    }

    .code-output {
      margin-top: 8px;
      padding: 6px 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--fg-secondary);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 80px;
      overflow: auto;
    }
  `]
})
export class WorkflowNodeComponent {
  data = input.required<NodeData>();
  x = input<number>(0);
  y = input<number>(0);
  selected = input<boolean>(false);

  openAnalytics = output<void>();
  testNode = output<void>();
  dragStart = output<{ event: MouseEvent }>();
  handleDragStart = output<{ event: MouseEvent; type: 'source' | 'target' }>();

  formatCI(ci: [number, number]): string {
    return ci.map(c => c.toFixed(2)).join(' – ');
  }

  formatVariants(variants: { label: string; weight: number }[]): string {
    return variants.map(v => `${v.label}:${v.weight}%`).join(' | ');
  }

  onMouseDown(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('handle')) return;
    this.dragStart.emit({ event });
  }

  onHandleMouseDown(event: MouseEvent, type: 'source' | 'target'): void {
    event.stopPropagation();
    this.handleDragStart.emit({ event, type });
  }
}
