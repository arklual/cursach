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

    describe('user-config round-trip', () => {
        it('сохраняет HTTP config (url, method, headers, body, timeoutMs) через round-trip', () => {
            const original: FrontNode = {
                id: 'http-1',
                type: 'workflowNode',
                position: { x: 1, y: 2 },
                data: {
                    id: 'http-1',
                    kind: 'http',
                    label: 'GET httpbin',
                    color: '#f97316',
                    successProb: 0.5,
                    variants: [],
                    randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                    config: {
                        url: 'https://httpbin.org/get',
                        method: 'GET',
                        headers: { 'X-Test': '1' },
                        body: null,
                        timeoutMs: 5000,
                    },
                },
            };

            const backend = frontNodeToBackend(original);
            const cfg = backend.data?.config as unknown as Record<string, unknown>;
            expect(cfg['url']).toBe('https://httpbin.org/get');
            expect(cfg['method']).toBe('GET');
            expect(cfg['timeoutMs']).toBe(5000);

            const restored = backendNodeToFront(backend);
            expect(restored.data.config?.['url']).toBe('https://httpbin.org/get');
            expect(restored.data.config?.['method']).toBe('GET');
            expect((restored.data.config?.['headers'] as { 'X-Test': string })['X-Test']).toBe('1');
            expect(restored.data.config?.['timeoutMs']).toBe(5000);
        });

        it('не утекает служебных __-полей в data.config', () => {
            const backend = {
                id: 'x',
                type: 'http',
                position: { x: 0, y: 0 },
                data: {
                    label: 'X',
                    config: {
                        url: 'https://x',
                        __metrics: { reached: 1 },
                        __color: '#111',
                        __subtype: 'filter',
                    },
                },
            };

            const front = backendNodeToFront(backend as never);
            expect(front.data.config?.['url']).toBe('https://x');
            expect(front.data.config?.['__metrics']).toBeUndefined();
            expect(front.data.config?.['__color']).toBeUndefined();
            expect(front.data.config?.['__subtype']).toBeUndefined();
        });

        it('dataflow-filter config (field/op/value) выживает round-trip', () => {
            const node: FrontNode = {
                id: 'df-1',
                type: 'workflowNode',
                position: { x: 0, y: 0 },
                data: {
                    id: 'df-1',
                    kind: 'dataflow',
                    label: 'F',
                    color: '#14b8a6',
                    successProb: 0,
                    variants: [],
                    randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                    __subtype: 'filter',
                    config: { field: 'amount', op: 'gt', value: 100 },
                },
            };

            const restored = backendNodeToFront(frontNodeToBackend(node));
            expect(restored.data.kind).toBe('dataflow');
            expect(restored.data.__subtype).toBe('filter');
            expect(restored.data.config).toEqual({ field: 'amount', op: 'gt', value: 100 });
        });
    });

    describe('dataflow subtype mapping', () => {
        it('kind=dataflow + __subtype=filter → backend type=dataflow.filter', () => {
            const node: FrontNode = {
                id: 'df-1',
                type: 'workflowNode',
                position: { x: 0, y: 0 },
                data: {
                    id: 'df-1',
                    kind: 'dataflow',
                    label: 'F',
                    color: '#14b8a6',
                    successProb: 0,
                    variants: [],
                    randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                },
            };
            (node.data as unknown as { __subtype?: string }).__subtype = 'filter';

            const backend = frontNodeToBackend(node);
            expect(backend.type).toBe('dataflow.filter');
        });

        it('backend type=dataflow.map → front kind=dataflow + __subtype=map', () => {
            const backend = { id: 'df-2', type: 'dataflow.map', position: { x: 1, y: 1 }, data: { label: 'M' } };
            const front = backendNodeToFront(backend as never);
            expect(front.data.kind).toBe('dataflow');
            expect((front.data as unknown as { __subtype?: string }).__subtype).toBe('map');
        });

        it('kind=dataflow без subtype дефолтится на filter', () => {
            const node: FrontNode = {
                id: 'df-3',
                type: 'workflowNode',
                position: { x: 0, y: 0 },
                data: {
                    id: 'df-3', kind: 'dataflow', label: '', color: '', successProb: 0,
                    variants: [], randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                },
            };
            const backend = frontNodeToBackend(node);
            expect(backend.type).toBe('dataflow.filter');
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

    describe('branch.split / branch.merge', () => {
        it('frontNodeToBackend для kind=ab выдаёт type=branch.split', () => {
            const front: FrontNode = {
                id: 'n1', type: 'ab', position: { x: 0, y: 0 },
                data: {
                    id: 'n1', kind: 'ab', label: 'Split', color: '#f472b6',
                    successProb: 0, variants: [],
                    randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                    config: { mode: 'split', strategy: 'random' },
                },
            };
            const back = frontNodeToBackend(front);
            expect(back.type).toBe('branch.split');
        });

        it('frontNodeToBackend для kind=join выдаёт type=branch.merge', () => {
            const front: FrontNode = {
                id: 'n2', type: 'join', position: { x: 0, y: 0 },
                data: {
                    id: 'n2', kind: 'join', label: 'Merge', color: '#c084fc',
                    successProb: 0.5, variants: [], randomization: 'simple',
                    metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
                },
            };
            const back = frontNodeToBackend(front);
            expect(back.type).toBe('branch.merge');
        });

        it('backendNodeToFront для type=branch.split возвращает kind=ab', () => {
            const back = {
                id: 'n3', type: 'branch.split', position: { x: 0, y: 0 },
                data: { label: 'Split', config: { mode: 'split' } as never },
            };
            const front = backendNodeToFront(back as never);
            expect(front.data.kind).toBe('ab');
        });

        it('backendNodeToFront для type=branch.merge возвращает kind=join', () => {
            const back = {
                id: 'n4', type: 'branch.merge', position: { x: 0, y: 0 },
                data: { label: 'Merge', config: {} as never },
            };
            const front = backendNodeToFront(back as never);
            expect(front.data.kind).toBe('join');
        });

        it('edge.data.variant пробрасывается в sourceHandle и обратно (round-trip)', () => {
            const edges: FrontEdge[] = [
                { id: 'e1', source: 'a', target: 'b', data: { variant: 'A' } },
            ];
            const graph = buildGraphForBackend('v-1', [], edges);
            expect(graph.connections[0].sourceHandle).toBe('A');
            const round = parseGraphFromBackend(graph);
            expect(round.edges[0].data?.variant).toBe('A');
        });
    });
});
