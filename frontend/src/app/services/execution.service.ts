import { Injectable, signal, computed, inject } from '@angular/core';
import { WorkflowService } from './workflow.service';
import { WorkflowExecution, NodeExecutionData, ExecutionStatus, NodeExecutionStatus, ExecutionData } from '../models/execution.model';
import { Observable, Subject } from 'rxjs';

/**
 * Сервис управления исполнением workflow
 * Аналог n8n execution manager
 */
@Injectable({
  providedIn: 'root'
})
export class ExecutionService {
  private workflowService = inject(WorkflowService);

  // Сигналы состояния исполнения
  private currentExecution = signal<WorkflowExecution | null>(null);
  private isExecuting = signal(false);
  private executionProgress = signal<number>(0);
  private activeNodeId = signal<string | null>(null);

  // Публичные сигналы
  readonly execution = computed(() => this.currentExecution());
  readonly executing = computed(() => this.isExecuting());
  readonly progress = computed(() => this.executionProgress());
  readonly activeNode = computed(() => this.activeNodeId());

  // Статусы по нодам
  private nodeStatuses = signal<Record<string, NodeExecutionStatus>>({});
  readonly nodeStatusesMap = computed(() => this.nodeStatuses());

  // История исполнений
  private executionHistory = signal<WorkflowExecution[]>([]);
  readonly history = computed(() => this.executionHistory());

  // Subject для событий исполнения
  private executionEvents = new Subject<{ type: string; data: unknown }>();
  readonly events$ = this.executionEvents.asObservable();

