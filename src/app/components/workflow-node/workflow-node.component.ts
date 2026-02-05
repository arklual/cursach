import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeData } from '../../models/workflow.model';

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
         (mousedown)="onMouseDown($event)">
      <div class="handle handle-left" (mousedown)="onHandleMouseDown($event, 'target')"></div>
      <header [style.background]="data().color + '16'">
        <span>{{ data().label }}</span>
        <div class="header-actions">
          <button class="ghost" (click)="openAnalytics.emit(); $event.stopPropagation()">📊</button>
          <button class="ghost" (click)="testNode.emit(); $event.stopPropagation()">⚙</button>
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
      </div>
      <div class="handle handle-right" (mousedown)="onHandleMouseDown($event, 'source')"></div>
    </div>
  `,
  styles: [`
    .node-card {
      position: absolute;
      min-width: 200px;
      background: white;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      overflow: visible;
      font-size: 12px;
      cursor: grab;
      user-select: none;
    }

    .node-card.selected {
      box-shadow: 0 0 0 2px var(--accent), 0 12px 30px rgba(15, 23, 42, 0.12);
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
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .body {
      padding: 10px 12px;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .node-metric {
      display: flex;
      justify-content: space-between;
    }

    .badge-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      background: rgba(22, 163, 74, 0.1);
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
      border: 2px solid white;
      background: var(--accent);
      top: 50%;
      transform: translateY(-50%);
      cursor: crosshair;
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
    }

    button.ghost:hover {
      background: rgba(0,0,0,0.05);
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
