import { Injectable, signal, computed } from '@angular/core';
import {
  WorkflowNode,
  WorkflowEdge,
  NodeKind,
  NodeTemplate,
  NodeMetrics,
  NodeData,
} from '../models/workflow.model';
import { uuid } from '../core/uuid';

/**
 * UI-уровневая метаинформация о workflow (с UI-only полями status / nodesCount).
 * На бэке хранится только id/name/description/createdAt/updatedAt.
 */
export interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  nodesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Локальное UI-состояние графа открытого в редакторе workflow.
 * CRUD над workflow (list/create/delete/duplicate/save) теперь живёт в WorkflowFacade.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  readonly nodeTemplates: Record<NodeKind, NodeTemplate> = {
    trigger: { label: 'Trigger', color: '#38bdf8', success: 0.2 },
    http: { label: 'HTTP', color: '#f97316', success: 0.35 },
    dataflow: { label: 'Dataflow', color: '#14b8a6', success: 0.25 },
    code: { label: 'Python', color: '#6366f1', success: 0.4 },
    ab: { label: 'A/B Fork', color: '#ec4899', success: 0.0 },
    join: { label: 'Join', color: '#0ea5e9', success: 0.5 },
  };

  private readonly dataflowSubtypeLabels: Record<string, string> = {
    filter: 'Filter',
    map: 'Map',
    reduce: 'Reduce',
    foreach: 'ForEach',
    flatmap: 'FlatMap',
  };

  private readonly codeSubtypeLabels: Record<string, string> = {
    js: 'JavaScript',
  };

  private readonly triggerSubtypeLabels: Record<string, string> = {
    webhook: 'Webhook',
    cron: 'Cron',
    interval: 'Interval',
  };

  private nodesSignal = signal<WorkflowNode[]>([]);
  private edgesSignal = signal<WorkflowEdge[]>([]);
  private activeNodeIdSignal = signal<string | null>(null);
  private logsSignal = signal<string[]>([]);

  readonly nodes = this.nodesSignal.asReadonly();
  readonly edges = this.edgesSignal.asReadonly();
  readonly activeNodeId = this.activeNodeIdSignal.asReadonly();
  readonly logs = this.logsSignal.asReadonly();

  readonly activeNode = computed(() => {
    const id = this.activeNodeIdSignal();
    return this.nodesSignal().find(n => n.id === id) || null;
  });

  private createDefaultMetrics(): NodeMetrics {
    return {
      reached: 0,
      converted: 0,
      pHat: 0,
      variance: 0,
      ci: [0, 0],
      users: [],
      events: [],
    };
  }

  private createNodeData(id: string, type: NodeKind, subtype?: string): NodeData {
    const template = this.nodeTemplates[type];
    let label = template.label;
    if (type === 'dataflow' && subtype) {
      label = this.dataflowSubtypeLabels[subtype] ?? template.label;
    } else if (type === 'code' && subtype) {
      label = this.codeSubtypeLabels[subtype] ?? template.label;
    } else if (type === 'trigger' && subtype) {
      label = this.triggerSubtypeLabels[subtype] ?? template.label;
    }
    const data: NodeData = {
      id,
      kind: type,
      label,
      color: template.color,
      successProb: template.success,
      variants: [],
      randomization: 'simple',
      metrics: this.createDefaultMetrics(),
    };
    if (subtype) {
      data.__subtype = subtype;
    }
    return data;
  }

  makeNode(id: string, type: NodeKind, position: { x: number; y: number }, subtype?: string): WorkflowNode {
    return {
      id,
      type: 'workflowNode',
      position,
      data: this.createNodeData(id, type, subtype),
    };
  }

  setActiveNode(id: string | null): void {
    this.activeNodeIdSignal.set(id);
  }

  addNode(type: NodeKind, position: { x: number; y: number }, subtype?: string): string {
    const suffix = uuid().slice(0, 5);
    const id = subtype ? `${type}-${subtype}-${suffix}` : `${type}-${suffix}`;
    const newNode = this.makeNode(id, type, position, subtype);
    this.nodesSignal.update(nodes => [...nodes, newNode]);
    this.activeNodeIdSignal.set(id);
    this.log(`Добавлена нода ${newNode.data.label}`);
    return id;
  }

  updateNodePosition(id: string, position: { x: number; y: number }): void {
    this.nodesSignal.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, position } : n)
    );
  }

  updateNodeData(id: string, updater: (data: NodeData) => NodeData): void {
    this.nodesSignal.update(nodes =>
      nodes.map(n => n.id === id ? { ...n, data: updater(n.data) } : n)
    );
  }

  addEdge(source: string, target: string, label?: string, variant?: string): void {
    const id = `e-${uuid().slice(0, 5)}`;
    const edge: WorkflowEdge = { id, source, target };
    if (label) edge.label = label;
    if (variant) edge.data = { variant };
    this.edgesSignal.update(edges => [...edges, edge]);
  }

  removeNode(id: string): void {
    this.nodesSignal.update(nodes => nodes.filter(n => n.id !== id));
    this.edgesSignal.update(edges => edges.filter(e => e.source !== id && e.target !== id));
    if (this.activeNodeIdSignal() === id) {
      this.activeNodeIdSignal.set(null);
    }
  }

  removeEdge(id: string): void {
    this.edgesSignal.update(edges => edges.filter(e => e.id !== id));
  }

  log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logsSignal.update(logs => [`[${timestamp}] ${message}`, ...logs].slice(0, 80));
  }

  clearLogs(): void {
    this.logsSignal.set([]);
  }

  setNodes(nodes: WorkflowNode[]): void {
    this.nodesSignal.set(nodes);
  }

  setEdges(edges: WorkflowEdge[]): void {
    this.edgesSignal.set(edges);
  }

  getNodeById(id: string): WorkflowNode | undefined {
    return this.nodesSignal().find(n => n.id === id);
  }
}
