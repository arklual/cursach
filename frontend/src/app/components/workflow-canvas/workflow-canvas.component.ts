import { Component, input, output, inject, ElementRef, viewChild, signal, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode, WorkflowEdge, NodeKind } from '../../models/workflow.model';
import { CanvasEmptyComponent } from '../canvas-empty/canvas-empty.component';

@Component({
  selector: 'app-workflow-canvas',
  standalone: true,
  imports: [CommonModule, CanvasEmptyComponent],
  template: `
    <section class="canvas-wrapper">
      <div class="canvas-toolbar">
        <div class="toolbar-actions">
          <button class="primary execute-btn" [class.executing]="isExecuting()" (click)="executeWorkflow.emit()" title="Execute workflow (Ctrl+Enter)">
            @if (isExecuting()) {
              <span class="spinner"></span>
            }
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Execute
          </button>
          @if (isExecuting()) {
            <div class="execution-progress">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="progress()"></div>
              </div>
              <span class="progress-text">{{ progress() }}%</span>
            </div>
          }
        </div>
        <div class="toolbar-tools">
          <button (click)="centerView()">Center</button>
          <button (click)="resetView()">Reset</button>
          <span class="zoom-info">{{ (zoom() * 100).toFixed(0) }}%</span>
          <span class="hint">⌘+Scroll = zoom, Drag = pan</span>
        </div>
      </div>
      <div class="canvas-viewport"
           #canvasArea
           (mousedown)="onViewportMouseDown($event)"
           (wheel)="onWheel($event)"
           (drop)="onDrop($event)"
           (dragover)="onDragOver($event)">

        @if (nodes().length === 0 && !readOnly()) {
          <app-canvas-empty (nodeAdded)="onNodeAdded($event)"></app-canvas-empty>
        }
        @if (nodes().length === 0 && readOnly()) {
          <div class="canvas-readonly-empty">
            <p>Этот workflow пока пустой. Откройте редактор на десктопе, чтобы добавить ноды.</p>
          </div>
        }

        <div class="canvas-layer"
             [style.transform]="'translate(' + panX() + 'px, ' + panY() + 'px) scale(' + zoom() + ')'"
             (click)="onCanvasClick()">

          <!-- SVG слой для стрелок -->
          <svg class="edges-svg">
            @for (edge of edges(); track edge.id) {
              <g class="edge-group"
                 [class.selected]="edge.id === selectedEdgeId()"
                 (click)="selectEdge($event, edge.id)"
                 (mouseenter)="hoveredEdgeId.set(edge.id)"
                 (mouseleave)="hoveredEdgeId.set(null)">
                <path [attr.d]="calcPath(edge)" class="edge-hit" fill="none"/>
                <path [attr.d]="calcPathWithArrow(edge)"
                      class="edge-line"
                      [class.selected]="edge.id === selectedEdgeId()"
                      [class.hovered]="edge.id === hoveredEdgeId()"
                      [class.variant]="!!getEdgeColor(edge)"
                      [style.stroke]="getEdgeColor(edge)"
                      fill="none"/>
                @if (edge.label) {
                  <text [attr.x]="calcLabelPos(edge).x"
                        [attr.y]="calcLabelPos(edge).y"
                        class="edge-text">{{ edge.label }}</text>
                }
              </g>
            }

            @if (isDrawing()) {
              <path [attr.d]="tempPath()" class="edge-temp"
                    [style.stroke]="getTempEdgeColor()"
                    fill="none"/>
            }
          </svg>

          <!-- Кнопка удаления на выбранной стрелке -->
          @if (!readOnly() && selectedEdgeId(); as edgeId) {
            <button class="edge-delete-btn"
                    [style.left.px]="getDeleteBtnPos(edgeId).x"
                    [style.top.px]="getDeleteBtnPos(edgeId).y"
                    (click)="deleteEdge(edgeId); $event.stopPropagation()">
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          }

          <!-- Ноды -->
          @for (node of nodes(); track node.id) {
            <div class="node-wrap"
                 [style.left.px]="node.position.x"
                 [style.top.px]="node.position.y"
                 [class.selected]="node.id === activeNodeId()"
                 [class.executing]="executionStatus()[node.id] === 'running'"
                 [class.success]="executionStatus()[node.id] === 'success'"
                 [class.error]="executionStatus()[node.id] === 'error'"
                 [class.drop-target]="isDrawing() && dropTargetNodeId() === node.id"
                 (mousedown)="startDragNode($event, node)"
                 (click)="selectNode($event, node.id)">

              @if (!readOnly() && node.data.kind !== 'trigger') {
                <div class="handle handle-in"
                     (mousedown)="startDrawEdge($event, node, 'target')"></div>
              }

              <div class="node-content" [style.borderColor]="node.data.color + '55'"
                   [style.minHeight.px]="node.data.kind === 'ab' ? getAbMinHeight(node) : null">
                <div class="node-header" [style.background]="node.data.color + '20'">
                  <span class="node-kind">{{ formatKind(node) }}</span>
                  <span class="node-label">{{ node.data.label }}</span>
                  @if (executionStatus()[node.id]; as st) {
                    <span class="status-pill" [class]="'st-' + st">{{ st }}</span>
                  }
                </div>
                <div class="node-body">
                  <span class="node-hint">Click to inspect I/O</span>
                </div>
              </div>

              @if (!readOnly()) {
                @if (node.data.kind === 'ab') {
                  @for (variant of getAbVariants(node); track variant.key; let i = $index) {
                    <div class="handle handle-out handle-variant"
                         [style.top.px]="getAbHandleTop(i)"
                         [attr.data-variant]="variant.key"
                         [style.background-color]="getVariantColor(variant.key, i)"
                         (mousedown)="$event.stopPropagation(); startDrawEdge($event, node, 'source', variant.key)"
                         [title]="'Variant ' + variant.key + (variant.label && variant.label !== variant.key ? ' — ' + variant.label : '')">
                      <span class="handle-label">{{ variant.key }}</span>
                    </div>
                  }
                } @else {
                  <div class="handle handle-out"
                       (mousedown)="startDrawEdge($event, node, 'source')"></div>
                }
              }
            </div>
          }
        </div>
      </div>

      <div class="info-panel">
        <span>Ноды: {{ nodes().length }} | Связи: {{ edges().length }}</span>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    .canvas-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      min-height: 0;
    }

    .canvas-toolbar {
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }

    .toolbar-actions {
      display: flex;
      gap: 8px;
    }

    .toolbar-actions button.primary {
      background: var(--accent);
      color: white;
      border: none;
      font-weight: 600;
    }

    .toolbar-actions button.primary:hover {
      background: var(--accent-hover);
    }

    .execute-btn {
      position: relative;
      min-width: 120px;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }

    .execute-btn.executing {
      background: var(--accent);
      opacity: 0.8;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .execution-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
    }

    .progress-bar {
      width: 150px;
      height: 6px;
      background: var(--bg-tertiary);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-glow));
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      min-width: 35px;
    }

    .toolbar-tools {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .icon {
      display: block;
      color: inherit;
      vertical-align: middle;
    }

    .canvas-toolbar button {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
      cursor: pointer;
      font-size: 13px;
      color: var(--fg-primary);
    }

    .canvas-toolbar button:hover {
      background: var(--panel-hover);
    }

    .hint {
      color: var(--fg-muted);
      font-size: 12px;
      margin-left: auto;
    }

    .zoom-info {
      background: var(--bg-tertiary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: var(--fg-primary);
    }

    .canvas-viewport {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 0;
      cursor: grab;
      background: var(--bg-secondary);
      background-image: 
        radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
      background-size: 24px 24px;
    }

    .canvas-viewport:active {
      cursor: grabbing;
    }

    .canvas-readonly-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      pointer-events: none;
    }

    .canvas-readonly-empty p {
      max-width: 320px;
      text-align: center;
      color: var(--fg-muted);
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }

    .canvas-layer {
      position: absolute;
      width: 8000px;
      height: 8000px;
      transform-origin: 0 0;
    }

    .edges-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      overflow: visible;
    }

    .edge-group {
      pointer-events: stroke;
      cursor: pointer;
    }

    .edge-hit {
      stroke: transparent;
      stroke-width: 20;
    }

    .edge-line {
      stroke: var(--border-light);
      stroke-width: 2;
      transition: stroke 0.15s, stroke-width 0.15s;
    }

    .edge-line.variant {
      stroke-width: 2.5;
    }

    /* hover/selected переопределяют variant-цвет, заданный inline */
    .edge-line.hovered {
      stroke: var(--accent) !important;
      stroke-width: 3;
    }

    .edge-line.selected {
      stroke: var(--danger) !important;
      stroke-width: 3.5;
    }

    .edge-temp {
      stroke: var(--accent);
      stroke-width: 2;
      stroke-dasharray: 6 4;
      animation: dash-scroll 30s linear infinite;
    }

    @keyframes dash-scroll {
      to {
        stroke-dashoffset: -1000;
      }
    }

    .edge-text {
      font-size: 11px;
      fill: var(--fg-muted);
      pointer-events: none;
    }

    .edge-delete-btn {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid var(--danger);
      background: var(--panel);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      z-index: 50;
      box-shadow: var(--shadow-md);
      color: var(--fg-primary);
    }

    .edge-delete-btn:hover {
      background: var(--danger-bg);
      transform: translate(-50%, -50%) scale(1.1);
    }

    .node-wrap {
      position: absolute;
      z-index: 2;
      cursor: grab;
      user-select: none;
      transition: transform 0.15s ease-out;
    }

    .node-wrap:active {
      cursor: grabbing;
    }

    .node-wrap.selected .node-content {
      box-shadow: 0 0 0 2px var(--accent);
    }

    .node-wrap.drop-target {
      transform: scale(1.08);
      transition: transform 0.15s ease-out;
    }

    .node-wrap.drop-target .node-content {
      box-shadow: 0 0 0 3px var(--success), 0 8px 24px var(--success-glow);
    }

    .node-wrap.executing .node-content {
      border-color: var(--accent);
      border-width: 3px;
      box-shadow: 0 0 20px var(--accent-glow), 0 0 40px var(--accent-glow-strong), var(--shadow-lg);
      animation: node-pulse 0.8s ease-in-out infinite;
      z-index: 10;
    }

    .node-wrap.success .node-content {
      border-color: var(--success);
      border-width: 3px;
      box-shadow: 0 0 15px var(--success-glow), 0 0 30px var(--success-glow-strong), var(--shadow-lg);
    }

    .node-wrap.error .node-content {
      border-color: var(--danger);
      border-width: 3px;
      box-shadow: 0 0 15px var(--danger-glow), 0 0 30px var(--danger-glow-strong), var(--shadow-lg);
      animation: node-shake 0.5s ease-in-out;
    }

    @keyframes node-pulse {
      0%, 100% { 
        transform: scale(1.05);
        box-shadow: 0 0 10px var(--accent-glow), 0 0 20px var(--accent-glow-strong), var(--shadow-lg);
      }
      50% { 
        transform: scale(1.08);
        box-shadow: 0 0 30px var(--accent-glow), 0 0 60px var(--accent-glow-strong), var(--shadow-lg);
      }
    }

    @keyframes node-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-8px) rotate(-2deg); }
      40% { transform: translateX(8px) rotate(2deg); }
      60% { transform: translateX(-8px) rotate(-2deg); }
      80% { transform: translateX(8px) rotate(2deg); }
    }

    .node-content {
      width: 200px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: var(--shadow-md);
    }

    .node-header {
      padding: 8px 10px;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--fg-primary);
    }

    .node-body {
      padding: 8px 10px;
      font-size: 12px;
    }

    .node-kind {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-right: 6px;
    }

    .node-label {
      flex: 1;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-hint {
      color: var(--fg-muted);
      font-size: 11px;
    }

    .status-pill {
      margin-left: 6px;
      padding: 2px 6px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-radius: 8px;
      background: var(--bg-tertiary);
      color: var(--fg-muted);
    }

    .status-pill.st-running { background: var(--accent-glow); color: var(--accent); }
    .status-pill.st-success { background: var(--success-bg); color: var(--success); }
    .status-pill.st-error { background: var(--danger-bg); color: var(--danger); }
    .status-pill.st-skipped { background: var(--bg-tertiary); color: var(--fg-muted); }

    .handle {
      position: absolute;
      width: 14px;
      height: 14px;
      background: var(--bg-tertiary);
      border: 2px solid var(--border-light);
      border-radius: 50%;
      top: 50%;
      transform: translateY(-50%);
      cursor: crosshair;
      z-index: 10;
      transition: transform 0.15s, background 0.15s;
    }

    .handle:hover {
      transform: translateY(-50%) scale(1.3);
      background: var(--accent);
      border-color: var(--accent);
    }

    .handle-in {
      left: -7px;
      top: 50%;
      transform: translateY(-50%);
    }

    .handle-out {
      right: 0;
      top: 50%;
      transform: translateY(-50%) translateX(50%);
    }

    .handle-variant {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--bg-primary);
      cursor: crosshair;
      position: absolute;
      right: -9px;
      top: auto;
      transform: translateY(-50%);
      z-index: 11;
    }

    .handle-variant:hover {
      transform: translateY(-50%) scale(1.25);
      z-index: 12;
    }

    .handle-label {
      position: absolute;
      right: 100%;
      margin-right: 6px;
      font-size: 10px;
      font-weight: 600;
      color: var(--fg-secondary);
      line-height: 16px;
      white-space: nowrap;
      pointer-events: none;
    }

    .info-panel {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--fg-muted);
      z-index: 100;
    }

    .canvas-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      pointer-events: none;
      text-align: center;
      color: var(--fg-secondary);
      z-index: 1;
      padding: 24px;
    }

    .canvas-empty-arrow {
      font-size: 64px;
      line-height: 1;
      color: var(--accent);
      animation: empty-bounce 1.6s ease-in-out infinite;
    }

    .canvas-empty h3 {
      margin: 0;
      font-size: 22px;
      color: var(--fg-primary);
    }

    .canvas-empty p {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      max-width: 420px;
    }

    .canvas-empty-hint {
      color: var(--fg-muted);
      font-size: 13px;
    }

    @keyframes empty-bounce {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(-12px); }
    }
  `]
})
export class WorkflowCanvasComponent implements AfterViewInit {
  private ws = inject(WorkflowService);

