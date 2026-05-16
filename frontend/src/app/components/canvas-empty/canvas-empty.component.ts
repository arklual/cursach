import { Component, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowService } from '../../services/workflow.service';
import { NodeKind } from '../../models/workflow.model';

@Component({
  selector: 'app-canvas-empty',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-empty-state">
      <div class="empty-icon">🎨</div>
      <h3>Холст пуст</h3>
      <p class="empty-description">
        Перетащите ноду из палитры слева или выберите готовый тип ниже
      </p>
      
      <div class="quick-start">
        <p class="quick-start-title">Популярные ноды:</p>
        <div class="quick-start-nodes">
          <button 
            class="quick-node-btn"
            (click)="addQuickNode('trigger')"
            title="Стартовая точка workflow">
            <span class="node-icon">🎯</span>
            <span class="node-label">Trigger</span>
          </button>
          
          <button 
            class="quick-node-btn"
            (click)="addQuickNode('ab')"
            title="Разделение трафика на варианты">
            <span class="node-icon">⚖</span>
            <span class="node-label">A/B Fork</span>
          </button>
          
          <button 
            class="quick-node-btn"
            (click)="addQuickNode('http')"
            title="HTTP запрос к API">
            <span class="node-icon">🌐</span>
            <span class="node-label">HTTP</span>
          </button>
          
          <button 
            class="quick-node-btn"
            (click)="addQuickNode('code')"
            title="Python код для обработки">
            <span class="node-icon">💻</span>
            <span class="node-label">Code</span>
          </button>
        </div>
      </div>
      
      <div class="empty-hint">
        <p>💡 Совет: Нажмите на кнопку, чтобы добавить ноду в центр холста</p>
      </div>
    </div>
  `,
  styles: [`
    .canvas-empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      pointer-events: none;
      text-align: center;
      color: #475569;
      z-index: 1;
      padding: 24px;
      background: rgba(255, 255, 255, 0.95);
    }

    .empty-icon {
      font-size: 64px;
      line-height: 1;
      opacity: 0.8;
    }

    h3 {
      margin: 0;
      font-size: 22px;
      color: #0f172a;
    }

    .empty-description {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      max-width: 420px;
      color: #64748b;
    }

    .quick-start {
      margin-top: 8px;
      pointer-events: auto;
    }

    .quick-start-title {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
    }

    .quick-start-nodes {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .quick-node-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px 20px;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 100px;
    }

    .quick-node-btn:hover {
      border-color: #6366f1;
      background: #f8fafc;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
    }

    .quick-node-btn:active {
      transform: translateY(0);
    }

    .node-icon {
      font-size: 28px;
      line-height: 1;
    }

    .node-label {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .empty-hint {
      margin-top: 16px;
      padding: 12px 20px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      pointer-events: auto;
    }

    .empty-hint p {
      margin: 0;
      font-size: 13px;
      color: #0369a1;
    }
  `]
})
export class CanvasEmptyComponent {
  private workflowService = inject(WorkflowService);

  nodeAdded = output<NodeKind>();

  addQuickNode(type: NodeKind): void {
    // Добавляем ноду в центр холста (примерные координаты)
    const position = { x: 400, y: 300 };
    this.workflowService.addNode(type, position);
    this.nodeAdded.emit(type);
  }
}
