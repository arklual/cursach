import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowService } from '../../services/workflow.service';
import { NodeKind, NodeTemplate } from '../../models/workflow.model';

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="palette">
      <h2>Палитра нод</h2>
      <p class="hint">Перетащите тип на Canvas</p>
      <div class="palette-items">
        @for (item of nodeTemplateEntries; track item.type) {
          <button class="palette-item"
                  draggable="true"
                  (dragstart)="onDragStart($event, item.type)">
            {{ item.template.label }}
          </button>
        }
      </div>
      <section class="calc-card">
        <header>
          <h3>Power / Sample</h3>
          <span class="badge">α=0.05 · power={{ power() }}</span>
        </header>
        <p>Baseline p₀ = 0.25, Δ = 0.05</p>
        <p>n ≈ {{ sampleSize() }} / вариант</p>
        <p class="hint">n ≈ ((z₁₋α/₂ + z₁₋β)² · p(1−p)) / d²</p>
      </section>
    </aside>
  `,
  styles: [`
    .palette {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: calc(100vh - 200px);
      overflow: auto;
    }

    .palette h2 {
      margin: 0;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      margin: 0;
    }

    .palette-items {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .palette-item {
      background: #f8fafc;
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 8px 14px;
      cursor: grab;
      font-size: 14px;
    }

    .palette-item:hover {
      background: #f1f5f9;
    }

    .calc-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fdfdff;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .calc-card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .calc-card h3 {
      margin: 0;
      font-size: 14px;
    }

    .calc-card p {
      margin: 0;
      font-size: 13px;
    }

    .badge {
      background: rgba(79, 70, 229, 0.1);
      color: var(--accent);
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 12px;
    }
  `]
})
export class PaletteComponent {
  private workflowService = inject(WorkflowService);

  power = input<number>(0.8);
  sampleSize = input<string>('0');

  dragStart = output<{ type: NodeKind }>();

  get nodeTemplateEntries(): { type: NodeKind; template: NodeTemplate }[] {
    return Object.entries(this.workflowService.nodeTemplates).map(([type, template]) => ({
      type: type as NodeKind,
      template
    }));
  }

  onDragStart(event: DragEvent, type: NodeKind): void {
    event.dataTransfer?.setData('application/workflow-node', type);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.dragStart.emit({ type });
  }
}
