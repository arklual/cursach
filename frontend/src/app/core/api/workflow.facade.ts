import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import type {
    WorkflowEdge as FrontEdge,
    WorkflowNode as FrontNode,
} from '../../models/workflow.model';
import { WorkflowMeta as UiMeta } from '../../services/workflow.service';
import type { WorkflowMeta as BackendMeta } from './api.models';
import { buildGraphForBackend, parseGraphFromBackend } from './workflow.mapper';
import { WorkflowApiService } from './workflow.api';

export interface LoadedWorkflow {
    meta: UiMeta;
    versionId: string;
    nodes: FrontNode[];
    edges: FrontEdge[];
}

function toUiMeta(backend: Partial<BackendMeta> | undefined, nodesCount = 0): UiMeta {
    const m = backend ?? {};
    return {
        id: m.id ?? '',
        name: m.name ?? '',
        description: m.description ?? '',
        status: 'draft',
        nodesCount,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date(),
    };
}

/**
 * Высокоуровневый сервис над WorkflowApiService.
 * Превращает бэк-DTO в фронт-модели и обратно; компоненты пользуются только им.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowFacade {
    private readonly api = inject(WorkflowApiService);

    listWorkflows(): Observable<UiMeta[]> {
        return this.api.list().pipe(map(list => list.map(m => toUiMeta(m))));
    }

    createWorkflow(name: string, description = ''): Observable<{ workflowId: string; versionId: string }> {
        return this.api.create({ name, description }).pipe(
            map(wf => ({
                workflowId: wf.meta?.id ?? '',
                versionId: wf.graph?.versionId ?? '',
            })),
        );
    }

    loadWorkflow(workflowId: string): Observable<LoadedWorkflow> {
        return this.api.get(workflowId).pipe(
            map(wf => {
                const graph = wf.graph ?? { versionId: '', nodes: [], connections: [] };
                const { nodes, edges } = parseGraphFromBackend(graph);
                return {
                    meta: toUiMeta(wf.meta, nodes.length),
                    versionId: graph.versionId ?? '',
                    nodes,
                    edges,
                };
            }),
        );
    }

    saveGraph(versionId: string, nodes: FrontNode[], edges: FrontEdge[]): Observable<void> {
        const graph = buildGraphForBackend(versionId, nodes, edges);
        return this.api.putGraph(versionId, graph).pipe(map(() => void 0));
    }

    deleteWorkflow(workflowId: string): Observable<void> {
        return this.api.delete(workflowId);
    }

    duplicateWorkflow(workflowId: string): Observable<{ workflowId: string; versionId: string }> {
        return this.api.get(workflowId).pipe(
            switchMap(source => {
                const sourceName = source.meta?.name ?? 'Workflow';
                const sourceDesc = source.meta?.description ?? '';
                const sourceGraph = source.graph ?? { versionId: '', nodes: [], connections: [] };
                return this.api.create({ name: `${sourceName} (копия)`, description: sourceDesc }).pipe(
                    switchMap(created => {
                        const newVersionId = created.graph?.versionId ?? '';
                        return this.api.putGraph(newVersionId, {
                            ...sourceGraph,
                            versionId: newVersionId,
                        }).pipe(
                            map(() => ({
                                workflowId: created.meta?.id ?? '',
                                versionId: newVersionId,
                            })),
                        );
                    }),
                );
            }),
        );
    }

    renameWorkflow(workflowId: string, name: string, description?: string): Observable<UiMeta> {
        return this.api.updateMeta(workflowId, { name, description }).pipe(map(meta => toUiMeta(meta)));
    }
}
