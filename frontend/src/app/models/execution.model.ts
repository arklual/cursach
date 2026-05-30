export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting';

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface ExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
  pairedItem?: {
    item: number;
  };
}

export interface NodeExecutionData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeExecutionStatus;
  startTime?: string;
  endTime?: string;
  duration?: number;

  inputData?: ExecutionData[];
  outputData?: ExecutionData[];

  error?: {
    message: string;
    details?: string;
    stack?: string;
  };

  itemsCount?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt?: string;
  stoppedAt?: string;
  duration?: number;

  nodes: NodeExecutionData[];

  totalItems?: number;
  nodesExecuted?: number;
  nodesTotal?: number;
}

export interface ExecutionProgress {
  workflowId: string;
  executionId: string;
  status: ExecutionStatus;
  currentNodeId?: string;
  completedNodes: string[];
  totalNodes: number;
  progress: number;
}
