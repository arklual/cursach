import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { WorkflowApiService } from './workflow.api';
import { WorkflowFacade } from './workflow.facade';
import type { Workflow, WorkflowMeta as BackendMeta, WorkflowVersion } from './api.models';
import type { WorkflowEdge as FrontEdge, WorkflowNode as FrontNode } from '../../models/workflow.model';

function backendMeta(id: string, name = 'Test'): BackendMeta {
    return {
        id,
        name,
        description: 'd',
        isDemo: false,
        nodesCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
    };
}

function sampleFrontNode(id = 'node-1'): FrontNode {
    return {
        id,
        type: 'workflowNode',
        position: { x: 1, y: 2 },
        data: {
            id,
            kind: 'http',
            label: 'n',
            color: '#fff',
            successProb: 0.5,
            variants: [],
            randomization: 'simple',
            metrics: { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0], users: [], events: [] },
        },
    };
}

describe('WorkflowFacade', () => {
    let facade: WorkflowFacade;
    let api: jasmine.SpyObj<WorkflowApiService>;

    beforeEach(() => {
        api = jasmine.createSpyObj<WorkflowApiService>('WorkflowApiService', [
            'list', 'get', 'create', 'updateMeta', 'delete',
            'listVersions', 'createVersion', 'putGraph',
        ]);

        TestBed.configureTestingModule({
            providers: [
                { provide: WorkflowApiService, useValue: api },
                WorkflowFacade,
            ],
        });

        facade = TestBed.inject(WorkflowFacade);
    });

    describe('listWorkflows()', () => {
        it('маппит бэк-Meta в UI-Meta с дефолтами status=draft и nodesCount=0', done => {
            api.list.and.returnValue(of([backendMeta('wf-1', 'first')]));

            facade.listWorkflows().subscribe(uiList => {
                expect(uiList.length).toBe(1);
                expect(uiList[0].id).toBe('wf-1');
                expect(uiList[0].name).toBe('first');
                expect(uiList[0].status).toBe('draft');
                expect(uiList[0].nodesCount).toBe(0);
                expect(uiList[0].createdAt instanceof Date).toBe(true);
                expect(uiList[0].updatedAt instanceof Date).toBe(true);
                done();
            });
        });
    });

    describe('createWorkflow()', () => {
        it('зовёт api.create и возвращает workflowId + versionId из meta.currentVersionId-аналога', done => {
            const created: Workflow = {
                meta: backendMeta('wf-2', 'new'),
                graph: { versionId: 'v-init', nodes: [], connections: [] },
            };
            api.create.and.returnValue(of(created));

            facade.createWorkflow('new', 'desc').subscribe(res => {
                expect(api.create).toHaveBeenCalledWith({ name: 'new', description: 'desc' });
                expect(res).toEqual({ workflowId: 'wf-2', versionId: 'v-init' });
                done();
            });
        });
    });

    describe('loadWorkflow()', () => {
        it('возвращает meta + распакованный граф', done => {
            const wf: Workflow = {
                meta: backendMeta('wf-3', 'loaded'),
                graph: {
                    versionId: 'v-3',
                    nodes: [{ id: 'n1', type: 'http', position: { x: 5, y: 5 }, data: { label: 'X' } }],
                    connections: [{ id: 'e1', source: 'n1', target: 'n1' }],
                },
            };
            api.get.and.returnValue(of(wf));

            facade.loadWorkflow('wf-3').subscribe(loaded => {
                expect(api.get).toHaveBeenCalledWith('wf-3');
                expect(loaded.meta.id).toBe('wf-3');
                expect(loaded.versionId).toBe('v-3');
                expect(loaded.nodes.length).toBe(1);
                expect(loaded.nodes[0].data.label).toBe('X');
                expect(loaded.edges.length).toBe(1);
                done();
            });
        });
    });

    describe('saveGraph()', () => {
        it('конвертирует фронт-граф в бэк-DTO и зовёт api.putGraph(versionId, graph)', done => {
            api.putGraph.and.returnValue(of({ versionId: 'v', nodes: [], connections: [] }));

            const nodes = [sampleFrontNode('n1')];
            const edges: FrontEdge[] = [{ id: 'e1', source: 'n1', target: 'n1' }];

            facade.saveGraph('v-42', nodes, edges).subscribe(() => {
                expect(api.putGraph).toHaveBeenCalled();
                const [vid, graph] = api.putGraph.calls.mostRecent().args;
                expect(vid).toBe('v-42');
                expect(graph.versionId).toBe('v-42');
                expect(graph.nodes?.length).toBe(1);
                expect(graph.connections?.length).toBe(1);
                done();
            });
        });
    });

    describe('deleteWorkflow()', () => {
        it('делегирует api.delete', done => {
            api.delete.and.returnValue(of(void 0));

            facade.deleteWorkflow('wf-x').subscribe(() => {
                expect(api.delete).toHaveBeenCalledWith('wf-x');
                done();
            });
        });
    });

    describe('renameWorkflow()', () => {
        it('зовёт api.updateMeta и маппит ответ в UI-Meta', done => {
            const updated = backendMeta('wf-1', 'renamed');
            api.updateMeta.and.returnValue(of(updated));

            facade.renameWorkflow('wf-1', 'renamed', 'new desc').subscribe(meta => {
                expect(api.updateMeta).toHaveBeenCalledWith('wf-1', { name: 'renamed', description: 'new desc' });
                expect(meta.id).toBe('wf-1');
                expect(meta.name).toBe('renamed');
                done();
            });
        });
    });

    describe('duplicateWorkflow()', () => {
        it('загружает source, создаёт новый и сохраняет в него граф source-а', done => {
            const source: Workflow = {
                meta: backendMeta('wf-1', 'orig'),
                graph: { versionId: 'v-1', nodes: [{ id: 'a', type: 'http', position: { x: 0, y: 0 }, data: { label: 'a' } }], connections: [] },
            };
            const created: Workflow = {
                meta: backendMeta('wf-1-copy', 'orig (копия)'),
                graph: { versionId: 'v-copy', nodes: [], connections: [] },
            };

            api.get.and.returnValue(of(source));
            api.create.and.returnValue(of(created));
            api.putGraph.and.returnValue(of({ versionId: 'v-copy', nodes: [], connections: [] }));

            facade.duplicateWorkflow('wf-1').subscribe(res => {
                expect(api.get).toHaveBeenCalledWith('wf-1');
                expect(api.create).toHaveBeenCalled();
                const createReq = api.create.calls.mostRecent().args[0];
                expect(createReq.name).toContain('копия');
                expect(api.putGraph).toHaveBeenCalled();
                expect(res.workflowId).toBe('wf-1-copy');
                expect(res.versionId).toBe('v-copy');
                done();
            });
        });
    });
});
