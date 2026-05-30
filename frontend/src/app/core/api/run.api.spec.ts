import { TestBed } from '@angular/core/testing';
import {
    provideHttpClient,
    withInterceptorsFromDi,
} from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';

import { RunApiService } from './run.api';
import { environment } from '../../../environments/environment';
import type { NodeRun, WorkflowRun } from './api.models';

describe('RunApiService', () => {
    let service: RunApiService;
    let httpMock: HttpTestingController;
    const base = environment.apiBaseUrl;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptorsFromDi()),
                provideHttpClientTesting(),
                RunApiService,
            ],
        });
        service = TestBed.inject(RunApiService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('enqueue() выполняет POST /workflows/{id}/runs с входным JSON', () => {
        const input = { foo: 'bar' };
        const fixture = { id: 'run-1', workflowId: 'wf-1', status: 'queued' } as unknown as WorkflowRun;

        service.enqueue('wf-1', input as never).subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1/runs`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(input);
        expect(req.request.params.has('startNodeId')).toBe(false);
        req.flush(fixture, { status: 202, statusText: 'Accepted' });
    });

    it('enqueue(startNodeId) пробрасывает startNodeId как query-param', () => {
        const input = { foo: 'bar' };
        const fixture = { id: 'run-2', workflowId: 'wf-1', status: 'queued' } as unknown as WorkflowRun;

        service.enqueue('wf-1', input as never, 'node-a').subscribe();

        const req = httpMock.expectOne(r =>
            r.method === 'POST' &&
            r.url === `${base}/workflows/wf-1/runs` &&
            r.params.get('startNodeId') === 'node-a',
        );
        expect(req.request.body).toEqual(input);
        req.flush(fixture, { status: 202, statusText: 'Accepted' });
    });

    it('list() выполняет GET /workflows/{id}/runs', () => {
        const fixture = [
            { id: 'run-1', workflowId: 'wf-1', status: 'success' } as unknown as WorkflowRun,
        ];

        let result: WorkflowRun[] | undefined;
        service.list('wf-1').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows/wf-1/runs`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);

        expect(result).toEqual(fixture);
    });

    it('get() выполняет GET /workflow-runs/{runId}', () => {
        const fixture = { id: 'run-1', workflowId: 'wf-1', status: 'running' } as unknown as WorkflowRun;

        service.get('run-1').subscribe();

        const req = httpMock.expectOne(`${base}/workflow-runs/run-1`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);
    });

    it('getNodeRun() выполняет GET /node-runs/{id}', () => {
        const fixture = {
            id: 'nr-1',
            workflowRunId: 'run-1',
            nodeId: 'node-a',
            status: 'success',
        } as unknown as NodeRun;

        service.getNodeRun('nr-1').subscribe();

        const req = httpMock.expectOne(`${base}/node-runs/nr-1`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);
    });
});
