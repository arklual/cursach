import { WorkflowValidatorService } from './workflow-validator.service';
import { WorkflowNode, WorkflowEdge } from '../models/workflow.model';

describe('WorkflowValidatorService', () => {
  let svc: WorkflowValidatorService;
  beforeEach(() => { svc = new WorkflowValidatorService(); });

  function baseMetrics() {
    return { reached: 0, converted: 0, pHat: 0, variance: 0, ci: [0, 0] as [number, number], users: [], events: [] };
  }
  function triggerNode(id: string = 't'): WorkflowNode {
    return {
      id, type: 'trigger', position: { x: 0, y: 0 },
      data: { id, kind: 'trigger', label: 'T', color: '', successProb: 0, variants: [],
        randomization: 'simple', metrics: baseMetrics() },
    };
  }
  function dataflowNode(id: string): WorkflowNode {
    return {
      id, type: 'dataflow', position: { x: 0, y: 0 },
      data: { id, kind: 'dataflow', label: id, color: '', successProb: 0, variants: [],
        randomization: 'simple', metrics: baseMetrics() },
    };
  }
  function abNode(id: string, config: Record<string, unknown>): WorkflowNode {
    return {
      id, type: 'ab', position: { x: 0, y: 0 },
      data: { id, kind: 'ab', label: id, color: '', successProb: 0,
        variants: [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }],
        randomization: 'simple', metrics: baseMetrics(), config },
    };
  }
  function joinNode(id: string): WorkflowNode {
    return {
      id, type: 'join', position: { x: 0, y: 0 },
      data: { id, kind: 'join', label: id, color: '', successProb: 0, variants: [],
        randomization: 'simple', metrics: baseMetrics() },
    };
  }

  describe('базовые проверки', () => {
    it('error если граф пуст', () => {
      const r = svc.validate([], []);
      expect(r.ready).toBe(false);
      expect(r.status).toBe('error');
      expect(r.issues[0].message).toBe('Граф пуст');
    });

    it('error если нет trigger', () => {
      const r = svc.validate([dataflowNode('a')], []);
      expect(r.issues.some(i => i.severity === 'error' && i.message.includes('стартовой'))).toBe(true);
    });

    it('info если одна нода и это trigger', () => {
      const r = svc.validate([triggerNode()], []);
      expect(r.issues.some(i => i.severity === 'info')).toBe(true);
      expect(r.ready).toBe(true);
    });

    it('warning если нода не подключена', () => {
      const r = svc.validate([triggerNode(), dataflowNode('a'), dataflowNode('b')],
        [{ id: 'e0', source: 't', target: 'a' }]);
      expect(r.issues.some(i => i.severity === 'warning' && i.message.includes('"b"'))).toBe(true);
    });

    it('error если цикл', () => {
      const r = svc.validate(
        [triggerNode(), dataflowNode('a'), dataflowNode('b')],
        [
          { id: 'e0', source: 't', target: 'a' },
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'a' },
        ],
      );
      expect(r.issues.some(i => i.severity === 'error' && i.message.includes('цикл'))).toBe(true);
    });

    it('ready=true когда всё хорошо', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'random',
        variants: [{ key: 'A', label: 'A', weight: 50 }, { key: 'B', label: 'B', weight: 50 }],
      });
      const edges: WorkflowEdge[] = [
        { id: 'e0', source: 't', target: 's' },
        { id: 'e1', source: 's', target: 'a', data: { variant: 'A' } },
        { id: 'e2', source: 's', target: 'b', data: { variant: 'B' } },
        { id: 'e3', source: 'a', target: 'm' },
        { id: 'e4', source: 'b', target: 'm' },
      ];
      const r = svc.validate(
        [triggerNode(), split, dataflowNode('a'), dataflowNode('b'), joinNode('m')],
        edges,
      );
      expect(r.ready).toBe(true);
      expect(r.status).toBe('ready');
      expect(r.message).toBe('Готов к запуску');
    });
  });

  describe('правила Split (ab)', () => {
    it('error если edge от split без variant', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'random',
        variants: [{ key: 'A', label: 'A', weight: 100 }],
      });
      const r = svc.validate([triggerNode(), split, dataflowNode('p')], [
        { id: 'e0', source: 't', target: 's' },
        { id: 'e1', source: 's', target: 'p' },
      ]);
      expect(r.issues.some(i => i.severity === 'error' && i.message.toLowerCase().includes('variant'))).toBe(true);
    });

    it('error если variant не объявлен в split', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'random',
        variants: [{ key: 'A', label: 'A', weight: 100 }],
      });
      const r = svc.validate([triggerNode(), split, dataflowNode('p')], [
        { id: 'e0', source: 't', target: 's' },
        { id: 'e1', source: 's', target: 'p', data: { variant: 'Z' } },
      ]);
      expect(r.issues.some(i => i.severity === 'error' && i.message.includes('"Z"'))).toBe(true);
    });

    it('error если сумма весов variants = 0', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'random',
        variants: [{ key: 'A', label: 'A', weight: 0 }, { key: 'B', label: 'B', weight: 0 }],
      });
      const r = svc.validate([triggerNode(), split], [
        { id: 'e0', source: 't', target: 's' },
      ]);
      expect(r.issues.some(i => i.severity === 'error' && i.message.includes('весов'))).toBe(true);
    });

    it('error если стратегия hash без userIdField', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'hash',
        variants: [{ key: 'A', label: 'A', weight: 100 }],
      });
      const r = svc.validate([triggerNode(), split], [
        { id: 'e0', source: 't', target: 's' },
      ]);
      expect(r.issues.some(i => i.severity === 'error' && i.message.toLowerCase().includes('useridfield'))).toBe(true);
    });

    it('error если stratified без stratifyBy', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'stratified', userIdField: 'user.id',
        variants: [{ key: 'A', label: 'A', weight: 100 }],
      });
      const r = svc.validate([triggerNode(), split], [
        { id: 'e0', source: 't', target: 's' },
      ]);
      expect(r.issues.some(i => i.severity === 'error' && i.message.toLowerCase().includes('stratifyby'))).toBe(true);
    });

    it('warning если variant объявлен но без исходящего ребра', () => {
      const split = abNode('s', {
        mode: 'split', strategy: 'random',
        variants: [{ key: 'A', label: 'A', weight: 50 }, { key: 'B', label: 'B', weight: 50 }],
      });
      const r = svc.validate([triggerNode(), split, dataflowNode('a')], [
        { id: 'e0', source: 't', target: 's' },
        { id: 'e1', source: 's', target: 'a', data: { variant: 'A' } },
      ]);
      expect(r.issues.some(i => i.severity === 'warning' && i.message.includes('"B"'))).toBe(true);
    });

    it('warning если сумма весов variants ноды (data.variants) не равна 100', () => {
      const split: WorkflowNode = {
        id: 's', type: 'ab', position: { x: 0, y: 0 },
        data: { id: 's', kind: 'ab', label: 's', color: '', successProb: 0,
          variants: [{ label: 'A', weight: 30 }, { label: 'B', weight: 30 }],
          randomization: 'simple', metrics: baseMetrics(),
          config: { mode: 'split', strategy: 'random',
            variants: [{ key: 'A', label: 'A', weight: 30 }, { key: 'B', label: 'B', weight: 30 }] } },
      };
      const r = svc.validate([triggerNode(), split], [
        { id: 'e0', source: 't', target: 's' },
        { id: 'e1', source: 's', target: 't', data: { variant: 'A' } },
        { id: 'e2', source: 's', target: 't', data: { variant: 'B' } },
      ]);
      expect(r.issues.some(i => i.severity === 'warning' && i.message.includes('100%'))).toBe(true);
    });
  });

  describe('правила Merge (join)', () => {
    it('warning если merge с одним входом', () => {
      const r = svc.validate([triggerNode(), joinNode('m')], [
        { id: 'e0', source: 't', target: 'm' },
      ]);
      expect(r.issues.some(i => i.severity === 'warning' && i.message.toLowerCase().includes('merge'))).toBe(true);
    });

    it('нет warning если merge с двумя входами', () => {
      const r = svc.validate([triggerNode(), dataflowNode('a'), joinNode('m')], [
        { id: 'e0', source: 't', target: 'a' },
        { id: 'e1', source: 't', target: 'm' },
        { id: 'e2', source: 'a', target: 'm' },
      ]);
      expect(r.issues.some(i => i.message.toLowerCase().includes('merge') && i.severity === 'warning')).toBe(false);
    });
  });

  describe('utility', () => {
    it('isReady возвращает true для валидного графа', () => {
      expect(svc.isReady([triggerNode()], [])).toBe(true);
    });

    it('isReady возвращает false если есть errors', () => {
      expect(svc.isReady([], [])).toBe(false);
    });

    it('getStatusIcon отдаёт корректные имена', () => {
      expect(svc.getStatusIcon('ready')).toBe('check_circle');
      expect(svc.getStatusIcon('warning')).toBe('warning');
      expect(svc.getStatusIcon('error')).toBe('error');
    });

    it('getStatusColor отдаёт hex-цвета', () => {
      expect(svc.getStatusColor('ready')).toMatch(/^#/);
      expect(svc.getStatusColor('warning')).toMatch(/^#/);
      expect(svc.getStatusColor('error')).toMatch(/^#/);
    });
  });

  describe('buildResult', () => {
    it('сообщение содержит первый error если есть errors', () => {
      const r = svc.validate([], []);
      expect(r.message).toContain('Граф пуст');
    });

    it('сообщение про warning если errors нет, но warnings есть', () => {
      const r = svc.validate([triggerNode(), joinNode('m')], [
        { id: 'e0', source: 't', target: 'm' },
      ]);
      expect(r.status).toBe('warning');
      expect(r.message).toContain('Требует внимания');
    });
  });
});
