import { WorkflowValidatorService } from './workflow-validator.service';
import { WorkflowNode, WorkflowEdge } from '../models/workflow.model';

describe('WorkflowValidatorService — branch rules', () => {
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

    it('error если split edge без variant', () => {
        const split = abNode('split1', {
            mode: 'split', strategy: 'random',
            variants: [{ key: 'A', label: 'A', weight: 100 }],
        });
        const target = dataflowNode('p');
        const edges: WorkflowEdge[] = [
            { id: 'e0', source: 't', target: 'split1' },
            { id: 'e1', source: 'split1', target: 'p' },
        ];
        const result = svc.validate([triggerNode(), split, target], edges);
        expect(result.issues.some(i => i.severity === 'error' && i.message.toLowerCase().includes('variant'))).toBe(true);
    });

    it('error если hash без userIdField', () => {
        const split = abNode('split1', {
            mode: 'split', strategy: 'hash',
            variants: [{ key: 'A', label: 'A', weight: 100 }],
        });
        const result = svc.validate([triggerNode(), split], [
            { id: 'e0', source: 't', target: 'split1' },
        ]);
        expect(result.issues.some(i => i.severity === 'error' && i.message.toLowerCase().includes('useridfield'))).toBe(true);
    });

    it('warning если Merge с одним входом', () => {
        const result = svc.validate(
            [triggerNode(), joinNode('m')],
            [{ id: 'e1', source: 't', target: 'm' }],
        );
        expect(result.issues.some(i => i.severity === 'warning' && i.message.toLowerCase().includes('merge'))).toBe(true);
    });
});