  nodes = input.required<WorkflowNode[]>();
  edges = input.required<WorkflowEdge[]>();
  activeNodeId = input<string | null>(null);
  executionStatus = input<Record<string, 'pending' | 'running' | 'success' | 'error' | 'skipped'>>({});
  isExecuting = input<boolean>(false);
  progress = input<number>(0);
  readOnly = input<boolean>(false);

  nodeSelected = output<string>();
  executeWorkflow = output<void>();

  canvasArea = viewChild<ElementRef<HTMLDivElement>>('canvasArea');

  // Состояния
  selectedEdgeId = signal<string | null>(null);
  hoveredEdgeId = signal<string | null>(null);
  isDrawing = signal(false);
  dropTargetNodeId = signal<string | null>(null);

  // Pan & Zoom
  panX = signal(0);
  panY = signal(0);
  zoom = signal(1);
  private isPanning = signal(false);
  private panStart = { x: 0, y: 0 };
  private panStartOffset = { x: 0, y: 0 };

  private dragNode: WorkflowNode | null = null;
  private dragOffset = { x: 0, y: 0 };

  private drawSource: WorkflowNode | null = null;
  private drawType: 'source' | 'target' = 'source';
  private drawVariant: string | null = null;
  private mousePos = signal({ x: 0, y: 0 });

