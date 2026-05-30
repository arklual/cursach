import { test, expect } from '@playwright/test';

test('open workflow opens in edit mode with bottom panel collapsed and Debug tab visible', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('fluxpilot.guideSeen', '1');
    });

    const created = await page.request.post('http://localhost:8080/v1/workflows', {
        data: { name: `smoke-${Date.now()}` },
    });
    const json: any = await created.json();
    const wfId = json.meta.id;

    await page.goto(`http://localhost:4200/workflow/${wfId}`);

    await expect(page.locator('app-workflow-canvas, .canvas, [class*="canvas"]').first())
        .toBeVisible({ timeout: 15_000 });

    await expect(page.locator('app-palette').first()).toBeVisible({ timeout: 5_000 });

    await expect(page.locator('.run-panel')).toHaveClass(/collapsed/, { timeout: 5_000 });

    await expect(page.getByRole('tab', { name: /Debug/ })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('tab', { name: /Debug/ }).click();
    await expect(page.locator('app-debug-panel')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Старт отладки|Start/ })).toBeVisible();

    await page.screenshot({ path: '/tmp/smoke-debug-tab.png', fullPage: true });
});
