# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: runs.spec.ts >> Runs — UI >> Test-Run (1 sample) also writes to the log
- Location: e2e/runs.spec.ts:73:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Тест-запуск' })

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import {
  3  |   createWorkflowViaApi,
  4  |   deleteWorkflowsByPrefix,
  5  |   enqueueRunViaApi,
  6  |   listRunsViaApi,
  7  |   suppressFirstVisitHints,
  8  | } from './helpers';
  9  | 
  10 | test.beforeAll(async ({ request }) => {
  11 |   await deleteWorkflowsByPrefix(request, 'E2E-');
  12 | });
  13 | test.afterAll(async ({ request }) => {
  14 |   await deleteWorkflowsByPrefix(request, 'E2E-');
  15 | });
  16 | 
  17 | test.describe('Runs — API', () => {
  18 |   let createdId: string;
  19 | 
  20 |   test.beforeEach(async ({ request }) => {
  21 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  22 |     const wf = await createWorkflowViaApi(request, `E2E-Runs-${Date.now()}`);
  23 |     createdId = wf.meta.id;
  24 |   });
  25 | 
  26 |   test('enqueue a run and find it in the list', async ({ request }) => {
  27 |     const run = await enqueueRunViaApi(request, createdId, { event: 'e2e' });
  28 |     expect(run.id).toBeTruthy();
  29 |     expect(['queued', 'running', 'completed', 'failed', 'success']).toContain(run.status.toLowerCase());
  30 | 
  31 |     const runs = await listRunsViaApi(request, createdId);
  32 |     expect(runs.length).toBeGreaterThanOrEqual(1);
  33 |     expect(runs.some(r => r.id === run.id)).toBe(true);
  34 |   });
  35 | 
  36 |   test('listing runs for a fresh workflow returns an empty array', async ({ request }) => {
  37 |     const runs = await listRunsViaApi(request, createdId);
  38 |     expect(Array.isArray(runs)).toBe(true);
  39 |     expect(runs).toEqual([]);
  40 |   });
  41 | 
  42 |   test('enqueue with empty payload also succeeds', async ({ request }) => {
  43 |     const run = await enqueueRunViaApi(request, createdId, {});
  44 |     expect(run.id).toBeTruthy();
  45 |   });
  46 | });
  47 | 
  48 | test.describe('Runs — UI', () => {
  49 |   let createdId: string;
  50 | 
  51 |   test.beforeEach(async ({ page, request }) => {
  52 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  53 |     const wf = await createWorkflowViaApi(request, `E2E-Runs-UI-${Date.now()}`);
  54 |     createdId = wf.meta.id;
  55 |     await suppressFirstVisitHints(page);
  56 |   });
  57 | 
  58 |   test('Runs tab renders panel', async ({ page }) => {
  59 |     await page.goto(`/workflow/${createdId}`);
  60 |     await page.getByRole('button', { name: 'Запуски' }).click();
  61 |     await expect(page.locator('app-runs-panel')).toBeVisible({ timeout: 5_000 });
  62 |   });
  63 | 
  64 |   test('Simulate (500) populates the execution log', async ({ page }) => {
  65 |     await page.goto(`/workflow/${createdId}`);
  66 |     await expect(page.locator('.app-header')).toBeVisible();
  67 |     const before = await page.locator('.log-entry').count();
  68 |     await page.getByRole('button', { name: /Симуляция \(500\)/i }).click();
  69 |     await expect.poll(async () => page.locator('.log-entry').count(), { timeout: 8_000 })
  70 |       .toBeGreaterThan(before);
  71 |   });
  72 | 
  73 |   test('Test-Run (1 sample) also writes to the log', async ({ page }) => {
  74 |     await page.goto(`/workflow/${createdId}`);
  75 |     const before = await page.locator('.log-entry').count();
> 76 |     await page.getByRole('button', { name: 'Тест-запуск' }).click();
     |                                                             ^ Error: locator.click: Test timeout of 30000ms exceeded.
  77 |     await expect.poll(async () => page.locator('.log-entry').count(), { timeout: 8_000 })
  78 |       .toBeGreaterThan(before);
  79 |   });
  80 | 
  81 |   test('seed a run via API, switch to Runs tab, see at least one card', async ({ page, request }) => {
  82 |     await enqueueRunViaApi(request, createdId, { from: 'e2e' });
  83 |     await page.goto(`/workflow/${createdId}`);
  84 |     await page.getByRole('button', { name: 'Запуски' }).click();
  85 |     const panel = page.locator('app-runs-panel');
  86 |     await expect(panel).toBeVisible();
  87 |     await expect(panel.locator('.run-card')).toHaveCount(1, { timeout: 5_000 });
  88 |   });
  89 | });
  90 | 
```