  private readonly NODE_W = 200;
  private readonly NODE_H = 70;
  private readonly HANDLE_RADIUS = 14;

  private getNodeHeight(node: WorkflowNode): number {
    if (node.data.kind === 'ab') {
      return this.getAbMinHeight(node);
    }
    return this.NODE_H;
  }

  /** Vertical offset (px from top of node-wrap) of variant handle #i. */
  getAbHandleTop(i: number): number {
    return this.AB_FIRST_HANDLE_OFFSET + i * this.AB_HANDLE_STRIDE;
  }

  /** Minimum height (px) of an ab node so all variant handles fit comfortably. */
  getAbMinHeight(node: WorkflowNode): number {
    const n = Math.max(2, this.getAbVariants(node).length);
    // Last handle center + bottom padding
    const lastCenter = this.AB_FIRST_HANDLE_OFFSET + (n - 1) * this.AB_HANDLE_STRIDE;
    return Math.max(this.NODE_H, lastCenter + this.AB_BOTTOM_PADDING);
  }

  private readonly AB_FIRST_HANDLE_OFFSET = 42;
  private readonly AB_HANDLE_STRIDE = 26;
  private readonly AB_BOTTOM_PADDING = 16;

  formatKind(node: WorkflowNode): string {
    return node.data.__subtype ?? node.data.kind;
  }

