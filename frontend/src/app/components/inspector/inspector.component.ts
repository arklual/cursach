import { Component, input, output, inject, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode } from '../../models/workflow.model';
import { environment } from '../../../environments/environment';
import type { Trigger } from '../../core/api/trigger.api';
import { BranchSplitInspectorComponent } from './branch-split-inspector.component';
import { BranchMergeInspectorComponent } from './branch-merge-inspector.component';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule, BranchSplitInspectorComponent, BranchMergeInspectorComponent],
  template: `
    <aside class="inspector">
      <h2>Inspector</h2>
      @if (activeNode(); as node) {
        <div class="inspector-content">
          @if (node.data.purpose) {
            <section class="doc-section">
              <header class="doc-header">Что эта нода делает</header>
              <p class="doc-body">{{ node.data.purpose }}</p>
            </section>
          }
          @if (node.data.inputsHint) {
            <section class="doc-section">
              <header class="doc-header">Что принимает на вход</header>
              <pre class="doc-body inputs">{{ node.data.inputsHint }}</pre>
            </section>
          }
          <label>
            Название
            <input type="text" [ngModel]="node.data.label" (ngModelChange)="updateLabel($event)">
          </label>
          @if (node.data.kind === 'http') {
            <fieldset class="config-section">
              <legend>HTTP request</legend>
              <label>
                URL
                <input type="text"
                       [ngModel]="cfg(node, 'url', '')"
                       (ngModelChange)="setCfg(node, 'url', $event)"
                       placeholder="https://httpbin.org/get">
              </label>
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
                <input type="number" min="100" step="100"
                       [ngModel]="cfg(node, 'timeoutMs', 30000)"
                       (ngModelChange)="setCfg(node, 'timeoutMs', +$event)">
              </label>
              <label>
                Headers (JSON, key→value)
                <textarea rows="3" class="mono"
                          [ngModel]="cfgJson(node, 'headers')"
                          (ngModelChange)="setCfgJson(node, 'headers', $event)"
                          placeholder='{"Authorization": "Bearer ..."}'></textarea>
              </label>
              <label>
                Body (raw)
                <textarea rows="4" class="mono"
                          [ngModel]="cfg(node, 'body', '')"
                          (ngModelChange)="setCfg(node, 'body', $event)"
                          placeholder='{"hello": "world"}'></textarea>
              </label>
            </fieldset>
          }

          @if (node.data.kind === 'dataflow') {
            @if (getSubtype(node) === 'filter') {
              <fieldset class="config-section">
                <legend>Filter</legend>
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
                  Value (JSON)
                  <input type="text"
                         [ngModel]="cfgJson(node, 'value')"
                         (ngModelChange)="setCfgJson(node, 'value', $event)"
                         placeholder='100 или "pro"'>
                </label>
                <p class="hint">Если поле пустое — сравнивается сам элемент. Op gt/gte/lt/lte работают только для чисел.</p>
              </fieldset>
            }

            @if (getSubtype(node) === 'map') {
              <fieldset class="config-section">
                <legend>Map</legend>
                <label>
                  Режим
                  <select [ngModel]="mapMode(node)" (ngModelChange)="setMapMode(node, $event)">
                    <option value="select">Select fields</option>
                    <option value="rename">Rename</option>
                    <option value="wrap">Wrap</option>
                  </select>
                </label>

                @if (mapMode(node) === 'select') {
                  <label>
                    Поля через запятую
                    <input type="text"
                           [ngModel]="cfgList(node, 'select')"
                           (ngModelChange)="setCfgList(node, 'select', $event)"
                           placeholder="id, amount">
                  </label>
                  <p class="hint">Оставляет только перечисленные ключи у каждого объекта.</p>
                }
                @if (mapMode(node) === 'rename') {
                  <label>
                    Rename (JSON: новое имя → старое)
                    <textarea rows="3" class="mono"
                              [ngModel]="cfgJson(node, 'rename')"
                              (ngModelChange)="setCfgJson(node, 'rename', $event)"
                              placeholder='{"newName": "oldName"}'></textarea>
                  </label>
                  <p class="hint">Переименовывает поля каждого объекта в массиве.</p>
                }
                @if (mapMode(node) === 'wrap') {
                  <label>
                    Имя поля-обёртки
                    <input type="text"
                           [ngModel]="cfg(node, 'wrap', '')"
                           (ngModelChange)="setCfg(node, 'wrap', $event)"
                           placeholder="value">
                  </label>
                  <p class="hint">Превращает каждый элемент x в &#123; "fieldName": x &#125;.</p>
                }
              </fieldset>
            }

            @if (getSubtype(node) === 'reduce') {
              <fieldset class="config-section">
                <legend>Reduce</legend>
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
                  <p class="hint">Поле, по которому считается агрегат. Если пусто — берётся сам элемент.</p>
                } @else {
                  <p class="hint">Count возвращает длину входного массива. Поле не используется.</p>
                }
                <p class="hint">Возвращает &#123; "result": &lt;число&gt; &#125;.</p>
              </fieldset>
            }

            @if (getSubtype(node) === 'flatmap') {
              <fieldset class="config-section">
                <legend>FlatMap</legend>
                <label>
                  Поле-массив для разворачивания
                  <input type="text"
                         [ngModel]="cfg(node, 'field', '')"
                         (ngModelChange)="setCfg(node, 'field', $event)"
                         placeholder="items">
                </label>
                <p class="hint">Берёт массив из этого поля каждого элемента и склеивает всё в один плоский массив. Если пусто — на вход должен прийти массив массивов.</p>
              </fieldset>
            }

            @if (getSubtype(node) === 'foreach') {
              <fieldset class="config-section">
                <legend>ForEach</legend>
                <p class="hint">Passthrough: output = input (как массив). Настоящий fan-out по нодам пока не реализован — используйте как маркер «итерация по элементам».</p>
              </fieldset>
            }
          }

          @if (node.data.kind === 'trigger') {
            <fieldset class="config-section">
              <legend>{{ triggerLegend(node) }}</legend>
              @if (getSubtype(node) === 'manual') {
                <p class="hint">Запускает workflow только с этой ноды по нажатию кнопки. Без расписания и токена.</p>
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
                    @if (getSubtype(node) === 'webhook') {
                      <p class="hint warn">Webhook остановлен — вызовы по токену возвращают 404.</p>
                    } @else {
                      <p class="hint warn">Триггер остановлен — запуски по расписанию не происходят.</p>
                    }
                  }
                } @else {
                  <p class="hint">Активность будет доступна после сохранения графа.</p>
                }
              }
              @if (getSubtype(node) === 'webhook') {
                @if (webhookUrl(node); as url) {
                  <label>
                    Webhook URL
                    <input type="text" class="mono" readonly [value]="url" (click)="$any($event.target).select()">
                  </label>
                  <div class="actions-row">
                    <button class="ghost" (click)="copyToClipboard(url)">Скопировать URL</button>
                  </div>
                } @else {
                  <p class="hint">URL появится после сохранения графа.</p>
                }
              }
              @if (getSubtype(node) === 'cron') {
                <label>
                  Cron expression
                  <input type="text" class="mono"
                         [ngModel]="cfg(node, 'expression', '')"
                         (ngModelChange)="setCfg(node, 'expression', $event)"
                         placeholder="0 */5 * * * *">
                </label>
                <p class="hint">Формат Spring CronTrigger: sec min hour dom mon dow.</p>
              }
              @if (getSubtype(node) === 'interval') {
                <label>
                  Интервал, сек
                  <input type="number" min="1" step="1"
                         [ngModel]="cfg(node, 'periodSeconds', 30)"
                         (ngModelChange)="setCfg(node, 'periodSeconds', +$event)">
                </label>
                <p class="hint">Запуск повторяется каждые N секунд после сохранения графа.</p>
              }
            </fieldset>
          }

          @if (node.data.kind === 'code') {
            <fieldset class="config-section">
              <legend>{{ isJs(node) ? 'JavaScript sandbox' : 'Python sandbox' }}</legend>
              <label>
                Docker image (опционально)
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
                Code (определите <code>run(input)</code> — он получит JSON со входа)
                <textarea rows="8" class="mono"
                          [ngModel]="cfg(node, 'code', '')"
                          (ngModelChange)="setCfg(node, 'code', $event)"
                          [placeholder]="codePlaceholder(node)"></textarea>
              </label>
              <p class="hint">Бэк запускает <code>docker run --rm -i</code>. Требуется Docker на хосте бэка.</p>
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

          <div class="actions-row">
            <button class="ghost danger" (click)="deleteNode(node.id)">Удалить ноду</button>
          </div>
        </div>
      } @else {
        <p>Выберите ноду для настройки.</p>
      }
    </aside>
  `,
  styles: [`
    .inspector {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      min-height: 0;
      overflow: auto;
    }

    .inspector h2 {
      margin: 0;
    }

    .inspector-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      gap: 4px;
    }

    input, select, textarea {
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 6px 8px;
      font-family: inherit;
      font-size: 13px;
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
    }

    .doc-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .doc-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fg-muted);
      font-weight: 600;
    }

    .doc-body {
      margin: 0;
      font-size: 12px;
      color: var(--fg-secondary);
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .doc-body.inputs {
      font-family: var(--font-mono);
      font-size: 11px;
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
  `]
})
export class InspectorComponent {
  private workflowService = inject(WorkflowService);
  private platformId = inject(PLATFORM_ID);

