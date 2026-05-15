import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkflowService, WorkflowMeta } from '../../services/workflow.service';
import { WorkflowFacade } from '../../core/api/workflow.facade';
import { WorkflowWsService } from '../../core/ws/workflow-ws.service';
import { parseGraphFromBackend } from '../../core/api/workflow.mapper';
import { SimulationService } from '../../services/simulation.service';
import { calcSampleSize, calcPValue } from '../../services/statistics.utils';
import { WorkflowCanvasComponent } from '../../components/workflow-canvas/workflow-canvas.component';
import { PaletteComponent } from '../../components/palette/palette.component';
import { InspectorComponent } from '../../components/inspector/inspector.component';
import { AnalyticsModalComponent } from '../../components/analytics-modal/analytics-modal.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { RunsPanelComponent } from '../../components/runs-panel/runs-panel.component';
import { TriggersPanelComponent } from '../../components/triggers-panel/triggers-panel.component';
import { ExperimentConfig } from '../../models/workflow.model';

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WorkflowCanvasComponent,
    PaletteComponent,
    InspectorComponent,
    AnalyticsModalComponent,
    ModalComponent,
    RunsPanelComponent,
    TriggersPanelComponent,
  ],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <button class="back-btn" (click)="goBack()">
            <span>←</span>
          </button>
          <span class="logo">Δ</span>
          <div class="workflow-info">
            <input
              class="workflow-name-input"
              [value]="workflowMeta()?.name || 'Workflow'"
              (blur)="updateWorkflowName($event)"
              (keydown.enter)="$any($event.target).blur()">
            <p>{{ workflowMeta()?.status || 'draft' }}</p>
          </div>
        </div>
        <div class="header-actions">
          <button class="ghost" (click)="openModal('experiment')">Результаты эксперимента</button>
          <button class="ghost" (click)="openModal('schema')">Схема событий</button>
          <button class="ghost" (click)="openModal('qa')">QA сценарии</button>
          <button class="primary" (click)="simulateRun(500)">Simulate 500 users</button>
          <button class="secondary" (click)="simulateRun(1, 'sample')">Run sample payload</button>
        </div>
      </header>

      @if (loadError()) {
        <div class="editor-error-banner">{{ loadError() }}</div>
      }

      <main [style.grid-template-columns]="mainGridColumns()">
        <!-- Palette -->
        <div class="panel-container palette-panel" [class.collapsed]="paletteCollapsed()">
          @if (!paletteCollapsed()) {
            <div class="panel-content" [style.width.px]="paletteWidth()">
              <app-palette
                [power]="experimentConfig().power"
                [sampleSize]="sampleSize()">
              </app-palette>
            </div>
            <div class="resize-handle resize-handle-right"
                 (mousedown)="startResize($event, 'palette')"></div>
          }
          <button class="collapse-btn collapse-btn-right"
                  (click)="paletteCollapsed.set(!paletteCollapsed())">
            {{ paletteCollapsed() ? '→' : '←' }}
          </button>
        </div>

        <app-workflow-canvas
          [nodes]="workflowService.nodes()"
          [edges]="workflowService.edges()"
          [activeNodeId]="workflowService.activeNodeId()"
          (openAnalytics)="handleOpenAnalytics($event)"
          (testNode)="handleTestNode($event)"
          (nodeSelected)="workflowService.setActiveNode($event)"
          (openAbConfig)="openModal('abConfig')"
          (replayRun)="simulateRun(100, 'replay')">
        </app-workflow-canvas>

        <!-- Inspector -->
        <div class="panel-container inspector-panel" [class.collapsed]="inspectorCollapsed()">
          <button class="collapse-btn collapse-btn-left"
                  (click)="inspectorCollapsed.set(!inspectorCollapsed())">
            {{ inspectorCollapsed() ? '←' : '→' }}
          </button>
          @if (!inspectorCollapsed()) {
            <div class="resize-handle resize-handle-left"
                 (mousedown)="startResize($event, 'inspector')"></div>
            <div class="panel-content" [style.width.px]="inspectorWidth()">
              <app-inspector
                [activeNode]="workflowService.activeNode()"
                (testNode)="handleTestNode($event)"
                (promoteWinner)="workflowService.log('Promote winner triggered')">
              </app-inspector>
            </div>
          }
        </div>
      </main>

      <section class="run-panel" [class.collapsed]="logPanelCollapsed()">
        <header>
          <button class="collapse-btn collapse-btn-top"
                  (click)="logPanelCollapsed.set(!logPanelCollapsed())">
            {{ logPanelCollapsed() ? '▲' : '▼' }}
          </button>
          <div class="tabs">
            <button class="tab" [class.active]="bottomTab() === 'log'" (click)="bottomTab.set('log')">Execution log</button>
            <button class="tab" [class.active]="bottomTab() === 'runs'" (click)="bottomTab.set('runs')">Запуски</button>
            <button class="tab" [class.active]="bottomTab() === 'triggers'" (click)="bottomTab.set('triggers')">Триггеры</button>
          </div>
          <div>
            @if (bottomTab() === 'log') {
              <button (click)="workflowService.log('Открыты параллельные ветки')">Ветки</button>
              <button (click)="simulateRun(200, 'simulation mode')">Sim</button>
              <button (click)="workflowService.clearLogs()">Clear</button>
            }
          </div>
        </header>
        @if (!logPanelCollapsed()) {
          <div class="resize-handle resize-handle-top"
               (mousedown)="startResize($event, 'log')"></div>
          @if (bottomTab() === 'log') {
            <div class="log-stream" [style.height.px]="logPanelHeight()">
              @for (line of workflowService.logs(); track $index) {
                <p class="log-entry">{{ line }}</p>
              }
            </div>
          } @else if (bottomTab() === 'runs' && currentWorkflowIdValue()) {
            <div class="log-stream light" [style.height.px]="logPanelHeight()">
              <app-runs-panel [workflowId]="currentWorkflowIdValue()!"></app-runs-panel>
            </div>
          } @else if (bottomTab() === 'triggers' && currentWorkflowIdValue()) {
            <div class="log-stream light" [style.height.px]="logPanelHeight()">
              <app-triggers-panel [workflowId]="currentWorkflowIdValue()!"></app-triggers-panel>
            </div>
          }
        }
      </section>

      <app-analytics-modal
        [node]="analyticsNode()"
        (close)="closeAnalyticsModal()">
      </app-analytics-modal>

      <!-- A/B Config Modal -->
      <app-modal
        [open]="modals().abConfig"
        [title]="'A/B Test Configuration'"
        [showFooter]="true"
        (close)="closeModal('abConfig')">
        <label>
          Primary metric
          <select [(ngModel)]="experimentConfig().primaryMetric">
            <option>Конверсия в оплату</option>
            <option>Активация функции</option>
          </select>
        </label>
        <label>
          Secondary metrics
          <input [(ngModel)]="experimentConfig().secondaryMetrics">
        </label>
        <label>
          Период теста (дни)
          <input type="number" [(ngModel)]="experimentConfig().period">
        </label>
        <label>
          Минимальный размер выборки
          <input type="number" [(ngModel)]="experimentConfig().minSample">
        </label>
        <div class="traffic-allocation">
          @for (variant of experimentConfig().variants; track variant.label; let i = $index) {
            <div class="allocation-row">
              <span>{{ variant.label }}</span>
              <input type="range" min="5" max="95"
                     [ngModel]="variant.weight"
                     (ngModelChange)="updateExperimentVariantWeight(i, $event)">
              <input type="number"
                     [ngModel]="variant.weight"
                     (ngModelChange)="updateExperimentVariantWeight(i, $event)">
            </div>
          }
        </div>
        <div class="randomization">
          <h3>Randomization mode</h3>
          <label>
            <input type="radio" name="randMode"
                   [checked]="experimentConfig().randomization === 'simple'"
                   (change)="updateExperimentRandomization('simple')">
            Simple random
          </label>
          <label>
            <input type="radio" name="randMode"
                   [checked]="experimentConfig().randomization === 'hashed'"
                   (change)="updateExperimentRandomization('hashed')">
            Hashed by user_id + seed
          </label>
          <label>
            <input type="radio" name="randMode"
                   [checked]="experimentConfig().randomization === 'stratified'"
                   (change)="updateExperimentRandomization('stratified')">
            Stratified (device cohort)
          </label>
          <label>
            Seed
            <input [(ngModel)]="experimentConfig().seed">
          </label>
        </div>
        <div class="warnings">
          <p>⚠ Малые выборки → широкие CI. Следите за FDR при множественных проверках.</p>
          <p class="hint">CI = p̂ ± z₀.₉₇₅·√(p̂(1-p̂)/N)</p>
        </div>
        <div footer>
          <button class="ghost" (click)="simulateRun(300, 'experiment sim')">Simulate</button>
          <button class="primary" (click)="startExperiment()">Start Experiment</button>
        </div>
      </app-modal>

      <!-- Experiment Results Modal -->
      <app-modal
        [open]="modals().experiment"
        [title]="'Experiment Results'"
        [wide]="true"
        (close)="closeModal('experiment')">
        <div class="analytics-grid">
          @if (experimentVariants().length) {
            @for (variant of experimentVariants(); track variant.label) {
              <div class="analytics-card">
                <h4>Вариант {{ variant.label }}</h4>
                <p>N = {{ variant.reached }}</p>
                <p>k = {{ variant.converted }}</p>
                <p>p̂ = {{ (variant.pHat * 100).toFixed(2) }}%</p>
              </div>
            }
          } @else {
            <p>Добавьте A/B Fork для расчёта метрик.</p>
          }
        </div>
        @if (experimentVariants().length >= 2) {
          <div class="analytics-card">
            <h4>Сравнение A vs B</h4>
            <p>Δ = {{ (delta() * 100).toFixed(2) }} п.п.</p>
            <p>CI(Δ) ≈ ± {{ (1.96 * Math.sqrt(pooled() || 1e-9) * 100).toFixed(2) }} п.п.</p>
            <p>p-value = {{ pValue().toFixed(3) }}</p>
            <p>Рекомендация: {{ delta() > 0 && pValue() < 0.05 ? 'Rollout' : 'Retain / продолжить' }}</p>
          </div>
        }
        <div class="analytics-card">
          <h4>Сегментация</h4>
          <p>Device: iOS uplift {{ (delta() * 1.1 * 100).toFixed(2) }} п.п.</p>
          <p>Country: BR выигрывает при hashed randomization</p>
        </div>
      </app-modal>

      <!-- Schema Modal -->
      <app-modal
        [open]="modals().schema"
        [title]="'JSON Schema событий'"
        (close)="closeModal('schema')">
        <pre>{{ schemas() }}</pre>
      </app-modal>

      <!-- QA Modal -->
      <app-modal
        [open]="modals().qa"
        [title]="'QA сценарии'"
        (close)="closeModal('qa')">
        <pre>{{ qaText() }}</pre>
      </app-modal>
    </div>
  `,
  styles: [`
    .app-shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 32px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }

    .editor-error-banner {
      margin: 12px 24px 0;
      padding: 12px 16px;
      border-radius: 10px;
      background: #fee2e2;
      color: #b91c1c;
      font-size: 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-btn {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid var(--border);
      cursor: pointer;
      display: grid;
      place-items: center;
      font-size: 18px;
      transition: background 0.2s;
    }

    .back-btn:hover {
      background: #f1f5f9;
    }

    .brand .logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--accent);
      color: white;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 20px;
    }

    .workflow-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .workflow-name-input {
      border: none;
      background: transparent;
      font-size: 20px;
      font-weight: 600;
      padding: 4px 8px;
      margin: -4px -8px;
      border-radius: 6px;
      outline: none;
    }

    .workflow-name-input:hover {
      background: #f1f5f9;
    }

    .workflow-name-input:focus {
      background: white;
      box-shadow: 0 0 0 2px var(--accent);
    }

    .workflow-info p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    main {
      flex: 1;
      display: grid;
      gap: 16px;
      padding: 16px;
      overflow: hidden;
      min-height: 0;
    }

    main > app-workflow-canvas {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .panel-container {
      position: relative;
      display: flex;
      min-width: 0;
    }

    .panel-container.collapsed {
      width: 32px !important;
      min-width: 32px;
    }

    .panel-content {
      overflow: hidden;
      height: 100%;
    }

    .panel-content > * {
      height: 100%;
    }

    .palette-panel {
      flex-direction: row;
    }

    .inspector-panel {
      flex-direction: row-reverse;
    }

    .collapse-btn {
      position: absolute;
      z-index: 10;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: var(--panel);
      border: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      padding: 0;
    }

    .collapse-btn:hover {
      background: #f1f5f9;
    }

    .collapse-btn-right {
      right: -12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .collapse-btn-left {
      left: -12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .collapse-btn-top {
      position: relative;
      margin-right: 12px;
    }

    .resize-handle {
      position: absolute;
      background: transparent;
      z-index: 5;
    }

    .resize-handle:hover {
      background: var(--accent);
      opacity: 0.3;
    }

    .resize-handle-right {
      right: 0;
      top: 0;
      width: 4px;
      height: 100%;
      cursor: ew-resize;
    }

    .resize-handle-left {
      left: 0;
      top: 0;
      width: 4px;
      height: 100%;
      cursor: ew-resize;
    }

    .resize-handle-top {
      position: relative;
      width: 100%;
      height: 4px;
      cursor: ns-resize;
      margin-bottom: 4px;
    }

    .run-panel {
      background: var(--panel);
      border-top: 1px solid var(--border);
      padding: 12px 24px;
    }

    .run-panel.collapsed {
      padding-bottom: 12px;
    }

    .run-panel.collapsed .log-stream {
      display: none;
    }

    .run-panel header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .run-panel header h3 {
      margin: 0;
    }

    .run-panel header div {
      display: flex;
      gap: 8px;
    }

    .tabs {
      display: flex;
      gap: 4px;
    }

    .tabs .tab {
      padding: 4px 10px;
      border: 1px solid var(--border);
      background: transparent;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      color: var(--muted);
    }

    .tabs .tab.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    .log-stream.light {
      background: #ffffff;
      color: #0f172a;
      padding: 0;
    }

    .log-stream {
      overflow: auto;
      font-size: 12px;
      background: #0f172a;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 12px;
    }

    .log-entry {
      margin: 0;
      padding: 4px 0;
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
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

    button.secondary {
      background: #0f172a;
      color: white;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .analytics-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fdfdff;
    }

    .analytics-card h4 {
      margin: 0 0 8px;
    }

    .analytics-card p {
      margin: 4px 0;
      font-size: 13px;
    }

    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 12px;
      font-size: 12px;
      overflow: auto;
      max-height: 400px;
    }

    label {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      gap: 4px;
      margin-bottom: 12px;
    }

    input, select {
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 6px 8px;
    }

    .traffic-allocation {
      margin: 12px 0;
    }

    .allocation-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
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

    .randomization {
      margin: 16px 0;
    }

    .randomization h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }

    .randomization label {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .warnings {
      background: #fef3c7;
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
    }

    .warnings p {
      margin: 0 0 4px;
      font-size: 13px;
    }

    .hint {
      color: var(--muted);
      font-size: 11px;
    }
  `]
})
export class WorkflowEditorComponent implements OnInit, OnDestroy {
  workflowService = inject(WorkflowService);
  private facade = inject(WorkflowFacade);
  private ws = inject(WorkflowWsService);
  private simulationService = inject(SimulationService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private wsUnsubscribe: (() => void) | null = null;
  private wsGraphSub: import('rxjs').Subscription | null = null;

  private currentWorkflowId = signal<string | null>(null);
  private currentVersionId = signal<string | null>(null);
  private currentMeta = signal<WorkflowMeta | null>(null);
  loadError = signal<string | null>(null);

  /** Доступ к id из шаблона (signals private). */
  readonly currentWorkflowIdValue = this.currentWorkflowId.asReadonly();

  /** Вкладка нижней панели: лог симуляций / запуски / триггеры. */
  readonly bottomTab = signal<'log' | 'runs' | 'triggers'>('log');

  Math = Math;

  analyticsNodeId = signal<string | null>(null);
  modals = signal({
    analytics: false,
    abConfig: false,
    experiment: false,
    schema: false,
    qa: false
  });

  // Panel state
  paletteCollapsed = signal(false);
  paletteWidth = signal(300);
  inspectorCollapsed = signal(false);
  inspectorWidth = signal(340);
  logPanelCollapsed = signal(false);
  logPanelHeight = signal(180);

  private resizing: 'palette' | 'inspector' | 'log' | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartValue = 0;
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  mainGridColumns = computed(() => {
    const paletteW = this.paletteCollapsed() ? '32px' : `${this.paletteWidth()}px`;
    const inspectorW = this.inspectorCollapsed() ? '32px' : `${this.inspectorWidth()}px`;
    return `${paletteW} 1fr ${inspectorW}`;
  });

  experimentConfig = signal<ExperimentConfig>({
    primaryMetric: 'Конверсия в оплату',
    secondaryMetrics: 'Retention 7d, latency',
    period: 14,
    minSample: 5000,
    alpha: 0.05,
    power: 0.8,
    variants: [
      { label: 'A', weight: 50 },
      { label: 'B', weight: 50 }
    ],
    randomization: 'simple',
    seed: 'workflow-42'
  });

  schemas = signal('');
  qaText = signal('');

  workflowMeta = computed(() => this.currentMeta());

  analyticsNode = computed(() => {
    const id = this.analyticsNodeId();
    return id ? this.workflowService.getNodeById(id) || null : null;
  });

  experimentVariants = computed(() => this.simulationService.buildExperimentResults());

  delta = computed(() => {
    const variants = this.experimentVariants();
    if (variants.length < 2) return 0;
    return variants[1].pHat - variants[0].pHat;
  });

  pooled = computed(() => {
    const variants = this.experimentVariants();
    if (variants.length < 2) return 0;
    const [a, b] = variants;
    return (a.pHat * (1 - a.pHat)) / Math.max(1, a.reached) +
           (b.pHat * (1 - b.pHat)) / Math.max(1, b.reached);
  });

  pValue = computed(() => {
    const variants = this.experimentVariants();
    if (variants.length < 2) return 1;
    return calcPValue(variants[0], variants[1]);
  });

  sampleSize = computed(() => {
    const n = calcSampleSize(0.25, 0.05, this.experimentConfig().power);
    return n.toLocaleString('ru-RU');
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.currentWorkflowId.set(id);
      this.facade.loadWorkflow(id).subscribe({
        next: loaded => {
          this.currentVersionId.set(loaded.versionId);
          this.currentMeta.set(loaded.meta);
          this.workflowService.setNodes(loaded.nodes);
          this.workflowService.setEdges(loaded.edges);
          this.workflowService.setActiveNode(loaded.nodes[0]?.id ?? null);
          this.workflowService.clearLogs();
          this.workflowService.log(`Загружен workflow: ${loaded.meta.name}`);
          this.subscribeWs(id);
        },
        error: err => {
          console.error('Failed to load workflow', err);
          this.loadError.set('Не удалось загрузить workflow с бэкенда.');
        },
      });
    }

    this.http.get('docs/event_schemas.json', { responseType: 'text' })
      .subscribe({
        next: data => this.schemas.set(data),
        error: () => {}
      });

    this.http.get('docs/qa_scenarios.md', { responseType: 'text' })
      .subscribe({
        next: data => this.qaText.set(data),
        error: () => {}
      });

    // Авто-сохранение графа в бэк раз в 30 секунд
    this.autoSaveInterval = setInterval(() => {
      this.saveGraphToBackend();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.saveGraphToBackend();
    this.wsUnsubscribe?.();
    this.wsGraphSub?.unsubscribe();
  }

  private subscribeWs(workflowId: string): void {
    this.wsUnsubscribe?.();
    this.wsGraphSub?.unsubscribe();
    this.wsUnsubscribe = this.ws.subscribeToWorkflow(workflowId);
    this.wsGraphSub = this.ws.graphUpdates.subscribe(evt => {
      if (evt.workflowId !== workflowId) {
        return;
      }
      // Игнорируем "эхо" нашего собственного save (нет надёжного признака — фильтруем по совпадению).
      const { nodes, edges } = parseGraphFromBackend(evt.graph);
      this.workflowService.setNodes(nodes);
      this.workflowService.setEdges(edges);
      this.workflowService.log('Граф обновлён через WebSocket');
    });
  }

  private saveGraphToBackend(): void {
    const versionId = this.currentVersionId();
    if (!versionId) {
      return;
    }
    this.facade.saveGraph(versionId, this.workflowService.nodes(), this.workflowService.edges()).subscribe({
      error: err => console.error('Auto-save failed', err),
    });
  }

  goBack(): void {
    this.saveGraphToBackend();
    this.router.navigate(['/']);
  }

  updateWorkflowName(event: Event): void {
    const input = event.target as HTMLInputElement;
    const id = this.currentWorkflowId();
    const value = input.value.trim();
    if (id && value) {
      this.facade.renameWorkflow(id, value).subscribe({
        next: meta => this.currentMeta.set(meta),
        error: err => console.error('Rename failed', err),
      });
    }
  }

  openModal(key: 'analytics' | 'abConfig' | 'experiment' | 'schema' | 'qa'): void {
    this.modals.update(m => ({ ...m, [key]: true }));
  }

  closeModal(key: string): void {
    this.modals.update(m => ({ ...m, [key]: false }));
  }

  handleOpenAnalytics(nodeId: string): void {
    this.analyticsNodeId.set(nodeId);
  }

  closeAnalyticsModal(): void {
    this.analyticsNodeId.set(null);
  }

  handleTestNode(nodeId: string): void {
    this.simulationService.testNode(nodeId);
  }

  simulateRun(count: number, mode: string = 'bulk'): void {
    this.simulationService.simulateRun(count, mode);
  }

  updateExperimentVariantWeight(index: number, value: number): void {
    this.experimentConfig.update(config => {
      const variants = config.variants.map((v, i) =>
        i === index ? { ...v, weight: Number(value) } : v
      );
      const total = variants.reduce((sum, v) => sum + v.weight, 0);
      return {
        ...config,
        variants: variants.map(v => ({ ...v, weight: Math.round((v.weight / total) * 100) }))
      };
    });
  }

  updateExperimentRandomization(randomization: 'simple' | 'hashed' | 'stratified'): void {
    this.experimentConfig.update(c => ({ ...c, randomization }));
  }

  startExperiment(): void {
    this.closeModal('abConfig');
    this.workflowService.log('Experiment started');
    // status — UI-only поле, на бэке не хранится; обновляем локально, чтобы badge в header сменился.
    this.currentMeta.update(m => (m ? { ...m, status: 'running' } : m));
  }

  // Resize handlers
  startResize(e: MouseEvent, panel: 'palette' | 'inspector' | 'log'): void {
    e.preventDefault();
    this.resizing = panel;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;

    if (panel === 'palette') {
      this.resizeStartValue = this.paletteWidth();
    } else if (panel === 'inspector') {
      this.resizeStartValue = this.inspectorWidth();
    } else {
      this.resizeStartValue = this.logPanelHeight();
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.resizing) return;

    if (this.resizing === 'palette') {
      const delta = e.clientX - this.resizeStartX;
      const newWidth = Math.max(200, Math.min(500, this.resizeStartValue + delta));
      this.paletteWidth.set(newWidth);
    } else if (this.resizing === 'inspector') {
      const delta = this.resizeStartX - e.clientX;
      const newWidth = Math.max(250, Math.min(600, this.resizeStartValue + delta));
      this.inspectorWidth.set(newWidth);
    } else if (this.resizing === 'log') {
      const delta = this.resizeStartY - e.clientY;
      const newHeight = Math.max(80, Math.min(400, this.resizeStartValue + delta));
      this.logPanelHeight.set(newHeight);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.resizing = null;
  }
}
