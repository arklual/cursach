import { test, expect } from '@playwright/test';
import {
  API_BASE,
  connectNodes,
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
  dragPaletteNode,
  listRunsViaApi,
  listTriggersViaApi,
  suppressFirstVisitHints,
  waitForTriggers,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Triggers — graph-driven sync', () => {
  let workflowId: string;

  test.beforeEach(async ({ page, request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Triggers-${Date.now()}`);
    workflowId = wf.meta.id;
    await suppressFirstVisitHints(page);
  });

  test('dropping a Webhook node syncs a webhook trigger with token after save', async ({ page, request }) => {
    await page.goto(`/workflow/${workflowId}`);
    await dragPaletteNode(page, 'trigger:webhook', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);

    const list = await waitForTriggers(
      request,
      workflowId,
      ts => ts.some(t => t.type === 'webhook' && !!t.token),
      12_000,
    );
    const webhook = list.find(t => t.type === 'webhook');
    expect(webhook).toBeTruthy();
    expect(webhook!.token).toBeTruthy();
    expect(webhook!.nodeId).toBeTruthy();
  });

  test('dropping a Cron node + editing expression persists cron config', async ({ page, request }) => {
    await page.goto(`/workflow/${workflowId}`);
    await dragPaletteNode(page, 'trigger:cron', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);
    await page.locator('.node-wrap').first().click();

    const inspector = page.locator('app-inspector');
    await expect(inspector).toBeVisible();
    const cronInput = inspector.locator('input[placeholder*="* * * * *"]');
    await cronInput.fill('0 */5 * * * *');
    await cronInput.blur();

    const list = await waitForTriggers(
      request,
      workflowId,
      ts => ts.some(t => t.type === 'cron' && (t.config as { expression?: string } | undefined)?.expression === '0 */5 * * * *'),
      12_000,
    );
    expect(list.find(t => t.type === 'cron')).toBeTruthy();
  });

  test('dropping an Interval node + setting seconds persists interval config', async ({ page, request }) => {
    await page.goto(`/workflow/${workflowId}`);
    await dragPaletteNode(page, 'trigger:interval', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);
    await page.locator('.node-wrap').first().click();

    const inspector = page.locator('app-inspector');
    await expect(inspector).toBeVisible();
    const numericInput = inspector.locator('input[type="number"]').last();
    await numericInput.fill('7');
    await numericInput.blur();

    const list = await waitForTriggers(
      request,
      workflowId,
      ts => ts.some(t => t.type === 'interval' && Number((t.config as { periodSeconds?: number } | undefined)?.periodSeconds) === 7),
      12_000,
    );
    expect(list.find(t => t.type === 'interval')).toBeTruthy();
  });

  test('removing a trigger node removes the row on next save', async ({ page, request }) => {
    await page.goto(`/workflow/${workflowId}`);
    await dragPaletteNode(page, 'trigger:webhook', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);
    await waitForTriggers(request, workflowId, ts => ts.length === 1, 12_000);

    await page.locator('.node-wrap').first().click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Удалить ноду' }).click();
    await expect(page.locator('.node-wrap')).toHaveCount(0);

    await waitForTriggers(request, workflowId, ts => ts.length === 0, 12_000);
  });

  test('webhook end-to-end: POST /webhook/{token} enqueues a run', async ({ page, request }) => {
    await page.goto(`/workflow/${workflowId}`);
    await dragPaletteNode(page, 'trigger:webhook', { x: 200, y: 220 });
    await dragPaletteNode(page, 'http', { x: 480, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(2);
    await connectNodes(page, 0, 1);
    await expect(page.locator('.edge-group')).toHaveCount(1);

    const list = await waitForTriggers(
      request,
      workflowId,
      ts => ts.some(t => t.type === 'webhook' && !!t.token),
      12_000,
    );
    const token = list.find(t => t.type === 'webhook')!.token!;

    const res = await request.post(`${API_BASE}/webhook/${token}`, { data: { event: 'e2e' } });
    expect([200, 202]).toContain(res.status());

    await expect.poll(async () => (await listRunsViaApi(request, workflowId)).length, { timeout: 6_000 })
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe('Triggers — removed REST surface', () => {
  let workflowId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Triggers-API-${Date.now()}`);
    workflowId = wf.meta.id;
  });

  test('POST /workflows/{id}/triggers is no longer routed', async ({ request }) => {
    const res = await request.post(`${API_BASE}/workflows/${workflowId}/triggers`, {
      data: { type: 'webhook' },
    });
    expect([404, 405]).toContain(res.status());
  });

  test('DELETE /triggers/{id} is no longer routed', async ({ request }) => {
    const res = await request.delete(`${API_BASE}/triggers/does-not-matter`);
    expect([404, 405]).toContain(res.status());
  });

  test('POST /webhook with unknown token returns 4xx', async ({ request }) => {
    const res = await request.post(`${API_BASE}/webhook/definitely-not-a-token-${Date.now()}`, {
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('GET /workflows/{id}/triggers returns empty array initially', async ({ request }) => {
    const list = await listTriggersViaApi(request, workflowId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });
});
