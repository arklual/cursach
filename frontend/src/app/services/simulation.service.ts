import { Injectable, inject } from '@angular/core';
import { WorkflowService } from './workflow.service';
import {
  WorkflowNode,
  WorkflowEdge,
  NodeMetrics,
  Variant,
  ExperimentVariant
} from '../models/workflow.model';

/**
 * Сценарии симуляции с реалистичными данными
 */
export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  context: string;
  baselineConversion: number;
  expectedUplift: number;
}

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: 'ab-button-test',
    name: 'A/B тест кнопки',
    description: 'Сравнение цвета кнопки "Купить"',
    context: 'Контрольная группа (A) видит зелёную кнопку, тестовая (B) — оранжевую',
    baselineConversion: 0.25,
    expectedUplift: 0.06
  },
  {
    id: 'onboarding-funnel',
    name: 'Воронка онбординга',
    description: 'Анализ потерь на этапах активации',
    context: 'Пользователи проходят: Регистрация → Активация → Первая оплата',
    baselineConversion: 0.26,
    expectedUplift: 0
  },
  {
    id: 'pricing-page',
    name: 'Тест страницы оплаты',
    description: 'Сравнение двух вариантов ценообразования',
    context: 'Вариант A показывает 3 тарифа, вариант B — 2 с выделенным "Популярным"',
    baselineConversion: 0.18,
    expectedUplift: 0.04
  }
];

interface User {
  id: string;
  device: string;
  country: string;
  cohort: string;
  plan: string;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class SimulationService {
  private workflowService = inject(WorkflowService);

  private rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private randomUser(seed: number = 0): User {
    const id = `usr_${Math.abs(Math.sin(seed + Math.random()) * 1e6).toFixed(0)}`;
    return {
      id,
      device: ['ios', 'android', 'web'][Math.floor(Math.random() * 3)],
      country: ['DE', 'BR', 'IN', 'FR'][Math.floor(Math.random() * 4)],
      cohort: `2024-W${Math.ceil(Math.random() * 4)}`,
      plan: ['free', 'pro', 'team'][Math.floor(Math.random() * 3)],
      amount: Number(this.rand(20, 150).toFixed(2)),
    };
  }

  private calcCI(reached: number, converted: number): [number, number] {
    if (!reached) return [0, 0];
    const pHat = converted / reached;
    const variance = (pHat * (1 - pHat)) / reached;
    const margin = 1.96 * Math.sqrt(variance);
    return [Math.max(0, pHat - margin), Math.min(1, pHat + margin)];
  }

  private sumWeights(variants: Variant[]): number {
    return variants.reduce((sum, v) => sum + v.weight, 0);
  }

  private chooseVariant(
    node: WorkflowNode,
    user: User,
    outgoing: WorkflowEdge[]
  ): WorkflowEdge | undefined {
    const variants = node.data.variants;
    const total = this.sumWeights(variants);
    const allocation = variants.map(v => ({
      ...v,
      normalized: v.weight / total,
    }));

    let roll = Math.random();
    if (node.data.randomization === 'hashed') {
      roll = Math.abs(Math.sin(parseInt(user.id.replace(/\D/g, ''), 10) + 1)) % 1;
    }

    let cumulative = 0;
    for (const variant of allocation) {
      cumulative += variant.normalized;
      if (roll <= cumulative) {
        return outgoing.find(edge =>
          (edge.data?.variant || edge.label) === variant.label
        ) || outgoing[0];
      }
    }
    return outgoing[0];
  }

  simulateRun(count: number = 500, mode: string = 'bulk'): void {
    const nodes = this.workflowService.nodes();
    const edges = this.workflowService.edges();

    const nodeMap = new Map<string, WorkflowNode>(
      nodes.map(node => [node.id, structuredClone(node)])
    );
    const adjacency: Record<string, WorkflowEdge[]> = {};

    edges.forEach(edge => {
      if (!adjacency[edge.source]) adjacency[edge.source] = [];
      adjacency[edge.source].push(edge);
    });

    const triggers = nodes.filter(node => node.data.kind === 'trigger');
    const dataset: unknown[] = [];

    const defaultMetrics = (): NodeMetrics => ({
      reached: 0,
      converted: 0,
      pHat: 0,
      variance: 0,
      ci: [0, 0],
      users: [],
      events: [],
    });

    const recordMetric = (nodeId: string, payload: User, variant: string | null): void => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      const metrics = node.data.metrics || defaultMetrics();
      metrics.reached += 1;

      const success = Math.random() < node.data.successProb;
      if (success) metrics.converted += 1;

      const timestamp = new Date().toISOString();
      metrics.users = [
        { user: payload.id, timestamp, payload: payload as unknown as Record<string, unknown>, variant },
        ...(metrics.users || []),
      ].slice(0, 20);

      metrics.events = [
        { event: 'node_reached', node_id: nodeId, variant, timestamp, payload_summary: payload as unknown as Record<string, unknown> },
        ...(metrics.events || []),
      ].slice(0, 200);

      metrics.pHat = metrics.reached ? metrics.converted / metrics.reached : 0;
      metrics.variance = metrics.reached ? (metrics.pHat * (1 - metrics.pHat)) / metrics.reached : 0;
      metrics.ci = this.calcCI(metrics.reached, metrics.converted);

      node.data.metrics = metrics;
      nodeMap.set(nodeId, node);
      dataset.push(metrics.events[0]);
    };

    for (let i = 0; i < count; i++) {
      const user = this.randomUser(i);
      const queue = [...triggers];

      while (queue.length) {
        const node = queue.shift()!;
        recordMetric(node.id, user, null);

        const outgoing = adjacency[node.id] || [];

        if (node.data.kind === 'ab' && outgoing.length) {
          const target = this.chooseVariant(node, user, outgoing);
          if (target) {
            recordMetric(target.target, user, target.data?.variant || target.label || null);
            const nextNode = nodeMap.get(target.target);
            if (nextNode) queue.push(nextNode);
          }
        } else {
          outgoing.forEach(edge => {
            recordMetric(edge.target, user, edge.data?.variant || null);
            const next = nodeMap.get(edge.target);
            if (next) queue.push(next);
          });
        }
      }
    }

    this.workflowService.setNodes([...nodeMap.values()]);
    this.workflowService.log(`Simulated ${count} users (${mode}).`);

    if (mode === 'sample') {
      this.downloadFile(JSON.stringify(dataset.slice(0, 100), null, 2), 'sim_run_events.json');
    }
  }

