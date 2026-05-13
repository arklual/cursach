import { Injectable, signal, computed } from '@angular/core';
import {
  WorkflowNode,
  WorkflowEdge,
  NodeKind,
  NodeTemplate,
  NodeMetrics,
  NodeData,
  Variant,
  ExperimentConfig,
  ExperimentVariant
} from '../models/workflow.model';

export interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  nodesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowData {
  meta: WorkflowMeta;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly STORAGE_KEY = 'fluxpilot_workflows';
  private currentWorkflowId = signal<string | null>(null);
  readonly nodeTemplates: Record<NodeKind, NodeTemplate> = {
    trigger: { label: 'Trigger', color: '#38bdf8', success: 0.2 },
    http: { label: 'HTTP', color: '#f97316', success: 0.35 },
    dataflow: { label: 'Dataflow', color: '#14b8a6', success: 0.25 },
    code: { label: 'Code (Python)', color: '#6366f1', success: 0.4 },
    ab: { label: 'A/B Fork', color: '#ec4899', success: 0.0 },
    join: { label: 'Join', color: '#0ea5e9', success: 0.5 },
  };

  private readonly defaultVariants: Variant[] = [
    { label: 'A', weight: 50 },
    { label: 'B', weight: 50 },
  ];

  private nodesSignal = signal<WorkflowNode[]>([]);
  private edgesSignal = signal<WorkflowEdge[]>([]);
  private activeNodeIdSignal = signal<string | null>(null);
  private logsSignal = signal<string[]>([]);
  private workflowsSignal = signal<WorkflowMeta[]>(this.loadWorkflowsFromStorage());

  readonly nodes = this.nodesSignal.asReadonly();
  readonly edges = this.edgesSignal.asReadonly();
  readonly activeNodeId = this.activeNodeIdSignal.asReadonly();
  readonly logs = this.logsSignal.asReadonly();
  readonly workflows = this.workflowsSignal.asReadonly();

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

  private createNodeData(id: string, type: NodeKind): NodeData {
    const template = this.nodeTemplates[type];
    return {
      id,
      kind: type,
      label: template.label,
      color: template.color,
      successProb: template.success,
      variants: type === 'ab' ? JSON.parse(JSON.stringify(this.defaultVariants)) : [],
      randomization: 'simple',
      metrics: this.createDefaultMetrics(),
    };
  }

  makeNode(id: string, type: NodeKind, position: { x: number; y: number }): WorkflowNode {
    return {
      id,
      type: 'workflowNode',
      position,
      data: this.createNodeData(id, type),
    };
  }

  private createInitialNodes(): WorkflowNode[] {
    const nodes = [
      this.makeNode('trigger-1', 'trigger', { x: 60, y: 80 }),
      this.makeNode('ab-1', 'ab', { x: 320, y: 100 }),
      this.makeNode('http-1', 'http', { x: 600, y: 40 }),
      this.makeNode('code-1', 'code', { x: 600, y: 220 }),
      this.makeNode('join-1', 'join', { x: 880, y: 140 }),
    ];
    nodes[1].data.label = 'A/B Fork Checkout';
    nodes[2].data.label = 'Variant A HTTP';
    nodes[3].data.label = 'Variant B Code';
    nodes[4].data.label = 'Join analytics';
    return nodes;
  }

  private createInitialEdges(): WorkflowEdge[] {
    return [
      { id: 'e1', source: 'trigger-1', target: 'ab-1' },
      { id: 'e2', source: 'ab-1', target: 'http-1', label: 'A', data: { variant: 'A' } },
      { id: 'e3', source: 'ab-1', target: 'code-1', label: 'B', data: { variant: 'B' } },
      { id: 'e4', source: 'http-1', target: 'join-1' },
      { id: 'e5', source: 'code-1', target: 'join-1' },
    ];
  }

  setActiveNode(id: string | null): void {
    this.activeNodeIdSignal.set(id);
  }

  addNode(type: NodeKind, position: { x: number; y: number }): string {
    const id = `${type}-${crypto.randomUUID().slice(0, 5)}`;
    const newNode = this.makeNode(id, type, position);
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
    const id = `e-${crypto.randomUUID().slice(0, 5)}`;
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

  getNodeById(id: string): WorkflowNode | undefined {
    return this.nodesSignal().find(n => n.id === id);
  }

  // ==================== Workflow Management ====================

  private loadWorkflowsFromStorage(): WorkflowMeta[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      const workflows: WorkflowData[] = JSON.parse(data);
      return workflows.map(w => ({
        ...w.meta,
        createdAt: new Date(w.meta.createdAt),
        updatedAt: new Date(w.meta.updatedAt)
      }));
    } catch {
      return [];
    }
  }

  private loadAllWorkflowsData(): WorkflowData[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveAllWorkflowsData(workflows: WorkflowData[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(workflows));
    this.workflowsSignal.set(workflows.map(w => ({
      ...w.meta,
      createdAt: new Date(w.meta.createdAt),
      updatedAt: new Date(w.meta.updatedAt)
    })));
  }

  createNewWorkflow(): string {
    const id = crypto.randomUUID();
    const now = new Date();
    const nodes = this.createInitialNodes();
    const edges = this.createInitialEdges();

    const newWorkflow: WorkflowData = {
      meta: {
        id,
        name: `Workflow ${this.workflowsSignal().length + 1}`,
        description: '',
        status: 'draft',
        nodesCount: nodes.length,
        createdAt: now,
        updatedAt: now
      },
      nodes,
      edges
    };

    const all = this.loadAllWorkflowsData();
    all.push(newWorkflow);
    this.saveAllWorkflowsData(all);

    return id;
  }

  loadWorkflow(id: string): boolean {
    const all = this.loadAllWorkflowsData();
    const workflow = all.find(w => w.meta.id === id);

    if (!workflow) return false;

    this.currentWorkflowId.set(id);
    this.nodesSignal.set(workflow.nodes);
    this.edgesSignal.set(workflow.edges);
    this.activeNodeIdSignal.set(workflow.nodes[0]?.id || null);
    this.logsSignal.set([]);
    this.log(`Загружен workflow: ${workflow.meta.name}`);
    return true;
  }

  saveCurrentWorkflow(): void {
    const id = this.currentWorkflowId();
    if (!id) return;

    const all = this.loadAllWorkflowsData();
    const index = all.findIndex(w => w.meta.id === id);
    if (index === -1) return;

    all[index].nodes = this.nodesSignal();
    all[index].edges = this.edgesSignal();
    all[index].meta.nodesCount = this.nodesSignal().length;
    all[index].meta.updatedAt = new Date();

    this.saveAllWorkflowsData(all);
  }

  updateWorkflowMeta(id: string, updates: Partial<Pick<WorkflowMeta, 'name' | 'description' | 'status'>>): void {
    const all = this.loadAllWorkflowsData();
    const index = all.findIndex(w => w.meta.id === id);
    if (index === -1) return;

    all[index].meta = { ...all[index].meta, ...updates, updatedAt: new Date() };
    this.saveAllWorkflowsData(all);
  }

  duplicateWorkflow(id: string): string | null {
    const all = this.loadAllWorkflowsData();
    const workflow = all.find(w => w.meta.id === id);
    if (!workflow) return null;

    const newId = crypto.randomUUID();
    const now = new Date();

    const duplicate: WorkflowData = {
      meta: {
        ...workflow.meta,
        id: newId,
        name: `${workflow.meta.name} (копия)`,
        status: 'draft',
        createdAt: now,
        updatedAt: now
      },
      nodes: JSON.parse(JSON.stringify(workflow.nodes)),
      edges: JSON.parse(JSON.stringify(workflow.edges))
    };

    all.push(duplicate);
    this.saveAllWorkflowsData(all);
    return newId;
  }

  deleteWorkflow(id: string): boolean {
    const all = this.loadAllWorkflowsData();
    const filtered = all.filter(w => w.meta.id !== id);
    if (filtered.length === all.length) return false;

    this.saveAllWorkflowsData(filtered);

    if (this.currentWorkflowId() === id) {
      this.currentWorkflowId.set(null);
      this.nodesSignal.set([]);
      this.edgesSignal.set([]);
    }
    return true;
  }

  getCurrentWorkflowId(): string | null {
    return this.currentWorkflowId();
  }

  getCurrentWorkflowMeta(): WorkflowMeta | null {
    const id = this.currentWorkflowId();
    if (!id) return null;
    return this.workflowsSignal().find(w => w.id === id) || null;
  }
}
