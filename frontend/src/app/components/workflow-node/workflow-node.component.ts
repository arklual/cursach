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
         [class.is-pending]="executionStatus() === 'pending'"
         [class.executing]="executionStatus() === 'running'"
         [class.success]="executionStatus() === 'success'"
         [class.error]="executionStatus() === 'error'"
         [class.skipped]="executionStatus() === 'skipped'"
         (mousedown)="onMouseDownEvent.emit($event)">
      <div class="handle handle-left"
           (mousedown)="onHandleMouseDownEvent.emit({ event: $event, type: 'target' })"></div>
      <header [style.background]="data().color + '16'">
        <span class="kind-tag">{{ kindLabel() }}</span>
        <span class="label">{{ data().label }}</span>
      </header>
      <div class="body">
        @if (data().purpose) {
          <span class="purpose">{{ data().purpose }}</span>
        } @else {
          <span class="hint">Click to inspect</span>
        }
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

    /* pending — серый (статусная индикация по ТЗ требование 8/10) */
    .node-card.is-pending {
      border-color: var(--border);
    }

    /* running — жёлтый */
    .node-card.executing {
      border-color: #eab308;
      box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.35), var(--shadow-lg);
    }

    /* success — зелёный */
    .node-card.success {
      border-color: var(--success);
      box-shadow: 0 0 0 3px var(--success-glow), var(--shadow-lg);
    }

    /* failed — красный */
    .node-card.error {
      border-color: var(--danger);
      box-shadow: 0 0 0 3px var(--danger-glow), var(--shadow-lg);
    }

    /* skipped — серый с пунктирной обводкой */
    .node-card.skipped {
      border-style: dashed;
      border-color: var(--fg-muted);
      opacity: 0.7;
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

    .purpose {
      display: block;
      color: var(--fg-secondary);
      font-size: 11px;
      line-height: 1.4;
      white-space: normal;
      max-width: 240px;
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