  getAbVariants(node: WorkflowNode): Array<{ key: string; label: string }> {
    const cfg = node.data.config as { variants?: Array<{ key: string; label?: string }> } | undefined;
    return cfg?.variants?.map(v => ({ key: v.key, label: v.label ?? v.key })) ?? [];
  }

  private readonly variantPalette = ['#84cc16', '#3b82f6', '#f472b6', '#fb923c', '#a78bfa'];

  getVariantColor(key: string, index: number): string {
    return this.variantPalette[index % this.variantPalette.length];
  }

  ngAfterViewInit() {
    // Даём время на отрисовку, затем центрируем
    setTimeout(() => this.centerView(), 200);
  }

  centerView(): void {
    const nodes = this.nodes();
    const viewport = this.canvasArea()?.nativeElement;
    if (!viewport || nodes.length === 0) {
      this.panX.set(100);
      this.panY.set(100);
      return;
    }

    // Находим границы всех нод
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const h = this.getNodeHeight(node);
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x + this.NODE_W);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y + h);
    }

    // Центр контента
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    // Размеры viewport
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Вычисляем pan так, чтобы центр контента был в центре viewport
    // При zoom=1: panX + contentCenterX = vw/2
    // => panX = vw/2 - contentCenterX * zoom
    this.panX.set(vw / 2 - contentCenterX * this.zoom());
    this.panY.set(vh / 2 - contentCenterY * this.zoom());
  }

  resetView(): void {
    this.zoom.set(1);
    this.centerView();
  }

  onWheel(e: WheelEvent): void {
    // Zoom только с Cmd (Mac) или Ctrl (Windows)
    if (!e.metaKey && !e.ctrlKey) return;

    e.preventDefault();
    const oldZoom = this.zoom();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.3, Math.min(2, oldZoom * delta));
    if (newZoom === oldZoom) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const panX = this.panX();
    const panY = this.panY();
    this.panX.set(cx - (cx - panX) * (newZoom / oldZoom));
    this.panY.set(cy - (cy - panY) * (newZoom / oldZoom));
    this.zoom.set(newZoom);
  }

  onViewportMouseDown(e: MouseEvent): void {
    // ЛКМ - начинаем pan (если не кликнули на ноду или другой интерактивный элемент)
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      // Не начинаем pan если клик на ноде, кнопке, хендле или стрелке
      if (target.closest('.node-wrap')
        || target.closest('button')
        || target.closest('.handle')
        || target.closest('.edge-group')) {
        return;
      }
      e.preventDefault();
      this.isPanning.set(true);
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panStartOffset = { x: this.panX(), y: this.panY() };
    }
  }

  getDeleteBtnPos(edgeId: string): { x: number; y: number } {
    const edge = this.edges().find(e => e.id === edgeId);
    if (!edge) return { x: 0, y: 0 };
    return this.calcLabelPos(edge);
  }

  deleteEdge(edgeId: string): void {
    if (this.readOnly()) return;
    this.ws.removeEdge(edgeId);
    this.ws.log('Связь удалена');
    this.selectedEdgeId.set(null);
  }

  // === Расчёт координат для стрелок ===

  private getOutPoint(node: WorkflowNode, variant?: string | null): { x: number; y: number } {
    if (node.data.kind === 'ab' && variant) {
      const variants = this.getAbVariants(node);
      const i = variants.findIndex(v => v.key === variant);
      if (i >= 0) {
        return {
          x: node.position.x + this.NODE_W,
          y: node.position.y + this.getAbHandleTop(i),
        };
      }
    }
    const h = this.getNodeHeight(node);
    return {
      x: node.position.x + this.NODE_W,
      y: node.position.y + h / 2
    };
  }

  private getInPoint(node: WorkflowNode): { x: number; y: number } {
    const h = this.getNodeHeight(node);
    return {
      x: node.position.x,
      y: node.position.y + h / 2
    };
  }

  /** Resolves edge stroke colour from its variant when sourced from an A/B node. */
  getEdgeColor(edge: WorkflowEdge): string | null {
    const variant = edge.data?.variant;
    if (!variant) return null;
    const src = this.nodes().find(n => n.id === edge.source);
    if (!src || src.data.kind !== 'ab') return null;
    const variants = this.getAbVariants(src);
    const idx = variants.findIndex(v => v.key === variant);
    if (idx < 0) return null;
    return this.getVariantColor(variant, idx);
  }

  /** Colour for the in-flight (drawing) edge — picks up current draw variant. */
  getTempEdgeColor(): string | null {
    if (!this.drawSource || this.drawType !== 'source' || !this.drawVariant) return null;
    if (this.drawSource.data.kind !== 'ab') return null;
    const variants = this.getAbVariants(this.drawSource);
    const idx = variants.findIndex(v => v.key === this.drawVariant);
    if (idx < 0) return null;
    return this.getVariantColor(this.drawVariant, idx);
  }

  calcPath(edge: WorkflowEdge): string {
    const src = this.nodes().find(n => n.id === edge.source);
    const tgt = this.nodes().find(n => n.id === edge.target);
    if (!src || !tgt) return '';

    const p1 = this.getOutPoint(src, edge.data?.variant);
    const p2 = this.getInPoint(tgt);

    const dx = Math.abs(p2.x - p1.x);
    const cp = Math.max(50, dx * 0.5);

    return `M${p1.x},${p1.y} C${p1.x + cp},${p1.y} ${p2.x - cp},${p2.y} ${p2.x},${p2.y}`;
  }

  calcPathWithArrow(edge: WorkflowEdge): string {
    const src = this.nodes().find(n => n.id === edge.source);
    const tgt = this.nodes().find(n => n.id === edge.target);
    if (!src || !tgt) return '';

    const p1 = this.getOutPoint(src, edge.data?.variant);
    const p2 = this.getInPoint(tgt);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const cp = Math.max(50, Math.abs(dx) * 0.5);

    // Контрольные точки с учётом вертикального смещения
    const cx1 = p1.x + cp;
    const cy1 = p1.y + dy * 0.1;
    const cx2 = p2.x - cp;
    const cy2 = p2.y - dy * 0.1;

    // Размер стрелки
    const arrowLen = 10;
    const arrowWidth = 5;

    // Касательная: направление из точки на кривой (t≈0.9) к конечной точке
    // Для t=0.9 на кубической Безье: B(t) = (1-t)³P0 + 3(1-t)²tC1 + 3(1-t)t²C2 + t³P1
    const t = 0.85;
    const mt = 1 - t;
    const nearEndX = mt*mt*mt*p1.x + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*p2.x;
    const nearEndY = mt*mt*mt*p1.y + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*p2.y;

    const tangentX = p2.x - nearEndX;
    const tangentY = p2.y - nearEndY;
    const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1;
    const normX = tangentX / len;
    const normY = tangentY / len;

    // Перпендикуляр
    const perpX = -normY;
    const perpY = normX;

    // Точки крыльев стрелки
    const backX = p2.x - normX * arrowLen;
    const backY = p2.y - normY * arrowLen;

    const wing1X = backX + perpX * arrowWidth;
    const wing1Y = backY + perpY * arrowWidth;
    const wing2X = backX - perpX * arrowWidth;
    const wing2Y = backY - perpY * arrowWidth;

    // Кривая + стрелка
    return `M${p1.x},${p1.y} C${cx1},${cy1} ${cx2},${cy2} ${p2.x},${p2.y} L${wing1X},${wing1Y} M${p2.x},${p2.y} L${wing2X},${wing2Y}`;
  }

  calcLabelPos(edge: WorkflowEdge): { x: number; y: number } {
    const src = this.nodes().find(n => n.id === edge.source);
    const tgt = this.nodes().find(n => n.id === edge.target);
    if (!src || !tgt) return { x: 0, y: 0 };

    const p1 = this.getOutPoint(src, edge.data?.variant);
    const p2 = this.getInPoint(tgt);

    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2 - 8
    };
  }

  tempPath(): string {
    if (!this.drawSource) return '';

    const mouse = this.mousePos();
    let start: { x: number; y: number };

    if (this.drawType === 'source') {
      start = this.getOutPoint(this.drawSource, this.drawVariant);
    } else {
      start = this.getInPoint(this.drawSource);
    }

    const dx = Math.abs(mouse.x - start.x);
    const cp = Math.max(30, dx * 0.4);

    if (this.drawType === 'source') {
      return `M${start.x},${start.y} C${start.x + cp},${start.y} ${mouse.x - cp},${mouse.y} ${mouse.x},${mouse.y}`;
    } else {
      return `M${start.x},${start.y} C${start.x - cp},${start.y} ${mouse.x + cp},${mouse.y} ${mouse.x},${mouse.y}`;
    }
  }

  // === Обработчики событий ===

  // Конвертация координат viewport -> canvas
  private viewToCanvas(viewX: number, viewY: number): { x: number; y: number } {
    return {
      x: (viewX - this.panX()) / this.zoom(),
      y: (viewY - this.panY()) / this.zoom()
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    // Panning
    if (this.isPanning()) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.panX.set(this.panStartOffset.x + dx);
      this.panY.set(this.panStartOffset.y + dy);
      return;
    }

    const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const viewX = e.clientX - rect.left;
    const viewY = e.clientY - rect.top;
    const canvas = this.viewToCanvas(viewX, viewY);

    // Перетаскивание ноды
    if (this.dragNode) {
      this.ws.updateNodePosition(this.dragNode.id, {
        x: canvas.x - this.dragOffset.x,
        y: canvas.y - this.dragOffset.y
      });
    }

    // Рисование связи
    if (this.isDrawing()) {
      this.mousePos.set({ x: canvas.x, y: canvas.y });

      const targetNode = this.findNodeAt(canvas.x, canvas.y);
      if (targetNode && targetNode.id !== this.drawSource?.id) {
        this.dropTargetNodeId.set(targetNode.id);
      } else {
        this.dropTargetNodeId.set(null);
      }
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(e: MouseEvent) {
    if (this.isPanning()) {
      this.isPanning.set(false);
      return;
    }

    console.log('[DEBUG mouseup]', { isDrawing: this.isDrawing(), drawSource: this.drawSource?.id, clientX: e.clientX, clientY: e.clientY });
    if (this.isDrawing() && this.drawSource) {
      const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
      if (rect) {
        const viewX = e.clientX - rect.left;
        const viewY = e.clientY - rect.top;
        const canvas = this.viewToCanvas(viewX, viewY);

        const target = this.findNodeAt(canvas.x, canvas.y);
        console.log('[DEBUG mouseup detail]', { viewX, viewY, canvasX: canvas.x, canvasY: canvas.y, targetId: target?.id, targetKind: target?.data.kind, drawSourceId: this.drawSource.id, panX: this.panX(), panY: this.panY(), zoom: this.zoom() });

        if (target && target.id !== this.drawSource.id) {
          // Determine which node would be the edge target (incoming side)
          const incoming = this.drawType === 'source' ? target : this.drawSource;
          if (incoming.data.kind === 'trigger') {
            this.ws.log('Trigger не может принимать входящие связи');
          } else {
            const exists = this.edges().some(ed =>
              (ed.source === this.drawSource!.id && ed.target === target.id) ||
              (ed.source === target.id && ed.target === this.drawSource!.id)
            );

            if (!exists) {
              if (this.drawType === 'source') {
                this.ws.addEdge(this.drawSource.id, target.id, undefined, this.drawVariant ?? undefined);
              } else {
                this.ws.addEdge(target.id, this.drawSource.id, undefined, undefined);
              }
              this.ws.log(`Связь: ${this.drawSource.data.label} → ${target.data.label}`);
            }
          }
        }
      }
    }

    this.dragNode = null;
    this.isDrawing.set(false);
    this.drawSource = null;
    this.drawVariant = null;
    this.dropTargetNodeId.set(null);
  }

  private findNodeAt(x: number, y: number): WorkflowNode | null {
    // Ищем с конца (верхние ноды)
    for (let i = this.nodes().length - 1; i >= 0; i--) {
      const n = this.nodes()[i];
      const h = this.getNodeHeight(n);
      // Расширяем зону на размер хендлов (слева и справа)
      const left = n.position.x - this.HANDLE_RADIUS;
      const right = n.position.x + this.NODE_W + this.HANDLE_RADIUS;
      const top = n.position.y;
      const bottom = n.position.y + h;

      if (x >= left && x <= right && y >= top && y <= bottom) {
        return n;
      }
    }
    return null;
  }

  // === Действия пользователя ===

  onCanvasClick() {
    this.selectedEdgeId.set(null);
  }

  selectNode(e: Event, id: string) {
    e.stopPropagation();
    this.nodeSelected.emit(id);
    this.ws.setActiveNode(id);
    this.selectedEdgeId.set(null);
  }

  selectEdge(e: Event, id: string) {
    e.stopPropagation();
    this.selectedEdgeId.set(id);
  }

  deleteSelectedEdge() {
    const id = this.selectedEdgeId();
    if (id) {
      this.ws.removeEdge(id);
      this.ws.log('Связь удалена');
      this.selectedEdgeId.set(null);
    }
  }

  startDragNode(e: MouseEvent, node: WorkflowNode) {
    if (this.readOnly()) return;
    if ((e.target as HTMLElement).classList.contains('handle')) return;

    e.preventDefault();
    this.dragNode = node;

    const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
    if (rect) {
      const viewX = e.clientX - rect.left;
      const viewY = e.clientY - rect.top;
      const canvas = this.viewToCanvas(viewX, viewY);
      this.dragOffset = {
        x: canvas.x - node.position.x,
        y: canvas.y - node.position.y
      };
    }
  }

  startDrawEdge(e: MouseEvent, node: WorkflowNode, type: 'source' | 'target', variant?: string) {
    if (this.readOnly()) return;
    e.preventDefault();
    e.stopPropagation();

    console.log('[DEBUG startDrawEdge]', { nodeId: node.id, kind: node.data.kind, type, variant, clientX: e.clientX, clientY: e.clientY });
    this.isDrawing.set(true);
    this.drawSource = node;
    this.drawType = type;
    this.drawVariant = variant ?? null;

    const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
    if (rect) {
      const viewX = e.clientX - rect.left;
      const viewY = e.clientY - rect.top;
      const canvas = this.viewToCanvas(viewX, viewY);
      this.mousePos.set({ x: canvas.x, y: canvas.y });
    }
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    if (this.readOnly()) return;
    const raw = e.dataTransfer?.getData('application/workflow-node');
    if (!raw) return;

    const [kindStr, subtype] = raw.split(':');
    const kind = kindStr as NodeKind;
    if (!kind) return;

    const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const viewX = e.clientX - rect.left;
    const viewY = e.clientY - rect.top;
    const canvas = this.viewToCanvas(viewX, viewY);

    this.ws.addNode(kind, {
      x: canvas.x - this.NODE_W / 2,
      y: canvas.y - this.NODE_H / 2,
    }, subtype);
  }

  /** Обработчик добавления ноды из CanvasEmptyComponent */
  onNodeAdded(type: NodeKind): void {
    // Нода уже добавлена сервисом, можно просто прокрутить к ней
    setTimeout(() => this.centerView(), 100);
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.preventDefault();
  }
}
