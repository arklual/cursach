import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeData } from '../../models/workflow.model';

type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

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
         (mousedown)="onMouseDownEvent.emit($event)">
      <div class="handle handle-left"
           (mousedown)="onHandleMouseDownEvent.emit({ event: $event, type: 'target' })"></div>
      <header [style.background]="data().color + '16'">
        <span class="kind-tag">{{ kindLabel() }}</span>
        <span class="label">{{ data().label }}</span>
      </header>
      <div class="body">
        <span class="hint">Click to inspect</span>
      </div>
      <div class="handle handle-right"
           (mousedown)="onHandleMouseDownEvent.emit({ event: $event, type: 'source' })"></div>
    </div>
  `,
  styles: [`
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
      transition: all 0.2s ease;
    }

    .node-card.selected {
      box-shadow: 0 0 0 2px var(--accent), var(--shadow-lg);
    }

    .node-card.executing {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow), var(--shadow-lg);
    }

    .node-card.success {
      border-color: var(--success);
      box-shadow: 0 0 0 3px var(--success-glow), var(--shadow-lg);
    }

    .node-card.error {
      border-color: var(--danger);
      box-shadow: 0 0 0 3px var(--danger-glow), var(--shadow-lg);
    }

    header {
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      border-radius: 11px 11px 0 0;
      color: var(--fg-primary);
    }

    .kind-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .body {
      padding: 8px 12px;
      color: var(--fg-muted);
      font-size: 11px;
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

    .handle-left { left: -7px; }
    .handle-right { right: -7px; }
  `]
})
export class WorkflowNodeComponent {
  data = input.required<NodeData>();
  x = input.required<number>();
  y = input.required<number>();
  selected = input<boolean>(false);
  executionStatus = input<ExecutionStatus>('pending');

  onMouseDownEvent = output<MouseEvent>();
  onHandleMouseDownEvent = output<{ event: MouseEvent; type: 'source' | 'target' }>();

  kindLabel(): string {
    const d = this.data();
    if (d.kind === 'dataflow' && d.__subtype) {
      return d.__subtype;
    }
    return d.kind;
  }
}
