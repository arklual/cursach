import { test, expect } from '@playwright/test';
import {
  API_BASE,
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Workflow versions — API', () => {
  let createdId: string;
  let initialVersionId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Versions-${Date.now()}`);
    createdId = wf.meta.id;
    initialVersionId = wf.graph.versionId;
  });

  test('fresh workflow has at least one (draft) version', async ({ request }) => {
    const res = await request.get(`${API_BASE}/workflows/${createdId}/versions`);
    expect(res.ok()).toBeTruthy();
    const versions = (await res.json()) as Array<{ id: string; tag: string | null }>;
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.some(v => v.id === initialVersionId)).toBe(true);
  });

  test('POST /versions creates an additional version', async ({ request }) => {
    const post = await request.post(`${API_BASE}/workflows/${createdId}/versions`, { data: {} });
    expect(post.ok()).toBeTruthy();
    const created = (await post.json()) as { id: string; workflowId: string };
    expect(created.id).toBeTruthy();
    expect(created.workflowId).toBe(createdId);

    const listRes = await request.get(`${API_BASE}/workflows/${createdId}/versions`);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some(v => v.id === created.id)).toBe(true);
  });

  test('updating the graph for a version returns the materialized graph', async ({ request }) => {
    const body = {
      versionId: initialVersionId,
      nodes: [
        {
          id: 'n-1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: { label: 'Test trigger' },
        },
        {
          id: 'n-2',
          type: 'http',
          position: { x: 300, y: 100 },
          data: { label: 'Call API' },
        },
      ],
      connections: [
        { id: 'c-1', source: 'n-1', target: 'n-2' },
      ],
    };
    const res = await request.put(`${API_BASE}/workflow-versions/${initialVersionId}/graph`, { data: body });
    expect(res.ok(), `expected 2xx but got ${res.status()}: ${await res.text()}`).toBeTruthy();
    const graph = (await res.json()) as { nodes: unknown[]; connections: unknown[] };
    expect(graph.nodes.length).toBe(2);
    expect(graph.connections.length).toBe(1);
  });

  test('updating graph with a connection referencing an unknown node returns 400', async ({ request }) => {
    const body = {
      versionId: initialVersionId,
      nodes: [{ id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'A' } }],
      connections: [{ id: 'c-bad', source: 'a', target: 'does-not-exist' }],
    };
    const res = await request.put(`${API_BASE}/workflow-versions/${initialVersionId}/graph`, { data: body });
    expect(res.status()).toBe(400);
  });

  test('updating graph with duplicate node ids returns 400', async ({ request }) => {
    const body = {
      versionId: initialVersionId,
      nodes: [
        { id: 'dup', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'one' } },
        { id: 'dup', type: 'http', position: { x: 200, y: 0 }, data: { label: 'two' } },
      ],
      connections: [],
    };
    const res = await request.put(`${API_BASE}/workflow-versions/${initialVersionId}/graph`, { data: body });
    expect(res.status()).toBe(400);
  });
});
