import { test, expect } from '@playwright/test';

test('open workflow opens in edit mode with bottom panel collapsed and Debug tab visible', async ({ page }) => {
    // Pre-set the guide-dismissed flag so the onboarding modal doesn't pop up.
    await page.addInitScript(() => {
        localStorage.setItem('fluxpilot.guideSeen', '1');
    });

    // Create workflow via backend API directly
    const created = await page.request.post('http://localhost:8080/v1/workflows', {
        data: { name: `smoke-${Date.now()}` },
    });
    const json: any = await created.json();
    const wfId = json.meta.id;

    await page.goto(`http://localhost:4200/workflow/${wfId}`);

    // 1. Editor canvas should be visible (we're in edit mode, not viewing a run)
    await expect(page.locator('app-workflow-canvas, .canvas, [class*="canvas"]').first())
        .toBeVisible({ timeout: 15_000 });

    // 2. Palette should be visible (left panel)
    await expect(page.locator('app-palette').first()).toBeVisible({ timeout: 5_000 });

    // 3. Bottom panel should be COLLAPSED (run-panel has class .collapsed)
    await expect(page.locator('.run-panel')).toHaveClass(/collapsed/, { timeout: 5_000 });

    // 4. New Debug tab is in the tab list
    await expect(page.getByRole('tab', { name: /Debug/ })).toBeVisible({ timeout: 5_000 });

    // 5. Clicking the Debug tab expands the panel and shows the debug-panel content
    await page.getByRole('tab', { name: /Debug/ }).click();
    await expect(page.locator('app-debug-panel')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Старт отладки|Start/ })).toBeVisible();

    await page.screenshot({ path: '/tmp/smoke-debug-tab.png', fullPage: true });
});
