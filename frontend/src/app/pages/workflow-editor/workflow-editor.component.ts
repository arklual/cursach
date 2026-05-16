import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, DestroyRef, PLATFORM_ID, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkflowService, WorkflowMeta } from '../../services/workflow.service';
import { WorkflowFacade } from '../../core/api/workflow.facade';
import { WorkflowWsService } from '../../core/ws/workflow-ws.service';
import { buildGraphForBackend, parseGraphFromBackend } from '../../core/api/workflow.mapper';
import { environment } from '../../../environments/environment';
import { SimulationService } from '../../services/simulation.service';
import { calcSampleSize, calcPValue } from '../../services/statistics.utils';
import { WorkflowCanvasComponent } from '../../components/workflow-canvas/workflow-canvas.component';
import { PaletteComponent } from '../../components/palette/palette.component';
import { InspectorComponent } from '../../components/inspector/inspector.component';
import { AnalyticsModalComponent } from '../../components/analytics-modal/analytics-modal.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { RunsPanelComponent } from '../../components/runs-panel/runs-panel.component';
import { TriggersPanelComponent } from '../../components/triggers-panel/triggers-panel.component';
import { WorkflowValidatorService, ValidationResult } from '../../services/workflow-validator.service';
import { StatisticsTermsService } from '../../services/statistics-terms.service';
import { ExperimentConfig } from '../../models/workflow.model';
import { ExecutionService } from '../../services/execution.service';
import { ExecutionPanelComponent } from '../../components/execution-panel/execution-panel.component';

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
    ExecutionPanelComponent,
  ],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <button class="back-btn" (click)="goBack()">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
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
          <div class="action-group">
            <button class="ghost guide-btn" (click)="openModal('guide')" title="Пошаговая инструкция">
              <span class="q-mark">?</span> Гайд
            </button>
            <button class="ghost" (click)="openModal('experiment')" title="Сводка по A/B-эксперименту: метрики, CI, p-value">
              Результаты A/B
            </button>
            <button class="ghost" (click)="openModal('schema')" title="JSON-схема событий, отправляемых нодами">
              События
            </button>
            <button class="ghost" (click)="openModal('qa')" title="Чек-лист ручных проверок">
              QA-чеклист
            </button>
          </div>
          <div class="action-group action-group-primary">
            <!-- Индикатор готовности -->
            <div 
              class="validation-indicator" 
              [title]="validationResult().message"
              [class.validation-error]="validationResult().status === 'error'"
              [class.validation-warning]="validationResult().status === 'warning'"
              [class.validation-ready]="validationResult().status === 'ready'">
              <span class="validation-icon">
                @switch (validationResult().status) {
                  @case ('error') {
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                  }
                  @case ('warning') {
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                    </svg>
                  }
                  @default {
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  }
                }
              </span>
              <span class="validation-text">{{ validationResult().message }}</span>
            </div>
            
            <button class="secondary" (click)="simulateRun(1, 'sample')" title="Прогнать пайплайн с одним тестовым событием">
              Тест-запуск
            </button>
            <button class="primary" (click)="simulateRun(500)" title="Сгенерировать трафик из 500 «пользователей» и собрать метрики">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Симуляция (500)
            </button>
          </div>
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
            @if (paletteCollapsed()) {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            } @else {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
              </svg>
            }
          </button>
        </div>

        <app-workflow-canvas
          [nodes]="workflowService.nodes()"
          [edges]="workflowService.edges()"
          [activeNodeId]="workflowService.activeNodeId()"
          [executionStatus]="executionStatus()"
          [isExecuting]="isExecuting()"
          [progress]="executionProgress()"
          (openAnalytics)="handleOpenAnalytics($event)"
          (testNode)="handleTestNode($event)"
          (nodeSelected)="workflowService.setActiveNode($event)"
          (openAbConfig)="openModal('abConfig')"
          (replayRun)="simulateRun(100, 'replay')"
          (executeWorkflow)="executeWorkflow()"
          (executeFromNode)="executeFromNode()">
        </app-workflow-canvas>

        <!-- Inspector -->
        <div class="panel-container inspector-panel" [class.collapsed]="inspectorCollapsed()">
          <button class="collapse-btn collapse-btn-left"
                  (click)="inspectorCollapsed.set(!inspectorCollapsed())">
            @if (inspectorCollapsed()) {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
              </svg>
            } @else {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            }
          </button>
          @if (!inspectorCollapsed()) {
            <div class="resize-handle resize-handle-left"
                 (mousedown)="startResize($event, 'inspector')"></div>
            <div class="panel-content" [style.width.px]="inspectorWidth()">
              @if (showExecutionPanel() && selectedExecutionNodeId()) {
                <app-execution-panel
                  [nodeId]="selectedExecutionNodeId()"
                  (close)="closeExecutionPanel()"
                  (reset)="resetExecution()">
                </app-execution-panel>
              } @else {
                <app-inspector
                  [activeNode]="workflowService.activeNode()"
                  (testNode)="handleTestNode($event)"
                  (promoteWinner)="workflowService.log('Promote winner triggered')">
                </app-inspector>
              }
            </div>
          }
        </div>
      </main>

      <section class="run-panel" [class.collapsed]="logPanelCollapsed()">
        <header>
          <button class="collapse-btn collapse-btn-top"
                  (click)="logPanelCollapsed.set(!logPanelCollapsed())">
            @if (logPanelCollapsed()) {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
              </svg>
            } @else {
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
              </svg>
            }
          </button>
          <div class="tabs">
            <button class="tab" [class.active]="bottomTab() === 'log'" (click)="bottomTab.set('log')">Симуляция</button>
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
          <p>
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="display:inline-block;vertical-align:middle;margin-right:4px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            Малые выборки → широкие CI. Следите за FDR при множественных проверках.
          </p>
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

      <!-- Quick-start Guide Modal -->
      <app-modal
        [open]="modals().guide"
        [title]="'Как пользоваться редактором'"
        [wide]="true"
        (close)="closeModal('guide')">
        <div class="guide">
          <p class="guide-lead">
            Этот редактор позволяет собрать пайплайн обработки событий, провести по нему симуляцию
            пользователей и оценить A/B-эксперимент. Ниже — пять шагов от пустого холста до результата.
          </p>

          <ol class="guide-steps">
            <li>
              <span class="guide-step-num">1</span>
              <div>
                <h4>Перетащите ноду из палитры</h4>
                <p>
                  Слева — палитра типов нод (HTTP, A/B Fork, Code, Wait и т.д.).
                  Зажмите элемент и перетащите на холст в центре — нода появится в месте, куда вы её отпустили.
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">2</span>
              <div>
                <h4>Соедините ноды</h4>
                <p>
                  У каждой ноды есть точки-«хэндлы» по бокам: левая — вход, правая — выход.
                  Нажмите на правый хэндл и протяните линию к левому хэндлу следующей ноды.
                  Чтобы удалить связь — кликните по линии и нажмите
                  <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:inline-block;vertical-align:middle;">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>.
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">3</span>
              <div>
                <h4>Настройте параметры</h4>
                <p>
                  Кликните по ноде — справа откроется Inspector с её настройками
                  (URL, метод, payload, тело кода и т.д.).
                  Для A/B Fork отдельно укажите конфиг эксперимента: «Результаты A/B» в шапке.
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">4</span>
              <div>
                <h4>Запустите</h4>
                <p>
                  В шапке справа:
                  <b>Тест-запуск</b> — один пробный прогон,
                  <b>Симуляция (500)</b> — нагрузка 500 «пользователей» с распределением по веткам.
                  Прогресс и логи отображаются в нижней панели на вкладке <b>Execution log</b>.
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">5</span>
              <div>
                <h4>Смотрите результаты</h4>
                <p>
                  Вкладка <b>Запуски</b> внизу — история запусков с бэкенда.
                  Вкладка <b>Триггеры</b> — webhook/cron/interval, которые запускают пайплайн автоматически.
                  Двойной клик по ноде — детальная аналитика метрик (конверсии, CI, гистограмма задержек).
                </p>
              </div>
            </li>
          </ol>

          <div class="guide-tips">
            <h4>Полезное</h4>
            <ul>
              <li><b>⌘ / Ctrl + Scroll</b> — зум холста; <b>Drag по пустому месту</b> — pan.</li>
              <li>Боковые панели сворачиваются стрелочками на границах.</li>
              <li>Граф сохраняется автоматически каждые ~0.5 секунды после правки.</li>
              <li>Имя workflow меняется кликом по заголовку в шапке.</li>
            </ul>
          </div>
        </div>
      </app-modal>
    </div>
  `,
  styles: [`
    .app-shell {
      height: 100vh;
      max-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
      justify-content: center;
      place-items: center;
      font-size: 18px;
      transition: background 0.2s;
    }

    .back-btn:hover {
      background: #f1f5f9;
    }

    .icon {
      display: block;
      color: inherit;
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
      gap: 16px;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
    }

    .action-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .action-group-primary {
      padding-left: 16px;
      border-left: 1px solid var(--border);
    }

    .validation-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      font-size: 13px;
      margin-right: 8px;
      transition: all 0.2s;
    }

    .validation-indicator:hover {
      background: #f1f5f9;
    }

    .validation-icon {
      font-size: 14px;
      line-height: 1;
    }

    .validation-text {
      color: #475569;
      font-weight: 500;
    }

    .validation-indicator.validation-error {
      background: #fee2e2;
      border-color: #fecaca;
    }

    .validation-indicator.validation-error .validation-text {
      color: #b91c1c;
    }

    .validation-indicator.validation-warning {
      background: #fef3c7;
      border-color: #fde68a;
    }

    .validation-indicator.validation-warning .validation-text {
      color: #92400e;
    }

    .validation-indicator.validation-ready {
      background: #dcfce7;
      border-color: #bbf7d0;
    }

    .validation-indicator.validation-ready .validation-text {
      color: #166534;
    }

    .guide-btn .q-mark {
      display: inline-grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      font-size: 12px;
      margin-right: 4px;
    }

    main {
      flex: 1;
      display: grid;
      gap: 16px;
      padding: 16px;
      overflow: hidden;
      min-height: 0;
      position: relative;
    }

    main > app-workflow-canvas {
      min-width: 0;
      min-height: 0;
      flex: 1;
      overflow: hidden;
    }

    .panel-container {
      position: relative;
      display: flex;
      min-width: 0;
      max-height: 100%;
      overflow: hidden;
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
      color: #1e293b;
      padding: 0;
    }

    .log-stream {
      overflow: auto;
      font-size: 12px;
      background: var(--bg-secondary);
      color: var(--fg-secondary);
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
      color: var(--fg-primary);
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
      background: var(--bg-tertiary);
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
      background: var(--bg-secondary);
    }

    .analytics-card h4 {
      margin: 0 0 8px;
    }

    .analytics-card p {
      margin: 4px 0;
      font-size: 13px;
    }

    pre {
      background: var(--bg-primary);
      color: var(--fg-secondary);
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

    .guide {
      display: flex;
      flex-direction: column;
      gap: 20px;
      color: var(--fg-primary);
    }

    .guide-lead {
      margin: 0;
      font-size: 14px;
      color: var(--fg-secondary);
      line-height: 1.55;
    }

    .guide-steps {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .guide-steps > li {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .guide-step-num {
      flex: 0 0 28px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 14px;
    }

    .guide-steps h4 {
      margin: 0 0 4px;
      font-size: 14px;
    }

    .guide-steps p {
      margin: 0;
      font-size: 13px;
      color: #475569;
      line-height: 1.55;
    }

    .guide-tips {
      padding: 14px 16px;
      background: #eef2ff;
      border-radius: 12px;
    }

    .guide-tips h4 {
      margin: 0 0 8px;
      font-size: 14px;
      color: #3730a3;
    }

    .guide-tips ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .guide-tips li {
      font-size: 13px;
      color: #1e293b;
    }

    .execution-panel {
      display: none; /* Удалено - теперь execution panel внутри inspector */
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
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);
  private readonly guideStorageKey = 'fluxpilot.guideSeen';

  private wsUnsubscribe: (() => void) | null = null;
  private wsGraphSub: import('rxjs').Subscription | null = null;

  private currentWorkflowId = signal<string | null>(null);
  private currentVersionId = signal<string | null>(null);
  private currentMeta = signal<WorkflowMeta | null>(null);
  loadError = signal<string | null>(null);

  /** Becomes true только после успешного loadWorkflow — иначе debounced save отстреливает ещё на пустом графе сразу после init и затирает реальные данные. */
  private graphLoaded = signal(false);

  /** Debounce timer для авто-сейва при изменении nodes/edges. */
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Флаг "сейчас применяем граф из WebSocket" — чтобы не зациклиться: save→WS-эхо→setNodes→save→… */
  private applyingWsUpdate = false;

  // Inject services
  private validator = inject(WorkflowValidatorService);
  private termsService = inject(StatisticsTermsService);
  private executionService = inject(ExecutionService);

  // Execution signals
  showExecutionPanel = signal(false);
  selectedExecutionNodeId = signal<string | null>(null);
  executionStatus = signal<Record<string, 'pending' | 'running' | 'success' | 'error' | 'skipped'>>({});
  executionProgress = signal<number>(0);
  isExecuting = signal(false);

  // Effect для отслеживания исполнения
  constructor() {
    // Сохраняем граф через 500ms после ЛЮБОГО изменения nodes/edges. Это надёжнее, чем
    // полагаться на ngOnDestroy при выходе из редактора (HTTP может не успеть уйти при
    // SPA-навигации / browser back / закрытии вкладки).
    effect(() => {
      const nodes = this.workflowService.nodes();
      const edges = this.workflowService.edges();
      if (!this.graphLoaded() || this.applyingWsUpdate) {
        return;
      }
      void nodes.length;
      void edges.length;
      if (this.saveDebounceTimer) {
        clearTimeout(this.saveDebounceTimer);
      }
      this.saveDebounceTimer = setTimeout(() => this.saveGraphToBackend(), 500);
    });
    
    // Проверка валидации при изменении графа
    effect(() => {
      const nodes = this.workflowService.nodes();
      const edges = this.workflowService.edges();
      if (nodes.length > 0 || edges.length > 0) {
        this.validationResult.set(this.validator.validate(nodes, edges));
      }
    });

    // Отслеживание статусов исполнения для UI
    effect(() => {
      const statuses = this.executionService.nodeStatusesMap();
      this.executionStatus.set(statuses);

      // Автовыбор первой активной ноды
      const runningNode = Object.entries(statuses).find(([_, status]) => status === 'running');
      if (runningNode) {
        this.selectedExecutionNodeId.set(runningNode[0]);
      }

      // Обновляем прогресс
      const total = Object.keys(statuses).length;
      const completed = Object.values(statuses).filter(s => s === 'success' || s === 'error').length;
      if (total > 0) {
        this.executionProgress.set(Math.round((completed / total) * 100));
      }

      // Проверка завершения
      const isRunning = Object.values(statuses).some(s => s === 'running');
      this.isExecuting.set(isRunning);
      
      // Автоматически показываем нижнюю панель после завершения
      if (!isRunning && completed > 0) {
        setTimeout(() => {
          this.logPanelCollapsed.set(false);
        }, 500);
      }
    });
  }

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
    qa: false,
    guide: false,
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

  // Валидация графа
  validationResult = signal<ValidationResult>({
    ready: true,
    status: 'ready',
    message: 'Готов к запуску',
    issues: []
  });

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
    this.maybeShowGuide();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.currentWorkflowId.set(id);
      this.facade.loadWorkflow(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: loaded => {
            this.currentVersionId.set(loaded.versionId);
            this.currentMeta.set(loaded.meta);
            this.applyingWsUpdate = true;
            this.workflowService.setNodes(loaded.nodes);
            this.workflowService.setEdges(loaded.edges);
            this.workflowService.setActiveNode(loaded.nodes[0]?.id ?? null);
            this.workflowService.clearLogs();
            this.workflowService.log(`Загружен workflow: ${loaded.meta.name}`);
            this.subscribeWs(id);
            this.graphLoaded.set(true);
            setTimeout(() => { this.applyingWsUpdate = false; }, 0);
            this.startAutoSave();
          },
          error: err => {
            console.error('Failed to load workflow', err);
            this.loadError.set('Не удалось загрузить workflow с бэкенда.');
          },
        });
    }

    this.http.get('docs/event_schemas.json', { responseType: 'text' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.schemas.set(data),
        error: () => {}
      });

    this.http.get('docs/qa_scenarios.md', { responseType: 'text' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.qaText.set(data),
        error: () => {}
      });
  }

  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      return;
    }
    this.autoSaveInterval = setInterval(() => {
      this.saveGraphToBackend();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.flushSaveOnUnload();
    }
    this.resizing = null;
    this.wsUnsubscribe?.();
    this.wsGraphSub?.unsubscribe();
  }

  /** Закрытие вкладки / reload: keepalive-fetch гарантирует, что PUT долетит до бэка. */
  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.flushSaveOnUnload();
  }

  private flushSaveOnUnload(): void {
    const versionId = this.currentVersionId();
    if (!versionId || !this.graphLoaded()) {
      return;
    }
    const graph = buildGraphForBackend(
      versionId,
      this.workflowService.nodes(),
      this.workflowService.edges(),
    );
    // keepalive: запрос завершится даже если страница уже выгружается.
    fetch(`${environment.apiBaseUrl}/workflow-versions/${versionId}/graph`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph),
      keepalive: true,
    }).catch(() => { /* swallow — это best-effort save при unload */ });
  }

  private subscribeWs(workflowId: string): void {
    this.wsUnsubscribe?.();
    this.wsGraphSub?.unsubscribe();
    this.wsUnsubscribe = this.ws.subscribeToWorkflow(workflowId);
    this.wsGraphSub = this.ws.graphUpdates.subscribe(evt => {
      if (evt.workflowId !== workflowId) {
        return;
      }
      const { nodes, edges } = parseGraphFromBackend(evt.graph);
      // Помечаем "из WS", чтобы effect выше не запустил save в ответ на own-echo
      // (иначе цикл: save → WS-echo → setNodes → save → …).
      this.applyingWsUpdate = true;
      try {
        this.workflowService.setNodes(nodes);
        this.workflowService.setEdges(edges);
      } finally {
        // Сбрасываем флаг в следующем тике, чтобы реактивные сигналы успели проинвалидироваться.
        setTimeout(() => { this.applyingWsUpdate = false; }, 0);
      }
      this.workflowService.log('Граф обновлён через WebSocket');
    });
  }

  private saveGraphToBackend(): void {
    const versionId = this.currentVersionId();
    if (!versionId) {
      console.warn('[editor] save skipped: no versionId');
      return;
    }
    const nodes = this.workflowService.nodes();
    const edges = this.workflowService.edges();
    console.debug(`[editor] saveGraph PUT versionId=${versionId} nodes=${nodes.length} edges=${edges.length}`);
    this.facade.saveGraph(versionId, nodes, edges).subscribe({
      next: () => console.debug(`[editor] saveGraph OK nodes=${nodes.length}`),
      error: err => console.error('[editor] saveGraph FAILED', err),
    });
  }

  goBack(): void {
    // Сохраняем граф ДО навигации: иначе при размонтировании компонента HTTP-запрос
    // отменяется и пользователь теряет изменения. Если save упадёт — всё равно ухо́дим,
    // чтобы UI не залипал, но логируем ошибку.
    const versionId = this.currentVersionId();
    if (!versionId) {
      this.router.navigate(['/']);
      return;
    }
    this.facade.saveGraph(versionId, this.workflowService.nodes(), this.workflowService.edges()).subscribe({
      next: () => this.router.navigate(['/']),
      error: err => {
        console.error('Save before navigation failed', err);
        this.router.navigate(['/']);
      },
    });
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

  openModal(key: 'analytics' | 'abConfig' | 'experiment' | 'schema' | 'qa' | 'guide'): void {
    this.modals.update(m => ({ ...m, [key]: true }));
  }

  closeModal(key: string): void {
    this.modals.update(m => ({ ...m, [key]: false }));
    if (key === 'guide' && isPlatformBrowser(this.platformId)) {
      try { localStorage.setItem(this.guideStorageKey, '1'); } catch { /* ignore */ }
    }
  }

  private maybeShowGuide(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    let seen: string | null = null;
    try { seen = localStorage.getItem(this.guideStorageKey); } catch { /* ignore */ }
    if (seen !== '1') {
      this.openModal('guide');
    }
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

  executeWorkflow(): void {
    const workflowId = this.currentWorkflowId();
    if (!workflowId) {
      console.warn('No workflow ID selected');
      return;
    }

    console.log('Starting execution for workflow:', workflowId);
    
    // Автоматически скрываем нижнюю панель и показываем Execution Panel
    this.logPanelCollapsed.set(true);
    this.showExecutionPanel.set(true);
    this.selectedExecutionNodeId.set(null);
    this.executionStatus.set({});
    this.executionProgress.set(0);
    this.isExecuting.set(true);

    // Запускаем исполнение
    this.executionService.executeWorkflow(workflowId).subscribe({
      next: () => console.log('Execution started'),
      error: (err) => {
        console.error('Execution error:', err);
        this.isExecuting.set(false);
      }
    });
  }

  executeFromNode(): void {
    // TODO: Реализовать выбор ноды для запуска
    alert('Выберите ноду для запуска (будет реализовано)');
  }

  closeExecutionPanel(): void {
    // Не очищаем executionStatus - сохраняем подсветку нод
    this.showExecutionPanel.set(false);
    this.selectedExecutionNodeId.set(null);
    // executionService.clearExecution() не вызываем - сохраняем статусы нод
  }

  resetExecution(): void {
    // Сброс исполнения с очисткой статусов
    this.executionService.clearExecution();
    this.showExecutionPanel.set(false);
    this.selectedExecutionNodeId.set(null);
    this.executionStatus.set({});
    this.executionProgress.set(0);
    this.isExecuting.set(false);
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
