import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, DestroyRef, PLATFORM_ID, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { WorkflowService, WorkflowMeta } from '../../services/workflow.service';
import { WorkflowFacade } from '../../core/api/workflow.facade';
import { WorkflowWsService } from '../../core/ws/workflow-ws.service';
import { buildGraphForBackend, parseGraphFromBackend } from '../../core/api/workflow.mapper';
import { environment } from '../../../environments/environment';
import { WorkflowCanvasComponent } from '../../components/workflow-canvas/workflow-canvas.component';
import { PaletteComponent } from '../../components/palette/palette.component';
import { InspectorComponent } from '../../components/inspector/inspector.component';
import { ModalComponent } from '../../components/modal/modal.component';
import { RunsPanelComponent } from '../../components/runs-panel/runs-panel.component';
import { TriggerApiService, Trigger } from '../../core/api/trigger.api';
import { WorkflowValidatorService, ValidationResult } from '../../services/workflow-validator.service';
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
    ModalComponent,
    RunsPanelComponent,
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
          <div
            class="validation-status"
            [class.is-error]="validationResult().status === 'error'"
            [class.is-warning]="validationResult().status === 'warning'"
            [class.is-ready]="validationResult().status === 'ready'"
            [title]="validationResult().message">
            <span class="status-dot"></span>
            <span class="status-text">{{ validationResult().message }}</span>
          </div>
          <button class="icon-btn" (click)="openModal('guide')" title="Пошаговая инструкция" aria-label="Гайд">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
          </button>
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
              <app-palette></app-palette>
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
          (nodeSelected)="onNodeSelected($event)"
          (executeWorkflow)="executeWorkflow()">
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
                  [triggers]="triggers()"
                  (runFromNode)="executeFromNode($event)">
                </app-inspector>
              }
            </div>
          }
        </div>
      </main>

      <section class="run-panel" [class.collapsed]="logPanelCollapsed()">
        <header class="run-panel-header">
          <div class="tabs" role="tablist">
            <button class="tab" role="tab"
                    [class.active]="!logPanelCollapsed() && bottomTab() === 'log'"
                    (click)="selectBottomTab('log')"
                    title="Локальные сообщения редактора">
              <svg class="tab-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <span>Логи</span>
              @if (workflowService.logs().length > 0) {
                <span class="tab-badge">{{ workflowService.logs().length }}</span>
              }
            </button>
            <button class="tab" role="tab"
                    [class.active]="!logPanelCollapsed() && bottomTab() === 'runs'"
                    (click)="selectBottomTab('runs')"
                    title="История запусков workflow на бэкенде">
              <svg class="tab-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm7 6V3l-2.29 2.29A8.96 8.96 0 0 0 13 3v2a7 7 0 0 1 3.29.83L14 8h6z"/>
              </svg>
              <span>Запуски</span>
            </button>
          </div>
          <div class="tab-actions">
            @if (!logPanelCollapsed() && bottomTab() === 'log' && workflowService.logs().length > 0) {
              <button class="icon-action-btn" (click)="workflowService.clearLogs()" title="Очистить лог">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            }
            <button class="icon-action-btn collapse-toggle"
                    (click)="logPanelCollapsed.set(!logPanelCollapsed())"
                    [title]="logPanelCollapsed() ? 'Развернуть панель' : 'Свернуть панель'">
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
          </div>
        </header>
        @if (!logPanelCollapsed()) {
          <div class="resize-handle resize-handle-top"
               (mousedown)="startResize($event, 'log')"></div>
          @if (bottomTab() === 'log') {
            <div class="bottom-content" [style.height.px]="logPanelHeight()">
              @if (workflowService.logs().length === 0) {
                <div class="empty-state">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                  </svg>
                  <p>Здесь будут события редактора (добавление нод, сохранение, ошибки).</p>
                </div>
              } @else {
                <div class="log-stream">
                  @for (line of workflowService.logs(); track $index) {
                    <p class="log-entry">{{ line }}</p>
                  }
                </div>
              }
            </div>
          } @else if (bottomTab() === 'runs') {
            <div class="bottom-content" [style.height.px]="logPanelHeight()">
              @if (currentWorkflowIdValue()) {
                <app-runs-panel [workflowId]="currentWorkflowIdValue()!"></app-runs-panel>
              } @else {
                <div class="empty-state">Сохраните workflow, чтобы запускать его.</div>
              }
            </div>
          }
        }
      </section>

      <!-- Quick-start Guide Modal -->
      <app-modal
        [open]="modals().guide"
        [title]="'Как пользоваться редактором'"
        [wide]="true"
        (close)="closeModal('guide')">
        <div class="guide">
          <p class="guide-lead">
            Этот редактор позволяет собрать workflow из HTTP-запросов, Python-кода и
            dataflow-операций (filter / map / reduce / foreach / flatmap), запустить его на бэкенде
            и посмотреть входной/выходной JSON каждой ноды.
          </p>

          <ol class="guide-steps">
            <li>
              <span class="guide-step-num">1</span>
              <div>
                <h4>Перетащите ноду из палитры</h4>
                <p>
                  Слева — палитра: Trigger, HTTP, Python и dataflow-операции (Filter, Map, Reduce, ForEach, FlatMap).
                  Зажмите элемент и перетащите на холст.
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">2</span>
              <div>
                <h4>Соедините ноды</h4>
                <p>
                  Тяните от правого хэндла одной ноды к левому хэндлу следующей.
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
                  Кликните по ноде — справа откроется Inspector
                  (URL, метод и body для HTTP, поля и операции для dataflow, код для Python).
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">4</span>
              <div>
                <h4>Запустите</h4>
                <p>
                  Нажмите <b>Execute</b> в тулбаре холста. Ноды подсветятся статусом
                  (pending → running → success / error).
                </p>
              </div>
            </li>
            <li>
              <span class="guide-step-num">5</span>
              <div>
                <h4>Смотрите I/O ноды</h4>
                <p>
                  Кликните по ноде после прогона — справа появится панель с
                  <b>входным</b> и <b>выходным</b> JSON ноды, а также временем выполнения и ошибками,
                  если они были. В нижней панели — история запусков и триггеры.
                </p>
              </div>
            </li>
          </ol>

          <div class="guide-tips">
            <h4>Полезное</h4>
            <ul>
              <li><b>⌘ / Ctrl + Scroll</b> — зум холста; <b>Drag по пустому месту</b> — pan.</li>
              <li>Боковые панели сворачиваются стрелочками на границах.</li>
              <li>Граф сохраняется автоматически через ~0.5 сек после правки.</li>
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
      background: var(--danger-bg);
      color: var(--danger);
      border: 1px solid rgba(225, 29, 72, 0.35);
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
      background: var(--bg-secondary);
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

    .workflow-name-input {
      color: var(--fg-primary);
    }

    .workflow-name-input:hover {
      background: var(--bg-secondary);
    }

    .workflow-name-input:focus {
      background: var(--bg-secondary);
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
      justify-content: flex-end;
      align-items: center;
    }

    .validation-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 13px;
      color: var(--fg-secondary);
      transition: background 0.15s;
    }

    .validation-status:hover {
      background: var(--bg-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--fg-muted);
      flex-shrink: 0;
    }

    .validation-status.is-ready .status-dot {
      background: var(--success);
      box-shadow: 0 0 0 3px var(--success-bg);
    }

    .validation-status.is-warning .status-dot {
      background: var(--warning);
      box-shadow: 0 0 0 3px var(--warning-bg);
    }

    .validation-status.is-error .status-dot {
      background: var(--danger);
      box-shadow: 0 0 0 3px var(--danger-bg);
    }

    .status-text {
      font-weight: 500;
      white-space: nowrap;
    }

    .icon-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 8px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      cursor: pointer;
      display: inline-grid;
      place-items: center;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .icon-btn:hover {
      background: var(--bg-secondary);
      color: var(--fg-primary);
      transform: none;
      box-shadow: none;
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
      background: var(--bg-secondary);
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
      padding: 0 24px 12px;
    }

    .run-panel.collapsed {
      padding-bottom: 0;
    }

    .run-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 12px;
      padding: 4px 0;
    }

    .tabs {
      display: flex;
      gap: 2px;
      align-items: stretch;
    }

    .tabs .tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: none;
      background: transparent;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      color: var(--fg-muted);
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }

    .tabs .tab:hover {
      color: var(--fg-primary);
      background: var(--bg-secondary);
      transform: none;
      box-shadow: none;
    }

    .tabs .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tabs .tab .tab-icon {
      display: block;
      flex-shrink: 0;
    }

    .tab-badge {
      display: inline-grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--bg-tertiary);
      color: var(--fg-secondary);
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }

    .tabs .tab.active .tab-badge {
      background: var(--accent);
      color: white;
    }

    .tab-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .icon-action-btn {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--fg-secondary);
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .icon-action-btn:hover {
      background: var(--bg-secondary);
      color: var(--fg-primary);
      transform: none;
      box-shadow: none;
    }

    .bottom-content {
      overflow: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
    }

    .log-stream {
      padding: 12px;
      font-size: 12px;
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
      color: var(--fg-secondary);
    }

    .log-entry {
      margin: 0;
      padding: 3px 0;
      line-height: 1.5;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
      min-height: 100px;
      color: var(--fg-muted);
      font-size: 13px;
      text-align: center;
      padding: 16px;
    }

    .empty-state svg {
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      max-width: 320px;
      line-height: 1.5;
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
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
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
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .guide-step-num {
      flex: 0 0 28px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: #1a0e05;
      display: grid;
      place-items: center;
      font-family: var(--font-display);
      font-style: italic;
      font-weight: 600;
      font-size: 15px;
    }

    .guide-steps h4 {
      margin: 0 0 4px;
      font-size: 14px;
    }

    .guide-steps p {
      margin: 0;
      font-size: 13px;
      color: var(--fg-secondary);
      line-height: 1.55;
    }

    .guide-tips {
      padding: 14px 16px;
      background: var(--accent-glow);
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .guide-tips h4 {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--accent);
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
      color: var(--fg-secondary);
    }

  `]
})
export class WorkflowEditorComponent implements OnInit, OnDestroy {
  workflowService = inject(WorkflowService);
  private facade = inject(WorkflowFacade);
  private triggerApi = inject(TriggerApiService);
  private ws = inject(WorkflowWsService);
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
  triggers = signal<Trigger[]>([]);
  loadError = signal<string | null>(null);

  /** Becomes true только после успешного loadWorkflow — иначе debounced save отстреливает ещё на пустом графе сразу после init и затирает реальные данные. */
  private graphLoaded = signal(false);

  /** Debounce timer для авто-сейва при изменении nodes/edges. */
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Флаг "сейчас применяем граф из WebSocket" — чтобы не зациклиться: save→WS-эхо→setNodes→save→… */
  private applyingWsUpdate = false;

  // Inject services
  private validator = inject(WorkflowValidatorService);
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

  /** Вкладка нижней панели: лог / запуски / триггеры. */
  readonly bottomTab = signal<'log' | 'runs'>('log');

  modals = signal({
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

  validationResult = signal<ValidationResult>({
    ready: true,
    status: 'ready',
    message: 'Готов к запуску',
    issues: []
  });

  workflowMeta = computed(() => this.currentMeta());

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
            this.refreshTriggers();
            this.startAutoSave();
          },
          error: err => {
            console.error('Failed to load workflow', err);
            this.loadError.set('Не удалось загрузить workflow с бэкенда.');
          },
        });
    }
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
      next: () => {
        console.debug(`[editor] saveGraph OK nodes=${nodes.length}`);
        this.refreshTriggers();
      },
      error: err => console.error('[editor] saveGraph FAILED', err),
    });
  }

  private refreshTriggers(): void {
    const workflowId = this.currentWorkflowId();
    if (!workflowId) {
      return;
    }
    this.triggerApi.list(workflowId).subscribe({
      next: list => this.triggers.set(list),
      error: err => console.warn('[editor] refreshTriggers failed', err),
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

  openModal(key: 'guide'): void {
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

  /** Клик по табу нижней панели: переключает таб + раскрывает панель, если она была свёрнута. */
  selectBottomTab(tab: 'log' | 'runs'): void {
    if (this.logPanelCollapsed() && this.bottomTab() === tab) {
      this.logPanelCollapsed.set(false);
      return;
    }
    this.bottomTab.set(tab);
    if (this.logPanelCollapsed()) {
      this.logPanelCollapsed.set(false);
    }
  }

  onNodeSelected(nodeId: string): void {
    this.workflowService.setActiveNode(nodeId);
    if (this.executionService.execution()) {
      this.selectedExecutionNodeId.set(nodeId);
      this.showExecutionPanel.set(true);
    }
  }

  executeWorkflow(): void {
    this.runWorkflow();
  }

  /** Manual-trigger node "Запустить отсюда" — стартует только subgraph от данной ноды. */
  executeFromNode(nodeId: string): void {
    this.runWorkflow(nodeId);
  }

  private runWorkflow(fromNodeId?: string): void {
    const workflowId = this.currentWorkflowId();
    if (!workflowId) {
      console.warn('No workflow ID selected');
      return;
    }

    this.logPanelCollapsed.set(true);
    this.showExecutionPanel.set(true);
    this.selectedExecutionNodeId.set(null);
    this.executionStatus.set({});
    this.executionProgress.set(0);
    this.isExecuting.set(true);

    this.executionService.executeWorkflow(workflowId, fromNodeId).subscribe({
      error: (err) => {
        console.error('Execution error:', err);
        this.isExecuting.set(false);
      },
    });
  }

  closeExecutionPanel(): void {
    this.showExecutionPanel.set(false);
    this.selectedExecutionNodeId.set(null);
  }

  resetExecution(): void {
    this.executionService.clearExecution();
    this.showExecutionPanel.set(false);
    this.selectedExecutionNodeId.set(null);
    this.executionStatus.set({});
    this.executionProgress.set(0);
    this.isExecuting.set(false);
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
