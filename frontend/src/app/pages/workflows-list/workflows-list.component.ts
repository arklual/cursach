import { Component, OnInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { WorkflowMeta } from '../../services/workflow.service';
import { WorkflowFacade } from '../../core/api/workflow.facade';
import { ModalComponent } from '../../components/modal/modal.component';

type CreateMode = 'closed' | 'choose' | 'template';

@Component({
  selector: 'app-workflows-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ModalComponent],
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
        <button class="primary" (click)="openCreateModal()">
          + Создать workflow
        </button>
      </header>

      @if (loading()) {
        <div class="loading-banner">Загрузка…</div>
      }
      @if (errorMessage()) {
        <div class="error-banner">{{ errorMessage() }}</div>
      }

      @if (showIntro()) {
        <section class="intro-banner">
          <div class="intro-text">
            <h2>Что это вообще такое?</h2>
            <p>
              FluxPilot — визуальный конструктор пайплайнов событий с A/B-экспериментами.
              Создайте workflow, перетаскивайте ноды на холст, соединяйте их и запускайте
              симуляцию пользователей.
            </p>
            <ul>
              <li><b>Workflow</b> — это набор соединённых нод (HTTP-вызовов, кода, A/B-веток, ожиданий).</li>
              <li><b>Запуск</b> прогоняет один payload через граф, <b>симуляция</b> — много пользователей сразу.</li>
              <li><b>Триггеры</b> — webhook / cron, которые запускают workflow автоматически.</li>
            </ul>
          </div>
          <div class="intro-actions">
            <button class="primary" (click)="openCreateModal()">+ Создать workflow</button>
            <button class="ghost" (click)="dismissIntro()">Понятно, скрыть</button>
          </div>
        </section>
      }

      <section class="user-section">
        <main class="workflows-grid">
          @for (workflow of userWorkflows(); track workflow.id) {
            <div class="workflow-card">
              <a class="workflow-card-link" [routerLink]="['/workflow', workflow.id]">
                <div class="card-header">
                  <span class="card-icon" [style.background]="getStatusColor(workflow.status)">
                    @switch (workflow.status) {
                      @case ('running') {
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      }
                      @case ('completed') {
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                      }
                      @case ('paused') {
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                      }
                      @default {
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                      }
                    }
                  </span>
                  <span class="card-status" [class]="workflow.status">{{ workflow.status }}</span>
                </div>
                <h3>{{ workflow.name }}</h3>
                <p class="card-description">{{ workflow.description || 'Без описания' }}</p>
                <div class="card-meta">
                  <span>{{ workflow.nodesCount }} нод</span>
                  <span>{{ formatDate(workflow.updatedAt) }}</span>
                </div>
              </a>
              <div class="card-actions">
                <button class="ghost" (click)="duplicateWorkflow($event, workflow.id)">Копировать</button>
                <button class="ghost danger" (click)="deleteWorkflow($event, workflow.id)">Удалить</button>
              </div>
            </div>
          } @empty {
            <div class="empty-state">
              <div class="empty-icon">Δ</div>
              <h2>Нет workflows</h2>
              <p>Создайте с нуля или возьмите готовый шаблон — это быстрее, чем тащить ноды вручную.</p>
              <button class="primary" (click)="openCreateModal()">+ Создать workflow</button>
            </div>
          }
        </main>
      </section>

      <app-modal
        [open]="createMode() !== 'closed'"
        [title]="createMode() === 'template' ? 'Выбор шаблона' : 'Новый workflow'"
        [wide]="createMode() === 'template'"
        (close)="closeCreateModal()">
        @if (createMode() === 'choose') {
          <div class="create-choice">
            <button class="choice-card" type="button" (click)="createFromScratch()">
              <div class="choice-icon scratch" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </div>
              <div class="choice-text">
                <h3>Создать с нуля</h3>
                <p>Пустой холст — будете добавлять ноды сами через палитру слева.</p>
              </div>
            </button>
            <button class="choice-card" type="button" (click)="goToTemplatePicker()" [disabled]="templates().length === 0">
              <div class="choice-icon template" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div class="choice-text">
                <h3>Использовать шаблон</h3>
                @if (templates().length > 0) {
                  <p>Готовые пайплайны (FX, погода, землетрясения и др.) — скопируются как новый workflow.</p>
                } @else {
                  <p>Шаблоны ещё не загружены с бэкенда.</p>
                }
              </div>
            </button>
          </div>
        }
        @if (createMode() === 'template') {
          <div class="template-picker">
            <header class="template-picker-header">
              <button class="ghost" type="button" (click)="backToChoose()">← Назад к выбору</button>
              <input
                type="search"
                class="template-search"
                placeholder="Поиск по шаблонам…"
                [ngModel]="templateQuery()"
                (ngModelChange)="templateQuery.set($event)"
                aria-label="Поиск по шаблонам" />
            </header>
            <div class="template-grid">
              @for (tpl of visibleTemplates(); track tpl.id) {
                <button class="template-card" type="button" [disabled]="creating()" (click)="useTemplate(tpl)">
                  <div class="template-card-head">
                    <span class="template-badge">{{ tpl.nodesCount }} нод</span>
                  </div>
                  <h3>{{ tpl.name }}</h3>
                  <p>{{ tpl.description || 'Без описания' }}</p>
                  <span class="template-cta">Создать копию →</span>
                </button>
              } @empty {
                <p class="template-empty">Ничего не нашлось. Попробуйте другой запрос или вернитесь и создайте с нуля.</p>
              }
            </div>
          </div>
        }
      </app-modal>
    </div>
  `,
  styles: [`
    .workflows-page {
      min-height: 100vh;
      background: var(--bg-primary);
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 32px 48px 28px;
      background: linear-gradient(180deg, rgba(36, 29, 23, 0.92) 0%, rgba(22, 18, 14, 0.6) 100%);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .brand .logo {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background:
        radial-gradient(circle at 30% 22%, #ffd6a3 0%, transparent 55%),
        linear-gradient(135deg, #ff7a1a 0%, #a8300a 100%);
      color: #1a0e05;
      display: grid;
      place-items: center;
      font-family: var(--font-display);
      font-style: italic;
      font-weight: 400;
      font-size: 30px;
      line-height: 1;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25),
        0 10px 26px rgba(255, 122, 26, 0.32);
    }

    .page-header h1 {
      margin: 0 0 4px;
      font-family: var(--font-display);
      font-style: italic;
      font-weight: 400;
      font-size: 42px;
      line-height: 1.02;
      letter-spacing: -0.028em;
      color: var(--fg-primary);
    }

    .page-header p {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--fg-muted);
    }

    .loading-banner, .error-banner {
      margin: 16px 48px 0;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
    }

    .loading-banner {
      background: var(--bg-tertiary);
      color: var(--fg-secondary);
    }

    .error-banner {
      background: var(--danger-bg);
      color: var(--danger);
    }

    .user-section {
      padding: 16px 48px 8px;
    }

    .workflows-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
      padding: 16px 0 32px;
    }

    .create-choice {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .choice-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--fg-primary);
      text-align: left;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .choice-card:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: var(--shadow-md), 0 0 0 1px var(--accent-glow);
    }

    .choice-card:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .choice-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: white;
    }

    .choice-icon.scratch { background: linear-gradient(135deg, #84cc16 0%, #4d7c0f 100%); }
    .choice-icon.template { background: linear-gradient(135deg, #ff7a1a 0%, #a8300a 100%); }

    .choice-text h3 {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: var(--fg-primary);
    }

    .choice-text p {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--fg-secondary);
    }

    .template-picker {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 280px;
    }

    .template-picker-header {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .template-search {
      flex: 1;
      min-width: 200px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md, 10px);
      background: var(--bg-secondary);
      color: var(--fg-primary);
      font-size: 13px;
    }

    .template-search:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .template-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }

    .template-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      background:
        linear-gradient(135deg, rgba(255, 122, 26, 0.10) 0%, rgba(132, 204, 22, 0.06) 100%),
        var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--fg-primary);
      text-align: left;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .template-card:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: var(--shadow-md), 0 0 0 1px var(--accent-glow);
    }

    .template-card:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .template-card h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--fg-primary);
    }

    .template-card p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg-secondary);
      flex: 1;
    }

    .template-card-head {
      display: flex;
      justify-content: flex-end;
    }

    .template-badge {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--accent-glow);
      color: var(--accent);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .template-cta {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
    }

    .template-empty {
      grid-column: 1 / -1;
      margin: 0;
      padding: 28px 12px;
      text-align: center;
      color: var(--fg-muted);
      font-size: 13px;
    }

    .workflow-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .workflow-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }

    .workflow-card-link {
      display: block;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    a.btn-like {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      box-sizing: border-box;
      flex: 1;
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
    }

    .card-icon svg {
      display: block;
    }

    .card-status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 500;
    }

    .card-status.draft {
      background: var(--bg-tertiary);
      color: var(--fg-muted);
    }

    .card-status.running {
      background: var(--success-bg);
      color: var(--success);
    }

    .card-status.completed {
      background: var(--accent-glow);
      color: var(--accent);
    }

    .card-status.paused {
      background: var(--warning-bg);
      color: var(--warning);
    }

    .workflow-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
      color: var(--fg-primary);
    }

    .card-description {
      color: var(--fg-secondary);
      font-size: 14px;
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--fg-muted);
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
      color: var(--fg-primary);
      cursor: pointer;
      border: 1px solid transparent;
      transition: transform 0.1s ease, box-shadow 0.2s ease;
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    button.primary {
      background: var(--accent);
      color: white;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg-primary);
    }

    button.ghost.danger:hover {
      border-color: var(--danger);
      color: var(--danger);
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
      color: var(--fg-primary);
    }

    .empty-state p {
      color: var(--fg-muted);
      margin: 0 0 24px;
    }

    .intro-banner {
      margin: 16px 48px 0;
      padding: 24px;
      background: linear-gradient(135deg, var(--accent-glow) 0%, rgba(132, 204, 22, 0.12) 100%);
      border: 1px solid var(--border-light);
      border-radius: 16px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: center;
    }

    .intro-text h2 {
      margin: 0 0 8px;
      font-size: 20px;
      color: var(--fg-primary);
    }

    .intro-text p {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.5;
      color: var(--fg-secondary);
    }

    .intro-text ul {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      color: var(--fg-secondary);
    }

    .intro-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 200px;
    }

    @media (max-width: 768px) {
      .intro-banner {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class WorkflowsListComponent implements OnInit {
  private readonly facade = inject(WorkflowFacade);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly introStorageKey = 'fluxpilot.introSeen';

  readonly workflows = signal<WorkflowMeta[]>([]);
  readonly templates = computed(() => this.workflows().filter(w => w.isDemo));
  readonly userWorkflows = computed(() => this.workflows().filter(w => !w.isDemo));
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showIntro = signal(true);

  readonly createMode = signal<CreateMode>('closed');
  readonly templateQuery = signal('');
  readonly creating = signal(false);
  readonly visibleTemplates = computed(() => {
    const q = this.templateQuery().trim().toLowerCase();
    const all = this.templates();
    if (!q) return all;
    return all.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.hydrateIntroFlag();
    this.refresh();
  }

  private hydrateIntroFlag(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.showIntro.set(false);
      return;
    }
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(this.introStorageKey);
    } catch {
      /* ignore */
    }
    this.showIntro.set(seen !== '1');
  }

  dismissIntro(): void {
    this.showIntro.set(false);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.introStorageKey, '1');
    } catch {
      /* ignore */
    }
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

  openCreateModal(): void {
    this.templateQuery.set('');
    this.creating.set(false);
    this.createMode.set('choose');
  }

  closeCreateModal(): void {
    if (this.creating()) return;
    this.createMode.set('closed');
  }

  goToTemplatePicker(): void {
    if (this.templates().length === 0) return;
    this.createMode.set('template');
  }

  backToChoose(): void {
    this.createMode.set('choose');
  }

  createFromScratch(): void {
    if (this.creating()) return;
    const defaultName = `Workflow ${this.userWorkflows().length + 1}`;
    this.creating.set(true);
    this.facade.createWorkflow(defaultName).subscribe({
      next: ({ workflowId }) => {
        this.creating.set(false);
        this.createMode.set('closed');
        if (workflowId) {
          this.router.navigate(['/workflow', workflowId]).then(navigated => {
            if (!navigated) {
              this.refresh();
            }
          });
        } else {
          this.errorMessage.set('Workflow создан, но бэкенд не вернул id. Список обновлён.');
          this.refresh();
        }
      },
      error: err => {
        this.creating.set(false);
        this.errorMessage.set('Не удалось создать workflow.');
        console.error(err);
      },
    });
  }

  useTemplate(template: WorkflowMeta): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.facade.duplicateWorkflow(template.id).subscribe({
      next: ({ workflowId }) => {
        this.creating.set(false);
        this.createMode.set('closed');
        if (workflowId) {
          this.router.navigate(['/workflow', workflowId]).then(navigated => {
            if (!navigated) {
              this.refresh();
            }
          });
        } else {
          this.refresh();
        }
      },
      error: err => {
        this.creating.set(false);
        this.errorMessage.set('Не удалось скопировать шаблон.');
        console.error(err);
      },
    });
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
      case 'running': return '#84cc16';
      case 'completed': return '#ff7a1a';
      case 'paused': return '#fbbf24';
      default: return '#8b7e6a';
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
