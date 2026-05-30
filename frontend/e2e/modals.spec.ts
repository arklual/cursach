import { test, expect } from '@playwright/test';
import {
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
  suppressFirstVisitHints,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Workflow editor — modal toggles', () => {
  let createdId: string;

  test.beforeEach(async ({ page, request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Modal-${Date.now()}`);
    createdId = wf.meta.id;
    await suppressFirstVisitHints(page);
  });
  test.afterEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
  });

  test('"Гайд" opens the guide modal with all 5 steps', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.guide-btn').click();
    await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeVisible();
    await expect(page.locator('.guide-step-num')).toHaveCount(5);
    await expect(page.locator('.guide-tips')).toBeVisible();
  });

  test('"Снепшоты" opens the snapshots modal', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.snapshots-btn').click();
    await expect(page.getByRole('heading', { name: /Снепшоты графа/i })).toBeVisible();
  });

  test('Escape closes guide modal', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.guide-btn').click();
    const title = page.getByRole('heading', { name: 'Как пользоваться редактором' });
    await expect(title).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(title).toBeHidden({ timeout: 2_000 });
  });

  test('Backdrop click closes modal', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.guide-btn').click();
    const title = page.getByRole('heading', { name: 'Как пользоваться редактором' });
    await expect(title).toBeVisible();
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(title).toBeHidden({ timeout: 2_000 });
  });

  test('only one modal is rendered at a time (re-clicking a trigger after close)', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.guide-btn').click();
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await page.locator('.snapshots-btn').click();
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
  });
});
