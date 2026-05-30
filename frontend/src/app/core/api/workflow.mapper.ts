import type {
    WorkflowConnection as BackendConnection,
    WorkflowNode as BackendNode,
    WorkflowGraph,
} from './api.models';
import type {
    WorkflowEdge as FrontEdge,
    WorkflowNode as FrontNode,
    NodeKind,
    NodeData,
    NodeMetrics,
    Variant,
} from '../../models/workflow.model';
import { uuid } from '../uuid';

const META_KEYS = ['__variants', '__randomization', '__metrics', '__successProb', '__color', '__subtype', '__originalKind', '__purpose', '__inputsHint'] as const;

const DATAFLOW_SUBTYPES = ['filter', 'map', 'reduce', 'foreach', 'flatmap'] as const;
type DataflowSubtype = typeof DATAFLOW_SUBTYPES[number];

const TRIGGER_SUBTYPES = ['manual', 'webhook', 'cron', 'interval'] as const;
type TriggerSubtype = typeof TRIGGER_SUBTYPES[number];

function defaultMetrics(): NodeMetrics {
    return { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] };
}

function toBackendType(kind: NodeKind, subtype: string | undefined): string {
    if (kind === 'dataflow') {
        const sub = (DATAFLOW_SUBTYPES as readonly string[]).includes(subtype ?? '')
            ? subtype
            : 'filter';
        return `dataflow.${sub}`;
    }
    if (kind === 'code') {
        return subtype === 'js' ? 'javascript' : 'python';
    }
    if (kind === 'http') {
        return 'http';
    }
    if (kind === 'ai') {
        return 'ai';
    }
    if (kind === 'trigger') {
        const sub = (TRIGGER_SUBTYPES as readonly string[]).includes(subtype ?? '')
            ? subtype
            : 'webhook';
        return `trigger.${sub}`;
    }
    if (kind === 'ab') {
        return 'branch.split';
    }
    if (kind === 'join') {
        return 'branch.merge';
    }
    return 'dataflow.foreach';
}

function fromBackendType(type: string | undefined, originalKind?: NodeKind): { kind: NodeKind; subtype?: string } {
    if (type === 'branch.split') {
        return { kind: 'ab' };
    }
    if (type === 'branch.merge') {
        return { kind: 'join' };
    }
    if (type && type.startsWith('trigger.')) {
        const sub = type.substring('trigger.'.length) as TriggerSubtype;
        if ((TRIGGER_SUBTYPES as readonly string[]).includes(sub)) {
            return { kind: 'trigger', subtype: sub };
        }
        return { kind: 'trigger' };
    }
    if (type && type.startsWith('dataflow.')) {
        const sub = type.substring('dataflow.'.length) as DataflowSubtype;
        if (sub === 'foreach' && originalKind && originalKind !== 'dataflow' && originalKind !== 'trigger') {
            return { kind: originalKind };
        }
        if ((DATAFLOW_SUBTYPES as readonly string[]).includes(sub)) {
            return { kind: 'dataflow', subtype: sub };
        }
        return { kind: 'dataflow' };
    }
    if (type === 'python') {
        return { kind: 'code' };
    }
    if (type === 'javascript') {
        return { kind: 'code', subtype: 'js' };
    }
    if (type === 'http') {
        return { kind: 'http' };
    }
    if (type === 'ai') {
        return { kind: 'ai' };
    }
    return { kind: (type ?? 'http') as NodeKind };
}

export function frontNodeToBackend(node: FrontNode): BackendNode {
    const userConfig = node.data.config ?? {};
    const subtype = node.data.__subtype ?? (userConfig['subtype'] as string | undefined);

    const config: Record<string, unknown> = {
        ...userConfig,
        __variants: node.data.variants,
        __randomization: node.data.randomization,
        __metrics: node.data.metrics,
        __successProb: node.data.successProb,
        __color: node.data.color,
        __subtype: subtype,
        __originalKind: node.data.kind,
    };
    if (node.data.purpose) {
        config['__purpose'] = node.data.purpose;
    }
    if (node.data.inputsHint) {
        config['__inputsHint'] = node.data.inputsHint;
    }

    return {
        id: node.id,
        type: toBackendType(node.data.kind, subtype),
        position: node.position,
        data: {
            label: node.data.label,
            config: config as never,
        },
    };
}

export function backendNodeToFront(backend: BackendNode): FrontNode {
    const id = backend.id ?? uuid();
    const data = backend.data ?? {};
    const config = (data.config ?? {}) as Record<string, unknown>;
    const originalKind = config['__originalKind'] as NodeKind | undefined;
    const { kind, subtype } = fromBackendType(backend.type, originalKind);

    const userConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
        if (!k.startsWith('__')) {
            userConfig[k] = v;
        }
    }

    const front: NodeData = {
        id,
        kind,
        label: data.label ?? '',
        color: (config['__color'] as string) ?? '#888888',
        successProb: (config['__successProb'] as number) ?? 0.5,
        variants: (config['__variants'] as Variant[]) ?? [],
        randomization: (config['__randomization'] as NodeData['randomization']) ?? 'simple',
        metrics: (config['__metrics'] as NodeMetrics) ?? defaultMetrics(),
        config: userConfig,
    };
    if (subtype) {
        front.__subtype = subtype;
    }
    const purpose = config['__purpose'];
    if (typeof purpose === 'string' && purpose.length > 0) {
        front.purpose = purpose;
    }
    const inputsHint = config['__inputsHint'];
    if (typeof inputsHint === 'string' && inputsHint.length > 0) {
        front.inputsHint = inputsHint;
    }

    return {
        id,
        type: 'workflowNode',
        position: {
            x: backend.position?.x ?? 0,
            y: backend.position?.y ?? 0,
        },
        data: front,
    };
}

export function frontEdgeToBackend(edge: FrontEdge): BackendConnection {
    return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.data?.variant,
    };
}

export function backendConnectionToFront(conn: BackendConnection): FrontEdge {
    const edge: FrontEdge = {
        id: conn.id,
        source: conn.source,
        target: conn.target,
    };
    if (conn.sourceHandle) {
        edge.label = conn.sourceHandle;
        edge.data = { variant: conn.sourceHandle };
    }
    return edge;
}

export function buildGraphForBackend(
    versionId: string,
    nodes: FrontNode[],
    edges: FrontEdge[],
): WorkflowGraph {
    return {
        versionId,
        nodes: nodes.map(frontNodeToBackend),
        connections: edges.map(frontEdgeToBackend),
    };
}

export function parseGraphFromBackend(graph: WorkflowGraph): { nodes: FrontNode[]; edges: FrontEdge[] } {
    return {
        nodes: (graph.nodes ?? []).map(backendNodeToFront),
        edges: (graph.connections ?? []).map(backendConnectionToFront),
    };
}

export const __META_KEYS = META_KEYS;
