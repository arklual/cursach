import {
    backendConnectionToFront,
    backendNodeToFront,
    buildGraphForBackend,
    frontEdgeToBackend,
    frontNodeToBackend,
    parseGraphFromBackend,
} from './workflow.mapper';
import type { WorkflowNode as FrontNode, WorkflowEdge as FrontEdge } from '../../models/workflow.model';

function sampleFrontNode(): FrontNode {
    return {
        id: 'node-1',
        type: 'workflowNode',
        position: { x: 100, y: 200 },
        data: {
            id: 'node-1',
            kind: 'http',
            label: 'HTTP test',
            color: '#f97316',
            successProb: 0.35,
            variants: [{ label: 'A', weight: 50 }],
            randomization: 'hashed',
            metrics: { reached: 10, converted: 3, pHat: 0.3, variance: 0.02, ci: [0.1, 0.5], users: [], events: [] },
        },
    };
}

describe('workflow.mapper', () => {
    describe('frontNodeToBackend / backendNodeToFront — round-trip', () => {
        it('сохраняет id, position, label, kind, successProb, variants, randomization, metrics', () => {
            const original = sampleFrontNode();

            const backend = frontNodeToBackend(original);
            expect(backend.id).toBe(original.id);
            expect(backend.type).toBe('http');
            expect(backend.position).toEqual(original.position);
            expect(backend.data?.label).toBe('HTTP test');

            const roundTripped = backendNodeToFront(backend);
            expect(roundTripped.id).toBe(original.id);
            expect(roundTripped.position).toEqual(original.position);
            expect(roundTripped.data.kind).toBe('http');
            expect(roundTripped.data.label).toBe('HTTP test');
            expect(roundTripped.data.successProb).toBe(0.35);
            expect(roundTripped.data.randomization).toBe('hashed');
            expect(roundTripped.data.variants).toEqual([{ label: 'A', weight: 50 }]);
            expect(roundTripped.data.metrics.reached).toBe(10);
        });

        it('дефолтит metrics и variants при отсутствии config-полей', () => {
            const backend = { id: 'x', type: 'trigger', position: { x: 1, y: 2 }, data: { label: 't' } };
            const front = backendNodeToFront(backend as never);
            expect(front.data.metrics).toEqual({ reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] });
            expect(front.data.variants).toEqual([]);
            expect(front.data.randomization).toBe('simple');
        });
    });

    describe('edges <-> connections', () => {
        it('frontEdgeToBackend кладёт variant в sourceHandle', () => {
            const edge: FrontEdge = { id: 'e1', source: 'a', target: 'b', label: 'A', data: { variant: 'A' } };
            const conn = frontEdgeToBackend(edge);
            expect(conn).toEqual({ id: 'e1', source: 'a', target: 'b', sourceHandle: 'A' });
        });

        it('backendConnectionToFront читает variant обратно из sourceHandle', () => {
            const conn = { id: 'e1', source: 'a', target: 'b', sourceHandle: 'B' };
            const front = backendConnectionToFront(conn);
            expect(front.id).toBe('e1');
            expect(front.source).toBe('a');
            expect(front.target).toBe('b');
            expect(front.label).toBe('B');
            expect(front.data?.variant).toBe('B');
        });

        it('edges без variant остаются без label/data', () => {
            const edge: FrontEdge = { id: 'e2', source: 'a', target: 'b' };
            const conn = frontEdgeToBackend(edge);
            expect(conn.sourceHandle).toBeUndefined();
            const back = backendConnectionToFront(conn);
            expect(back.label).toBeUndefined();
            expect(back.data).toBeUndefined();
        });
    });

    describe('full graph round-trip', () => {
        it('buildGraphForBackend + parseGraphFromBackend сохраняют структуру', () => {
            const nodes = [sampleFrontNode()];
            const edges: FrontEdge[] = [{ id: 'e1', source: 'node-1', target: 'node-2' }];

            const graph = buildGraphForBackend('v-42', nodes, edges);
            expect(graph.versionId).toBe('v-42');
            expect(graph.nodes?.length).toBe(1);
            expect(graph.connections?.length).toBe(1);

            const parsed = parseGraphFromBackend(graph);
            expect(parsed.nodes[0].id).toBe('node-1');
            expect(parsed.edges[0].id).toBe('e1');
        });

        it('parseGraphFromBackend на пустом графе возвращает пустые массивы', () => {
            const parsed = parseGraphFromBackend({ versionId: 'v', nodes: [], connections: [] });
            expect(parsed.nodes).toEqual([]);
            expect(parsed.edges).toEqual([]);
        });
    });
});
