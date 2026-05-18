import { TestBed } from '@angular/core/testing';
import {
    provideHttpClient,
    withInterceptorsFromDi,
} from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TriggerApiService, Trigger } from './trigger.api';
import type { WebhookAccepted, WorkflowRun } from './api.models';
import { environment } from '../../../environments/environment';

describe('TriggerApiService', () => {
    let service: TriggerApiService;
    let httpMock: HttpTestingController;
    const base = environment.apiBaseUrl;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptorsFromDi()),
                provideHttpClientTesting(),
                TriggerApiService,
            ],
        });
        service = TestBed.inject(TriggerApiService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('list() выполняет GET /workflows/{id}/triggers', () => {
        const fixture: Trigger[] = [
            { id: 't1', workflowId: 'wf-1', nodeId: 'trigger-webhook-abc', type: 'webhook', config: {}, token: 'tok_abc' },
        ];

        let result: Trigger[] | undefined;
        service.list('wf-1').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows/wf-1/triggers`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);

        expect(result).toEqual(fixture);
    });

    it('invokeWebhook() выполняет POST /webhook/{token} и возвращает WebhookAccepted с pollUrl', () => {
        const payload = { event: 'click', amount: 42 };
        const run = { id: 'run-9', workflowId: 'wf-1', status: 'queued' } as unknown as WorkflowRun;
        const fixture: WebhookAccepted = { run, pollUrl: 'http://localhost/workflow-runs/run-9' };

        let result: WebhookAccepted | undefined;
        service.invokeWebhook('tok_abc', payload).subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/webhook/tok_abc`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(payload);
        req.flush(fixture, { status: 202, statusText: 'Accepted' });

        expect(result).toEqual(fixture);
    });
});
