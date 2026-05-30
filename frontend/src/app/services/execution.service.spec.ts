import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { ExecutionService } from './execution.service';
import { WorkflowService } from './workflow.service';
import { RunApiService } from '../core/api/run.api';
import type { WorkflowRun } from '../core/api/api.models';

describe('ExecutionService', () => {
  let svc: ExecutionService;
  let workflow: WorkflowService;
  let runApi: jasmine.SpyObj<RunApiService>;

  function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
    return {
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'queued',
      nodes: [],
      ...overrides,
    } as WorkflowRun;
  }

  beforeEach(() => {
    runApi = jasmine.createSpyObj<RunApiService>('RunApiService', ['enqueue', 'list', 'get', 'getNodeRun']);
    TestBed.configureTestingModule({
      providers: [
        ExecutionService,
        WorkflowService,
        { provide: RunApiService, useValue: runApi },
      ],
    });
    svc = TestBed.inject(ExecutionService);
    workflow = TestBed.inject(WorkflowService);
  });

  describe('executeWorkflow', () => {
    it('ставит все ноды в pending перед стартом', () => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      workflow.addNode('http', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(new Subject<WorkflowRun>().asObservable());

      svc.executeWorkflow('wf-1');

      const statuses = svc.nodeStatusesMap();
      expect(Object.values(statuses).every(s => s === 'pending')).toBe(true);
      expect(svc.executing()).toBe(true);
    });

    it('передаёт fromNodeId и payload в runApi.enqueue', () => {
      runApi.enqueue.and.returnValue(new Subject<WorkflowRun>().asObservable());
      svc.executeWorkflow('wf-1', 'node-x', { foo: 'bar' });
      expect(runApi.enqueue).toHaveBeenCalledWith('wf-1', { foo: 'bar' } as never, 'node-x');
    });

    it('дефолтный payload = {} если input не передан', () => {
      runApi.enqueue.and.returnValue(new Subject<WorkflowRun>().asObservable());
      svc.executeWorkflow('wf-1');
      expect(runApi.enqueue).toHaveBeenCalledWith('wf-1', {} as never, undefined);
    });

    it('если бэк не вернул run.id — помечает все ноды как error', () => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({ id: undefined })));

      svc.executeWorkflow('wf-1').subscribe();

      expect(svc.executing()).toBe(false);
      const statuses = svc.nodeStatusesMap();
      expect(Object.values(statuses).every(s => s === 'error')).toBe(true);
      expect(svc.execution()?.status).toBe('error');
    });

    it('при ошибке enqueue помечает все ноды error и завершается', () => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(throwError(() => ({ message: 'boom' })));

      svc.executeWorkflow('wf-1').subscribe();

      expect(svc.executing()).toBe(false);
      expect(svc.execution()?.nodes[0].error?.message).toBe('boom');
    });
  });

  describe('polling', () => {
    it('останавливается при статусе success и применяет финальный run', fakeAsync(() => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      const wfId = 'wf-1';

      runApi.enqueue.and.returnValue(of(makeRun({ status: 'running' })));
      runApi.get.and.returnValues(
        of(makeRun({ status: 'running' })),
        of(makeRun({ status: 'success', durationMs: 1234 })),
      );

      let final: unknown = 'untouched';
      svc.executeWorkflow(wfId).subscribe(r => (final = r));

      tick(800);
      tick(800);
      flush();

      expect(svc.executing()).toBe(false);
      expect(svc.execution()?.status).toBe('success');
      expect(svc.execution()?.duration).toBe(1234);
      expect(final).not.toBeNull();
    }));

    it('останавливается при статусе failed', fakeAsync(() => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({ status: 'running' })));
      runApi.get.and.returnValue(of(makeRun({ status: 'failed' })));

      svc.executeWorkflow('wf-1').subscribe();
      tick(800);
      flush();

      expect(svc.executing()).toBe(false);
      expect(svc.execution()?.status).toBe('error');
    }));

    it('переживает транзиентные ошибки polling-tick без падения', fakeAsync(() => {
      workflow.addNode('trigger', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({ status: 'running' })));
      runApi.get.and.returnValues(
        throwError(() => new Error('net')),
        of(makeRun({ status: 'success' })),
      );

      svc.executeWorkflow('wf-1').subscribe();
      tick(800);
      tick(800);
      flush();

      expect(svc.execution()?.status).toBe('success');
    }));
  });

  describe('mapping', () => {
    it('маппит node_run в NodeExecutionData с label/type из графа', fakeAsync(() => {
      const id = workflow.addNode('http', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({
        status: 'success',
        nodes: [{
          id: 'nr-1',
          nodeId: id,
          status: 'success',
          startedAt: '2026-05-19T00:00:00Z',
          finishedAt: '2026-05-19T00:00:01Z',
          input: [{ a: 1 }, { a: 2 }],
          output: [{ b: 3 }],
        } as never],
      })));
      runApi.get.and.returnValue(of(makeRun({ status: 'success' })));

      svc.executeWorkflow('wf-1').subscribe();
      flush();

      const node = svc.getNodeExecutionData(id);
      expect(node).toBeTruthy();
      expect(node?.nodeType).toBe('http');
      expect(node?.inputData?.length).toBe(2);
      expect(node?.outputData?.length).toBe(1);
      expect(node?.itemsCount).toBe(1);
      expect(node?.duration).toBe(1000);
    }));

    it('оборачивает не-объектные input/output в { value }', fakeAsync(() => {
      const id = workflow.addNode('http', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({
        status: 'success',
        nodes: [{
          id: 'nr-1', nodeId: id, status: 'success',
          input: 'plain-string',
          output: 42,
        } as never],
      })));
      runApi.get.and.returnValue(of(makeRun({ status: 'success' })));

      svc.executeWorkflow('wf-1').subscribe();
      flush();

      const node = svc.getNodeExecutionData(id);
      expect(node?.inputData?.[0].json).toEqual({ value: 'plain-string' });
      expect(node?.outputData?.[0].json).toEqual({ value: 42 });
    }));

    it('ноды графа без node_run остаются в pending', fakeAsync(() => {
      const a = workflow.addNode('trigger', { x: 0, y: 0 });
      const b = workflow.addNode('http', { x: 0, y: 0 });
      runApi.enqueue.and.returnValue(of(makeRun({
        status: 'running',
        nodes: [{ id: 'nr-a', nodeId: a, status: 'success' } as never],
      })));
      runApi.get.and.returnValue(of(makeRun({ status: 'success', nodes: [
        { id: 'nr-a', nodeId: a, status: 'success' } as never,
      ] })));

      svc.executeWorkflow('wf-1').subscribe();
      flush();

      expect(svc.nodeStatusesMap()[a]).toBe('success');
      expect(svc.nodeStatusesMap()[b]).toBe('pending');
    }));
  });

  describe('setExecution / setExecutionFromRun / clearExecution', () => {
    it('setExecution выставляет текущее выполнение и статусы по нодам', () => {
      svc.setExecution({
        id: 'r', workflowId: 'wf', status: 'success',
        nodes: [
          { nodeId: 'a', nodeName: 'A', nodeType: 'trigger', status: 'success' },
          { nodeId: 'b', nodeName: 'B', nodeType: 'http', status: 'error' },
        ],
      });
      expect(svc.execution()?.id).toBe('r');
      expect(svc.nodeStatusesMap()).toEqual({ a: 'success', b: 'error' });
      expect(svc.executing()).toBe(false);
    });

    it('setExecution(null) очищает statuses', () => {
      svc.setExecution(null);
      expect(svc.execution()).toBeNull();
      expect(svc.nodeStatusesMap()).toEqual({});
    });

    it('setExecutionFromRun применяет run', () => {
      svc.setExecutionFromRun(makeRun({ status: 'success' }));
      expect(svc.execution()?.status).toBe('success');
      expect(svc.executing()).toBe(false);
    });

    it('clearExecution возвращает в исходное', () => {
      svc.setExecution({ id: 'r', workflowId: 'wf', status: 'success', nodes: [] });
      svc.clearExecution();
      expect(svc.execution()).toBeNull();
      expect(svc.nodeStatusesMap()).toEqual({});
      expect(svc.executing()).toBe(false);
    });
  });

  describe('getNodeExecutionData', () => {
    it('возвращает null когда execution не задан', () => {
      expect(svc.getNodeExecutionData('x')).toBeNull();
    });

    it('возвращает null если ноды нет в execution', () => {
      svc.setExecution({ id: 'r', workflowId: 'w', status: 'success', nodes: [] });
      expect(svc.getNodeExecutionData('x')).toBeNull();
    });
  });
});
