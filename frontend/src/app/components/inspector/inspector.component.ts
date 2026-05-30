import { Component, input, output, inject, computed, effect, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode } from '../../models/workflow.model';
import { environment } from '../../../environments/environment';
import type { Trigger } from '../../core/api/trigger.api';
import { BranchSplitInspectorComponent } from './branch-split-inspector.component';
import { BranchMergeInspectorComponent } from './branch-merge-inspector.component';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, BranchSplitInspectorComponent, BranchMergeInspectorComponent],
  template: `
    <aside class="inspector" [class.is-readonly]="readOnly()">
      <div class="inspector-head">
        <h2>Inspector</h2>
        @if (readOnly()) {
          <span class="readonly-badge" title="С телефона недоступно редактирование. Откройте на компьютере, чтобы менять конфигурацию нод.">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">
              <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V8a5 5 0 10-10 0v2H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM9 8a3 3 0 016 0v2H9V8z"/>
            </svg>
            Просмотр
          </span>
        }
      </div>
      @if (activeNode(); as node) {
        <fieldset class="inspector-content" [disabled]="readOnly()">
          @if (node.data.purpose) {
            <p class="doc-line">{{ node.data.purpose }}</p>
          }
          <label>
            Название
            <input type="text" [ngModel]="node.data.label" (ngModelChange)="updateLabel($event)">
          </label>

          <div class="actions-row">
            <button class="ghost small" type="button" (click)="debugRunNode.emit(node.id)"
                    title="Отладочный запуск только этой ноды с произвольным входом">Запустить ноду</button>
          </div>

          @if (upstreamRefs(node); as refs) {
            @if (refs.length > 0) {
              <section class="upstream-section" aria-label="Входы">
                <header class="upstream-header">Вход</header>
                <ul class="upstream-list">
                  @for (ref of refs; track ref.id) {
                    <li class="upstream-item">
                      <span class="upstream-id" [title]="ref.label">{{ ref.id }}</span>
                      <button class="ghost small" type="button" (click)="copyToClipboard(codeRef(ref.id))" title="code: input.inputs['id']">code</button>
                      <button class="ghost small" type="button" (click)="copyToClipboard(templateRef(ref.id))" title="http: &#36;{inputs.id}">http</button>
                    </li>
                  }
                </ul>
              </section>
            }
          }

          @if (node.data.kind === 'http') {
            <fieldset class="config-section">
              <legend>HTTP</legend>
              <label>
                URL
                <input type="text"
                       [formControl]="urlControl"
                       [class.invalid]="urlControl.invalid"
                       placeholder="https://httpbin.org/get">
              </label>
              @if (urlControl.invalid) {
                <span class="field-error">URL обязателен</span>
              }
              <label>
                Method
                <select [ngModel]="cfg(node, 'method', 'GET')"
                        (ngModelChange)="setCfg(node, 'method', $event)">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                </select>
              </label>
              <label>
                Timeout, ms
                <input type="number" min="1" max="300000" step="100"
                       [formControl]="timeoutControl"
                       [class.invalid]="timeoutControl.invalid">
              </label>
              @if (timeoutControl.invalid) {
                <span class="field-error">Тайм-аут: 1…300000 мс</span>
              }
              <label>
                Headers
                <textarea rows="3" class="mono"
                          [ngModel]="cfgJson(node, 'headers')"
                          (ngModelChange)="setCfgJson(node, 'headers', $event)"
                          placeholder='{"Authorization": "Bearer ..."}'></textarea>
              </label>
              <label>
                Body
                <textarea rows="4" class="mono"
                          [ngModel]="cfg(node, 'body', '')"
                          (ngModelChange)="setCfg(node, 'body', $event)"
                          placeholder='{"hello": "world"}'></textarea>
              </label>
            </fieldset>
          }

          @if (node.data.kind === 'dataflow') {
            <fieldset class="config-section">
              <legend>{{ dataflowLegend(node) }}</legend>

              @if (upstreamRefs(node); as refs) {
                @if (refs.length > 1) {
                  <label>
                    Input
                    <select [ngModel]="cfg(node, 'from', '')"
                            (ngModelChange)="setCfg(node, 'from', $event)">
                      <option value="">Авто</option>
                      @for (ref of refs; track ref.id) {
                        <option [value]="ref.id">{{ ref.id }}</option>
                      }
                    </select>
                  </label>
                }
              }

              @if (getSubtype(node) === 'filter') {
                <label>
                  Field
                  <input type="text"
                         [ngModel]="cfg(node, 'field', '')"
                         (ngModelChange)="setCfg(node, 'field', $event)"
                         placeholder="amount">
                </label>
                <label>
                  Op
                  <select [ngModel]="cfg(node, 'op', 'gt')"
                          (ngModelChange)="setCfg(node, 'op', $event)">
                    <option value="eq">eq</option>
                    <option value="ne">ne</option>
                    <option value="gt">gt</option>
                    <option value="gte">gte</option>
                    <option value="lt">lt</option>
                    <option value="lte">lte</option>
                  </select>
                </label>
                <label>
                  Value
                  <input type="text"
                         [ngModel]="cfgJson(node, 'value')"
                         (ngModelChange)="setCfgJson(node, 'value', $event)"
                         placeholder='100'>
                </label>
              }

              @if (getSubtype(node) === 'map') {
                <label>
                  Режим
                  <select [ngModel]="mapMode(node)" (ngModelChange)="setMapMode(node, $event)">
                    <option value="select">Select</option>
                    <option value="rename">Rename</option>
                    <option value="wrap">Wrap</option>
                  </select>
                </label>
                @if (mapMode(node) === 'select') {
                  <label>
                    Fields
                    <input type="text"
                           [ngModel]="cfgList(node, 'select')"
                           (ngModelChange)="setCfgList(node, 'select', $event)"
                           placeholder="id, amount">
                  </label>
                }
                @if (mapMode(node) === 'rename') {
                  <label>
                    Mapping
                    <textarea rows="3" class="mono"
                              [ngModel]="cfgJson(node, 'rename')"
                              (ngModelChange)="setCfgJson(node, 'rename', $event)"
                              placeholder='{"newName": "oldName"}'></textarea>
                  </label>
                }
                @if (mapMode(node) === 'wrap') {
                  <label>
                    Wrap key
                    <input type="text"
                           [ngModel]="cfg(node, 'wrap', '')"
                           (ngModelChange)="setCfg(node, 'wrap', $event)"
                           placeholder="value">
                  </label>
                }
              }

              @if (getSubtype(node) === 'reduce') {
                <label>
                  Op
                  <select [ngModel]="cfg(node, 'op', 'count')"
                          (ngModelChange)="setCfg(node, 'op', $event)">
                    <option value="count">count</option>
                    <option value="sum">sum</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                    <option value="avg">avg</option>
                  </select>
                </label>
                @if (cfg(node, 'op', 'count') !== 'count') {
                  <label>
                    Field
                    <input type="text"
                           [ngModel]="cfg(node, 'field', '')"
                           (ngModelChange)="setCfg(node, 'field', $event)"
                           placeholder="amount">
                  </label>
                }
              }

              @if (getSubtype(node) === 'flatmap') {
                <label>
                  Field
                  <input type="text"
                         [ngModel]="cfg(node, 'field', '')"
                         (ngModelChange)="setCfg(node, 'field', $event)"
                         placeholder="items">
                </label>
              }

              @if (getSubtype(node) === 'foreach') {
                <p class="hint">Passthrough.</p>
              }
            </fieldset>
          }

          @if (node.data.kind === 'trigger') {
            <fieldset class="config-section">
              <legend>{{ triggerLegend(node) }}</legend>
              @if (getSubtype(node) === 'manual') {
                <div class="actions-row">
                  <button class="primary" (click)="runFromNode.emit(node.id)">Запустить отсюда</button>
                </div>
              }
              @if (getSubtype(node) !== 'manual') {
                @if (triggerByNodeId().get(node.id); as trigger) {
                  <label class="toggle-row">
                    <input type="checkbox"
                           [checked]="trigger.enabled !== false"
                           (change)="onEnabledToggle(trigger, $any($event.target).checked)">
                    <span>Активен</span>
                  </label>
                  @if (trigger.enabled === false) {
                    <p class="hint warn">Остановлен.</p>
                  }
                } @else {
                  <p class="hint">Доступно после сохранения.</p>
                }
              }
              @if (getSubtype(node) === 'webhook') {
                @if (webhookUrl(node); as url) {
                  <label>
                    URL
                    <input type="text" class="mono" readonly [value]="url" (click)="$any($event.target).select()">
                  </label>
                  <div class="actions-row">
                    <button class="ghost" (click)="copyToClipboard(url)">Копировать</button>
                  </div>
                }
              }
              @if (getSubtype(node) === 'cron') {
                <label>
                  Cron
                  <input type="text" class="mono"
                         [formControl]="cronControl"
                         [class.invalid]="cronControl.invalid"
                         placeholder="* * * * *">
                </label>
                @if (cronControl.invalid) {
                  <span class="field-error">Некорректное cron-выражение (5 или 6 полей)</span>
                }
              }
              @if (getSubtype(node) === 'interval') {
                <label>
                  Интервал, сек
                  <input type="number" min="1" step="1"
                         [ngModel]="cfg(node, 'periodSeconds', 30)"
                         (ngModelChange)="setCfg(node, 'periodSeconds', +$event)">
                </label>
              }
              <div class="actions-row">
                <button class="danger small" type="button" (click)="deleteNode(node.id)"
                        title="Удалить этот триггер">Удалить триггер</button>
              </div>
            </fieldset>
          }

          @if (node.data.kind === 'code') {
            <fieldset class="config-section">
              <legend>{{ isJs(node) ? 'JavaScript' : 'Python' }}</legend>
              <label>
                Image
                <input type="text"
                       [ngModel]="cfg(node, 'image', '')"
                       (ngModelChange)="setCfg(node, 'image', $event)"
                       [placeholder]="isJs(node) ? 'node:20-alpine' : 'python:3.12-alpine'">
              </label>
              <label>
                Timeout, ms
                <input type="number" min="500" step="500"
                       [ngModel]="cfg(node, 'timeoutMs', 5000)"
                       (ngModelChange)="setCfg(node, 'timeoutMs', +$event)">
              </label>
              <label>
                Memory, MB
                <input type="number" min="32" step="32"
                       [ngModel]="cfg(node, 'memoryMb', 128)"
                       (ngModelChange)="setCfg(node, 'memoryMb', +$event)">
              </label>
              <label>
                Code
                <textarea rows="8" class="mono"
                          [ngModel]="cfg(node, 'code', '')"
                          (ngModelChange)="setCfg(node, 'code', $event)"
                          [placeholder]="codePlaceholder(node)"></textarea>
              </label>
            </fieldset>
          }

          @if (node.data.kind === 'ai') {
            <fieldset class="config-section">
              <legend>AI · {{ aiProviderLabel(node) }}</legend>
              <label>
                Провайдер
                <select [ngModel]="cfg(node, 'provider', 'openai')"
                        (ngModelChange)="setCfg(node, 'provider', $event)">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="gemini">Google (Gemini)</option>
                </select>
              </label>
              <label>
                Модель
                <input type="text"
                       [ngModel]="cfg(node, 'model', '')"
                       (ngModelChange)="setCfg(node, 'model', $event)"
                       [placeholder]="aiModelPlaceholder(node)">
              </label>
              <label>
                API-ключ
                <input type="password" autocomplete="off" class="mono"
                       [ngModel]="cfg(node, 'apiKey', '')"
                       (ngModelChange)="setCfg(node, 'apiKey', $event)"
                       placeholder="sk-…">
              </label>
              <p class="hint">Оставьте ключ пустым, чтобы взять его из переменной окружения сервера
                ({{ aiEnvVarHint(node) }}).</p>
              <label>
                System (системный промпт)
                <textarea rows="2"
                          [ngModel]="cfg(node, 'system', '')"
                          (ngModelChange)="setCfg(node, 'system', $event)"
                          placeholder="Ты — полезный ассистент."></textarea>
              </label>
              <label>
                Prompt (запрос)
                <textarea rows="5"
                          [ngModel]="cfg(node, 'prompt', '')"
                          (ngModelChange)="setCfg(node, 'prompt', $event)"
                          placeholder="Суммируй: &#36;{inputs.fetch.body.text}"></textarea>
              </label>
              <p class="hint">В промпте можно ссылаться на данные предыдущих нод через
                &#36;{{ '{' }}inputs.nodeId.field{{ '}' }}.</p>
              <label>
                Temperature
                <input type="number" min="0" max="2" step="0.1"
                       [ngModel]="cfg(node, 'temperature', 0.7)"
                       (ngModelChange)="setCfg(node, 'temperature', +$event)">
              </label>
              <label>
                Max tokens
                <input type="number" min="1" step="1"
                       [ngModel]="cfg(node, 'maxTokens', 1024)"
                       (ngModelChange)="setCfg(node, 'maxTokens', +$event)">
              </label>
              <label>
                Base URL (опционально)
                <input type="text" class="mono"
                       [ngModel]="cfg(node, 'baseUrl', '')"
                       (ngModelChange)="setCfg(node, 'baseUrl', $event)"
                       [placeholder]="aiBaseUrlPlaceholder(node)">
              </label>
            </fieldset>
          }

          @if (activeNode()?.data?.kind === 'ab') {
            <app-branch-split-inspector
                [node]="activeNode()!"
                (configChange)="onSplitConfigChange($event)">
            </app-branch-split-inspector>
          }
          @if (activeNode()?.data?.kind === 'join') {
            <app-branch-merge-inspector
                [node]="activeNode()!"
                (configChange)="onSplitConfigChange($event)">
            </app-branch-merge-inspector>
          }

          @if (!readOnly()) {
            <div class="actions-row">
              <button class="ghost danger" (click)="deleteNode(node.id)">Удалить ноду</button>
            </div>
          }
        </fieldset>
      } @else {
        <p>Выберите ноду для настройки.</p>
      }
      @if (toastVisible()) {
        <div class="copy-toast" role="status" aria-live="polite">{{ toastMessage() }}</div>
      }
    </aside>
  `,
  styles: [`
    input.invalid {
      border-color: var(--danger, #ef4444) !important;
    }
    .field-error {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: var(--danger, #ef4444);
    }
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      min-width: 0;
    }

    .inspector {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      width: 100%;
      min-height: 0;
      min-width: 0;
      overflow-x: hidden;
      overflow-y: auto;
      box-sizing: border-box;
      overscroll-behavior: contain;
    }

    .inspector h2 {
      margin: 0;
    }

    .inspector-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    .readonly-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      color: var(--fg-muted);
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      cursor: help;
      user-select: none;
    }

    .readonly-badge svg { opacity: 0.7; }

    .inspector-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      border: 0;
      margin: 0;
      padding: 0;
    }

    .inspector-content[disabled] :is(input, select, textarea, button) {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .inspector-content[disabled] :is(input, select, textarea) {
      background: var(--bg-secondary);
    }

    label {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      gap: 4px;
      min-width: 0;
    }

    .upstream-section {
      background: var(--bg-secondary, #1a1d28);
      border: 1px solid var(--border, #303644);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .upstream-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fg-muted, #8a92a6);
      font-weight: 600;
    }
    .upstream-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .upstream-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }
    .upstream-id {
      font-family: monospace;
      font-weight: 600;
      color: var(--fg, #d8dde9);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .upstream-item button.ghost.small {
      font-size: 10px;
      padding: 2px 6px;
      border: 1px solid var(--border, #303644);
      background: transparent;
      color: var(--fg, #d8dde9);
      border-radius: 4px;
      cursor: pointer;
    }
    .upstream-item button.ghost.small:hover {
      border-color: var(--accent, #3b82f6);
    }
    .doc-line {
      margin: 0;
      font-size: 12px;
      color: var(--fg-muted);
      line-height: 1.4;
    }

    input, select, textarea {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 6px 8px;
      font-family: inherit;
      font-size: 13px;
      box-sizing: border-box;
    }

    textarea {
      resize: vertical;
    }

    textarea.mono, input.mono {
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .config-section {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      min-width: 0;
    }

    .config-section legend {
      padding: 0 6px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .actions-row {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .actions-row button {
      flex: 1;
    }

    button {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
    }

    button.danger {
      color: var(--danger);
      border-color: var(--danger);
    }

    button.danger:hover {
      background: var(--danger-bg);
    }

    button.primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    button.primary:hover {
      filter: brightness(1.05);
    }

    .hint {
      color: var(--fg-muted);
      font-size: 12px;
      margin: 8px 0 0;
    }

    .hint.warn {
      color: var(--danger, #c0392b);
    }

    .toggle-row {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .toggle-row input[type="checkbox"] {
      width: auto;
      margin: 0;
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 14px;
      cursor: pointer;
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
    }

    button.ghost:hover {
      background: var(--panel-hover);
    }

    .copy-toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      background: var(--panel);
      color: var(--fg-primary);
      border: 1px solid var(--border);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      z-index: 1000;
      pointer-events: none;
      animation: copy-toast-in 0.18s ease-out;
    }

    @keyframes copy-toast-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class InspectorComponent {
  private workflowService = inject(WorkflowService);
  private platformId = inject(PLATFORM_ID);

  activeNode = input<WorkflowNode | null>(null);
  triggers = input<Trigger[]>([]);
  readOnly = input<boolean>(false);

  private readonly cronPattern = /^\s*(\*|\?|(\*\/\d+)|([0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)(,[0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)*)(\s+(\*|\?|(\*\/\d+)|([0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)(,[0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)*)){4,5}\s*$/;
  readonly configForm = new FormGroup({
    url: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timeoutMs: new FormControl(30000, { validators: [Validators.min(1), Validators.max(300000)] }),
    cron: new FormControl('', { validators: [Validators.required] }),
  });
  get urlControl(): FormControl { return this.configForm.controls.url; }
  get timeoutControl(): FormControl { return this.configForm.controls.timeoutMs as FormControl; }
  get cronControl(): FormControl { return this.configForm.controls.cron as FormControl; }

  constructor() {
    this.cronControl.addValidators(Validators.pattern(this.cronPattern));
    effect(() => {
      const node = this.activeNode();
      if (!node) { return; }
      const cfg = node.data.config ?? {};
      this.configForm.patchValue({
        url: (cfg['url'] as string) ?? '',
        timeoutMs: (cfg['timeoutMs'] as number) ?? 30000,
        cron: (cfg['expression'] as string) ?? '',
      }, { emitEvent: false });
    });
    this.urlControl.valueChanges.subscribe(v => {
      const node = this.activeNode();
      if (node && node.data.kind === 'http') { this.setCfg(node, 'url', v); }
    });
    this.timeoutControl.valueChanges.subscribe(v => {
      const node = this.activeNode();
      if (node && node.data.kind === 'http' && v != null) { this.setCfg(node, 'timeoutMs', +v); }
    });
    this.cronControl.valueChanges.subscribe(v => {
      const node = this.activeNode();
      if (node && this.getSubtype(node) === 'cron') { this.setCfg(node, 'expression', v); }
    });
  }

  readonly runFromNode = output<string>();
  readonly debugRunNode = output<string>();
  readonly triggerEnabledChange = output<{ triggerId: string; enabled: boolean }>();

  readonly toastMessage = signal<string>('');
  readonly toastVisible = signal<boolean>(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly upstreamRefs = (active: WorkflowNode | null): { id: string; label: string }[] => {
    if (!active) return [];
    const sources = this.workflowService.edges()
      .filter(e => e.target === active.id)
      .map(e => e.source);
    const unique = Array.from(new Set(sources));
    const byId = new Map(this.workflowService.nodes().map(n => [n.id, n] as const));
    return unique
      .map(id => ({ id, label: byId.get(id)?.data.label ?? id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  };

  codeRef(nodeId: string): string {
    return `input.inputs["${nodeId}"]`;
  }

  templateRef(nodeId: string): string {
    return '${inputs.' + nodeId + '}';
  }

  onEnabledToggle(trigger: Trigger, enabled: boolean): void {
    this.triggerEnabledChange.emit({ triggerId: trigger.id, enabled });
  }

  protected readonly triggerByNodeId = computed(() => {
    const map = new Map<string, Trigger>();
    for (const t of this.triggers()) {
      if (t.nodeId) {
        map.set(t.nodeId, t);
      }
    }
    return map;
  });

  triggerLegend(node: WorkflowNode): string {
    const sub = this.getSubtype(node);
    if (sub === 'manual') return 'Manual';
    if (sub === 'webhook') return 'Webhook';
    if (sub === 'cron') return 'Cron';
    if (sub === 'interval') return 'Interval';
    return 'Trigger';
  }

  webhookUrl(node: WorkflowNode): string | null {
    const trigger = this.triggerByNodeId().get(node.id);
    const token = trigger?.token;
    if (!token) {
      return null;
    }
    const apiBase = environment.apiBaseUrl;
    if (apiBase.startsWith('http')) {
      return `${apiBase}/webhook/${token}`;
    }
    const origin = isPlatformBrowser(this.platformId) && typeof window !== 'undefined'
      ? window.location.origin
      : '';
    return `${origin}${apiBase}/webhook/${token}`;
  }

  copyToClipboard(text: string): void {
    if (!isPlatformBrowser(this.platformId) || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => this.showToast('Скопировано в буфер обмена'))
      .catch(err => console.error('clipboard write failed', err));
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastVisible.set(false);
      this.toastTimer = null;
    }, 1800);
  }

  updateLabel(label: string): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, label }));
    }
  }

  getSubtype(node: WorkflowNode): string {
    if (node.data.__subtype) {
      return node.data.__subtype;
    }
    if (node.data.kind === 'trigger') return 'webhook';
    if (node.data.kind === 'dataflow') return 'filter';
    return '';
  }

  isJs(node: WorkflowNode): boolean {
    return node.data.kind === 'code' && node.data.__subtype === 'js';
  }

  isCronValid(expr: string): boolean {
    const value = (expr ?? '').trim();
    if (value.length === 0) {
      return false;
    }
    const fields = value.split(/\s+/);
    if (fields.length !== 5 && fields.length !== 6) {
      return false;
    }
    const field = /^(\*|\?|(\*\/\d+)|([0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)(,[0-9A-Za-z]+(-[0-9A-Za-z]+)?(\/\d+)?)*)$/;
    return fields.every(f => field.test(f));
  }

  codePlaceholder(node: WorkflowNode): string {
    if (this.isJs(node)) {
      return [
        'async function run(input) {',
        '  return input.runInput;',
        '}',
      ].join('\n');
    }
    return [
      'def run(input):',
      '    return input.get("runInput")',
    ].join('\n');
  }

  private aiProvider(node: WorkflowNode): string {
    return (node.data.config?.['provider'] as string) || 'openai';
  }

  aiProviderLabel(node: WorkflowNode): string {
    const p = this.aiProvider(node);
    if (p === 'anthropic') return 'Claude';
    if (p === 'gemini') return 'Gemini';
    return 'OpenAI';
  }

  aiModelPlaceholder(node: WorkflowNode): string {
    const p = this.aiProvider(node);
    if (p === 'anthropic') return 'claude-3-5-sonnet-latest';
    if (p === 'gemini') return 'gemini-1.5-flash';
    return 'gpt-4o-mini';
  }

  aiBaseUrlPlaceholder(node: WorkflowNode): string {
    const p = this.aiProvider(node);
    if (p === 'anthropic') return 'https://api.anthropic.com';
    if (p === 'gemini') return 'https://generativelanguage.googleapis.com';
    return 'https://api.openai.com/v1';
  }

  aiEnvVarHint(node: WorkflowNode): string {
    const p = this.aiProvider(node);
    if (p === 'anthropic') return 'ANTHROPIC_API_KEY';
    if (p === 'gemini') return 'GEMINI_API_KEY / GOOGLE_API_KEY';
    return 'OPENAI_API_KEY';
  }

  dataflowLegend(node: WorkflowNode): string {
    const sub = this.getSubtype(node);
    if (sub === 'filter') return 'Filter';
    if (sub === 'map') return 'Map';
    if (sub === 'reduce') return 'Reduce';
    if (sub === 'flatmap') return 'FlatMap';
    if (sub === 'foreach') return 'ForEach';
    return 'Dataflow';
  }

  mapMode(node: WorkflowNode): 'select' | 'rename' | 'wrap' {
    const cfg = node.data.config ?? {};
    if (typeof cfg['wrap'] === 'string' && cfg['wrap']) return 'wrap';
    if (cfg['rename'] != null) return 'rename';
    return 'select';
  }

  setMapMode(node: WorkflowNode, mode: 'select' | 'rename' | 'wrap'): void {
    this.workflowService.updateNodeData(node.id, data => {
      const next: Record<string, unknown> = { ...(data.config ?? {}) };
      if (mode !== 'select') delete next['select'];
      if (mode !== 'rename') delete next['rename'];
      if (mode !== 'wrap') delete next['wrap'];
      return { ...data, config: next };
    });
  }

  cfg<T = unknown>(node: WorkflowNode, key: string, fallback: T): T {
    return (node.data.config?.[key] as T | undefined) ?? fallback;
  }

  setCfg(node: WorkflowNode, key: string, value: unknown): void {
    this.workflowService.updateNodeData(node.id, data => ({
      ...data,
      config: { ...(data.config ?? {}), [key]: value },
    }));
  }

  cfgJson(node: WorkflowNode, key: string): string {
    const v = node.data.config?.[key];
    if (v == null) {
      return '';
    }
    if (typeof v === 'string') {
      return v;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  setCfgJson(node: WorkflowNode, key: string, raw: string): void {
    const trimmed = raw.trim();
    let parsed: unknown = raw;
    if (trimmed.length > 0) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = raw;
      }
    } else {
      parsed = undefined;
    }
    this.setCfg(node, key, parsed);
  }

  cfgList(node: WorkflowNode, key: string): string {
    const v = node.data.config?.[key];
    if (Array.isArray(v)) {
      return v.join(', ');
    }
    return '';
  }

  setCfgList(node: WorkflowNode, key: string, raw: string): void {
    const list = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    this.setCfg(node, key, list.length > 0 ? list : undefined);
  }

  deleteNode(nodeId: string): void {
    if (this.readOnly()) return;
    if (!confirm('Удалить ноду?')) {
      return;
    }
    this.workflowService.removeNode(nodeId);
  }

  onSplitConfigChange(cfg: Record<string, unknown>): void {
    const node = this.activeNode();
    if (!node) {
      return;
    }
    this.workflowService.updateNodeData(node.id, data => ({ ...data, config: cfg }));
  }
}
