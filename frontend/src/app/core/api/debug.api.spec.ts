import { TestBed } from '@angular/core/testing';
import {
    provideHttpClient,
    withInterceptorsFromDi,
} from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';

import { DebugApiService, DebugSessionDto } from './debug.api';
import { environment } from '../../../environments/environment';

describe('DebugApiService', () => {
    let service: DebugApiService;
    let httpMock: HttpTestingController;
    const base = environment.apiBaseUrl;

    const sample = (overrides: Partial<DebugSessionDto> = {}): DebugSessionDto => ({
        sessionId: 'ses-1',
        workflowId: 'wf-1',
        versionId: 'v-1',
        status: 'ready',
        input: null,
        outputs: {},
        completed: [],
        skipped: [],
        failed: [],
        ready: ['a'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        readyInputs: {},
        ...overrides,
    });

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptorsFromDi()),
                provideHttpClientTesting(),
                DebugApiService,
            ],
        });
        service = TestBed.inject(DebugApiService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('start() POST-ит /workflows/{id}/debug-sessions', () => {
        let result: DebugSessionDto | undefined;
        service.start('wf-1', { input: { x: 1 } }).subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows/wf-1/debug-sessions`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ input: { x: 1 } });
        req.flush(sample());

        expect(result?.sessionId).toBe('ses-1');
    });

    it('step() POST-ит /debug-sessions/{id}/step с nodeId в body', () => {
        let result: DebugSessionDto | undefined;
        service.step('ses-1', 'nodeA').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/debug-sessions/ses-1/step`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ nodeId: 'nodeA' });
        req.flush(sample({ status: 'stepping', completed: ['nodeA'], ready: ['nodeB'] }));

        expect(result?.completed).toEqual(['nodeA']);
        expect(result?.ready).toEqual(['nodeB']);
    });

    it('runToEnd() POST-ит /debug-sessions/{id}/run-to-end', () => {
        let result: DebugSessionDto | undefined;
        service.runToEnd('ses-1').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/debug-sessions/ses-1/run-to-end`);
        expect(req.request.method).toBe('POST');
        req.flush(sample({ status: 'done', completed: ['a', 'b'], ready: [] }));

        expect(result?.status).toBe('done');
    });

    it('close() DELETE-ит /debug-sessions/{id}', () => {
        service.close('ses-1').subscribe();
        const req = httpMock.expectOne(`${base}/debug-sessions/ses-1`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
    });
});
