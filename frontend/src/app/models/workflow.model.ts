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

export interface ExperimentConfig {
  primaryMetric: string;
  secondaryMetrics: string;
  period: number;
  minSample: number;
  alpha: number;
  power: number;
  variants: Variant[];
  randomization: 'simple' | 'hashed' | 'stratified';
  seed: string;
}

export interface ExperimentVariant extends Variant {
  reached: number;
  converted: number;
  pHat: number;
}
