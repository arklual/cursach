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

/**
 * Сервис валидации графа workflow
 * Проверяет корректность структуры перед запуском
 */
@Injectable({ providedIn: 'root' })
export class WorkflowValidatorService {
  
  /**
   * Основная проверка графа
   */
  validate(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Проверка 1: Есть ли вообще ноды
    if (nodes.length === 0) {
      issues.push({
        severity: 'error',
        message: 'Граф пуст',
        fix: 'Добавьте хотя бы одну ноду из палитры'
      });
      return this.buildResult(issues);
    }

    // Проверка 2: Есть ли стартовая нода (Trigger)
    const hasTrigger = nodes.some(n => n.data.kind === 'trigger');
    if (!hasTrigger) {
      issues.push({
        severity: 'error',
        message: 'Нет стартовой ноды',
        fix: 'Добавьте ноду типа "Trigger" — с неё начнётся выполнение'
      });
    }

    // Проверка 3: Все ли ноды подключены
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

    // Проверка 4: Нет ли циклических зависимостей
    const hasCycle = this.detectCycle(nodes, edges);
    if (hasCycle) {
      issues.push({
        severity: 'error',
        message: 'Обнаружен цикл в графе',
        fix: 'Удалите связь, создающую цикл'
      });
    }

    // Проверка 5: Предупреждение о малом количестве нод
    if (nodes.length === 1 && hasTrigger) {
      issues.push({
        severity: 'info',
        message: 'В графе только одна нода',
        fix: 'Добавьте ещё ноды для построения пайплайна'
      });
    }

    // Проверка 6: Настройки A/B ноды
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

    return this.buildResult(issues);
  }

  /**
   * Построение результата валидации
   */
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

  /**
   * Обнаружение циклов через DFS
   */
  private detectCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const adjList = new Map<string, string[]>();
    
    // Построение списка смежности
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

  /**
   * Быстрая проверка готовности (без деталей)
   */
  isReady(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const result = this.validate(nodes, edges);
    return result.ready;
  }

  /**
   * Получение статуса для UI
   */
  getStatusIcon(status: 'ready' | 'warning' | 'error'): string {
    switch (status) {
      case 'ready': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
    }
  }

  /**
   * Получение цвета статуса
   */
  getStatusColor(status: 'ready' | 'warning' | 'error'): string {
    switch (status) {
      case 'ready': return '#84cc16';
      case 'warning': return '#fbbf24';
      case 'error': return '#e11d48';
    }
  }
}
