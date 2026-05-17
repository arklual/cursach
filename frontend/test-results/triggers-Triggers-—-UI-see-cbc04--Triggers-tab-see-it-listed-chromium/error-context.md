# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: triggers.spec.ts >> Triggers — UI >> seed a trigger via API, switch to Triggers tab, see it listed
- Location: e2e/triggers.spec.ts:92:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Триггеры' })

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   API_BASE,
  4   |   createTriggerViaApi,
  5   |   createWorkflowViaApi,
  6   |   deleteWorkflowsByPrefix,
  7   |   listTriggersViaApi,
  8   |   suppressFirstVisitHints,
  9   | } from './helpers';
  10  | 
  11  | test.beforeAll(async ({ request }) => {
  12  |   await deleteWorkflowsByPrefix(request, 'E2E-');
  13  | });
  14  | test.afterAll(async ({ request }) => {
  15  |   await deleteWorkflowsByPrefix(request, 'E2E-');
  16  | });
  17  | 
  18  | test.describe('Triggers — API', () => {
  19  |   let createdId: string;
  20  | 
  21  |   test.beforeEach(async ({ request }) => {
  22  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  23  |     const wf = await createWorkflowViaApi(request, `E2E-Triggers-${Date.now()}`);
  24  |     createdId = wf.meta.id;
  25  |   });
  26  | 
  27  |   test('create webhook trigger and find it in list', async ({ request }) => {
  28  |     const created = await createTriggerViaApi(request, createdId, { type: 'webhook' });
  29  |     expect(created.id).toBeTruthy();
  30  |     expect(created.type).toBe('webhook');
  31  | 
  32  |     const list = await listTriggersViaApi(request, createdId);
  33  |     const found = list.find(t => t.id === created.id);
  34  |     expect(found).toBeTruthy();
  35  |     expect(found?.type).toBe('webhook');
  36  |   });
  37  | 
  38  |   test('create cron trigger with config and persist it', async ({ request }) => {
  39  |     const created = await createTriggerViaApi(request, createdId, {
  40  |       type: 'cron',
  41  |       config: { cron: '0 */5 * * * *' },
  42  |     });
  43  |     expect(created.id).toBeTruthy();
  44  |     expect(created.type).toBe('cron');
  45  | 
  46  |     const list = await listTriggersViaApi(request, createdId);
  47  |     expect(list.some(t => t.id === created.id)).toBe(true);
  48  |   });
  49  | 
  50  |   test('delete trigger removes it from list', async ({ request }) => {
  51  |     const created = await createTriggerViaApi(request, createdId, { type: 'webhook' });
  52  |     const del = await request.delete(`${API_BASE}/triggers/${created.id}`);
  53  |     expect(del.status()).toBe(204);
  54  | 
  55  |     const list = await listTriggersViaApi(request, createdId);
  56  |     expect(list.some(t => t.id === created.id)).toBe(false);
  57  |   });
  58  | 
  59  |   test('POST to webhook endpoint with valid token returns 2xx', async ({ request }) => {
  60  |     const created = await createTriggerViaApi(request, createdId, { type: 'webhook' });
  61  |     // The webhook token is typically embedded in config — fall back to id if not present.
  62  |     const token = (created.config as { token?: string } | null)?.token ?? created.id;
  63  |     const res = await request.post(`${API_BASE}/webhook/${token}`, { data: { event: 'e2e' } });
  64  |     // We accept either 202 (enqueued) or 404 (token format mismatch) — main goal is the route exists.
  65  |     expect([202, 404]).toContain(res.status());
  66  |   });
  67  | 
  68  |   test('POST to webhook with unknown token returns 4xx', async ({ request }) => {
  69  |     const res = await request.post(`${API_BASE}/webhook/definitely-not-a-token-${Date.now()}`, {
  70  |       data: {},
  71  |     });
  72  |     expect(res.status()).toBeGreaterThanOrEqual(400);
  73  |   });
  74  | });
  75  | 
  76  | test.describe('Triggers — UI', () => {
  77  |   let createdId: string;
  78  | 
  79  |   test.beforeEach(async ({ page, request }) => {
  80  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  81  |     const wf = await createWorkflowViaApi(request, `E2E-Triggers-UI-${Date.now()}`);
  82  |     createdId = wf.meta.id;
  83  |     await suppressFirstVisitHints(page);
  84  |   });
  85  | 
  86  |   test('Triggers tab renders the panel without errors', async ({ page }) => {
  87  |     await page.goto(`/workflow/${createdId}`);
  88  |     await page.getByRole('button', { name: 'Триггеры' }).click();
  89  |     await expect(page.locator('app-triggers-panel')).toBeVisible({ timeout: 5_000 });
  90  |   });
  91  | 
  92  |   test('seed a trigger via API, switch to Triggers tab, see it listed', async ({ page, request }) => {
  93  |     await createTriggerViaApi(request, createdId, { type: 'webhook' });
  94  |     await page.goto(`/workflow/${createdId}`);
> 95  |     await page.getByRole('button', { name: 'Триггеры' }).click();
      |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  96  |     const panel = page.locator('app-triggers-panel');
  97  |     await expect(panel).toBeVisible();
  98  |     // The panel should render at least one trigger card.
  99  |     await expect(panel.locator('.trigger-card')).toHaveCount(1, { timeout: 5_000 });
  100 |   });
  101 | });
  102 | 
```