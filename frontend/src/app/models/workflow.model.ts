export interface Variant {
  label: string;
  weight: number;
}

export interface UserEntry {
  user: string;
  variant: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface EventEntry {
  event: string;
  node_id: string;
  variant?: string | null;
  timestamp: string;
  payload_summary?: Record<string, unknown>;
}

export interface NodeMetrics {
  reached: number;
  converted: number;
  pHat: number;
  variance: number;
  ci: [number, number];
  users: UserEntry[];
  events: EventEntry[];
  /** Последний результат выполнения кода (для code нод) */
  lastOutput?: string;
}

export interface NodeData {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  successProb: number;
  variants: Variant[];
  randomization: 'simple' | 'hashed' | 'stratified';
  metrics: NodeMetrics;
  /**
   * Произвольный JSON-конфиг для бэкенд-executor'а:
   *   http: { url, method, headers, body, timeoutMs }
   *   dataflow.filter: { field, op, value }
   *   dataflow.map: { select | rename | wrap }
   *   dataflow.reduce / flatmap: { op?, field? }
   *   code: { image?, code, timeoutMs?, memoryMb? }
   * Mapper кладёт это в node.data.config на бэке.
   */
  config?: Record<string, unknown>;
  /** Служебное: подтип dataflow-ноды (filter/map/reduce/foreach/flatmap). */
  __subtype?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  selected?: boolean;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { variant?: string };
}

export type NodeKind = 'trigger' | 'http' | 'dataflow' | 'code' | 'ab' | 'join';

export interface NodeTemplate {
  label: string;
  color: string;
  success: number;
}
