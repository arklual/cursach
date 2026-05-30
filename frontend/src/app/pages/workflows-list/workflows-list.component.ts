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
                  <span class="card-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                    </svg>
                  </span>
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
      background: linear-gradient(180deg, rgba(28, 32, 38, 0.85) 0%, rgba(20, 23, 28, 0.55) 100%);
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
        radial-gradient(circle at 28% 20%, rgba(180, 205, 255, 0.5) 0%, transparent 58%),
        linear-gradient(135deg, #5b8def 0%, #2c4a99 100%);
      color: var(--accent-ink);
      display: grid;
      place-items: center;
      font-family: var(--font-sans);
      font-weight: 700;
      font-size: 26px;
      letter-spacing: -0.02em;
      line-height: 1;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25),
        0 10px 24px rgba(91, 141, 239, 0.28);
    }

    .page-header h1 {
      margin: 0 0 4px;
      font-family: var(--font-sans);
      font-weight: 700;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: -0.022em;
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

    .create-choice > * {
      min-width: 0;
    }

    .choice-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      font: inherit;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--fg-primary);
      text-align: left;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
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
      flex-shrink: 0;
    }

    .choice-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      width: 100%;
    }

    .choice-icon.scratch { background: linear-gradient(135deg, #5b8def 0%, #2c4a99 100%); }
    .choice-icon.template { background: linear-gradient(135deg, #a78bfa 0%, #6d4dd6 100%); }

    .choice-text h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--fg-primary);
      white-space: normal;
    }

    .choice-text p {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--fg-secondary);
      white-space: normal;
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

    .template-grid > * {
      min-width: 0;
    }

    .template-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      font: inherit;
      background:
        linear-gradient(135deg, rgba(91, 141, 239, 0.06) 0%, rgba(167, 139, 250, 0.04) 100%),
        var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--fg-primary);
      text-align: left;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
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
      white-space: normal;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: calc(2 * 1.3 * 15px);
    }

    .template-card p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg-secondary);
      flex: 1;
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: calc(4 * 1.5 * 12px);
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
      display: flex;
      flex-direction: column;
    }

    .workflow-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }

    .workflow-card-link {
      display: flex;
      flex-direction: column;
      flex: 1;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .workflow-card-link .card-description {
      flex: 1;
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
      color: var(--accent);
      background: var(--accent-glow);
    }

    .card-icon svg {
      display: block;
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
      background: linear-gradient(135deg, var(--accent-glow) 0%, var(--success-glow) 100%);
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

    @media (max-width: 900px) {
      .page-header {
        padding: 24px 24px 20px;
      }
      .page-header h1 {
        font-size: 34px;
      }
      .loading-banner, .error-banner {
        margin: 12px 24px 0;
      }
      .user-section {
        padding: 12px 24px 8px;
      }
      .workflows-grid {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
      }
      .intro-banner {
        margin: 16px 24px 0;
        grid-template-columns: 1fr;
        padding: 20px;
      }
      .intro-actions {
        flex-direction: row;
        flex-wrap: wrap;
        min-width: 0;
      }
    }

    @media (max-width: 640px) {
      .page-header {
        flex-direction: column;
        align-items: stretch;
        gap: 16px;
        padding: 20px 16px;
      }
      .brand {
        gap: 12px;
      }
      .brand .logo {
        width: 44px;
        height: 44px;
        font-size: 24px;
        border-radius: 12px;
      }
      .page-header h1 {
        font-size: 28px;
        line-height: 1.08;
      }
      .page-header p {
        font-size: 10px;
        letter-spacing: 0.12em;
      }
      .page-header > button.primary {
        width: 100%;
        justify-content: center;
      }

      .loading-banner, .error-banner {
        margin: 12px 16px 0;
      }
      .user-section {
        padding: 8px 16px 16px;
      }
      .workflows-grid {
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 12px 0 24px;
      }
      .intro-banner {
        margin: 12px 16px 0;
        padding: 16px;
      }
      .intro-banner h2 {
        font-size: 22px;
      }
      .intro-actions {
        flex-direction: column;
      }
      .intro-actions button {
        width: 100%;
        justify-content: center;
      }

      .create-choice {
        grid-template-columns: 1fr;
      }
      .template-picker-header {
        gap: 8px;
      }
      .template-search {
        min-width: 0;
        width: 100%;
      }
      .template-grid {
        grid-template-columns: 1fr;
        gap: 10px;
      }
    }

    @media (max-width: 480px) {
      .page-header {
        padding: 16px 12px;
      }
      .brand .logo {
        width: 40px;
        height: 40px;
        font-size: 22px;
      }
      .page-header h1 {
        font-size: 24px;
      }
      .loading-banner, .error-banner {
        margin: 10px 12px 0;
        padding: 10px 12px;
        font-size: 13px;
      }
      .user-section {
        padding: 6px 12px 14px;
      }
      .intro-banner {
        margin: 10px 12px 0;
        padding: 14px;
        border-radius: 12px;
      }
      .workflow-card {
        padding: 14px;
      }
    }

    @media (max-width: 360px) {
      .page-header {
        padding: 12px 10px;
        gap: 12px;
      }
      .brand {
        gap: 10px;
      }
      .brand .logo {
        width: 36px;
        height: 36px;
        font-size: 20px;
        border-radius: 10px;
      }
      .page-header h1 {
        font-size: 22px;
        line-height: 1.1;
      }
      .user-section {
        padding: 4px 10px 12px;
      }
      .loading-banner, .error-banner {
        margin: 8px 10px 0;
      }
      .intro-banner {
        margin: 8px 10px 0;
        padding: 12px;
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
    }
    this.showIntro.set(seen !== '1');
  }

  dismissIntro(): void {
    this.showIntro.set(false);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.introStorageKey, '1');
    } catch {
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

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
