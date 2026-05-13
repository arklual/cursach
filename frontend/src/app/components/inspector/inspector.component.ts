import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode, Variant } from '../../models/workflow.model';

@Component({
  selector: 'app-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="inspector">
      <h2>Inspector</h2>
      @if (activeNode(); as node) {
        <div class="inspector-content">
          <label>
            Название
            <input type="text" [ngModel]="node.data.label" (ngModelChange)="updateLabel($event)">
          </label>
          <label>
            Метрика успеха p̂
            <input type="number" step="0.05" min="0" max="1"
                   [ngModel]="node.data.successProb"
                   (ngModelChange)="updateSuccessProb($event)">
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
            <label>
              Dataflow подтип
              <select [ngModel]="getSubtype(node)" (ngModelChange)="updateSubtype($event)">
                <option value="filter">filter</option>
                <option value="map">map</option>
                <option value="reduce">reduce</option>
                <option value="foreach">foreach</option>
                <option value="flatmap">flatmap</option>
              </select>
            </label>

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
              </fieldset>
            }

            @if (getSubtype(node) === 'map') {
              <fieldset class="config-section">
                <legend>Map</legend>
                <label>
                  Select fields (comma-separated)
                  <input type="text"
                         [ngModel]="cfgList(node, 'select')"
                         (ngModelChange)="setCfgList(node, 'select', $event)"
                         placeholder="id, amount">
                </label>
                <label>
                  Rename (JSON: new → old)
                  <textarea rows="2" class="mono"
                            [ngModel]="cfgJson(node, 'rename')"
                            (ngModelChange)="setCfgJson(node, 'rename', $event)"
                            placeholder='{"newName": "oldName"}'></textarea>
                </label>
                <label>
                  Wrap field name
                  <input type="text"
                         [ngModel]="cfg(node, 'wrap', '')"
                         (ngModelChange)="setCfg(node, 'wrap', $event)"
                         placeholder="value">
                </label>
                <p class="hint">Использовать одно из трёх: select / rename / wrap.</p>
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
                <label>
                  Field (для sum/min/max/avg)
                  <input type="text"
                         [ngModel]="cfg(node, 'field', '')"
                         (ngModelChange)="setCfg(node, 'field', $event)"
                         placeholder="amount">
                </label>
              </fieldset>
            }

            @if (getSubtype(node) === 'flatmap') {
              <fieldset class="config-section">
                <legend>FlatMap</legend>
                <label>
                  Field (массив для разворачивания)
                  <input type="text"
                         [ngModel]="cfg(node, 'field', '')"
                         (ngModelChange)="setCfg(node, 'field', $event)"
                         placeholder="items">
                </label>
                <p class="hint">Если пусто — ожидается массив массивов на входе.</p>
              </fieldset>
            }

            @if (getSubtype(node) === 'foreach') {
              <p class="hint">Foreach в MVP — passthrough (output = input как массив). Настоящий fan-out не реализован.</p>
            }
          }

          @if (node.data.kind === 'code') {
            <fieldset class="config-section">
              <legend>Python sandbox</legend>
              <label>
                Docker image (опционально)
                <input type="text"
                       [ngModel]="cfg(node, 'image', '')"
                       (ngModelChange)="setCfg(node, 'image', $event)"
                       placeholder="python:3.12-alpine">
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
                Code (получает stdin как JSON, печатает результат)
                <textarea rows="8" class="mono"
                          [ngModel]="cfg(node, 'code', '')"
                          (ngModelChange)="setCfg(node, 'code', $event)"
                          placeholder="import sys, json
data = json.load(sys.stdin)
print(json.dumps({'sum': sum(data.get('xs', []))}))"></textarea>
              </label>
              <p class="hint">Бэк запускает <code>docker run --rm -i</code>. Требуется Docker на хосте бэка.</p>
            </fieldset>
          }
          @if (node.data.kind === 'ab') {
            <div class="traffic-section">
              <h4>Traffic allocation</h4>
              @for (variant of node.data.variants; track variant.label; let i = $index) {
                <div class="allocation-row">
                  <span>{{ variant.label }}</span>
                  <input type="range" min="5" max="95"
                         [ngModel]="variant.weight"
                         (ngModelChange)="updateVariantWeight(i, $event)">
                  <input type="number"
                         [ngModel]="variant.weight"
                         (ngModelChange)="updateVariantWeight(i, $event)">
                </div>
              }
              <label>
                Randomization
                <select [ngModel]="node.data.randomization" (ngModelChange)="updateRandomization($event)">
                  <option value="simple">Simple random</option>
                  <option value="hashed">Hashed by user_id</option>
                  <option value="stratified">Stratified</option>
                </select>
              </label>
            </div>
          }
          <div class="actions-row">
            <button class="ghost" (click)="testNode.emit(node.id)">Test node</button>
            <button class="ghost danger" (click)="deleteNode(node.id)">Удалить ноду</button>
          </div>
        </div>
      } @else {
        <p>Выберите ноду для настройки.</p>
      }

      <section class="inspector-section">
        <h3>Stopping rules</h3>
        <label><input type="radio" name="stopping" checked> Fixed horizon (α контролируется)</label>
        <label><input type="radio" name="stopping"> Sequential (SPRT) + FDR alert</label>
        <p class="hint">Контролируйте вероятность ложной тревоги (Type I error).</p>
      </section>

      <section class="inspector-section">
        <h3>Reroute / roll-out</h3>
        <button (click)="promoteWinner.emit()">Promote winner</button>
        <p class="hint">Автоматически обновит доли трафика по результатам.</p>
      </section>
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
      height: calc(100vh - 200px);
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
      color: #b91c1c;
      border-color: #fecaca;
    }

    button.danger:hover {
      background: #fee2e2;
    }

    .traffic-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .traffic-section h4 {
      margin: 8px 0 4px;
      font-size: 13px;
    }

    .allocation-row {
      display: flex;
      align-items: center;
      gap: 8px;
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

    .inspector-section {
      background: #f8fafc;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .inspector-section h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }

    .inspector-section label {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      margin: 8px 0 0;
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
      background: #f1f5f9;
    }
  `]
})
export class InspectorComponent {
  private workflowService = inject(WorkflowService);

  activeNode = input<WorkflowNode | null>(null);
  testNode = output<string>();
  promoteWinner = output<void>();

  updateLabel(label: string): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, label }));
    }
  }

  updateSuccessProb(prob: number): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, successProb: prob }));
    }
  }

  updateRandomization(randomization: 'simple' | 'hashed' | 'stratified'): void {
    const node = this.activeNode();
    if (node) {
      this.workflowService.updateNodeData(node.id, data => ({ ...data, randomization }));
    }
  }

  getSubtype(node: WorkflowNode): string {
    return node.data.__subtype ?? 'filter';
  }

  updateSubtype(subtype: string): void {
    const node = this.activeNode();
    if (!node) {
      return;
    }
    this.workflowService.updateNodeData(node.id, data => ({ ...data, __subtype: subtype }));
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

  updateVariantWeight(index: number, value: number): void {
    const node = this.activeNode();
    if (!node) return;

    this.workflowService.updateNodeData(node.id, data => {
      const variants = data.variants.map((v, i) =>
        i === index ? { ...v, weight: Number(value) } : v
      );
      const total = variants.reduce((sum, v) => sum + v.weight, 0);
      return {
        ...data,
        variants: variants.map(v => ({ ...v, weight: Math.round((v.weight / total) * 100) }))
      };
    });
  }
}
