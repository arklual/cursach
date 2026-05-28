# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-editing.spec.ts >> Canvas editing >> empty-state shows on fresh workflow and disappears after first node
- Location: e2e/canvas-editing.spec.ts:32:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.canvas-empty-state')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.canvas-empty-state')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   attachConsoleSpy,
  4   |   connectNodes,
  5   |   createWorkflowViaApi,
  6   |   deleteWorkflowsByPrefix,
  7   |   dragPaletteNode,
  8   |   getWorkflowViaApi,
  9   |   suppressFirstVisitHints,
  10  | } from './helpers';
  11  | 
  12  | test.beforeAll(async ({ request }) => {
  13  |   await deleteWorkflowsByPrefix(request, 'E2E-');
  14  | });
  15  | test.afterAll(async ({ request }) => {
  16  |   await deleteWorkflowsByPrefix(request, 'E2E-');
  17  | });
  18  | 
  19  | test.describe('Canvas editing', () => {
  20  |   let createdId: string;
  21  | 
  22  |   test.beforeEach(async ({ page, request }) => {
  23  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  24  |     const wf = await createWorkflowViaApi(request, `E2E-Canvas-${Date.now()}`);
  25  |     createdId = wf.meta.id;
  26  |     await suppressFirstVisitHints(page);
  27  |   });
  28  |   test.afterEach(async ({ request }) => {
  29  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  30  |   });
  31  | 
  32  |   test('empty-state shows on fresh workflow and disappears after first node', async ({ page }) => {
  33  |     await page.goto(`/workflow/${createdId}`);
  34  |     const empty = page.locator('.canvas-empty-state');
> 35  |     await expect(empty).toBeVisible();
      |                         ^ Error: expect(locator).toBeVisible() failed
  36  |     await expect(empty.getByRole('heading', { name: 'Холст пуст' })).toBeVisible();
  37  | 
  38  |     await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
  39  |     await dragPaletteNode(page, 'trigger', { x: 220, y: 180 });
  40  |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
  41  |     await expect(empty).toBeHidden();
  42  |   });
  43  | 
  44  |   test('can add multiple nodes of any palette kind', async ({ page }) => {
  45  |     await page.goto(`/workflow/${createdId}`);
  46  |     await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
  47  | 
  48  |     // Drop three nodes at different positions.
  49  |     await dragPaletteNode(page, 'trigger', { x: 150, y: 150 });
  50  |     await dragPaletteNode(page, 'http', { x: 350, y: 150 });
  51  |     await dragPaletteNode(page, 'ab', { x: 550, y: 150 });
  52  | 
  53  |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(3);
  54  | 
  55  |     const info = page.locator('.info-panel');
  56  |     await expect(info).toContainText('Ноды: 3');
  57  |     await expect(info).toContainText('Связи: 0');
  58  |   });
  59  | 
  60  |   test('clicking a node opens the inspector with editable label', async ({ page }) => {
  61  |     await page.goto(`/workflow/${createdId}`);
  62  |     await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
  63  |     await expect(page.locator('.node-wrap')).toHaveCount(1);
  64  | 
  65  |     await page.locator('.node-wrap').first().click();
  66  |     const inspector = page.locator('app-inspector');
  67  |     await expect(inspector).toBeVisible();
  68  |     const labelInput = inspector.locator('input[type="text"]').first();
  69  |     await expect(labelInput).toBeVisible();
  70  | 
  71  |     const newLabel = `Edited-${Date.now()}`;
  72  |     await labelInput.fill(newLabel);
  73  |     await labelInput.blur();
  74  | 
  75  |     // Verify label appears on the node header.
  76  |     await expect(page.locator('.node-wrap').first()).toContainText(newLabel);
  77  |   });
  78  | 
  79  |   test('connecting two nodes via handles creates an edge in the SVG', async ({ page, request }) => {
  80  |     await page.goto(`/workflow/${createdId}`);
  81  |     await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
  82  |     await dragPaletteNode(page, 'http', { x: 500, y: 250 });
  83  |     await expect(page.locator('.node-wrap')).toHaveCount(2);
  84  | 
  85  |     // Use helper to connect nodes
  86  |     await connectNodes(page, 0, 1);
  87  | 
  88  |     await expect(page.locator('.edge-group')).toHaveCount(1, { timeout: 3_000 });
  89  |     await expect(page.locator('.info-panel')).toContainText('Связи: 1');
  90  | 
  91  |     // Save by navigating away, then verify the connection persisted on the backend.
  92  |     await page.locator('.back-btn').click();
  93  |     await page.waitForURL(/\/$/);
  94  |     await expect.poll(async () => {
  95  |       const wf = await getWorkflowViaApi(request, createdId);
  96  |       return wf.graph.connections.length;
  97  |     }, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  98  |   });
  99  | 
  100 |   test('clicking an edge selects it and the 🗑 button deletes it', async ({ page }) => {
  101 |     await page.goto(`/workflow/${createdId}`);
  102 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
  103 |     await dragPaletteNode(page, 'http', { x: 500, y: 250 });
  104 | 
  105 |     await connectNodes(page, 0, 1);
  106 |     await expect(page.locator('.edge-group')).toHaveCount(1);
  107 |     // SVG <g class="edge-group"> spans both nodes' bounding boxes; a real click at
  108 |     // any coordinate inside that box gets intercepted by .node-header. dispatchEvent
  109 |     // routes the click straight to the Angular handler without pointer-event hit-testing.
  110 |     await page.locator('.edge-group').first().dispatchEvent('click');
  111 |     const deleteBtn = page.locator('.edge-delete-btn');
  112 |     await expect(deleteBtn).toBeVisible({ timeout: 2_000 });
  113 |     await deleteBtn.click();
  114 |     await expect(page.locator('.edge-group')).toHaveCount(0);
  115 |   });
  116 | 
  117 |   test('zoom controls update the displayed percentage and Reset returns to 100%', async ({ page }) => {
  118 |     await page.goto(`/workflow/${createdId}`);
  119 |     await expect(page.locator('.zoom-info')).toHaveText('100%');
  120 | 
  121 |     // Zoom in via wheel with Ctrl/Cmd modifier (canvas listens for wheel events).
  122 |     const canvas = await page.locator('.canvas-viewport').boundingBox();
  123 |     if (!canvas) throw new Error('canvas not visible');
  124 |     await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  125 |     await page.keyboard.down('Meta');
  126 |     await page.mouse.wheel(0, -200);
  127 |     await page.keyboard.up('Meta');
  128 | 
  129 |     // Zoom level should change (either up or down depending on impl). Just verify it's not 100%.
  130 |     const zoomTextAfter = await page.locator('.zoom-info').innerText();
  131 |     // If wheel did not register (some envs ignore programmatic wheel), at least Reset must restore 100%.
  132 |     await page.getByRole('button', { name: 'Reset' }).click();
  133 |     await expect(page.locator('.zoom-info')).toHaveText('100%');
  134 |     expect(zoomTextAfter).toMatch(/%$/);
  135 |   });
```