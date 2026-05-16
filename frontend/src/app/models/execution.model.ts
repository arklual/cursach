/**
 * Модели для исполнения workflow - аналог n8n execution data
 */

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting';

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

/**
 * Структура данных в n8n стиле - массив items
 */
export interface ExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
  pairedItem?: {
    item: number;
  };
}

/**
 * Данные исполнения для отдельной ноды
 */
export interface NodeExecutionData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeExecutionStatus;
  startTime?: string;
  endTime?: string;
  duration?: number; // ms
  
  // Входные и выходные данные
  inputData?: ExecutionData[];
  outputData?: ExecutionData[];
  
  // Ошибки
  error?: {
    message: string;
    details?: string;
    stack?: string;
  };
  
  // Мета
  itemsCount?: number;
}

/**
 * Результат исполнения всего workflow
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt?: string;
  stoppedAt?: string;
  duration?: number;
  
  // Данные по нодам
  nodes: NodeExecutionData[];
  
  // Сводка
  totalItems?: number;
  nodesExecuted?: number;
  nodesTotal?: number;
}

/**
 * Прогресс исполнения
 */
export interface ExecutionProgress {
  workflowId: string;
  executionId: string;
  status: ExecutionStatus;
  currentNodeId?: string;
  completedNodes: string[];
  totalNodes: number;
  progress: number; // 0-100
}
