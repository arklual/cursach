import { test, expect } from '@playwright/test';
import {
  attachConsoleSpy,
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
  gotoList,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Workflows list — intro banner', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('shows intro banner on first visit and hides it after dismiss + reload', async ({ page }) => {
    const errs = attachConsoleSpy(page);

    // Fresh Playwright context already has empty localStorage. Avoid addInitScript here:
    // it would re-run on page.reload() and wipe the dismissed flag we want to verify persists.
    await gotoList(page);
    const banner = page.locator('.intro-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('heading', { name: 'Что это вообще такое?' })).toBeVisible();

    await banner.getByRole('button', { name: 'Понятно, скрыть' }).click();
    await expect(banner).toBeHidden();

    const flag = await page.evaluate(() => localStorage.getItem('fluxpilot.introSeen'));
    expect(flag).toBe('1');

    await page.reload();
    await expect(page.locator('.intro-banner')).toBeHidden();
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('intro banner stays hidden when localStorage flag is already set', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('fluxpilot.introSeen', '1'); } catch { /* ignore */ }
    });
    await gotoList(page);
    await expect(page.locator('.intro-banner')).toBeHidden();
  });

  test('intro banner has primary "+ Создать workflow" that navigates to editor', async ({ page }) => {
    // Fresh context → localStorage empty → banner shows by default.
    await gotoList(page);
    const banner = page.locator('.intro-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: /Создать workflow/i }).click();
    await page.waitForURL(/\/workflow\/[0-9a-f-]{36}$/, { timeout: 8_000 });
  });
});

test.describe('Workflow editor — Guide modal first-visit', () => {
  let createdId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Guide-${Date.now()}`);
    createdId = wf.meta.id;
  });
  test.afterEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
  });

  test('Guide modal auto-opens on first visit and persists "seen" on close', async ({ page }) => {
    // Fresh context → localStorage empty → guide auto-opens by default. We don't use
    // addInitScript here because it would re-run on page.reload() and remove the
    // 'guideSeen' flag we just set, falsely reopening the modal.
    await page.goto(`/workflow/${createdId}`);

    const guideTitle = page.getByRole('heading', { name: 'Как пользоваться редактором' });
    await expect(guideTitle).toBeVisible({ timeout: 5_000 });

    const stepNums = page.locator('.guide-step-num');
    await expect(stepNums).toHaveCount(5);

    await page.locator('.modal-card').getByRole('button', { name: '✕' }).click().catch(async () => {
      // Fallback: Esc
      await page.keyboard.press('Escape');
    });
    await expect(guideTitle).toBeHidden({ timeout: 2_000 });

    const flag = await page.evaluate(() => localStorage.getItem('fluxpilot.guideSeen'));
    expect(flag).toBe('1');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeHidden({ timeout: 3_000 });
  });

  test('Guide modal does NOT auto-open when seen flag is set', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('fluxpilot.guideSeen', '1'); } catch { /* ignore */ }
    });
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeHidden();
  });

  test('"? Гайд" button manually re-opens the guide modal', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('fluxpilot.guideSeen', '1'); } catch { /* ignore */ }
    });
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();

    await page.locator('.guide-btn').click();
    await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeVisible();
  });
});