  activeNode = input<WorkflowNode | null>(null);
  triggers = input<Trigger[]>([]);
  readonly runFromNode = output<string>();
  readonly triggerEnabledChange = output<{ triggerId: string; enabled: boolean }>();

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
    navigator.clipboard.writeText(text).catch(err => console.error('clipboard write failed', err));
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

  codePlaceholder(node: WorkflowNode): string {
    if (this.isJs(node)) {
      return 'async function run(input) {\n  return { sum: (input?.xs ?? []).reduce((a, b) => a + b, 0) };\n}';
    }
    return 'def run(input):\n    return {"sum": sum(input.get("xs", []))}';
  }

  /** Determine which map-mode is active from the stored config. */
  mapMode(node: WorkflowNode): 'select' | 'rename' | 'wrap' {
    const cfg = node.data.config ?? {};
    if (typeof cfg['wrap'] === 'string' && cfg['wrap']) return 'wrap';
    if (cfg['rename'] != null) return 'rename';
    return 'select';
  }

  /** Switching map mode clears keys of the other modes so backend priority doesn't surprise the user. */
  setMapMode(node: WorkflowNode, mode: 'select' | 'rename' | 'wrap'): void {
    this.workflowService.updateNodeData(node.id, data => {
      const next: Record<string, unknown> = { ...(data.config ?? {}) };
      if (mode !== 'select') delete next['select'];
      if (mode !== 'rename') delete next['rename'];
      if (mode !== 'wrap') delete next['wrap'];
      return { ...data, config: next };
    });
  }

  // ----- helpers для редактирования data.config из шаблона -----

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
        parsed = raw; // оставляем как строку, если ввод ещё не валиден
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
