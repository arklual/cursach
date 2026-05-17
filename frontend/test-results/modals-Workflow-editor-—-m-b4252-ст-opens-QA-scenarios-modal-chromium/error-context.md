# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: modals.spec.ts >> Workflow editor — modal toggles >> "QA-чеклист" opens QA scenarios modal
- Location: e2e/modals.spec.ts:35:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'QA-чеклист' })

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import {
  3  |   attachConsoleSpy,
  4  |   createWorkflowViaApi,
  5  |   deleteWorkflowsByPrefix,
  6  |   suppressFirstVisitHints,
  7  | } from './helpers';
  8  | 
  9  | test.beforeAll(async ({ request }) => {
  10 |   await deleteWorkflowsByPrefix(request, 'E2E-');
  11 | });
  12 | test.afterAll(async ({ request }) => {
  13 |   await deleteWorkflowsByPrefix(request, 'E2E-');
  14 | });
  15 | 
  16 | test.describe('Workflow editor — modal toggles', () => {
  17 |   let createdId: string;
  18 | 
  19 |   test.beforeEach(async ({ page, request }) => {
  20 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  21 |     const wf = await createWorkflowViaApi(request, `E2E-Modal-${Date.now()}`);
  22 |     createdId = wf.meta.id;
  23 |     await suppressFirstVisitHints(page);
  24 |   });
  25 |   test.afterEach(async ({ request }) => {
  26 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  27 |   });
  28 | 
  29 |   test('"События" opens Event Schema modal', async ({ page }) => {
  30 |     await page.goto(`/workflow/${createdId}`);
  31 |     await page.getByRole('button', { name: 'События' }).click();
  32 |     await expect(page.getByRole('heading', { name: /JSON Schema/i })).toBeVisible();
  33 |   });
  34 | 
  35 |   test('"QA-чеклист" opens QA scenarios modal', async ({ page }) => {
  36 |     await page.goto(`/workflow/${createdId}`);
> 37 |     await page.getByRole('button', { name: 'QA-чеклист' }).click();
     |                                                            ^ Error: locator.click: Test timeout of 30000ms exceeded.
  38 |     await expect(page.getByRole('heading', { name: /QA/i }).first()).toBeVisible();
  39 |   });
  40 | 
  41 |   test('"Результаты A/B" opens experiment modal', async ({ page }) => {
  42 |     const errs = attachConsoleSpy(page);
  43 |     await page.goto(`/workflow/${createdId}`);
  44 |     await page.getByRole('button', { name: 'Результаты A/B' }).click();
  45 |     await expect(page.locator('.modal-backdrop')).toBeVisible();
  46 |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  47 |   });
  48 | 
  49 |   test('"? Гайд" opens the guide modal with all 5 steps', async ({ page }) => {
  50 |     await page.goto(`/workflow/${createdId}`);
  51 |     await page.locator('.guide-btn').click();
  52 |     await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeVisible();
  53 |     await expect(page.locator('.guide-step-num')).toHaveCount(5);
  54 |     await expect(page.locator('.guide-tips')).toBeVisible();
  55 |   });
  56 | 
  57 |   test('Escape closes any open modal', async ({ page }) => {
  58 |     await page.goto(`/workflow/${createdId}`);
  59 |     await page.getByRole('button', { name: 'События' }).click();
  60 |     const title = page.getByRole('heading', { name: /JSON Schema/i });
  61 |     await expect(title).toBeVisible();
  62 |     await page.keyboard.press('Escape');
  63 |     await expect(title).toBeHidden({ timeout: 2_000 });
  64 |   });
  65 | 
  66 |   test('Backdrop click closes modal', async ({ page }) => {
  67 |     await page.goto(`/workflow/${createdId}`);
  68 |     await page.getByRole('button', { name: 'QA-чеклист' }).click();
  69 |     const title = page.getByRole('heading', { name: /QA/i }).first();
  70 |     await expect(title).toBeVisible();
  71 |     await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
  72 |     await expect(title).toBeHidden({ timeout: 2_000 });
  73 |   });
  74 | 
  75 |   test('only one modal is rendered at a time (re-clicking a trigger after close)', async ({ page }) => {
  76 |     await page.goto(`/workflow/${createdId}`);
  77 |     await page.getByRole('button', { name: 'События' }).click();
  78 |     await expect(page.locator('.modal-backdrop')).toHaveCount(1);
  79 |     await page.keyboard.press('Escape');
  80 |     await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  81 |     await page.getByRole('button', { name: 'QA-чеклист' }).click();
  82 |     await expect(page.locator('.modal-backdrop')).toHaveCount(1);
  83 |   });
  84 | });
  85 | 
```