  testNode(nodeId: string): void {
    const node = this.workflowService.getNodeById(nodeId);
    if (!node) return;

    this.workflowService.updateNodeData(nodeId, data => {
      const metrics = { ...data.metrics };
      metrics.reached += 1;

      const success = Math.random() < data.successProb;
      if (success) metrics.converted += 1;

      const timestamp = new Date().toISOString();
      const userId = this.sampleHash();

      metrics.users = [
        { user: userId, variant: null, timestamp, payload: { plan: 'pro', device: 'ios' } },
        ...metrics.users,
      ].slice(0, 20);

      metrics.events = [
        { event: 'node_reached', node_id: nodeId, timestamp },
        ...metrics.events,
      ].slice(0, 200);

      metrics.pHat = metrics.reached ? metrics.converted / metrics.reached : 0;
      metrics.variance = metrics.reached ? (metrics.pHat * (1 - metrics.pHat)) / metrics.reached : 0;
      metrics.ci = this.calcCI(metrics.reached, metrics.converted);

      return { ...data, metrics };
    });

    this.workflowService.log(`Test node ${nodeId} executed on sample payload`);
  }

  buildExperimentResults(): ExperimentVariant[] {
    const nodes = this.workflowService.nodes();
    const edges = this.workflowService.edges();

    const abNode = nodes.find(node => node.data.kind === 'ab');
    if (!abNode) return [];

    return abNode.data.variants.map(variant => {
      const downstreamEdges = edges.filter(edge =>
        edge.source === abNode.id && (edge.data?.variant || edge.label) === variant.label
      );
      const downstreamNodes = downstreamEdges
        .map(edge => nodes.find(node => node.id === edge.target))
        .filter((n): n is WorkflowNode => n !== undefined);

      const aggregate = downstreamNodes.reduce(
        (acc, node) => {
          acc.reached += node.data.metrics.reached;
          acc.converted += node.data.metrics.converted;
          return acc;
        },
        { reached: 0, converted: 0 }
      );

      const pHat = aggregate.reached ? aggregate.converted / aggregate.reached : 0;
      return { ...variant, reached: aggregate.reached, converted: aggregate.converted, pHat };
    });
  }

  private downloadFile(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private sampleHash(): string {
    return `usr_${Math.abs(Math.sin(Math.random()) * 1e6).toFixed(0)}`;
  }
}
