import { TestBed } from '@angular/core/testing';
import { Client, IMessage } from '@stomp/stompjs';
import { WorkflowWsService } from './workflow-ws.service';

/**
 * Тестируем поверхность WorkflowWsService без реального STOMP/SockJS:
 * `activate`, `subscribe`, `deactivate` на прототипе Client заменяем шпионами,
 * а `onConnect` хука вызываем вручную чтобы эмулировать connect.
 */
describe('WorkflowWsService', () => {
  let svc: WorkflowWsService;
  let activateSpy: jasmine.Spy;
  let deactivateSpy: jasmine.Spy;
  let subscribeSpy: jasmine.Spy;

  beforeEach(() => {
    Object.defineProperty(Client.prototype, 'active', {
      configurable: true,
      get(this: { _connected?: boolean }) {
        return this._connected === true;
      },
    });
    Object.defineProperty(Client.prototype, 'connected', {
      configurable: true,
      get(this: { _connected?: boolean }) {
        return this._connected === true;
      },
    });

    activateSpy = spyOn(Client.prototype, 'activate').and.callFake(function (this: { _connected?: boolean }) {
      this._connected = true;
    });
    deactivateSpy = spyOn(Client.prototype, 'deactivate').and.returnValue(Promise.resolve());
    subscribeSpy = spyOn(Client.prototype, 'subscribe').and.callFake(((destination: string) => {
      return { id: `sub-${destination}`, unsubscribe: jasmine.createSpy('unsubscribe') };
    }) as never);

    TestBed.configureTestingModule({ providers: [WorkflowWsService] });
    svc = TestBed.inject(WorkflowWsService);
  });

  it('connect создаёт клиента и активирует его', () => {
    svc.connect();
    expect(activateSpy).toHaveBeenCalledTimes(1);
  });

  it('повторный connect не создаёт нового клиента', () => {
    svc.connect();
    svc.connect();
    expect(activateSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribeToWorkflow подписывается на topic после connect', () => {
    svc.subscribeToWorkflow('wf-42');
    // simulate onConnect callback
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);
    expect(subscribeSpy).toHaveBeenCalled();
    const [topic] = subscribeSpy.calls.mostRecent().args;
    expect(topic).toBe('/topic/workflows/wf-42/graph');
  });

  it('эмитит graphUpdates когда приходит сообщение', () => {
    const emitted: Array<{ workflowId: string; graph: unknown }> = [];
    svc.graphUpdates.subscribe(e => emitted.push(e));

    svc.subscribeToWorkflow('wf-1');
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);

    const [, cb] = subscribeSpy.calls.mostRecent().args as [string, (m: IMessage) => void];
    cb({ body: JSON.stringify({ nodes: [], connections: [] }) } as IMessage);

    expect(emitted.length).toBe(1);
    expect(emitted[0].workflowId).toBe('wf-1');
    expect(emitted[0].graph).toEqual({ nodes: [], connections: [] } as never);
  });

  it('эмитит runEvents для сообщений с полем event и не эмитит graphUpdates', () => {
    const runEvents: Array<{ event: string; nodeId?: string; status: string }> = [];
    const graphEvents: unknown[] = [];
    svc.runEvents.subscribe(e => runEvents.push(e));
    svc.graphUpdates.subscribe(e => graphEvents.push(e));

    svc.subscribeToWorkflow('wf-7');
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);
    const [, cb] = subscribeSpy.calls.mostRecent().args as [string, (m: IMessage) => void];

    cb({ body: JSON.stringify({ event: 'node_reached', workflowId: 'wf-7', runId: 5, nodeId: 'n1', status: 'running' }) } as IMessage);

    expect(runEvents.length).toBe(1);
    expect(runEvents[0].event).toBe('node_reached');
    expect(runEvents[0].nodeId).toBe('n1');
    expect(graphEvents.length).toBe(0);
  });

  it('некорректный JSON в сообщении не падает и не эмитит', () => {
    const emitted: unknown[] = [];
    svc.graphUpdates.subscribe(e => emitted.push(e));

    svc.subscribeToWorkflow('wf-1');
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);
    const [, cb] = subscribeSpy.calls.mostRecent().args as [string, (m: IMessage) => void];

    expect(() => cb({ body: 'not-json' } as IMessage)).not.toThrow();
    expect(emitted.length).toBe(0);
  });

  it('возвращаемая функция отписки убирает stomp подписку', () => {
    const unsub = svc.subscribeToWorkflow('wf-1');
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);
    const result = subscribeSpy.calls.mostRecent().returnValue as { unsubscribe: jasmine.Spy };

    unsub();
    expect(result.unsubscribe).toHaveBeenCalled();
  });

  it('disconnect отписывает всё и сбрасывает клиента', () => {
    svc.subscribeToWorkflow('wf-1');
    const clientBefore = (svc as unknown as { client: Client | null }).client;
    clientBefore?.onConnect?.({} as never);

    svc.disconnect();

    expect(deactivateSpy).toHaveBeenCalled();
    expect((svc as unknown as { client: Client | null }).client).toBeNull();
  });

  it('после reconnect (повторный onConnect) переподнимает подписки', () => {
    svc.subscribeToWorkflow('wf-1');
    const client = (svc as unknown as { client: Client }).client;
    client.onConnect?.({} as never);
    const initialCalls = subscribeSpy.calls.count();

    // эмуляция переподключения
    client.onConnect?.({} as never);
    expect(subscribeSpy.calls.count()).toBeGreaterThan(initialCalls);
  });
});
