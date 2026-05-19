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
import { SnapshotsPanelComponent } from '../../components/snapshots-panel/snapshots-panel.component';

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
    SnapshotsPanelComponent,
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
          @if (isMobile()) {
            <button class="icon-btn mobile-only primary-mobile-cta" type="button"
                    (click)="toggleMobileRun()"
                    [class.active]="mobileRunOpen()"
                    [disabled]="!currentWorkflowIdValue() || isExecuting()"
                    title="Запустить workflow" aria-label="Запустить workflow">
              @if (isExecuting()) {
                <span class="header-spinner" aria-hidden="true"></span>
              } @else {
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              }
            </button>
            <button class="icon-btn mobile-only" type="button"
                    (click)="toggleMobileInspector()"
                    [class.active]="mobileInspectorOpen()"
                    title="Настройки выбранной ноды" aria-label="Настройки">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
          }
          <button class="icon-btn labeled-btn snapshots-btn" (click)="openSnapshots()"
                  title="Снепшоты и история графа" aria-label="Снепшоты"
                  [disabled]="!currentWorkflowIdValue()">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
            </svg>
            <span class="btn-label">Снепшоты</span>
          </button>
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

      <main [style.grid-template-columns]="mainGridColumns()"
            [class.is-mobile]="isMobile()"
            [class.has-drawer-open]="isMobile() && (mobilePaletteOpen() || mobileInspectorOpen() || mobileRunOpen())">
        @if (isMobile() && (mobilePaletteOpen() || mobileInspectorOpen() || mobileRunOpen())) {
          <div class="mobile-drawer-backdrop" (click)="closeMobileDrawers()" aria-hidden="true"></div>
        }
        @if (!isMobile()) {
          <!-- Palette (desktop only) -->
          <div class="panel-container palette-panel"
               [class.collapsed]="paletteCollapsed()">
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
        }

        <app-workflow-canvas
          [nodes]="workflowService.nodes()"
          [edges]="workflowService.edges()"
          [activeNodeId]="workflowService.activeNodeId()"
          [executionStatus]="executionStatus()"
          [isExecuting]="isExecuting()"
          [progress]="executionProgress()"
          [readOnly]="isMobile()"
          (nodeSelected)="onNodeSelected($event)"
          (executeWorkflow)="executeWorkflow()">
        </app-workflow-canvas>

        <!-- Inspector -->
        <div class="panel-container inspector-panel"
             [class.collapsed]="inspectorCollapsed() && !isMobile()"
             [class.mobile-open]="isMobile() && mobileInspectorOpen()">
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
              <div class="inspector-shell">
                <div class="inspector-tabs" role="tablist">
                  <button class="inspector-tab" role="tab"
                          [class.active]="inspectorTab() === 'config'"
                          (click)="inspectorTab.set('config')"
                          title="Конфигурация ноды">
                    <svg class="tab-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                    </svg>
                    <span>Конфиг</span>
                  </button>
                  <button class="inspector-tab" role="tab"
                          [class.active]="inspectorTab() === 'results'"
                          (click)="inspectorTab.set('results')"
                          title="Результаты последнего запуска ноды">
                    <svg class="tab-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Результаты</span>
                  </button>
                </div>
                <div class="inspector-tab-content">
                  @if (inspectorTab() === 'results') {
                    <app-execution-panel
                      [nodeId]="selectedExecutionNodeId() ?? workflowService.activeNodeId()"
                      (reset)="resetExecution()">
                    </app-execution-panel>
                  } @else {
                    <app-inspector
                      [activeNode]="workflowService.activeNode()"
                      [triggers]="triggers()"
                      [readOnly]="isMobile()"
                      (runFromNode)="executeFromNode($event)"
                      (triggerEnabledChange)="setTriggerEnabled($event)">
                    </app-inspector>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        @if (isMobile()) {
          <aside class="mobile-run-drawer"
                 [class.mobile-open]="mobileRunOpen()"
                 role="dialog"
                 aria-label="Запуск workflow">
            <header class="mobile-run-header">
              <div>
                <h3>Запуск workflow</h3>
                <p>Передайте JSON и нажмите «Запустить»</p>
              </div>
              <button class="icon-btn" type="button"
                      (click)="closeMobileDrawers()"
                      aria-label="Закрыть">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </header>

            <div class="mobile-run-body">
              <section class="mobile-run-section">
                <label class="mobile-run-label" for="mobile-run-payload">Входные данные (JSON)</label>
                <textarea
                  id="mobile-run-payload"
                  class="mobile-run-textarea"
                  [class.has-error]="!!mobileRunPayloadError()"
                  rows="6"
                  spellcheck="false"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  placeholder='{ "key": "value" }'
                  [value]="mobileRunPayload()"
                  (input)="updateMobileRunPayload($any($event.target).value)"></textarea>
                @if (mobileRunPayloadError(); as err) {
                  <p class="mobile-run-error" role="alert">{{ err }}</p>
                } @else {
                  <p class="mobile-run-hint">Оставьте пустым для запуска без входных данных.</p>
                }
              </section>

              @if (triggers().length > 0) {
                <section class="mobile-run-section">
                  <h4 class="mobile-run-subhead">Триггеры</h4>
                  <ul class="mobile-trigger-list">
                    @for (trigger of triggers(); track trigger.id) {
                      <li class="mobile-trigger-item">
                        <div class="mobile-trigger-meta">
                          <span class="mobile-trigger-type">{{ trigger.type }}</span>
                          <span class="mobile-trigger-detail">{{ describeTrigger(trigger) }}</span>
                        </div>
                        <label class="mobile-trigger-toggle">
                          <input type="checkbox"
                                 [checked]="!!trigger.enabled"
                                 (change)="setTriggerEnabled({ triggerId: trigger.id, enabled: $any($event.target).checked })">
                          <span>{{ trigger.enabled ? 'Вкл' : 'Выкл' }}</span>
                        </label>
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>

            <footer class="mobile-run-footer">
              <button type="button"
                      class="mobile-run-btn"
                      [disabled]="!currentWorkflowIdValue() || isExecuting() || !!mobileRunPayloadError()"
                      (click)="runWorkflowFromMobile()">
                @if (isExecuting()) {
                  <span class="header-spinner" aria-hidden="true"></span>
                  Запускается…
                } @else {
                  <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Запустить workflow
                }
              </button>
            </footer>
          </aside>
        }
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

      <!-- Snapshots Modal -->
      <app-modal
        [open]="modals().snapshots"
        [title]="'Снепшоты графа'"
        [wide]="true"
        (close)="closeModal('snapshots')">
        @if (currentWorkflowIdValue()) {
          <app-snapshots-panel
            [workflowId]="currentWorkflowIdValue()!"
            (restored)="onSnapshotRestored()">
          </app-snapshots-panel>
        }
      </app-modal>

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
      border: 1px solid var(--danger-glow-strong);
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
      background:
        radial-gradient(circle at 28% 20%, rgba(180, 205, 255, 0.5) 0%, transparent 58%),
        linear-gradient(135deg, #5b8def 0%, #2c4a99 100%);
      color: var(--accent-ink);
      display: grid;
      place-items: center;
      font-family: var(--font-sans);
      font-weight: 700;
      font-size: 20px;
      letter-spacing: -0.02em;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25),
        0 8px 20px rgba(91, 141, 239, 0.24);
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

    .icon-btn.labeled-btn {
      width: auto;
      padding: 0 12px;
      gap: 8px;
      display: inline-flex;
      align-items: center;
    }

    .icon-btn .btn-label {
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
    }

    .icon-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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

    .inspector-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      gap: 8px;
    }

    .inspector-tabs {
      display: flex;
      gap: 2px;
      align-items: stretch;
      flex-shrink: 0;
    }

    .inspector-tab {
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

    .inspector-tab:hover {
      color: var(--fg-primary);
      background: var(--bg-secondary);
      transform: none;
      box-shadow: none;
    }

    .inspector-tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .inspector-tab .tab-icon {
      display: block;
      flex-shrink: 0;
    }

    .inspector-tab-content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .inspector-tab-content > * {
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
      color: var(--accent-ink);
      display: grid;
      place-items: center;
      font-family: var(--font-sans);
      font-weight: 700;
      font-size: 13px;
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

    /* ============================================
       Mobile drawers + adaptive header
       ============================================ */

    .icon-btn.mobile-only.active {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: var(--accent);
    }

    .icon-btn.primary-mobile-cta {
      background: var(--accent);
      color: var(--accent-ink);
      border-color: var(--accent);
      box-shadow: 0 6px 18px var(--accent-glow);
    }

    .icon-btn.primary-mobile-cta:hover:not(:disabled),
    .icon-btn.primary-mobile-cta.active {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .icon-btn.primary-mobile-cta:disabled {
      opacity: 0.45;
      box-shadow: none;
    }

    .header-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.32);
      border-top-color: var(--accent-ink);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: inline-block;
    }

    .mobile-run-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-height: 88dvh;
      background: var(--panel);
      border-top: 1px solid var(--border);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -24px 60px rgba(0, 0, 0, 0.55);
      z-index: 40;
      transform: translateY(100%);
      transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .mobile-run-drawer.mobile-open {
      transform: translateY(0);
    }

    .mobile-run-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px 12px;
      border-bottom: 1px solid var(--border);
    }

    .mobile-run-header h3 {
      margin: 0 0 2px;
      font-size: 17px;
      font-weight: 600;
      color: var(--fg-primary);
    }

    .mobile-run-header p {
      margin: 0;
      font-size: 12px;
      color: var(--fg-muted);
    }

    .mobile-run-body {
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1 1 auto;
      min-height: 0;
      -webkit-overflow-scrolling: touch;
    }

    .mobile-run-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mobile-run-label,
    .mobile-run-subhead {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--fg-muted);
    }

    .mobile-run-textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--fg-primary);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      min-height: 120px;
    }

    .mobile-run-textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .mobile-run-textarea.has-error {
      border-color: var(--danger);
      box-shadow: 0 0 0 3px var(--danger-glow, rgba(239, 68, 68, 0.18));
    }

    .mobile-run-error {
      margin: 0;
      font-size: 12px;
      color: var(--danger);
    }

    .mobile-run-hint {
      margin: 0;
      font-size: 12px;
      color: var(--fg-muted);
    }

    .mobile-trigger-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mobile-trigger-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-secondary);
    }

    .mobile-trigger-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .mobile-trigger-type {
      font-size: 13px;
      font-weight: 600;
      color: var(--fg-primary);
      text-transform: capitalize;
    }

    .mobile-trigger-detail {
      font-size: 11px;
      color: var(--fg-muted);
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-trigger-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--fg-secondary);
      cursor: pointer;
      user-select: none;
    }

    .mobile-trigger-toggle input {
      accent-color: var(--accent);
      width: 18px;
      height: 18px;
    }

    .mobile-run-footer {
      padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--border);
      background: var(--panel);
    }

    .mobile-run-btn {
      width: 100%;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 0 18px;
      border: none;
      border-radius: 12px;
      background: var(--accent);
      color: var(--accent-ink);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 10px 24px var(--accent-glow);
      transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
    }

    .mobile-run-btn:hover:not(:disabled) {
      background: var(--accent-hover);
    }

    .mobile-run-btn:active:not(:disabled) {
      transform: translateY(1px);
    }

    .mobile-run-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    .mobile-drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(8, 6, 4, 0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 30;
      animation: drawerFade 180ms ease;
    }

    @keyframes drawerFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @media (max-width: 1100px) {
      .app-header {
        padding: 14px 20px;
      }
      .header-actions {
        gap: 8px;
      }
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr !important;
        padding: 12px;
        gap: 12px;
      }

      .panel-container {
        position: fixed;
        top: 64px;
        bottom: 12px;
        width: min(320px, 86vw);
        max-height: none;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow-xl);
        z-index: 40;
        transition: transform 260ms cubic-bezier(0.32, 0.72, 0.24, 1);
        overflow: hidden;
      }

      .palette-panel {
        left: 12px;
        transform: translateX(calc(-100% - 24px));
        flex-direction: column;
      }

      .palette-panel.mobile-open {
        transform: translateX(0);
      }

      .inspector-panel {
        right: 12px;
        transform: translateX(calc(100% + 24px));
        flex-direction: column;
      }

      .inspector-panel.mobile-open {
        transform: translateX(0);
      }

      .panel-container .panel-content {
        width: 100% !important;
        height: 100%;
        overflow: auto;
      }

      .panel-container .resize-handle,
      .panel-container .collapse-btn {
        display: none !important;
      }

      .palette-panel .panel-content > *,
      .inspector-panel .panel-content > * {
        height: 100%;
      }
    }

    @media (max-width: 900px) {
      .icon-btn.labeled-btn {
        width: 36px;
        padding: 0;
        gap: 0;
      }
      .icon-btn .btn-label {
        display: none;
      }
    }

    @media (max-width: 640px) {
      .app-header {
        padding: 10px 12px;
        gap: 8px;
      }
      .brand {
        gap: 8px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .brand .logo {
        width: 34px;
        height: 34px;
        font-size: 17px;
        border-radius: 9px;
      }
      .back-btn {
        width: 32px;
        height: 32px;
      }
      .workflow-info {
        min-width: 0;
        flex: 1 1 auto;
      }
      .workflow-name-input {
        font-size: 15px;
        padding: 2px 4px;
        margin: -2px -4px;
        width: 100%;
        min-width: 0;
        text-overflow: ellipsis;
      }
      .workflow-info p {
        font-size: 10px;
        letter-spacing: 0.06em;
      }
      .header-actions {
        gap: 6px;
        flex: 0 0 auto;
      }
      .validation-status {
        padding: 4px 6px;
        font-size: 11px;
      }
      .validation-status .status-text {
        display: none;
      }
      .icon-btn {
        width: 32px;
        height: 32px;
      }
      main {
        padding: 8px;
        gap: 8px;
      }
      .panel-container {
        top: 56px;
        bottom: 8px;
        width: min(300px, 90vw);
        border-radius: 12px;
      }
      .palette-panel { left: 8px; }
      .inspector-panel { right: 8px; }

      .run-panel {
        padding: 0 12px 8px;
      }
      .run-panel-header {
        flex-wrap: wrap;
        gap: 6px;
      }
      .tabs {
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar { display: none; }
      .tabs .tab {
        padding: 6px 10px;
        font-size: 12px;
        white-space: nowrap;
      }
      .tab-actions {
        flex-wrap: wrap;
      }
      .icon-action-btn {
        width: 30px;
        height: 30px;
      }

      .guide-steps > li {
        padding: 10px 12px;
        gap: 10px;
        border-radius: 10px;
      }
      .guide-step-num {
        flex: 0 0 24px;
        width: 24px;
        height: 24px;
        font-size: 13px;
      }
    }

    @media (max-width: 480px) {
      .editor-error-banner {
        margin: 8px 8px 0;
        padding: 10px 12px;
        font-size: 13px;
      }
      .brand .logo {
        width: 30px;
        height: 30px;
        font-size: 15px;
      }
      .back-btn {
        width: 30px;
        height: 30px;
      }
      .workflow-name-input {
        font-size: 14px;
      }
    }

    @media (max-width: 360px) {
      .app-header {
        padding: 8px 8px;
      }
      .brand {
        gap: 6px;
      }
      .header-actions {
        gap: 4px;
      }
      .icon-btn {
        width: 30px;
        height: 30px;
      }
      .validation-status {
        padding: 3px 4px;
      }
      .panel-container {
        width: min(280px, 92vw);
        top: 52px;
      }
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
  /** Какая вкладка показана в правом сайдбаре: конфиг ноды или результаты её последнего запуска. */
  inspectorTab = signal<'config' | 'results'>('config');
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

      // Автопереключение на "Результаты" в начале запуска, чтобы было видно живой I/O.
      // Делаем это только когда пользователь стоит на "Конфиг" — иначе уважаем его выбор.
      if (isRunning && this.inspectorTab() === 'config') {
        this.inspectorTab.set('results');
      }

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
    snapshots: false,
  });

  // Panel state
  paletteCollapsed = signal(false);
  paletteWidth = signal(300);
  inspectorCollapsed = signal(false);
  inspectorWidth = signal(340);
  logPanelCollapsed = signal(false);
  logPanelHeight = signal(180);

  // Mobile drawer state
  private static readonly MOBILE_BREAKPOINT = 900;
  isMobile = signal(false);
  mobilePaletteOpen = signal(false);
  mobileInspectorOpen = signal(false);
  mobileRunOpen = signal(false);
  mobileRunPayload = signal('');
  mobileRunPayloadError = signal<string | null>(null);

  private resizing: 'palette' | 'inspector' | 'log' | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartValue = 0;
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  mainGridColumns = computed(() => {
    if (this.isMobile()) {
      return '1fr';
    }
    const paletteW = this.paletteCollapsed() ? '32px' : `${this.paletteWidth()}px`;
    const inspectorW = this.inspectorCollapsed() ? '32px' : `${this.inspectorWidth()}px`;
    return `${paletteW} 1fr ${inspectorW}`;
  });

  @HostListener('window:resize')
  onWindowResize(): void {
    this.syncMobileFromViewport();
  }

  private syncMobileFromViewport(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const mobile = window.innerWidth < WorkflowEditorComponent.MOBILE_BREAKPOINT;
    if (mobile !== this.isMobile()) {
      this.isMobile.set(mobile);
      if (!mobile) {
        this.mobilePaletteOpen.set(false);
        this.mobileInspectorOpen.set(false);
      }
    }
  }

  toggleMobilePalette(): void {
    const next = !this.mobilePaletteOpen();
    this.mobilePaletteOpen.set(next);
    if (next) {
      this.mobileInspectorOpen.set(false);
      this.mobileRunOpen.set(false);
    }
  }

  toggleMobileInspector(): void {
    const next = !this.mobileInspectorOpen();
    this.mobileInspectorOpen.set(next);
    if (next) {
      this.mobilePaletteOpen.set(false);
      this.mobileRunOpen.set(false);
    }
  }

  toggleMobileRun(): void {
    const next = !this.mobileRunOpen();
    this.mobileRunOpen.set(next);
    if (next) {
      this.mobilePaletteOpen.set(false);
      this.mobileInspectorOpen.set(false);
    }
  }

  closeMobileDrawers(): void {
    this.mobilePaletteOpen.set(false);
    this.mobileInspectorOpen.set(false);
    this.mobileRunOpen.set(false);
  }

  updateMobileRunPayload(value: string): void {
    this.mobileRunPayload.set(value);
    if (!value.trim()) {
      this.mobileRunPayloadError.set(null);
      return;
    }
    try {
      JSON.parse(value);
      this.mobileRunPayloadError.set(null);
    } catch (err) {
      this.mobileRunPayloadError.set('Невалидный JSON');
    }
  }

  runWorkflowFromMobile(): void {
    const raw = this.mobileRunPayload().trim();
    let parsed: unknown = undefined;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
        this.mobileRunPayloadError.set(null);
      } catch {
        this.mobileRunPayloadError.set('Невалидный JSON — исправьте перед запуском');
        return;
      }
    }
    this.mobileRunOpen.set(false);
    this.runWorkflow(undefined, parsed);
  }

  validationResult = signal<ValidationResult>({
    ready: true,
    status: 'ready',
    message: 'Готов к запуску',
    issues: []
  });

  workflowMeta = computed(() => this.currentMeta());

  ngOnInit(): void {
    this.syncMobileFromViewport();
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

  setTriggerEnabled(event: { triggerId: string; enabled: boolean }): void {
    const workflowId = this.currentWorkflowId();
    if (!workflowId) {
      return;
    }
    this.triggerApi.setEnabled(workflowId, event.triggerId, event.enabled).subscribe({
      next: updated => {
        this.triggers.update(list => list.map(t => (t.id === updated.id ? updated : t)));
      },
      error: err => {
        console.error('[editor] setTriggerEnabled failed', err);
        this.refreshTriggers();
      },
    });
  }

  describeTrigger(trigger: Trigger): string {
    const cfg = (trigger.config ?? {}) as Record<string, unknown>;
    if (trigger.type === 'cron') {
      const expr = typeof cfg['expression'] === 'string' ? cfg['expression'] as string : '';
      return expr || 'cron';
    }
    if (trigger.type === 'interval') {
      const sec = typeof cfg['seconds'] === 'number' ? cfg['seconds'] as number : null;
      return sec != null ? `каждые ${sec} с` : 'interval';
    }
    if (trigger.type === 'webhook') {
      return trigger.token ? `token: ${trigger.token.slice(0, 8)}…` : 'webhook';
    }
    return '';
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

  openModal(key: 'guide' | 'snapshots'): void {
    this.modals.update(m => ({ ...m, [key]: true }));
  }

  openSnapshots(): void {
    this.openModal('snapshots');
  }

  closeModal(key: string): void {
    this.modals.update(m => ({ ...m, [key]: false }));
    if (key === 'guide' && isPlatformBrowser(this.platformId)) {
      try { localStorage.setItem(this.guideStorageKey, '1'); } catch { /* ignore */ }
    }
  }

  /**
   * После успешного rollback бэкенд уже сделал новую ревизию и оповестил по WS,
   * но опираться только на WS-эхо ненадёжно (например, при отключённом WS). Перезагружаем
   * граф явно — это гарантированно синхронизирует UI.
   */
  onSnapshotRestored(): void {
    const id = this.currentWorkflowId();
    if (!id) {
      return;
    }
    this.facade.loadWorkflow(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: loaded => {
          this.applyingWsUpdate = true;
          this.workflowService.setNodes(loaded.nodes);
          this.workflowService.setEdges(loaded.edges);
          this.workflowService.setActiveNode(loaded.nodes[0]?.id ?? null);
          this.workflowService.log('Граф восстановлен из снепшота');
          setTimeout(() => { this.applyingWsUpdate = false; }, 0);
          this.refreshTriggers();
          this.closeModal('snapshots');
        },
        error: err => {
          console.error('[editor] reload after restore failed', err);
        },
      });
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
    // Делаем выбранную ноду "целью" для вкладки результатов, даже если запуска ещё не было —
    // вкладка отрисует empty-state, но при появлении данных сразу покажет их без второго клика.
    this.selectedExecutionNodeId.set(nodeId);
  }

  executeWorkflow(): void {
    this.runWorkflow();
  }

  /** Manual-trigger node "Запустить отсюда" — стартует только subgraph от данной ноды. */
  executeFromNode(nodeId: string): void {
    this.runWorkflow(nodeId);
  }

  private runWorkflow(fromNodeId?: string, input?: unknown): void {
    const workflowId = this.currentWorkflowId();
    if (!workflowId) {
      console.warn('No workflow ID selected');
      return;
    }

    this.logPanelCollapsed.set(true);
    this.inspectorTab.set('results');
    this.selectedExecutionNodeId.set(null);
    this.executionStatus.set({});
    this.executionProgress.set(0);
    this.isExecuting.set(true);

    this.executionService.executeWorkflow(workflowId, fromNodeId, input).subscribe({
      error: (err) => {
        console.error('Execution error:', err);
        this.isExecuting.set(false);
      },
    });
  }

  resetExecution(): void {
    this.executionService.clearExecution();
    this.inspectorTab.set('config');
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
