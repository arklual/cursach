import { TestBed } from '@angular/core/testing';
import {
    provideHttpClient,
    withInterceptorsFromDi,
} from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';

import { TriggerApiService } from './trigger.api';
import { environment } from '../../../environments/environment';
import type { Trigger } from './api.models';

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
        const fixture = [
            { id: 't1', workflowId: 'wf-1', type: 'webhook', config: {} } as unknown as Trigger,
        ];

        let result: Trigger[] | undefined;
        service.list('wf-1').subscribe(r => (result = r));

        const req = httpMock.expectOne(`${base}/workflows/wf-1/triggers`);
        expect(req.request.method).toBe('GET');
        req.flush(fixture);

        expect(result).toEqual(fixture);
    });

    it('create() выполняет POST /workflows/{id}/triggers с телом', () => {
        const body = { type: 'cron', config: { expression: '*/30 * * * * *' } };
        const fixture = { id: 't2', workflowId: 'wf-1', type: 'cron', config: body.config } as unknown as Trigger;

        service.create('wf-1', body as never).subscribe();

        const req = httpMock.expectOne(`${base}/workflows/wf-1/triggers`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush(fixture, { status: 201, statusText: 'Created' });
    });

    it('delete() выполняет DELETE /triggers/{id}', () => {
        service.delete('t1').subscribe();

        const req = httpMock.expectOne(`${base}/triggers/t1`);
        expect(req.request.method).toBe('DELETE');
        req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('invokeWebhook() выполняет POST /webhook/{token} с произвольным JSON', () => {
        const payload = { event: 'click', amount: 42 };

        service.invokeWebhook('tok_abc', payload).subscribe();

        const req = httpMock.expectOne(`${base}/webhook/tok_abc`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(payload);
        req.flush(null, { status: 202, statusText: 'Accepted' });
    });
});
