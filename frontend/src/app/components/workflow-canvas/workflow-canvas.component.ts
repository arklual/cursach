import { Component, input, output, inject, ElementRef, viewChild, signal, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowNode, WorkflowEdge, NodeKind } from '../../models/workflow.model';

@Component({
  selector: 'app-workflow-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="canvas-wrapper">
      <div class="canvas-toolbar">
        <button (click)="openAbConfig.emit()">A/B Test Config</button>
        <button (click)="replayRun.emit()">Replay run</button>
        <button (click)="centerView()">Center view</button>
        <button (click)="resetView()">Reset</button>
        <span class="zoom-info">{{ (zoom() * 100).toFixed(0) }}%</span>
        <span class="hint">⌘+Scroll = zoom, Drag = pan</span>
      </div>
      <div class="canvas-viewport"
           #canvasArea
           (mousedown)="onViewportMouseDown($event)"
           (wheel)="onWheel($event)"
           (drop)="onDrop($event)"
           (dragover)="onDragOver($event)">

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
                      fill="none"/>
                @if (edge.label) {
                  <text [attr.x]="calcLabelPos(edge).x"
                        [attr.y]="calcLabelPos(edge).y"
                        class="edge-text">{{ edge.label }}</text>
                }
              </g>
            }

            @if (isDrawing()) {
              <path [attr.d]="tempPath()" class="edge-temp" fill="none"/>
            }
          </svg>

          <!-- Кнопка удаления на выбранной стрелке -->
          @if (selectedEdgeId(); as edgeId) {
            <button class="edge-delete-btn"
                    [style.left.px]="getDeleteBtnPos(edgeId).x"
                    [style.top.px]="getDeleteBtnPos(edgeId).y"
                    (click)="deleteEdge(edgeId); $event.stopPropagation()">
              🗑
            </button>
          }

          <!-- Ноды -->
          @for (node of nodes(); track node.id) {
            <div class="node-wrap"
                 [style.left.px]="node.position.x"
                 [style.top.px]="node.position.y"
                 [class.selected]="node.id === activeNodeId()"
                 [class.drop-target]="isDrawing() && dropTargetNodeId() === node.id"
                 (mousedown)="startDragNode($event, node)"
                 (click)="selectNode($event, node.id)"
                 (dblclick)="openAnalytics.emit(node.id)">

              <div class="handle handle-in"
                   (mousedown)="startDrawEdge($event, node, 'target')"></div>

              <div class="node-content" [style.borderColor]="node.data.color + '55'">
                <div class="node-header" [style.background]="node.data.color + '20'">
                  <span>{{ node.data.label }}</span>
                  <div class="node-actions">
                    <button (click)="openAnalytics.emit(node.id); $event.stopPropagation()">📊</button>
                    <button (click)="testNode.emit(node.id); $event.stopPropagation()">⚙</button>
                  </div>
                </div>
                <div class="node-body">
                  <div class="metric"><span>Reached</span><b>{{ node.data.metrics.reached }}</b></div>
                  <div class="metric"><span>Converted</span><b>{{ node.data.metrics.converted }}</b></div>
                  <div class="metric"><span>p̂</span><b>{{ node.data.metrics.pHat.toFixed(2) }}</b></div>
                  <div class="metric"><span>CI95%</span><b>{{ node.data.metrics.ci[0].toFixed(2) }}–{{ node.data.metrics.ci[1].toFixed(2) }}</b></div>
                  @if (node.data.kind === 'ab') {
                    <div class="variant-badge">
                      {{ formatVariants(node.data.variants) }}
                    </div>
                  }
                </div>
              </div>

              <div class="handle handle-out"
                   (mousedown)="startDrawEdge($event, node, 'source')"></div>
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
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      min-height: 0;
    }

    .canvas-toolbar {
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .canvas-toolbar button {
      padding: 6px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 13px;
    }

    .canvas-toolbar button:hover {
      background: #f1f5f9;
    }

    .hint {
      color: #64748b;
      font-size: 12px;
      margin-left: auto;
    }

    .zoom-info {
      background: #e2e8f0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .canvas-viewport {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 0;
      cursor: grab;
      background:
        linear-gradient(90deg, #e2e8f0 1px, transparent 1px),
        linear-gradient(#e2e8f0 1px, transparent 1px);
      background-size: 20px 20px;
      background-color: #f8fafc;
    }

    .canvas-viewport:active {
      cursor: grabbing;
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
      stroke: #94a3b8;
      stroke-width: 2;
      transition: stroke 0.15s, stroke-width 0.15s;
    }

    .edge-line.hovered {
      stroke: #6366f1;
      stroke-width: 2.5;
    }

    .edge-line.selected {
      stroke: #ef4444;
      stroke-width: 3;
    }

    .edge-temp {
      stroke: #6366f1;
      stroke-width: 2;
      stroke-dasharray: 6 4;
    }

    .edge-text {
      font-size: 11px;
      fill: #475569;
      pointer-events: none;
    }

    .edge-delete-btn {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid #ef4444;
      background: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      z-index: 50;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .edge-delete-btn:hover {
      background: #fee2e2;
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
      box-shadow: 0 0 0 2px #6366f1;
    }

    .node-wrap.drop-target {
      transform: scale(1.08);
      transition: transform 0.15s ease-out;
    }

    .node-wrap.drop-target .node-content {
      box-shadow: 0 0 0 3px #22c55e, 0 8px 24px rgba(34, 197, 94, 0.25);
    }

    .node-content {
      width: 200px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .node-header {
      padding: 8px 10px;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .node-actions {
      display: flex;
      gap: 4px;
    }

    .node-actions button {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 2px;
      font-size: 14px;
      opacity: 0.7;
    }

    .node-actions button:hover {
      opacity: 1;
    }

    .node-body {
      padding: 8px 10px;
      font-size: 12px;
    }

    .metric {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      color: #64748b;
    }

    .metric b {
      color: #1e293b;
    }

    .variant-badge {
      margin-top: 6px;
      padding: 3px 6px;
      background: #dcfce7;
      color: #16a34a;
      border-radius: 4px;
      font-size: 11px;
      text-align: center;
    }

    .handle {
      position: absolute;
      width: 14px;
      height: 14px;
      background: #6366f1;
      border: 2px solid #fff;
      border-radius: 50%;
      top: 50%;
      transform: translateY(-50%);
      cursor: crosshair;
      z-index: 10;
      transition: transform 0.15s, background 0.15s;
    }

    .handle:hover {
      transform: translateY(-50%) scale(1.3);
      background: #4f46e5;
    }

    .handle-in {
      left: -7px;
    }

    .handle-out {
      right: -7px;
    }

    .info-panel {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(255,255,255,0.9);
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #64748b;
      z-index: 100;
    }
  `]
})
export class WorkflowCanvasComponent implements AfterViewInit {
  private ws = inject(WorkflowService);

  nodes = input.required<WorkflowNode[]>();
  edges = input.required<WorkflowEdge[]>();
  activeNodeId = input<string | null>(null);

  openAnalytics = output<string>();
  testNode = output<string>();
  nodeSelected = output<string>();
  openAbConfig = output<void>();
  replayRun = output<void>();

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
  private mousePos = signal({ x: 0, y: 0 });

  // Константы размеров ноды
  private readonly NODE_W = 200;
  private readonly NODE_H = 130; // Базовая высота
  private readonly NODE_H_AB = 155; // Высота A/B Fork (с бейджем вариантов)
  private readonly HANDLE_RADIUS = 14; // Радиус хендла для расширения зоны попадания

  private getNodeHeight(node: WorkflowNode): number {
    return node.data.kind === 'ab' ? this.NODE_H_AB : this.NODE_H;
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
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.3, Math.min(2, this.zoom() * delta));
    this.zoom.set(newZoom);
  }

  onViewportMouseDown(e: MouseEvent): void {
    // ЛКМ - начинаем pan (если не кликнули на ноду или другой интерактивный элемент)
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      // Не начинаем pan если клик на ноде, кнопке или хендле
      if (target.closest('.node-wrap') || target.closest('button') || target.closest('.handle')) {
        return;
      }
      e.preventDefault();
      this.isPanning.set(true);
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panStartOffset = { x: this.panX(), y: this.panY() };
    }
  }

  formatVariants(variants: { label: string; weight: number }[]): string {
    return variants.map(v => `${v.label}:${v.weight}%`).join(' | ');
  }

  getMarker(edgeId: string): string {
    if (edgeId === this.selectedEdgeId()) return 'url(#arrowhead-selected)';
    if (edgeId === this.hoveredEdgeId()) return 'url(#arrowhead-hover)';
    return 'url(#arrowhead)';
  }

  getDeleteBtnPos(edgeId: string): { x: number; y: number } {
    const edge = this.edges().find(e => e.id === edgeId);
    if (!edge) return { x: 0, y: 0 };
    return this.calcLabelPos(edge);
  }

  deleteEdge(edgeId: string): void {
    this.ws.removeEdge(edgeId);
    this.ws.log('Связь удалена');
    this.selectedEdgeId.set(null);
  }

  // === Расчёт координат для стрелок ===

  private getNodeCenter(node: WorkflowNode): { x: number; y: number } {
    const h = this.getNodeHeight(node);
    return {
      x: node.position.x + this.NODE_W / 2,
      y: node.position.y + h / 2
    };
  }

  private getOutPoint(node: WorkflowNode): { x: number; y: number } {
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

  calcPath(edge: WorkflowEdge): string {
    const src = this.nodes().find(n => n.id === edge.source);
    const tgt = this.nodes().find(n => n.id === edge.target);
    if (!src || !tgt) return '';

    const p1 = this.getOutPoint(src);
    const p2 = this.getInPoint(tgt);

    const dx = Math.abs(p2.x - p1.x);
    const cp = Math.max(50, dx * 0.5);

    return `M${p1.x},${p1.y} C${p1.x + cp},${p1.y} ${p2.x - cp},${p2.y} ${p2.x},${p2.y}`;
  }

  calcPathWithArrow(edge: WorkflowEdge): string {
    const src = this.nodes().find(n => n.id === edge.source);
    const tgt = this.nodes().find(n => n.id === edge.target);
    if (!src || !tgt) return '';

    const p1 = this.getOutPoint(src);
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

    const p1 = this.getOutPoint(src);
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
      start = this.getOutPoint(this.drawSource);
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

    if (this.isDrawing() && this.drawSource) {
      const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
      if (rect) {
        const viewX = e.clientX - rect.left;
        const viewY = e.clientY - rect.top;
        const canvas = this.viewToCanvas(viewX, viewY);

        const target = this.findNodeAt(canvas.x, canvas.y);

        if (target && target.id !== this.drawSource.id) {
          const exists = this.edges().some(ed =>
            (ed.source === this.drawSource!.id && ed.target === target.id) ||
            (ed.source === target.id && ed.target === this.drawSource!.id)
          );

          if (!exists) {
            if (this.drawType === 'source') {
              this.ws.addEdge(this.drawSource.id, target.id);
            } else {
              this.ws.addEdge(target.id, this.drawSource.id);
            }
            this.ws.log(`Связь: ${this.drawSource.data.label} → ${target.data.label}`);
          }
        }
      }
    }

    this.dragNode = null;
    this.isDrawing.set(false);
    this.drawSource = null;
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

  startDrawEdge(e: MouseEvent, node: WorkflowNode, type: 'source' | 'target') {
    e.preventDefault();
    e.stopPropagation();

    this.isDrawing.set(true);
    this.drawSource = node;
    this.drawType = type;

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
    const type = e.dataTransfer?.getData('application/workflow-node') as NodeKind;
    if (!type) return;

    const rect = this.canvasArea()?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const viewX = e.clientX - rect.left;
    const viewY = e.clientY - rect.top;
    const canvas = this.viewToCanvas(viewX, viewY);

    this.ws.addNode(type, {
      x: canvas.x - this.NODE_W / 2,
      y: canvas.y - this.NODE_H / 2
    });
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.preventDefault();
  }
}
