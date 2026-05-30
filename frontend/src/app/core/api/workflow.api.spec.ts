import { TestBed } from '@angular/core/testing';
import {
    provideHttpClient,
    withInterceptorsFromDi,
} from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';

import { WorkflowApiService } from './workflow.api';
import { environment } from '../../../environments/environment';
import type { Workflow, WorkflowGraph, WorkflowMeta, WorkflowVersion } from './api.models';

describe('WorkflowApiService', () => {
    let service: WorkflowApiService;
    let httpMock: HttpTestingController;
    const base = environment.apiBaseUrl;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptorsFromDi()),
                provideHttpClientTesting(),
                WorkflowApiService,
            ],
        });
        service = TestBed.inject(WorkflowApiService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('list() выполняет GET /workflows и возвращает массив WorkflowMeta', () => {
        const fixture: WorkflowMeta[] = [
            { id: 'wf-1', name: 'Test', description: 'd', isDemo: false, nodesCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        ];

        let result: WorkflowMeta[] | undefined;
        service.list().subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);

        expect(result).toEqual(fixture);
    });

    it('get(id) выполняет GET /workflows/{id}', () => {
        const fixture = {
            meta: { id: 'wf-1', name: 't', createdAt: '', updatedAt: '' },
            graph: { versionId: 'v1', nodes: [], connections: [] },
        } as unknown as Workflow;

        let result: Workflow | undefined;
        service.get('wf-1').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows/wf-1`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);

        expect(result).toEqual(fixture);
    });

    it('create() выполняет POST /workflows с телом', () => {
        const body = { name: 'New', description: 'x' };
        const fixture = { meta: { id: 'wf-2', name: 'New', createdAt: '', updatedAt: '' }, graph: { versionId: 'v', nodes: [], connections: [] } } as unknown as Workflow;

        service.create(body).subscribe();

        const req = httpMock.expectOne(`${base}/workflows`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush(fixture, { status: 201, statusText: 'Created' });
    });

    it('updateMeta() выполняет PUT /workflows/{id}', () => {
        const fixture: WorkflowMeta = { id: 'wf-1', name: 'renamed', isDemo: false, nodesCount: 0, createdAt: '', updatedAt: '' };

        service.updateMeta('wf-1', { name: 'renamed' }).subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ name: 'renamed' });
        req.flush(fixture);
    });

    it('delete() выполняет DELETE /workflows/{id}', () => {
        service.delete('wf-1').subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('listVersions() выполняет GET /workflows/{id}/versions', () => {
        const fixture: WorkflowVersion[] = [{ id: 'v1', workflowId: 'wf-1', createdAt: '' }];

        service.listVersions('wf-1').subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1/versions`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);
    });

    it('createVersion() выполняет POST /workflows/{id}/versions', () => {
        const fixture: WorkflowVersion = { id: 'v2', workflowId: 'wf-1', createdAt: '' };

        service.createVersion('wf-1').subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1/versions`);
        expect(req.request.method).toBe('POST');
        req.flush(fixture, { status: 201, statusText: 'Created' });
    });

    it('putGraph() выполняет PUT /workflow-versions/{id}/graph', () => {
        const graph: WorkflowGraph = { versionId: 'v1', nodes: [], connections: [] };

        service.putGraph('v1', graph).subscribe();

        const req = httpMock.expectOne(`${base}/workflow-versions/v1/graph`);
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(graph);
        req.flush(graph);
    });
});
