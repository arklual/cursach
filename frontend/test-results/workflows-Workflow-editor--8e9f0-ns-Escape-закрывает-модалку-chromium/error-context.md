# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflows.spec.ts >> Workflow editor — interactions >> Escape закрывает модалку
- Location: e2e/workflows.spec.ts:222:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'События' })

```

# Test source

```ts
  124 |     await expect(page.locator('app-workflow-canvas')).toBeVisible();
  125 |     await expect(page.locator('app-palette')).toBeVisible();
  126 |     await expect(page.locator('app-inspector')).toBeVisible();
  127 |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  128 |   });
  129 | 
  130 |   test('rename workflow persists', async ({ page, request }) => {
  131 |     await page.goto(`/workflow/${createdId}`);
  132 |     const input = page.locator('.workflow-name-input');
  133 |     await expect(input).toBeVisible();
  134 |     const newName = `Renamed-${Date.now()}`;
  135 |     await input.fill(newName);
  136 |     await input.blur();
  137 |     // Reload to verify persistence
  138 |     await page.reload();
  139 |     await expect(page.locator('.workflow-name-input')).toHaveValue(newName);
  140 |   });
  141 | 
  142 |   test('back button returns to list', async ({ page }) => {
  143 |     await page.goto(`/workflow/${createdId}`);
  144 |     await page.locator('.back-btn').click();
  145 |     await page.waitForURL(/\/$/, { timeout: 5_000 });
  146 |     await expect(page.getByRole('heading', { name: 'FluxPilot Workflow Lab' })).toBeVisible();
  147 |   });
  148 | 
  149 |   test('switching bottom tabs: Запуски / Триггеры loads without errors', async ({ page }) => {
  150 |     const errs = attachConsoleSpy(page);
  151 |     await page.goto(`/workflow/${createdId}`);
  152 |     await expect(page.locator('.app-header')).toBeVisible();
  153 |     await page.getByRole('button', { name: 'Запуски' }).click();
  154 |     await expect(page.locator('app-runs-panel')).toBeVisible({ timeout: 5_000 });
  155 |     await page.getByRole('button', { name: 'Триггеры' }).click();
  156 |     await expect(page.locator('app-triggers-panel')).toBeVisible({ timeout: 5_000 });
  157 |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  158 |   });
  159 | 
  160 |   test('palette is visible with node templates', async ({ page }) => {
  161 |     await page.goto(`/workflow/${createdId}`);
  162 |     const palette = page.locator('app-palette');
  163 |     await expect(palette).toBeVisible();
  164 |     // Палитра должна содержать что-то, что выглядит как ноды (Trigger / HTTP / A/B...)
  165 |     const paletteText = await palette.innerText();
  166 |     expect(paletteText.length).toBeGreaterThan(0);
  167 |   });
  168 | 
  169 |   test('modals open and close', async ({ page }) => {
  170 |     await page.goto(`/workflow/${createdId}`);
  171 |     await page.getByRole('button', { name: 'События' }).click();
  172 |     await expect(page.getByRole('heading', { name: /JSON Schema/i })).toBeVisible();
  173 |     await page.keyboard.press('Escape').catch(() => {});
  174 |     await page.getByRole('button', { name: 'QA-чеклист' }).click();
  175 |     await expect(page.locator('.modal-backdrop')).toBeVisible();
  176 |   });
  177 | });
  178 | 
  179 | test.describe('Smoke — API/WS connectivity', () => {
  180 |   test('backend /v1/workflows responds', async ({ request }) => {
  181 |     const res = await request.get('http://localhost:8080/v1/workflows');
  182 |     expect(res.ok()).toBeTruthy();
  183 |     const list = await res.json();
  184 |     expect(Array.isArray(list)).toBe(true);
  185 |   });
  186 | 
  187 |   test('SockJS info endpoint reachable (под context-path /v1)', async ({ request }) => {
  188 |     const res = await request.get('http://localhost:8080/v1/ws/info?t=' + Date.now());
  189 |     expect(res.ok()).toBeTruthy();
  190 |   });
  191 | });
  192 | 
  193 | test.describe('Workflow editor — interactions', () => {
  194 |   let createdId: string;
  195 | 
  196 |   test.beforeEach(async ({ page, request }) => {
  197 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  198 |     const wf = await createWorkflowViaApi(request, `E2E-Inter-${Date.now()}`);
  199 |     createdId = wf.meta.id;
  200 |     await suppressFirstVisitHints(page);
  201 |   });
  202 | 
  203 |   test.afterEach(async ({ request }) => {
  204 |     await deleteWorkflowsByPrefix(request, 'E2E-');
  205 |     createdId = '';
  206 |   });
  207 | 
  208 |   test('non-existent workflow → editor показывает loadError', async ({ page }) => {
  209 |     await page.goto('/workflow/00000000-0000-0000-0000-000000000000');
  210 |     await expect(page.locator('.editor-error-banner')).toBeVisible({ timeout: 5_000 });
  211 |   });
  212 | 
  213 |   test('Simulate 500 users → execution log получает строки', async ({ page }) => {
  214 |     await page.goto(`/workflow/${createdId}`);
  215 |     await expect(page.locator('.app-header')).toBeVisible();
  216 |     const logsBefore = await page.locator('.log-entry').count();
  217 |     await page.getByRole('button', { name: /Симуляция \(500\)/i }).click();
  218 |     await expect.poll(async () => page.locator('.log-entry').count(), { timeout: 5_000 })
  219 |       .toBeGreaterThan(logsBefore);
  220 |   });
  221 | 
  222 |   test('Escape закрывает модалку', async ({ page }) => {
  223 |     await page.goto(`/workflow/${createdId}`);
> 224 |     await page.getByRole('button', { name: 'События' }).click();
      |                                                         ^ Error: locator.click: Test timeout of 30000ms exceeded.
  225 |     const modalTitle = page.getByRole('heading', { name: /JSON Schema/i });
  226 |     await expect(modalTitle).toBeVisible();
  227 |     await page.keyboard.press('Escape');
  228 |     await expect(modalTitle).toBeHidden({ timeout: 2_000 });
  229 |   });
  230 | 
  231 |   test('Click по backdrop закрывает модалку', async ({ page }) => {
  232 |     await page.goto(`/workflow/${createdId}`);
  233 |     await page.getByRole('button', { name: 'QA-чеклист' }).click();
  234 |     await expect(page.locator('.modal-backdrop')).toBeVisible();
  235 |     await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
  236 |     await expect(page.locator('.modal-backdrop')).toBeHidden({ timeout: 2_000 });
  237 |   });
  238 | 
  239 |   test('addNode работает в non-secure context (без crypto.randomUUID)', async ({ page }) => {
  240 |     // Эмулируем HTTP-прод без TLS, где Web Crypto API не отдаёт randomUUID.
  241 |     // У `crypto.randomUUID` в Chromium свой configurable=true, поэтому redefine работает.
  242 |     // Скрипт ставится через addInitScript — гарантированно выполняется ДО любого app-кода.
  243 |     await page.addInitScript(() => {
  244 |       Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true });
  245 |     });
  246 |     await page.goto(`/workflow/${createdId}`);
  247 |     // Sanity: убеждаемся что override применился именно в этой странице.
  248 |     const noRandomUUID = await page.evaluate(() => typeof window.crypto.randomUUID !== 'function');
  249 |     expect(noRandomUUID).toBe(true);
  250 |     
  251 |     // Ждём появления палитры и канваса
  252 |     await page.waitForSelector('app-palette .palette-item', { timeout: 5000 });
  253 |     await page.waitForSelector('.canvas-viewport', { timeout: 5000 });
  254 |     
  255 |     await page.evaluate(() => {
  256 |       const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
  257 |       const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
  258 |       const dt = new DataTransfer();
  259 |       dt.setData('application/workflow-node', 'trigger');
  260 |       paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  261 |       const rect = canvas.getBoundingClientRect();
  262 |       canvas.dispatchEvent(new DragEvent('drop', {
  263 |         bubbles: true, cancelable: true, dataTransfer: dt,
  264 |         clientX: rect.left + 200, clientY: rect.top + 200,
  265 |       }));
  266 |     });
  267 |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 3_000 });
  268 |   });
  269 | 
  270 |   test('Drag node из палитры → нода появляется на canvas', async ({ page }) => {
  271 |     await page.goto(`/workflow/${createdId}`);
  272 |     await expect(page.locator('.app-header')).toBeVisible();
  273 |     // Через dispatchEvent эмулируем drag+drop (Playwright's dragTo не переносит
  274 |     // кастомный mime 'application/workflow-node').
  275 |     await page.evaluate(() => {
  276 |       const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
  277 |       const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
  278 |       if (!paletteBtn || !canvas) throw new Error('palette or canvas not found');
  279 |       const dt = new DataTransfer();
  280 |       dt.setData('application/workflow-node', 'trigger');
  281 |       paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  282 |       const rect = canvas.getBoundingClientRect();
  283 |       canvas.dispatchEvent(new DragEvent('drop', {
  284 |         bubbles: true, cancelable: true, dataTransfer: dt,
  285 |         clientX: rect.left + 200, clientY: rect.top + 200,
  286 |       }));
  287 |     });
  288 |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 3_000 });
  289 |   });
  290 | 
  291 |   test('Multi-cycle: add → leave → reopen sохраняет все ноды', async ({ page, request }) => {
  292 |     const dragOneNode = async () => {
  293 |       await page.evaluate(() => {
  294 |         const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
  295 |         const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
  296 |         const dt = new DataTransfer();
  297 |         dt.setData('application/workflow-node', 'trigger');
  298 |         paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  299 |         const rect = canvas.getBoundingClientRect();
  300 |         canvas.dispatchEvent(new DragEvent('drop', {
  301 |           bubbles: true, cancelable: true, dataTransfer: dt,
  302 |           clientX: rect.left + 200 + Math.random() * 100, clientY: rect.top + 200 + Math.random() * 100,
  303 |         }));
  304 |       });
  305 |     };
  306 | 
  307 |     // Цикл 1: 1 нода
  308 |     await page.goto(`/workflow/${createdId}`);
  309 |     await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
  310 |     await dragOneNode();
  311 |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
  312 |     await page.locator('.back-btn').click();
  313 |     await page.waitForURL(/\/$/);
  314 | 
  315 |     // Reopen, проверяем что нода осталась
  316 |     await page.goto(`/workflow/${createdId}`);
  317 |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 5_000 });
  318 | 
  319 |     // Цикл 2: добавляем ещё ноду, выходим через browser back
  320 |     await dragOneNode();
  321 |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(2);
  322 |     await page.goBack();
  323 |     await page.waitForURL(/\/$/);
  324 | 
```