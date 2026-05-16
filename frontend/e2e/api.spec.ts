import { test, expect } from '@playwright/test';
import {
  API_BASE,
  createWorkflowViaApi,
  deleteWorkflowViaApi,
  deleteWorkflowsByPrefix,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Backend API contract — workflows', () => {
  test('GET /workflows returns an array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/workflows`);
    expect(res.ok()).toBeTruthy();
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
  });

  test('POST /workflows creates a workflow with id, meta, graph', async ({ request }) => {
    const res = await request.post(`${API_BASE}/workflows`, {
      data: { name: `E2E-API-${Date.now()}`, description: 'contract test' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.meta?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.meta?.name).toMatch(/^E2E-API-/);
    expect(body.graph?.versionId).toBeTruthy();
    expect(Array.isArray(body.graph?.nodes)).toBe(true);
    expect(Array.isArray(body.graph?.connections)).toBe(true);
  });

  test('GET /workflows/:id returns full workflow shape', async ({ request }) => {
    const created = await createWorkflowViaApi(request, `E2E-API-${Date.now()}`);
    const res = await request.get(`${API_BASE}/workflows/${created.meta.id}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.meta?.id).toBe(created.meta.id);
    expect(body.graph?.versionId).toBeTruthy();
  });

  test('PUT /workflows/:id updates the name', async ({ request }) => {
    const created = await createWorkflowViaApi(request, `E2E-API-${Date.now()}`);
    const newName = `E2E-API-renamed-${Date.now()}`;
    const res = await request.put(`${API_BASE}/workflows/${created.meta.id}`, {
      data: { name: newName, description: created.meta.name },
    });
    expect(res.ok()).toBeTruthy();
    const meta = await res.json();
    expect(meta.name).toBe(newName);
  });

  test('DELETE /workflows/:id makes a follow-up GET 404', async ({ request }) => {
    const created = await createWorkflowViaApi(request, `E2E-API-${Date.now()}`);
    await deleteWorkflowViaApi(request, created.meta.id);
    const res = await request.get(`${API_BASE}/workflows/${created.meta.id}`);
    expect(res.status()).toBe(404);
  });

  test('GET unknown workflow returns 404', async ({ request }) => {
    const res = await request.get(`${API_BASE}/workflows/00000000-0000-4000-8000-000000000044`);
    expect(res.status()).toBe(404);
  });

  test('DELETE unknown workflow returns 404', async ({ request }) => {
    const res = await request.delete(`${API_BASE}/workflows/d68f1ee0-739b-4c21-a965-47a43bdd5ec7`);
    expect(res.status()).toBe(404);
  });
});

test.describe('Backend API — websocket / sockjs reachability', () => {
  test('SockJS /info endpoint reachable under /v1', async ({ request }) => {
    const res = await request.get(`${API_BASE}/ws/info?t=${Date.now()}`);
    expect(res.ok()).toBeTruthy();
    const info = await res.json();
    expect(info.websocket).toBe(true);
  });
});