  /**
   * Запустить исполнение всего workflow
   */
  executeWorkflow(workflowId: string, fromNodeId?: string): Observable<WorkflowExecution> {
    this.isExecuting.set(true);
    this.executionProgress.set(0);
    this.activeNodeId.set(null);
    this.nodeStatuses.set({});

    // Создаём новое исполнение
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}`,
      workflowId,
      status: 'running',
      startedAt: new Date().toISOString(),
      nodes: []
    };

    this.currentExecution.set(execution);
    this.executionEvents.next({ type: 'start', data: execution });

    // Симуляция исполнения (заменить на реальный API вызов)
    this.simulateExecution(workflowId, fromNodeId);

    return new Observable<WorkflowExecution>(observer => {
      observer.next(execution);
      // Подписка будет завершена когда исполнение закончится
    });
  }

  /**
   * Запустить исполнение отдельной ноды
   */
  executeNode(workflowId: string, nodeId: string): Observable<NodeExecutionData> {
    this.activeNodeId.set(nodeId);
    
    const node = this.workflowService.getNodeById(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const nodeExecution: NodeExecutionData = {
      nodeId,
      nodeName: node.data.label,
      nodeType: node.data.kind,
      status: 'running',
      startTime: new Date().toISOString(),
      inputData: [{ json: { test: 'input', timestamp: new Date().toISOString() } }]
    };

    // Обновляем статус
    this.nodeStatuses.set({ ...this.nodeStatuses(), [nodeId]: 'running' });

    // Симуляция выполнения ноды
    setTimeout(() => {
      const success = Math.random() > 0.1;
      
      if (success) {
        this.updateNodeStatus(nodeId, 'success', {
          outputData: [{ 
            json: { 
              result: 'success',
              nodeType: node.data.kind,
              processedAt: new Date().toISOString(),
              data: { value: Math.random() * 100 }
            } 
          }],
          itemsCount: 1,
          duration: 150
        });
      } else {
        this.updateNodeStatus(nodeId, 'error', {
          error: {
            message: 'Simulated error',
            details: `Failed to execute node ${node.data.label}`,
          }
        });
      }
    }, 500);

    return new Observable<NodeExecutionData>(observer => {
      observer.next(nodeExecution);
    });
  }

  /**
   * Остановить исполнение
   */
  stopExecution(): void {
    this.isExecuting.set(false);
    this.activeNodeId.set(null);
    
    const current = this.currentExecution();
    if (current) {
      this.currentExecution.set({
        ...current,
        status: 'error',
        stoppedAt: new Date().toISOString()
      });
    }
    
    this.executionEvents.next({ type: 'stop', data: null });
  }

  /**
   * Получить данные исполнения ноды
   */
  getNodeExecutionData(nodeId: string): NodeExecutionData | null {
    const execution = this.currentExecution();
    if (!execution) return null;
    
    return execution.nodes.find(n => n.nodeId === nodeId) || null;
  }

  /**
   * Очистить данные исполнения
   */
  clearExecution(): void {
    this.currentExecution.set(null);
    this.isExecuting.set(false);
    this.executionProgress.set(0);
    this.activeNodeId.set(null);
    this.nodeStatuses.set({});
  }

  // ============================================================================
  // СИМУЛЯЦИЯ (удалить после реализации бэкенда)
  // ============================================================================

  private simulateExecution(workflowId: string, fromNodeId?: string): void {
    const nodes = this.workflowService.nodes();
    const edges = this.workflowService.edges();

    if (nodes.length === 0) {
      this.finishExecution(true);
      return;
    }

    // Инициализируем статусы нод
    const initialStatuses: Record<string, NodeExecutionStatus> = {};
    nodes.forEach(node => {
      initialStatuses[node.id] = 'pending';
    });
    this.nodeStatuses.set(initialStatuses);

    // Инициализируем ноды исполнения
    const nodeExecutions: NodeExecutionData[] = nodes.map(node => ({
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: node.data.kind,
      status: 'pending' as NodeExecutionStatus
    }));

    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}`,
      workflowId,
      status: 'running',
      startedAt: new Date().toISOString(),
      nodes: nodeExecutions,
      nodesTotal: nodes.length,
      nodesExecuted: 0
    };

    this.currentExecution.set(execution);

    // Симулируем последовательное исполнение
    let currentIndex = 0;
    const executeNext = () => {
      if (currentIndex >= nodes.length || !this.isExecuting()) {
        this.finishExecution();
        return;
      }

      const node = nodes[currentIndex];
      this.activeNodeId.set(node.id);
      this.executionProgress.set(((currentIndex) / nodes.length) * 100);

      // Обновляем статус ноды
      this.updateNodeStatus(node.id, 'running');

      // Симулируем задержку исполнения
      setTimeout(() => {
        const success = Math.random() > 0.1; // 90% успех
        
        if (success) {
          // Генерируем тестовые данные
          const inputData: ExecutionData[] = [{
            json: { 
              source: 'previous_node',
              timestamp: new Date().toISOString(),
              iteration: currentIndex
            }
          }];

          const outputData: ExecutionData[] = [{
            json: {
              result: 'success',
              nodeId: node.id,
              nodeName: node.data.label,
              processedAt: new Date().toISOString(),
              data: {
                value: Math.round(Math.random() * 1000) / 100,
                items: Math.floor(Math.random() * 50) + 1,
                metadata: {
                  processed: true,
                  nodeType: node.data.kind
                }
              }
            }
          }];

          // Для code нод симулируем выполнение кода
          if (node.data.kind === 'code') {
            // Получаем код из config
            const code = (node.data.config?.['code'] as string) || '';
            
            // Симулируем выполнение Python кода и захват вывода
            const pythonOutput = this.simulatePythonExecution(code);
            
            const codeOutput = pythonOutput.success 
              ? `✓ Code executed successfully\n\n${pythonOutput.output}`
              : `✕ Execution failed\n\n${pythonOutput.error}`;

            // Обновляем метрики ноды
            this.workflowService.updateNodeData(node.id, data => ({
              ...data,
              metrics: {
                ...data.metrics,
                lastOutput: codeOutput,
                reached: data.metrics.reached + 1,
                converted: data.metrics.converted + 1
              }
            }));
            
            // Добавляем вывод в outputData
            outputData[0] = {
              json: {
                ...outputData[0].json,
                stdout: pythonOutput.output,
                success: pythonOutput.success
              }
            };
          }

          this.updateNodeStatus(node.id, 'success', {
            inputData,
            outputData,
            itemsCount: outputData.length,
            duration: 150 + Math.random() * 200
          });
        } else {
          this.updateNodeStatus(node.id, 'error', {
            error: {
              message: 'Execution failed',
              details: `Failed to execute node "${node.data.label}" (type: ${node.data.kind})`,
              stack: new Error(`Node execution error at ${node.id}`).stack
            }
          });
          this.finishExecution(true);
          return;
        }

        currentIndex++;
        setTimeout(executeNext, 300);
      }, 800 + Math.random() * 400);
    };

    executeNext();
  }

  private updateNodeStatus(
    nodeId: string,
    status: NodeExecutionStatus,
    data?: Partial<NodeExecutionData>
  ): void {
    // Обновляем карту статусов
    const statuses = { ...this.nodeStatuses() };
    statuses[nodeId] = status;
    this.nodeStatuses.set(statuses);

    // Обновляем текущее исполнение
    const current = this.currentExecution();
    if (!current) return;

    const nodes = current.nodes.map(node => {
      if (node.nodeId === nodeId) {
        return {
          ...node,
          status,
          ...data,
          endTime: status !== 'running' && status !== 'pending' ? new Date().toISOString() : undefined,
          duration: data?.duration || (status !== 'running' && status !== 'pending' ? 
            Date.now() - new Date(node.startTime || Date.now()).getTime() : undefined)
        };
      }
      return node;
    });

    const executedCount = nodes.filter(n => n.status === 'success' || n.status === 'error').length;

    this.currentExecution.set({
      ...current,
      nodes,
      nodesExecuted: executedCount,
      status: status === 'error' ? 'error' : current.status
    });

    // Событие
    this.executionEvents.next({ 
      type: 'nodeUpdate', 
      data: { nodeId, status, data } 
    });
  }

  private finishExecution(hasError?: boolean): void {
    const current = this.currentExecution();
    if (!current) return;

    this.isExecuting.set(false);
    this.activeNodeId.set(null);
    this.executionProgress.set(100);

    this.currentExecution.set({
      ...current,
      status: hasError ? 'error' : 'success',
      stoppedAt: new Date().toISOString(),
      duration: Date.now() - new Date(current.startedAt || Date.now()).getTime()
    });

    // Добавляем в историю
    this.executionHistory.set([...this.executionHistory(), current]);
    
    this.executionEvents.next({
      type: 'complete',
      data: { success: !hasError, execution: current }
    });
  }

  /**
   * Симуляция выполнения Python кода
   * Извлекает print() statements и возвращает вывод
   */
  private simulatePythonExecution(code: string | undefined): { success: boolean; output: string; error?: string } {
    if (!code || !code.trim()) {
      return {
        success: true,
        output: '(no output)'
      };
    }

    try {
      // Извлекаем все print() statements
      const printStatements = code.match(/print\s*\(\s*['"`](.*?)['"`]\s*\)/g);
      
      if (printStatements && printStatements.length > 0) {
        const outputs = printStatements.map(stmt => {
          const match = stmt.match(/print\s*\(\s*['"`](.*?)['"`]\s*\)/);
          return match ? match[1] : '';
        }).filter(Boolean);
        
        return {
          success: true,
          output: outputs.join('\n')
        };
      }

      // Если нет print(), но код есть
      if (code.trim()) {
        return {
          success: true,
          output: `> Code executed (no print statements detected)\n> Lines: ${code.split('\n').length}`
        };
      }

      return {
        success: true,
        output: '(no output)'
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
