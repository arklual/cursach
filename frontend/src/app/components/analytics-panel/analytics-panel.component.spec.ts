import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { AnalyticsPanelComponent } from './analytics-panel.component';
import { WorkflowService } from '../../services/workflow.service';
import { environment } from '../../../environments/environment';

describe('AnalyticsPanelComponent', () => {
    let fixture: ComponentFixture<AnalyticsPanelComponent>;
    let httpMock: HttpTestingController;
    let wsStub: { nodes: ReturnType<typeof signal<any[]>> };

    beforeEach(() => {
        wsStub = { nodes: signal<any[]>([]) };
        TestBed.configureTestingModule({
            imports: [AnalyticsPanelComponent],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: WorkflowService, useValue: wsStub },
            ],
        });
        httpMock = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(AnalyticsPanelComponent);
        fixture.componentRef.setInput('workflowId', 'wf-1');
    });

    afterEach(() => httpMock.verify());

    it('shows empty state when no ab nodes', () => {
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('нет A/B-нод');
    });

    it('renders traffic bars for pick-mode response', () => {
        wsStub.nodes.set([{ id: 'ab1', data: { kind: 'ab', label: 'AB' } }]);
        fixture.detectChanges();
        const req = httpMock.expectOne(
            r => r.url === `${environment.apiBaseUrl}/workflows/wf-1/ab-analytics`
        );
        req.flush({
            abNodeId: 'ab1',
            mode: 'pick',
            totalRuns: 10,
            excludedNoVariant: 0,
            computedAt: new Date().toISOString(),
            variants: [
                {
                    key: 'A', label: 'Control', color: '#84cc16', weight: 50,
                    runs: 6, trafficCount: 6, trafficPct: 60.0,
                    conversions: 4, conversionPct: 66.7, ciLow: 30.0, ciHigh: 90.0,
                    liftVsBaseline: null, pValue: null, isBaseline: true, isSignificant: false,
                },
                {
                    key: 'B', label: 'Treatment', color: '#3b82f6', weight: 50,
                    runs: 4, trafficCount: 4, trafficPct: 40.0,
                    conversions: 3, conversionPct: 75.0, ciLow: 35.0, ciHigh: 95.0,
                    liftVsBaseline: 8.3, pValue: 0.7, isBaseline: false, isSignificant: false,
                },
            ],
            warnings: [],
        });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Traffic distribution');
        expect(text).toContain('Conversion');
    });

    it('hides Conversion section for split-mode', () => {
        wsStub.nodes.set([{ id: 'ab1', data: { kind: 'ab', label: 'AB' } }]);
        fixture.detectChanges();
        const req = httpMock.expectOne(
            r => r.url === `${environment.apiBaseUrl}/workflows/wf-1/ab-analytics`
        );
        req.flush({
            abNodeId: 'ab1',
            mode: 'split',
            totalRuns: 1,
            excludedNoVariant: 0,
            computedAt: new Date().toISOString(),
            variants: [
                { key: 'A', label: 'A', color: '#84cc16', weight: 50, runs: 0, trafficCount: 5, trafficPct: 50, conversions: null, conversionPct: null, ciLow: null, ciHigh: null, liftVsBaseline: null, pValue: null, isBaseline: true, isSignificant: false },
                { key: 'B', label: 'B', color: '#3b82f6', weight: 50, runs: 0, trafficCount: 5, trafficPct: 50, conversions: null, conversionPct: null, ciLow: null, ciHigh: null, liftVsBaseline: null, pValue: null, isBaseline: false, isSignificant: false },
            ],
            warnings: [],
        });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Conversion недоступна для split-mode');
    });
});
