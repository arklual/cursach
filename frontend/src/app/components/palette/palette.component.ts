import { Component, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { NodeKind } from '../../models/workflow.model';

interface PaletteItem {
  /** Identifier for drag payload: `kind` or `kind:subtype`. */
  id: string;
  /** Display label. */
  label: string;
  /** Underlying NodeKind for the workflow service. */
  kind: NodeKind;
  /** Optional subtype (dataflow operation, code language, or trigger flavour). */
  subtype?: 'filter' | 'map' | 'reduce' | 'foreach' | 'flatmap' | 'js' | 'webhook' | 'cron' | 'interval' | 'manual';
  iconPath: string;
}

interface NodeCategory {
  id: string;
  name: string;
  color: string;
  items: PaletteItem[];
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

      <div class="palette-body">
        @for (category of filteredCategories(); track category.id) {
          <section class="category">
            <div class="category-header" [style.borderLeftColor]="category.color">
              <h3>{{ category.name }}</h3>
              <span class="category-count">{{ category.items.length }}</span>
            </div>
            <div class="category-items">
              @for (item of category.items; track item.id) {
                <button
                  class="palette-item"
                  draggable="true"
                  (dragstart)="onDragStart($event, item)"
                  [title]="item.label">
                  <span class="palette-item-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path [attr.d]="item.iconPath"/>
                    </svg>
                  </span>
                  <span class="palette-item-label">{{ item.label }}</span>
                </button>
              }
            </div>
          </section>
        }

        @if (filteredCategories().length === 0) {
          <div class="empty-state">
            <span class="empty-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="10.5" cy="10.5" r="6.5"/>
                <path d="m20 20-4.8-4.8"/>
              </svg>
            </span>
            <p>Ноды не найдены</p>
          </div>
        }
      </div>

    </aside>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .palette {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .palette-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      background: var(--bg-primary);
    }

    .palette-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }

    .palette-body::-webkit-scrollbar {
      width: 8px;
    }

    .palette-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .palette-body::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }

    .palette-body::-webkit-scrollbar-thumb:hover {
      background: var(--border-light, var(--fg-muted));
      background-clip: padding-box;
      border: 2px solid transparent;
    }

    .palette-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--fg-primary);
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 13px;
      background: var(--bg-primary);
      color: var(--fg-primary);
      transition: all var(--transition-fast);
    }

    .search-input:hover {
      border-color: var(--border-light);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
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
      display: block;
      color: inherit;
    }

    .category-header h3 {
      flex: 1;
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-count {
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-muted);
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .category-items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 6px;
    }

    @media (max-width: 640px) {
      .palette-header { padding: 12px; gap: 10px; }
      .palette-body { padding: 12px; gap: 12px; }
      .category-items {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      }
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      cursor: grab;
      font-size: 12px;
      font-weight: 500;
      color: var(--fg-primary);
      transition: all var(--transition-base);
      text-align: left;
      min-height: 44px;
    }

    .palette-item-icon {
      display: block;
      color: var(--accent);
    }

    .palette-item:hover {
      background: var(--panel-hover);
      border-color: var(--accent);
      box-shadow: var(--shadow-md), 0 0 0 1px var(--accent-glow);
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
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 12px;
      background:
        linear-gradient(135deg, rgba(91, 141, 239, 0.08) 0%, rgba(52, 201, 124, 0.05) 100%),
        var(--bg-secondary);
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
      color: var(--fg-primary);
    }

    .calc-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .calc-content p {
      margin: 0;
      font-size: 12px;
      color: var(--fg-secondary);
    }

    .calc-content .result {
      font-family: var(--font-mono);
      font-size: 14px;
      color: var(--accent);
      font-weight: 600;
    }

    .badge {
      background: var(--accent-glow);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 12px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .hint {
      color: var(--fg-muted);
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
      color: var(--fg-muted);
    }

    .empty-icon {
      display: inline-flex;
      margin-bottom: 12px;
      color: var(--fg-muted);
      opacity: 0.6;
    }

    .empty-state p {
      margin: 0;
      font-family: var(--font-sans);
      font-weight: 500;
      font-size: 14px;
      color: var(--fg-secondary);
    }
  `]
})
export class PaletteComponent {
  private workflowService = inject(WorkflowService);

  searchQuery = signal<string>('');

  dragStart = output<{ kind: NodeKind; subtype?: string }>();

  private readonly icons = {
    webhook: 'M10 4a4 4 0 0 0-3.83 5.14l-2.6 4.5A3.5 3.5 0 1 0 7 16h7.46a3 3 0 1 0 0-2H7a1.5 1.5 0 1 1-1.5-1.5c.06 0 .12 0 .18.01l3.45-5.97A2 2 0 1 1 11.4 7.7L9.62 10.8a4 4 0 1 0 6.96 0L14.9 7.85A4 4 0 0 0 10 4zm6 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM5.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
    manual: 'M8 5v14l11-7z',
    cron: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    interval: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
    http: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
    js: 'M4 7v2c0 .55-.45 1-1 1H2v4h1c.55 0 1 .45 1 1v2c0 1.65 1.35 3 3 3h3v-2H7c-.55 0-1-.45-1-1v-2c0-1.3-.84-2.42-2-2.83v-.34C5.16 11.42 6 10.3 6 9V7c0-.55.45-1 1-1h3V4H7C5.35 4 4 5.35 4 7zm17 3c-.55 0-1-.45-1-1V7c0-1.65-1.35-3-3-3h-3v2h3c.55 0 1 .45 1 1v2c0 1.3.84 2.42 2 2.83v.34c-1.16.41-2 1.52-2 2.83v2c0 .55-.45 1-1 1h-3v2h3c1.65 0 3-1.35 3-3v-2c0-.55.45-1 1-1h1v-4h-1z',
    filter: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
    map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
    reduce: 'M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z',
    foreach: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
    flatmap: 'M22 11V9h-3.34c-.16-.53-.41-1.03-.7-1.49L20 5.5l-1.41-1.41-2.04 2.04C16.07 6.04 15.57 5.79 15 5.63V2H9v3.63c-.57.16-1.07.41-1.55.7L5.41 4.29 4 5.71l2 2.04c-.29.46-.54.96-.7 1.49H2v2h3.31c-.05.34-.07.66-.07 1 0 .35.02.66.07 1H2v2h3.34c.16.53.41 1.03.7 1.49L4 18.29l1.41 1.41 2.04-2.04c.48.29.98.54 1.55.7V22h6v-3.63c.57-.16 1.07-.41 1.55-.7l2.04 2.04L20 18.29l-2.04-2.04c.29-.46.54-.96.7-1.49H22v-2h-3.31c.05-.34.07-.66.07-1 0-.34-.02-.66-.07-1H22z',
    split: 'M3 6h6l4 6-4 6h-6 M14 12h7',
    merge: 'M3 6h6l4 6-4 6h-6 M14 12h7 M14 12L8 6 M14 12L8 18',
  } as const;

  private readonly categories: NodeCategory[] = [
    {
      id: 'entry',
      name: 'Триггеры',
      color: 'var(--success, #34c97c)',
      items: [
        { id: 'trigger:manual', label: 'Manual', kind: 'trigger', subtype: 'manual', iconPath: this.icons.manual },
        { id: 'trigger:webhook', label: 'Webhook', kind: 'trigger', subtype: 'webhook', iconPath: this.icons.webhook },
        { id: 'trigger:cron', label: 'Cron', kind: 'trigger', subtype: 'cron', iconPath: this.icons.cron },
        { id: 'trigger:interval', label: 'Interval', kind: 'trigger', subtype: 'interval', iconPath: this.icons.interval },
      ],
    },
    {
      id: 'io',
      name: 'I/O',
      color: 'var(--warning, #f5a524)',
      items: [
        { id: 'http', label: 'HTTP', kind: 'http', iconPath: this.icons.http },
      ],
    },
    {
      id: 'code',
      name: 'Код',
      color: 'var(--info, #a78bfa)',
      items: [
        { id: 'code', label: 'Python', kind: 'code', iconPath: this.icons.code },
        { id: 'code:js', label: 'JavaScript', kind: 'code', subtype: 'js', iconPath: this.icons.js },
      ],
    },
    {
      id: 'dataflow',
      name: 'Dataflow',
      color: 'var(--accent, #5b8def)',
      items: [
        { id: 'dataflow:filter', label: 'Filter', kind: 'dataflow', subtype: 'filter', iconPath: this.icons.filter },
        { id: 'dataflow:map', label: 'Map', kind: 'dataflow', subtype: 'map', iconPath: this.icons.map },
        { id: 'dataflow:reduce', label: 'Reduce', kind: 'dataflow', subtype: 'reduce', iconPath: this.icons.reduce },
        { id: 'dataflow:foreach', label: 'ForEach', kind: 'dataflow', subtype: 'foreach', iconPath: this.icons.foreach },
        { id: 'dataflow:flatmap', label: 'FlatMap', kind: 'dataflow', subtype: 'flatmap', iconPath: this.icons.flatmap },
      ],
    },
    {
      id: 'branches',
      name: 'Ветки',
      color: 'var(--info, #f472b6)',
      items: [
        { id: 'ab',   label: 'Split / A·B', kind: 'ab',   iconPath: this.icons.split },
        { id: 'join', label: 'Merge',       kind: 'join', iconPath: this.icons.merge },
      ],
    },
  ];

  readonly filteredCategories = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.categories;
    }
    return this.categories
      .map(category => ({
        ...category,
        items: category.items.filter(item => item.label.toLowerCase().includes(query)),
      }))
      .filter(category => category.items.length > 0);
  });

  onDragStart(event: DragEvent, item: PaletteItem): void {
    const payload = item.subtype ? `${item.kind}:${item.subtype}` : item.kind;
    event.dataTransfer?.setData('application/workflow-node', payload);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.dragStart.emit({ kind: item.kind, subtype: item.subtype });
  }
}
