import { Injectable } from '@angular/core';
import { WorkflowNode, WorkflowEdge, NodeKind } from '../models/workflow.model';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  fix: string;
}

export interface ValidationResult {
  ready: boolean;
  status: 'ready' | 'warning' | 'error';
  message: string;
  issues: ValidationIssue[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowValidatorService {

  validate(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (nodes.length === 0) {
      issues.push({
        severity: 'error',
        message: 'Граф пуст',
        fix: 'Добавьте хотя бы одну ноду из палитры'
      });
      return this.buildResult(issues);
    }

    const hasTrigger = nodes.some(n => n.data.kind === 'trigger');
    if (!hasTrigger) {
      issues.push({
        severity: 'error',
        message: 'Нет стартовой ноды',
        fix: 'Добавьте ноду типа "Trigger" — с неё начнётся выполнение'
      });
    }

    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id) && nodes.length > 1) {
        issues.push({
          severity: 'warning',
          message: `Нода "${node.data.label}" не подключена`,
          nodeId: node.id,
          fix: 'Соедините эту ноду с другими'
        });
      }
    }

    const hasCycle = this.detectCycle(nodes, edges);
    if (hasCycle) {
      issues.push({
        severity: 'error',
        message: 'Обнаружен цикл в графе',
        fix: 'Удалите связь, создающую цикл'
      });
    }

    if (nodes.length === 1 && hasTrigger) {
      issues.push({
        severity: 'info',
        message: 'В графе только одна нода',
        fix: 'Добавьте ещё ноды для построения пайплайна'
      });
    }

    const abNodes = nodes.filter(n => n.data.kind === 'ab');
    for (const abNode of abNodes) {
      const totalWeight = abNode.data.variants.reduce((sum, v) => sum + v.weight, 0);
      if (totalWeight !== 100 && abNode.data.variants.length > 0) {
        issues.push({
          severity: 'warning',
          message: `Сумма весов A/B не равна 100% (сейчас ${totalWeight}%)`,
          nodeId: abNode.id,
          fix: 'Отрегулируйте веса в настройках ноды'
        });
      }
    }

    const splitNodes = nodes.filter(n => n.data.kind === 'ab');
    for (const split of splitNodes) {
      const cfg = (split.data.config ?? {}) as {
        mode?: string;
        strategy?: string;
        variants?: Array<{ key: string; weight: number }>;
        userIdField?: string;
        stratifyBy?: string;
      };
      const variants = cfg.variants ?? [];
      const variantKeys = new Set(variants.map(v => v.key));
      const outgoing = edges.filter(e => e.source === split.id);

      for (const e of outgoing) {
        if (!e.data?.variant) {
          issues.push({
            severity: 'error',
            message: `Ребро от Split "${split.data.label}" не имеет variant`,
            nodeId: split.id,
            fix: 'Перетащите ребро из конкретной точки variant на Split-ноде',
          });
        } else if (!variantKeys.has(e.data.variant)) {
          issues.push({
            severity: 'error',
            message: `variant "${e.data.variant}" не объявлен в Split "${split.data.label}"`,
            nodeId: split.id,
            fix: 'Добавьте variant с этим key или удалите ребро',
          });
        }
      }

      const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
      if (totalWeight <= 0 && variants.length > 0) {
        issues.push({
          severity: 'error',
          message: `Сумма весов Split "${split.data.label}" должна быть > 0`,
          nodeId: split.id,
          fix: 'Установите ненулевые weight у вариантов',
        });
      }

      const s = cfg.strategy ?? 'random';
      const needsUserId = s === 'hash' || s === 'modulo' || s === 'stratified' || s === 'percentage';
      if (needsUserId && !cfg.userIdField) {
        issues.push({
          severity: 'error',
          message: `Стратегия "${s}" требует userIdField у Split "${split.data.label}"`,
          nodeId: split.id,
          fix: 'Заполните userIdField в инспекторе',
        });
      }
      if (s === 'stratified' && !cfg.stratifyBy) {
        issues.push({
          severity: 'error',
          message: `Стратегия stratified требует stratifyBy у Split "${split.data.label}"`,
          nodeId: split.id,
          fix: 'Заполните stratifyBy в инспекторе',
        });
      }

      const usedKeys = new Set(outgoing.map(e => e.data?.variant).filter((v): v is string => !!v));
      for (const v of variants) {
        if (!usedKeys.has(v.key)) {
          issues.push({
            severity: 'warning',
            message: `Variant "${v.key}" Split "${split.data.label}" без исходящего ребра`,
            nodeId: split.id,
            fix: 'Добавьте ребро от этого variant или удалите его',
          });
        }
      }
    }

    const mergeNodes = nodes.filter(n => n.data.kind === 'join');
    for (const m of mergeNodes) {
      const incoming = edges.filter(e => e.target === m.id).length;
      if (incoming === 1) {
        issues.push({
          severity: 'warning',
          message: `Merge "${m.data.label}" имеет только один вход — эквивалентен passthrough`,
          nodeId: m.id,
          fix: 'Подключите как минимум 2 ветки или удалите Merge',
        });
      }
    }

    return this.buildResult(issues);
  }

  private buildResult(issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    let status: 'ready' | 'warning' | 'error' = 'ready';
    let message = 'Готов к запуску';

    if (errors.length > 0) {
      status = 'error';
      message = `Ошибка: ${errors[0].message}`;
    } else if (warnings.length > 0) {
      status = 'warning';
      message = `Требует внимания: ${warnings[0].message}`;
    }

    return {
      ready: errors.length === 0,
      status,
      message,
      issues
    };
  }

  private detectCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      adjList.set(node.id, []);
    }
    for (const edge of edges) {
      const neighbors = adjList.get(edge.source) || [];
      neighbors.push(edge.target);
      adjList.set(edge.source, neighbors);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          return true;
        }
      }
    }

    return false;
  }

  isReady(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const result = this.validate(nodes, edges);
    return result.ready;
  }

  getStatusIcon(status: 'ready' | 'warning' | 'error'): string {
    switch (status) {
      case 'ready': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
    }
  }

  getStatusColor(status: 'ready' | 'warning' | 'error'): string {
    switch (status) {
      case 'ready': return '#34c97c';
      case 'warning': return '#f5a524';
      case 'error': return '#ef4444';
    }
  }
}
