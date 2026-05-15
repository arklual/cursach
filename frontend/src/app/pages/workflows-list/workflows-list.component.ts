import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WorkflowMeta } from '../../services/workflow.service';
import { WorkflowFacade } from '../../core/api/workflow.facade';

@Component({
  selector: 'app-workflows-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="workflows-page">
      <header class="page-header">
        <div class="brand">
          <span class="logo">Δ</span>
          <div>
            <h1>FluxPilot Workflow Lab</h1>
            <p>Конструктор экспериментов для product-команд</p>
          </div>
        </div>
        <button class="primary" (click)="createWorkflow()">
          + Создать workflow
        </button>
      </header>

      @if (loading()) {
        <div class="loading-banner">Загрузка…</div>
      }
      @if (errorMessage()) {
        <div class="error-banner">{{ errorMessage() }}</div>
      }

      <main class="workflows-grid">
        @for (workflow of workflows(); track workflow.id) {
          <div class="workflow-card" (click)="openWorkflow(workflow.id)">
            <div class="card-header">
              <span class="card-icon" [style.background]="getStatusColor(workflow.status)">
                {{ getStatusIcon(workflow.status) }}
              </span>
              <span class="card-status" [class]="workflow.status">{{ workflow.status }}</span>
            </div>
            <h3>{{ workflow.name }}</h3>
            <p class="card-description">{{ workflow.description || 'Без описания' }}</p>
            <div class="card-meta">
              <span>{{ workflow.nodesCount }} нод</span>
              <span>{{ formatDate(workflow.updatedAt) }}</span>
            </div>
            <div class="card-actions">
              <button class="primary" (click)="openWorkflowFromButton($event, workflow.id)">Открыть</button>
              <button class="ghost" (click)="duplicateWorkflow($event, workflow.id)">Копировать</button>
              <button class="ghost danger" (click)="deleteWorkflow($event, workflow.id)">Удалить</button>
            </div>
          </div>
        } @empty {
          <div class="empty-state">
            <div class="empty-icon">Δ</div>
            <h2>Нет workflows</h2>
            <p>Создайте первый workflow для A/B тестирования</p>
            <button class="primary" (click)="createWorkflow()">+ Создать workflow</button>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    .workflows-page {
      min-height: 100vh;
      background: #f8fafc;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 48px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--accent);
      color: white;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 24px;
    }

    .page-header h1 {
      margin: 0;
      font-size: 24px;
    }

    .page-header p {
      margin: 0;
      color: var(--muted);
    }

    .loading-banner, .error-banner {
      margin: 16px 48px 0;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
    }

    .loading-banner {
      background: #f1f5f9;
      color: #475569;
    }

    .error-banner {
      background: #fee2e2;
      color: #b91c1c;
    }

    .workflows-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
      padding: 32px 48px;
    }

    .workflow-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .workflow-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: white;
      font-size: 18px;
    }

    .card-status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 500;
    }

    .card-status.draft {
      background: #f1f5f9;
      color: #64748b;
    }

    .card-status.running {
      background: #dcfce7;
      color: #16a34a;
    }

    .card-status.completed {
      background: #dbeafe;
      color: #2563eb;
    }

    .card-status.paused {
      background: #fef3c7;
      color: #d97706;
    }

    .workflow-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .card-description {
      color: var(--muted);
      font-size: 14px;
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--muted);
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }

    .card-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }

    .card-actions button {
      flex: 1;
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 14px;
      background: var(--panel);
      color: #0f172a;
      cursor: pointer;
      border: 1px solid transparent;
      transition: transform 0.1s ease, box-shadow 0.2s ease;
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
    }

    button.primary {
      background: var(--accent);
      color: white;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
    }

    button.ghost.danger:hover {
      border-color: #ef4444;
      color: #ef4444;
    }

    .empty-state {
      grid-column: 1 / -1;
      text-align: center;
      padding: 80px 20px;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      border-radius: 20px;
      background: var(--accent);
      color: white;
      display: grid;
      place-items: center;
      font-size: 36px;
      font-weight: 700;
    }

    .empty-state h2 {
      margin: 0 0 8px;
      font-size: 24px;
    }

    .empty-state p {
      color: var(--muted);
      margin: 0 0 24px;
    }
  `]
})
export class WorkflowsListComponent implements OnInit {
  private readonly facade = inject(WorkflowFacade);
  private readonly router = inject(Router);

  readonly workflows = signal<WorkflowMeta[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.facade.listWorkflows().subscribe({
      next: list => {
        this.workflows.set(list);
        this.loading.set(false);
      },
      error: err => {
        this.errorMessage.set('Не удалось загрузить список workflow. Проверьте бэкенд.');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  createWorkflow(): void {
    const defaultName = `Workflow ${this.workflows().length + 1}`;
    this.facade.createWorkflow(defaultName).subscribe({
      next: ({ workflowId }) => {
        if (workflowId) {
          this.router.navigate(['/workflow', workflowId]);
        } else {
          this.errorMessage.set('Workflow создан, но бэкенд не вернул id. Список обновлён.');
          this.refresh();
        }
      },
      error: err => {
        this.errorMessage.set('Не удалось создать workflow.');
        console.error(err);
      },
    });
  }

  openWorkflow(id: string): void {
    if (!id) {
      return;
    }
    this.router.navigate(['/workflow', id]);
  }

  openWorkflowFromButton(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.openWorkflow(id);
  }

  duplicateWorkflow(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.facade.duplicateWorkflow(id).subscribe({
      next: () => this.refresh(),
      error: err => {
        this.errorMessage.set('Не удалось скопировать workflow.');
        console.error(err);
      },
    });
  }

  deleteWorkflow(event: MouseEvent, id: string): void {
    event.stopPropagation();
    if (!confirm('Удалить этот workflow?')) {
      return;
    }
    this.facade.deleteWorkflow(id).subscribe({
      next: () => this.refresh(),
      error: err => {
        this.errorMessage.set('Не удалось удалить workflow.');
        console.error(err);
      },
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'running': return '#16a34a';
      case 'completed': return '#2563eb';
      case 'paused': return '#d97706';
      default: return '#64748b';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '▶';
      case 'completed': return '✓';
      case 'paused': return '⏸';
      default: return 'Δ';
    }
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
