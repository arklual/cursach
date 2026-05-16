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
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64">
          <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z"/>
        </svg>
      </div>
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
            <svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-2-3.5l6-4.5-6-4.5z"/>
            </svg>
            <span class="node-label">Trigger</span>
          </button>

          <button
            class="quick-node-btn"
            (click)="addQuickNode('ab')"
            title="Разделение трафика на варианты">
            <svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span class="node-label">A/B Fork</span>
          </button>

          <button
            class="quick-node-btn"
            (click)="addQuickNode('http')"
            title="HTTP запрос к API">
            <svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <span class="node-label">HTTP</span>
          </button>

          <button
            class="quick-node-btn"
            (click)="addQuickNode('code')"
            title="Python код для обработки">
            <svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            </svg>
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
      color: var(--fg-secondary);
      z-index: 1;
      padding: 24px;
      background: var(--panel);
    }

    .empty-icon {
      font-size: 64px;
      line-height: 1;
      opacity: 0.8;
    }

    .node-icon {
      display: block;
      color: var(--accent);
      margin-bottom: 8px;
    }

    h3 {
      margin: 0;
      font-size: 22px;
      color: var(--fg-primary);
    }

    .empty-description {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      max-width: 420px;
      color: var(--fg-muted);
    }

    .quick-start {
      margin-top: 8px;
      pointer-events: auto;
    }

    .quick-start-title {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--fg-secondary);
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
      background: var(--panel);
      border: 2px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 100px;
    }

    .quick-node-btn:hover {
      border-color: var(--accent);
      background: var(--panel-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md), var(--accent-glow);
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
      color: var(--fg-primary);
    }

    .empty-hint {
      margin-top: 16px;
      padding: 12px 20px;
      background: var(--accent-glow);
      border: 1px solid var(--accent);
      border-radius: 8px;
      pointer-events: auto;
    }

    .empty-hint p {
      margin: 0;
      font-size: 13px;
      color: var(--accent);
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
