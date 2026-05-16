import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { NodeKind, NodeTemplate } from '../../models/workflow.model';

interface NodeCategory {
  id: string;
  name: string;
  icon: string;
  types: string[];
  color: string;
}

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="palette">
      <header class="palette-header">
        <h2>Ноды</h2>
        <input
          type="text"
          class="search-input"
          placeholder="Поиск нод..."
          [(ngModel)]="searchQuery"
          aria-label="Поиск нод">
      </header>

      @for (category of filteredCategories(); track category.id) {
        <section class="category">
          <div class="category-header" [style.borderLeftColor]="category.color">
            <span class="category-icon">{{ category.icon }}</span>
            <h3>{{ category.name }}</h3>
            <span class="category-count">{{ category.types.length }}</span>
          </div>
          <div class="category-items">
            @for (item of getFilteredNodes(category.types); track item.type) {
              <button
                class="palette-item"
                draggable="true"
                (dragstart)="onDragStart($event, item.type)"
                [title]="item.template.label">
                <span class="palette-item-icon">{{ getNodeIcon(item.type) }}</span>
                <span class="palette-item-label">{{ item.template.label }}</span>
              </button>
            }
          </div>
        </section>
      }

      @if (filteredCategories().length === 0) {
        <div class="empty-state">
          <span class="empty-icon">🔍</span>
          <p>Ноды не найдены</p>
        </div>
      }

      <section class="calc-card">
        <header>
          <h3>📊 Power Analysis</h3>
          <span class="badge">α=0.05 · power={{ power() }}</span>
        </header>
        <div class="calc-content">
          <p><strong>Baseline:</strong> p₀ = 0.25</p>
          <p><strong>MDE:</strong> Δ = 0.05</p>
          <p class="result"><strong>n ≈ {{ sampleSize() }}</strong> / вариант</p>
        </div>
        <p class="hint">n ≈ ((z₁₋α/₂ + z₁₋β)² · p(1−p)) / d²</p>
      </section>
    </aside>
  `,
  styles: [`
    .palette {
      background: var(--bg-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: calc(100vh - 180px);
      overflow: auto;
      box-shadow: var(--shadow-sm);
    }

    .palette-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-default);
    }

    .palette-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: 13px;
      background: var(--bg-primary);
      color: var(--text-primary);
      transition: all var(--transition-fast);
    }

    .search-input:hover {
      border-color: var(--border-strong);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--primary-500);
      box-shadow: var(--focus-ring);
    }

    .category {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
      border-left: 3px solid;
    }

    .category-icon {
      font-size: 14px;
      line-height: 1;
    }

    .category-header h3 {
      flex: 1;
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-count {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .category-items {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: grab;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      transition: all var(--transition-base);
      text-align: left;
      min-height: 44px;
    }

    .palette-item:hover {
      background: var(--bg-primary);
      border-color: var(--primary-400);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .palette-item:active {
      cursor: grabbing;
    }

    .palette-item-icon {
      font-size: 16px;
      line-height: 1;
      flex-shrink: 0;
    }

    .palette-item-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .calc-card {
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: 12px;
      background: linear-gradient(135deg, var(--primary-50), var(--info-50));
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
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .calc-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .calc-content p {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .calc-content .result {
      font-size: 14px;
      color: var(--primary-700);
      font-weight: 600;
    }

    .badge {
      background: var(--primary-100);
      color: var(--primary-700);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .hint {
      color: var(--text-tertiary);
      font-size: 10px;
      margin: 0;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      text-align: center;
      color: var(--text-tertiary);
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      font-size: 13px;
    }
  `]
})
export class PaletteComponent {
  private workflowService = inject(WorkflowService);

  power = input<number>(0.8);
  sampleSize = input<string>('0');

  searchQuery = signal<string>('');

  dragStart = output<{ type: NodeKind }>();

  private readonly categories: NodeCategory[] = [
    {
      id: 'entry',
      name: 'Вход',
      icon: '📥',
      types: ['trigger', 'http'],
      color: 'var(--success-500)'
    },
    {
      id: 'logic',
      name: 'Логика',
      icon: '🔀',
      types: ['ab', 'dataflow'],
      color: 'var(--primary-500)'
    },
    {
      id: 'action',
      name: 'Действия',
      icon: '⚡',
      types: ['http', 'code'],
      color: 'var(--warning-500)'
    },
    {
      id: 'exit',
      name: 'Выход',
      icon: '📤',
      types: ['join'],
      color: 'var(--info-500)'
    }
  ];

  readonly filteredCategories = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.categories;
    }

    return this.categories
      .map(category => ({
        ...category,
        types: category.types.filter(type => {
          const template = this.workflowService.nodeTemplates[type as NodeKind];
          return template?.label.toLowerCase().includes(query);
        })
      }))
      .filter(category => category.types.length > 0);
  });

  getFilteredNodes(types: string[]): { type: NodeKind; template: NodeTemplate }[] {
    return types
      .filter(type => this.workflowService.nodeTemplates[type as NodeKind])
      .map(type => ({
        type: type as NodeKind,
        template: this.workflowService.nodeTemplates[type as NodeKind]
      }));
  }

  getNodeIcon(type: NodeKind): string {
    const icons: Record<NodeKind, string> = {
      trigger: '🎯',
      http: '🌐',
      dataflow: '📊',
      code: '💻',
      ab: '⚖',
      join: '⏹'
    };
    return icons[type] || '•';
  }

  onDragStart(event: DragEvent, type: NodeKind): void {
    event.dataTransfer?.setData('application/workflow-node', type);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.dragStart.emit({ type });
  }
}
