import { TestBed } from '@angular/core/testing';
import { WorkflowService } from './workflow.service';
import { NodeKind } from '../models/workflow.model';

describe('WorkflowService', () => {
  let svc: WorkflowService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WorkflowService] });
    svc = TestBed.inject(WorkflowService);
  });

  describe('multi-select', () => {
    it('toggleNodeSelection накапливает выделение, removeSelectedNodes удаляет все', () => {
      const a = svc.addNode('http', { x: 0, y: 0 });
      const b = svc.addNode('http', { x: 50, y: 0 });
      const c = svc.addNode('http', { x: 100, y: 0 });
      svc.setActiveNode(a);
      svc.toggleNodeSelection(b);
      expect(svc.selectedNodeIds().has(a)).toBeTrue();
      expect(svc.selectedNodeIds().has(b)).toBeTrue();
      expect(svc.selectedNodeIds().has(c)).toBeFalse();

      const removed = svc.removeSelectedNodes();
      expect(removed).toBe(2);
      expect(svc.nodes().map(n => n.id)).toEqual([c]);
      expect(svc.selectedNodeIds().size).toBe(0);
    });

    it('toggle убирает уже выделенную ноду', () => {
      const a = svc.addNode('http', { x: 0, y: 0 });
      svc.setActiveNode(a);
      svc.toggleNodeSelection(a);
      expect(svc.selectedNodeIds().has(a)).toBeFalse();
    });

    it('removeSelectedNodes без выделения удаляет активную ноду', () => {
      const a = svc.addNode('http', { x: 0, y: 0 });
      svc.clearSelection();
      svc.setActiveNode(a);
      expect(svc.removeSelectedNodes()).toBe(1);
      expect(svc.nodes().length).toBe(0);
    });
  });

  describe('addNode', () => {
    it('добавляет ноду и делает её активной', () => {
      const id = svc.addNode('trigger', { x: 10, y: 20 });
      expect(svc.nodes().length).toBe(1);
      expect(svc.nodes()[0].id).toBe(id);
      expect(svc.activeNodeId()).toBe(id);
    });

    it('кладёт subtype в id и __subtype', () => {
      const id = svc.addNode('dataflow', { x: 0, y: 0 }, 'filter');
      const node = svc.getNodeById(id);
      expect(id).toContain('dataflow-filter-');
      expect(node?.data.__subtype).toBe('filter');
      expect(node?.data.label).toBe('Filter');
    });

    it('для trigger подбирает label по subtype (webhook)', () => {
      const id = svc.addNode('trigger', { x: 0, y: 0 }, 'webhook');
      expect(svc.getNodeById(id)?.data.label).toBe('Webhook');
    });

    it('ai нода получает дефолтный config с провайдером по subtype', () => {
      const openaiId = svc.addNode('ai', { x: 0, y: 0 }, 'openai');
      const openaiCfg = svc.getNodeById(openaiId)?.data.config as { provider: string; model: string };
      expect(svc.getNodeById(openaiId)?.data.label).toBe('OpenAI');
      expect(openaiCfg.provider).toBe('openai');
      expect(openaiCfg.model).toBe('gpt-4o-mini');

      const claudeId = svc.addNode('ai', { x: 0, y: 0 }, 'anthropic');
      const claudeCfg = svc.getNodeById(claudeId)?.data.config as { provider: string };
      expect(svc.getNodeById(claudeId)?.data.label).toBe('Claude');
      expect(claudeCfg.provider).toBe('anthropic');
    });

    it('ab нода получает дефолтный config с двумя variants 50/50', () => {
      const id = svc.addNode('ab', { x: 0, y: 0 });
      const cfg = svc.getNodeById(id)?.data.config as { variants: Array<{ key: string; weight: number }> };
      expect(cfg?.variants?.length).toBe(2);
      expect(cfg.variants[0].weight + cfg.variants[1].weight).toBe(100);
    });

    it('записывает событие в logs', () => {
      svc.addNode('http', { x: 0, y: 0 });
      expect(svc.logs().length).toBe(1);
      expect(svc.logs()[0]).toContain('Добавлена нода');
    });
  });

  describe('updateNodePosition', () => {
    it('обновляет позицию существующей ноды', () => {
      const id = svc.addNode('trigger', { x: 0, y: 0 });
      svc.updateNodePosition(id, { x: 100, y: 200 });
      expect(svc.getNodeById(id)?.position).toEqual({ x: 100, y: 200 });
    });

    it('для неизвестного id ничего не падает', () => {
      svc.addNode('trigger', { x: 0, y: 0 });
      expect(() => svc.updateNodePosition('missing', { x: 1, y: 1 })).not.toThrow();
    });
  });

  describe('updateNodeData', () => {
    it('пропускает данные через updater', () => {
      const id = svc.addNode('http', { x: 0, y: 0 });
      svc.updateNodeData(id, data => ({ ...data, label: 'Custom' }));
      expect(svc.getNodeById(id)?.data.label).toBe('Custom');
    });
  });

  describe('edges', () => {
    it('addEdge добавляет ребро без label/variant', () => {
      svc.addEdge('a', 'b');
      expect(svc.edges().length).toBe(1);
      expect(svc.edges()[0].source).toBe('a');
      expect(svc.edges()[0].target).toBe('b');
      expect(svc.edges()[0].label).toBeUndefined();
      expect(svc.edges()[0].data).toBeUndefined();
    });

    it('addEdge прокидывает label и variant в data', () => {
      svc.addEdge('a', 'b', 'go', 'A');
      const e = svc.edges()[0];
      expect(e.label).toBe('go');
      expect(e.data?.variant).toBe('A');
    });

    it('removeEdge удаляет по id', () => {
      svc.addEdge('a', 'b');
      const id = svc.edges()[0].id;
      svc.removeEdge(id);
      expect(svc.edges()).toEqual([]);
    });
  });

  describe('removeNode', () => {
    it('удаляет ноду и связанные рёбра, сбрасывает activeNode если совпадал', () => {
      const a = svc.addNode('trigger', { x: 0, y: 0 });
      const b = svc.addNode('http', { x: 0, y: 0 });
      svc.addEdge(a, b);
      svc.addEdge(b, 'unrelated');
      svc.setActiveNode(a);
      svc.removeNode(a);

      expect(svc.nodes().map(n => n.id)).toEqual([b]);
      expect(svc.edges().length).toBe(1);
      expect(svc.edges()[0]).toEqual(jasmine.objectContaining({ source: b, target: 'unrelated' }));
      expect(svc.activeNodeId()).toBeNull();
    });

    it('не сбрасывает active, если удаляется другая нода', () => {
      const a = svc.addNode('trigger', { x: 0, y: 0 });
      const b = svc.addNode('http', { x: 0, y: 0 });
      svc.setActiveNode(a);
      svc.removeNode(b);
      expect(svc.activeNodeId()).toBe(a);
    });
  });

  describe('logs', () => {
    it('log добавляет timestamped запись в начало', () => {
      svc.log('hello');
      expect(svc.logs()[0]).toMatch(/^\[\d{1,2}:\d{2}:\d{2}.*] hello$/);
    });

    it('логи обрезаются до 80 элементов', () => {
      for (let i = 0; i < 90; i++) svc.log(`msg-${i}`);
      expect(svc.logs().length).toBe(80);
      expect(svc.logs()[0]).toContain('msg-89');
    });

    it('clearLogs очищает все логи', () => {
      svc.log('x');
      svc.clearLogs();
      expect(svc.logs()).toEqual([]);
    });
  });

  describe('setNodes / setEdges / getNodeById', () => {
    it('setNodes заменяет коллекцию полностью', () => {
      svc.addNode('trigger', { x: 0, y: 0 });
      svc.setNodes([]);
      expect(svc.nodes()).toEqual([]);
    });

    it('setEdges заменяет коллекцию полностью', () => {
      svc.addEdge('a', 'b');
      svc.setEdges([]);
      expect(svc.edges()).toEqual([]);
    });

    it('getNodeById возвращает undefined если нет такой ноды', () => {
      expect(svc.getNodeById('nope')).toBeUndefined();
    });
  });

  describe('makeNode', () => {
    it('строит ноду без побочных эффектов', () => {
      const before = svc.nodes().length;
      const node = svc.makeNode('manual-id', 'code', { x: 5, y: 7 }, 'js');
      expect(svc.nodes().length).toBe(before);
      expect(node.id).toBe('manual-id');
      expect(node.data.kind).toBe('code');
      expect(node.data.label).toBe('JavaScript');
    });
  });

  describe('activeNode computed', () => {
    it('возвращает null если activeNodeId не задан', () => {
      expect(svc.activeNode()).toBeNull();
    });

    it('синхронизирован с setActiveNode', () => {
      const id = svc.addNode('trigger', { x: 0, y: 0 });
      svc.setActiveNode(null);
      expect(svc.activeNode()).toBeNull();
      svc.setActiveNode(id);
      expect(svc.activeNode()?.id).toBe(id);
    });
  });

  describe('nodeTemplates', () => {
    it('содержит все 7 видов нод', () => {
      const kinds: NodeKind[] = ['trigger', 'http', 'dataflow', 'code', 'ab', 'join', 'ai'];
      for (const k of kinds) {
        expect(svc.nodeTemplates[k]).toBeTruthy();
        expect(svc.nodeTemplates[k].label).toBeTruthy();
      }
    });
  });
});
