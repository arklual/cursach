// Маппер между фронт-моделями (src/app/models/workflow.model.ts) и бэк-DTO (api.models.ts).
//
// Решение по хранению "лишних" фронт-данных (variants, randomization, metrics):
//   - В бэк-DTO они кладутся в `Node.data.config` как ключи __variants, __randomization, __metrics.
//   - Префикс __ — чтобы не пересекаться с обычной config-нодой (HTTP url, timeout и т. п.).
//   - На обратном пути извлекаются и кладутся в правильные поля фронт-NodeData.

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

const META_KEYS = ['__variants', '__randomization', '__metrics', '__successProb', '__color'] as const;

function defaultMetrics(): NodeMetrics {
    return { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] };
}

export function frontNodeToBackend(node: FrontNode): BackendNode {
    const config: Record<string, unknown> = {
        __variants: node.data.variants,
        __randomization: node.data.randomization,
        __metrics: node.data.metrics,
        __successProb: node.data.successProb,
        __color: node.data.color,
    };

    return {
        id: node.id,
        type: node.data.kind,
        position: node.position,
        data: {
            label: node.data.label,
            // openapi-typescript генерирует `Record<string, never>` для open-ended object — приходится cast'ить.
            config: config as never,
        },
    };
}

export function backendNodeToFront(backend: BackendNode): FrontNode {
    const id = backend.id ?? crypto.randomUUID();
    const kind = (backend.type ?? 'http') as NodeKind;
    const data = backend.data ?? {};
    const config = (data.config ?? {}) as Record<string, unknown>;

    const front: NodeData = {
        id,
        kind,
        label: data.label ?? '',
        color: (config['__color'] as string) ?? '#888888',
        successProb: (config['__successProb'] as number) ?? 0.5,
        variants: (config['__variants'] as Variant[]) ?? [],
        randomization: (config['__randomization'] as NodeData['randomization']) ?? 'simple',
        metrics: (config['__metrics'] as NodeMetrics) ?? defaultMetrics(),
    };

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

// Внешний экспорт ключей — полезно в тестах.
export const __META_KEYS = META_KEYS;
