# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: intro-and-guide.spec.ts >> Workflow editor — Guide modal first-visit >> "? Гайд" button manually re-opens the guide modal
- Location: e2e/intro-and-guide.spec.ts:104:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.guide-btn')

```

# Test source

```ts
  11  | });
  12  | test.afterAll(async ({ request }) => {
  13  |   await deleteWorkflowsByPrefix(request, 'E2E-');
  14  | });
  15  | 
  16  | test.describe('Workflows list — intro banner', () => {
  17  |   test.beforeEach(async ({ context }) => {
  18  |     await context.clearCookies();
  19  |   });
  20  | 
  21  |   test('shows intro banner on first visit and hides it after dismiss + reload', async ({ page }) => {
  22  |     const errs = attachConsoleSpy(page);
  23  | 
  24  |     // Fresh Playwright context already has empty localStorage. Avoid addInitScript here:
  25  |     // it would re-run on page.reload() and wipe the dismissed flag we want to verify persists.
  26  |     await gotoList(page);
  27  |     const banner = page.locator('.intro-banner');
  28  |     await expect(banner).toBeVisible();
  29  |     await expect(banner.getByRole('heading', { name: 'Что это вообще такое?' })).toBeVisible();
  30  | 
  31  |     await banner.getByRole('button', { name: 'Понятно, скрыть' }).click();
  32  |     await expect(banner).toBeHidden();
  33  | 
  34  |     const flag = await page.evaluate(() => localStorage.getItem('fluxpilot.introSeen'));
  35  |     expect(flag).toBe('1');
  36  | 
  37  |     await page.reload();
  38  |     await expect(page.locator('.intro-banner')).toBeHidden();
  39  |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  40  |   });
  41  | 
  42  |   test('intro banner stays hidden when localStorage flag is already set', async ({ page }) => {
  43  |     await page.addInitScript(() => {
  44  |       try { localStorage.setItem('fluxpilot.introSeen', '1'); } catch { /* ignore */ }
  45  |     });
  46  |     await gotoList(page);
  47  |     await expect(page.locator('.intro-banner')).toBeHidden();
  48  |   });
  49  | 
  50  |   test('intro banner has primary "+ Создать workflow" that navigates to editor', async ({ page }) => {
  51  |     // Fresh context → localStorage empty → banner shows by default.
  52  |     await gotoList(page);
  53  |     const banner = page.locator('.intro-banner');
  54  |     await expect(banner).toBeVisible();
  55  |     await banner.getByRole('button', { name: /Создать workflow/i }).click();
  56  |     await page.waitForURL(/\/workflow\/[0-9a-f-]{36}$/, { timeout: 8_000 });
  57  |   });
  58  | });
  59  | 
  60  | test.describe('Workflow editor — Guide modal first-visit', () => {
  61  |   let createdId: string;
  62  | 
  63  |   test.beforeEach(async ({ request }) => {
  64  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  65  |     const wf = await createWorkflowViaApi(request, `E2E-Guide-${Date.now()}`);
  66  |     createdId = wf.meta.id;
  67  |   });
  68  |   test.afterEach(async ({ request }) => {
  69  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  70  |   });
  71  | 
  72  |   test('Guide modal auto-opens on first visit and persists "seen" on close', async ({ page }) => {
  73  |     // Fresh context → localStorage empty → guide auto-opens by default. We don't use
  74  |     // addInitScript here because it would re-run on page.reload() and remove the
  75  |     // 'guideSeen' flag we just set, falsely reopening the modal.
  76  |     await page.goto(`/workflow/${createdId}`);
  77  | 
  78  |     const guideTitle = page.getByRole('heading', { name: 'Как пользоваться редактором' });
  79  |     await expect(guideTitle).toBeVisible({ timeout: 5_000 });
  80  | 
  81  |     const stepNums = page.locator('.guide-step-num');
  82  |     await expect(stepNums).toHaveCount(5);
  83  | 
  84  |     // Close modal via Escape (more reliable than clicking close button)
  85  |     await page.keyboard.press('Escape');
  86  |     await expect(guideTitle).toBeHidden({ timeout: 2_000 });
  87  | 
  88  |     const flag = await page.evaluate(() => localStorage.getItem('fluxpilot.guideSeen'));
  89  |     expect(flag).toBe('1');
  90  | 
  91  |     await page.reload();
  92  |     await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeHidden({ timeout: 3_000 });
  93  |   });
  94  | 
  95  |   test('Guide modal does NOT auto-open when seen flag is set', async ({ page }) => {
  96  |     await page.addInitScript(() => {
  97  |       try { localStorage.setItem('fluxpilot.guideSeen', '1'); } catch { /* ignore */ }
  98  |     });
  99  |     await page.goto(`/workflow/${createdId}`);
  100 |     await expect(page.locator('.app-header')).toBeVisible();
  101 |     await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeHidden();
  102 |   });
  103 | 
  104 |   test('"? Гайд" button manually re-opens the guide modal', async ({ page }) => {
  105 |     await page.addInitScript(() => {
  106 |       try { localStorage.setItem('fluxpilot.guideSeen', '1'); } catch { /* ignore */ }
  107 |     });
  108 |     await page.goto(`/workflow/${createdId}`);
  109 |     await expect(page.locator('.app-header')).toBeVisible();
  110 | 
> 111 |     await page.locator('.guide-btn').click();
      |                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  112 |     await expect(page.getByRole('heading', { name: 'Как пользоваться редактором' })).toBeVisible();
  113 |   });
  114 | });
  115 | 
```