import { test, expect } from '@playwright/test';
import {
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
  enqueueRunViaApi,
  listRunsViaApi,
  suppressFirstVisitHints,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Runs — API', () => {
  let createdId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Runs-${Date.now()}`);
    createdId = wf.meta.id;
  });

  test('enqueue a run and find it in the list', async ({ request }) => {
    const run = await enqueueRunViaApi(request, createdId, { event: 'e2e' });
    expect(run.id).toBeTruthy();
    expect(['queued', 'running', 'completed', 'failed', 'success']).toContain(run.status.toLowerCase());

    const runs = await listRunsViaApi(request, createdId);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.some(r => r.id === run.id)).toBe(true);
  });

  test('listing runs for a fresh workflow returns an empty array', async ({ request }) => {
    const runs = await listRunsViaApi(request, createdId);
    expect(Array.isArray(runs)).toBe(true);
    expect(runs).toEqual([]);
  });

  test('enqueue with empty payload also succeeds', async ({ request }) => {
    const run = await enqueueRunViaApi(request, createdId, {});
    expect(run.id).toBeTruthy();
  });
});

test.describe('Runs — UI', () => {
  let createdId: string;

  test.beforeEach(async ({ page, request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Runs-UI-${Date.now()}`);
    createdId = wf.meta.id;
    await suppressFirstVisitHints(page);
  });

  test('Runs tab renders panel', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.getByRole('tab', { name: 'Запуски' }).click();
    await expect(page.locator('app-runs-panel')).toBeVisible({ timeout: 5_000 });
  });

  test('seed a run via API, switch to Runs tab, see at least one card', async ({ page, request }) => {
    await enqueueRunViaApi(request, createdId, { from: 'e2e' });
    await page.goto(`/workflow/${createdId}`);
    await page.getByRole('tab', { name: 'Запуски' }).click();
    const panel = page.locator('app-runs-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.run-card')).toHaveCount(1, { timeout: 5_000 });
  });
});
