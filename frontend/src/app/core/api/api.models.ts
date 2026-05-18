// Короткие алиасы поверх auto-generated api.types.ts.
// Регенерируется через `npm run gen:api`. Если бэк-swagger меняется, обновится только api.types.ts.

import type { components, paths } from './api.types';

type Schemas = components['schemas'];

export type WorkflowMeta = Schemas['WorkflowMeta'];
export type Workflow = Schemas['Workflow'];
export type WorkflowGraph = Schemas['WorkflowGraph'];
export type WorkflowNode = Schemas['Node'];
export type WorkflowConnection = Schemas['Connection'];
export type WorkflowVersion = Schemas['WorkflowVersion'];
export type Trigger = Schemas['Trigger'];
export type TriggerUpdate = Schemas['TriggerUpdate'];
export type WorkflowRun = Schemas['WorkflowRun'];
export type NodeRun = Schemas['NodeRun'];
export type WebhookAccepted = Schemas['WebhookAccepted'];
export type WorkflowRunResult = Schemas['WorkflowRunResult'];

// Inline request-bodies из paths
export type WorkflowCreateRequest = NonNullable<
    paths['/workflows']['post']['requestBody']
>['content']['application/json'];

export type WorkflowMetaUpdateRequest = Schemas['WorkflowMetaUpdate'];

export type EnqueueRunInput = NonNullable<
    paths['/workflows/{workflowId}/runs']['post']['requestBody']
>['content']['application/json'];
