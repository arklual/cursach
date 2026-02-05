import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode, Variant } from '../../models/workflow.model';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="inspector">
      <h2>Inspector</h2>
      @if (activeNode(); as node) {
        <div class="inspector-content">
          <label>
            Название
            <input type="text" [ngModel]="node.data.label" (ngModelChange)="updateLabel($event)">
          </label>
          <label>
            Метрика успеха p̂
            <input type="number" step="0.05" min="0" max="1"
                   [ngModel]="node.data.successProb"
                   (ngModelChange)="updateSuccessProb($event)">
          </label>
          @if (node.data.kind === 'ab') {
            <div class="traffic-section">
              <h4>Traffic allocation</h4>
              @for (variant of node.data.variants; track variant.label; let i = $index) {
                <div class="allocation-row">
                  <span>{{ variant.label }}</span>
                  <input type="range" min="5" max="95"
                         [ngModel]="variant.weight"
                         (ngModelChange)="updateVariantWeight(i, $event)">
                  <input type="number"
                         [ngModel]="variant.weight"
                         (ngModelChange)="updateVariantWeight(i, $event)">
                </div>
              }
              <label>
                Randomization
                <select [ngModel]="node.data.randomization" (ngModelChange)="updateRandomization($event)">
                  <option value="simple">Simple random</option>
                  <option value="hashed">Hashed by user_id</option>
                  <option value="stratified">Stratified</option>
                </select>
              </label>
            </div>
          }
          <button class="ghost" (click)="testNode.emit(node.id)">Test node</button>
        </div>
      } @else {
        <p>Выберите ноду для настройки.</p>
      }

      <section class="inspector-section">
        <h3>Stopping rules</h3>
        <label><input type="radio" name="stopping" checked> Fixed horizon (α контролируется)</label>
        <label><input type="radio" name="stopping"> Sequential (SPRT) + FDR alert</label>
        <p class="hint">Контролируйте вероятность ложной тревоги (Type I error).</p>
      </section>

      <section class="inspector-section">
        <h3>Reroute / roll-out</h3>
        <button (click)="promoteWinner.emit()">Promote winner</button>
        <p class="hint">Автоматически обновит доли трафика по результатам.</p>
      </section>
    </aside>
  `,
  styles: [`
    .inspector {
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

    .inspector h2 {
      margin: 0;
    }

    .inspector-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      gap: 4px;
    }

    input, select {
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 6px 8px;
    }

    .traffic-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .traffic-section h4 {
      margin: 8px 0 4px;
      font-size: 13px;
    }

    .allocation-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .allocation-row span {
      width: 20px;
      font-weight: 600;
    }

    .allocation-row input[type="range"] {
      flex: 1;
    }

    .allocation-row input[type="number"] {
      width: 60px;
    }

    .inspector-section {
      background: #f8fafc;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .inspector-section h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }

    .inspector-section label {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      margin: 8px 0 0;
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 14px;
      cursor: pointer;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
    }

    button.ghost:hover {
      background: #f1f5f9;
    }
  `]
})
export class InspectorComponent {
  private workflowService = inject(WorkflowService);

  activeNode = input<WorkflowNode | null>(null);
  testNode = output<string>();
  promoteWinner = output<void>();

  updateLabel(label: string): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, label }));
    }
  }

  updateSuccessProb(prob: number): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, successProb: prob }));
    }
  }

  updateRandomization(randomization: 'simple' | 'hashed' | 'stratified'): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, randomization }));
    }
  }

  updateVariantWeight(index: number, value: number): void {
    const node = this.activeNode();
    if (!node) return;

    this.workflowService.updateNodeData(node.id, data => {
      const variants = data.variants.map((v, i) =>
        i === index ? { ...v, weight: Number(value) } : v
      );
      const total = variants.reduce((sum, v) => sum + v.weight, 0);
      return {
        ...data,
        variants: variants.map(v => ({ ...v, weight: Math.round((v.weight / total) * 100) }))
      };
    });
  }
}
