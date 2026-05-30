export interface paths {
    "/workflows/{workflowId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get"];
        put: operations["updateMeta"];
        post?: never;
        delete: operations["delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflow-versions/{versionId}/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["putGraph"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["list"];
        put?: never;
        post: operations["create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listVersions"];
        put?: never;
        post: operations["createVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/versions/{versionId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["restoreVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/snapshots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["list_1"];
        put?: never;
        post: operations["create_1"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/snapshots/{snapshotId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listRuns"];
        put?: never;
        post: operations["runWorkflow"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/nodes/{nodeId}/debug-run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["debugRunNode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/debug-sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["webhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/debug-sessions/{sessionId}/step": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["step"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/debug-sessions/{sessionId}/run-to-end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["runToEnd"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/triggers/{triggerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["update"];
        trace?: never;
    };
    "/workflows/{workflowId}/triggers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["list_2"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/ab-analytics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get_1"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflow-runs/{runId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflow-runs/{runId}/result": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getRunResult"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/node-runs/{nodeRunId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getNodeRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/debug-sessions/{sessionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get_2"];
        put?: never;
        post?: never;
        delete: operations["close"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflows/{workflowId}/snapshots/{snapshotId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["delete_1"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        WorkflowMetaUpdate: {
            name?: string;
            description?: string;
        };
        WorkflowMeta: {
            id: string;
            name: string;
            description?: string;
            isDemo: boolean;
            nodesCount: number;
            createdAt: string;
            updatedAt: string;
        };
        Connection: {
            id: string;
            source: string;
            target: string;
            sourceHandle?: string;
            targetHandle?: string;
            variant?: string;
        };
        JsonNode: Record<string, never>;
        Node: {
            id: string;
            type: string;
            position?: components["schemas"]["Position"];
            data?: components["schemas"]["NodeData"];
        };
        NodeData: {
            label?: string;
            config?: components["schemas"]["JsonNode"];
            abConfig?: components["schemas"]["JsonNode"];
        };
        Position: {
            x: number;
            y: number;
        };
        WorkflowGraph: {
            versionId: string;
            nodes: components["schemas"]["Node"][];
            connections: components["schemas"]["Connection"][];
        };
        WorkflowCreateRequest: {
            name: string;
            description?: string;
        };
        Workflow: {
            meta: components["schemas"]["WorkflowMeta"];
            graph: components["schemas"]["WorkflowGraph"];
        };
        WorkflowVersionCreateRequest: {
            versionTag?: string;
        };
        WorkflowVersion: {
            id: string;
            workflowId: string;
            tag?: string;
            createdAt: string;
        };
        CreateSnapshotRequest: {
            name: string;
            description?: string;
        };
        WorkflowSnapshot: {
            id: string;
            workflowId: string;
            name: string;
            description?: string;
            createdAt: string;
        };
        NodeRun: {
            id: string;
            workflowRunId: string;
            nodeId: string;
            nodeType?: string;
            status: string;
            startedAt?: string;
            finishedAt?: string;
            input?: components["schemas"]["JsonNode"];
            output?: components["schemas"]["JsonNode"];
            errorMessage?: string;
        };
        WorkflowRun: {
            id: string;
            workflowId: string;
            status: string;
            startedAt?: string;
            finishedAt?: string;
            durationMs?: number;
            input?: components["schemas"]["JsonNode"];
            output?: components["schemas"]["JsonNode"];
            startNodeId?: string;
            isDebug: boolean;
            triggerType?: string;
            nodes: components["schemas"]["NodeRun"][];
        };
        DebugNodeRunRequest: {
            input?: components["schemas"]["JsonNode"];
        };
        DebugNodeRunResult: {
            runId: string;
            workflowId: string;
            nodeId: string;
            status: string;
            input?: components["schemas"]["JsonNode"];
            output?: components["schemas"]["JsonNode"];
            errorMessage?: string;
        };
        DebugStartRequest: {
            input?: components["schemas"]["JsonNode"];
            startNodeId?: string;
        };
        DebugFailedNode: {
            nodeId: string;
            message: string;
        };
        DebugSessionDto: {
            sessionId: string;
            workflowId: string;
            versionId: string;
            status: string;
            input?: components["schemas"]["JsonNode"];
            outputs: {
                [key: string]: components["schemas"]["JsonNode"];
            };
            completed: string[];
            skipped: string[];
            failed: components["schemas"]["DebugFailedNode"][];
            ready: string[];
            createdAt: string;
            updatedAt: string;
            readyInputs: {
                [key: string]: components["schemas"]["JsonNode"];
            };
        };
        WebhookAccepted: {
            run: components["schemas"]["WorkflowRun"];
            pollUrl: string;
        };
        DebugStepRequest: {
            nodeId?: string;
        };
        TriggerUpdate: {
            enabled: boolean;
        };
        Trigger: {
            id: string;
            workflowId: string;
            nodeId: string;
            type: string;
            config?: components["schemas"]["JsonNode"];
            token?: string;
            enabled: boolean;
        };
        AbAnalyticsResponse: {
            abNodeId: string;
            mode: string;
            totalRuns: number;
            excludedNoVariant: number;
            computedAt: string;
            variants: components["schemas"]["AbVariantRow"][];
            warnings: string[];
        };
        AbVariantRow: {
            key: string;
            label: string;
            color: string;
            weight?: number;
            runs: number;
            trafficCount: number;
            trafficPct: number;
            conversions?: number;
            conversionPct?: number;
            ciLow?: number;
            ciHigh?: number;
            liftVsBaseline?: number;
            pValue?: number;
            isBaseline: boolean;
            isSignificant: boolean;
            pvalue?: number;
        };
        WorkflowRunResult: {
            id: string;
            workflowId: string;
            status: string;
            startedAt?: string;
            finishedAt?: string;
            durationMs?: number;
            output?: components["schemas"]["JsonNode"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["Workflow"];
                };
            };
        };
    };
    updateMeta: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowMetaUpdate"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowMeta"];
                };
            };
        };
    };
    delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    putGraph: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                versionId: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowGraph"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowGraph"];
                };
            };
        };
    };
    list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowMeta"][];
                };
            };
        };
    };
    create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowCreateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["Workflow"];
                };
            };
        };
    };
    listVersions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowVersion"][];
                };
            };
        };
    };
    createVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["WorkflowVersionCreateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowVersion"];
                };
            };
        };
    };
    restoreVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
                versionId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowGraph"];
                };
            };
        };
    };
    list_1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowSnapshot"][];
                };
            };
        };
    };
    create_1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateSnapshotRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowSnapshot"];
                };
            };
        };
    };
    restore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
                snapshotId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowGraph"];
                };
            };
        };
    };
    listRuns: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowRun"][];
                };
            };
        };
    };
    runWorkflow: {
        parameters: {
            query?: {
                startNodeId?: string;
            };
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["JsonNode"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowRun"];
                };
            };
        };
    };
    debugRunNode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
                nodeId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["DebugNodeRunRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["DebugNodeRunResult"];
                };
            };
        };
    };
    start: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["DebugStartRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["DebugSessionDto"];
                };
            };
        };
    };
    webhook: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["JsonNode"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WebhookAccepted"];
                };
            };
        };
    };
    step: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["DebugStepRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["DebugSessionDto"];
                };
            };
        };
    };
    runToEnd: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["DebugSessionDto"];
                };
            };
        };
    };
    update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
                triggerId: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TriggerUpdate"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["Trigger"];
                };
            };
        };
    };
    list_2: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["Trigger"][];
                };
            };
        };
    };
    get_1: {
        parameters: {
            query: {
                abNodeId: string;
            };
            header?: never;
            path: {
                workflowId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["AbAnalyticsResponse"];
                };
            };
        };
    };
    getRun: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowRun"];
                };
            };
        };
    };
    getRunResult: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                runId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["WorkflowRunResult"];
                };
            };
        };
    };
    getNodeRun: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                nodeRunId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["NodeRun"];
                };
            };
        };
    };
    get_2: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": components["schemas"]["DebugSessionDto"];
                };
            };
        };
    };
    close: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    delete_1: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                workflowId: string;
                snapshotId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
