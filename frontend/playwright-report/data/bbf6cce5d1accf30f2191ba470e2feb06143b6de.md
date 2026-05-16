# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-editing.spec.ts >> Canvas editing >> connecting two nodes via handles creates an edge in the SVG
- Location: e2e/canvas-editing.spec.ts:78:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.edge-group')
Expected: 1
Received: 0
Timeout:  3000ms

Call log:
  - Expect "toHaveCount" with timeout 3000ms
  - waiting for locator('.edge-group')
    7 × locator resolved to 0 elements
      - unexpected value "0"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   attachConsoleSpy,
  4   |   createWorkflowViaApi,
  5   |   deleteWorkflowsByPrefix,
  6   |   dragPaletteNode,
  7   |   getWorkflowViaApi,
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
  18  | test.describe('Canvas editing', () => {
  19  |   let createdId: string;
  20  | 
  21  |   test.beforeEach(async ({ page, request }) => {
  22  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  23  |     const wf = await createWorkflowViaApi(request, `E2E-Canvas-${Date.now()}`);
  24  |     createdId = wf.meta.id;
  25  |     await suppressFirstVisitHints(page);
  26  |   });
  27  |   test.afterEach(async ({ request }) => {
  28  |     await deleteWorkflowsByPrefix(request, 'E2E-');
  29  |   });
  30  | 
  31  |   test('empty-state shows on fresh workflow and disappears after first node', async ({ page }) => {
  32  |     await page.goto(`/workflow/${createdId}`);
  33  |     const empty = page.locator('.canvas-empty-state');
  34  |     await expect(empty).toBeVisible();
  35  |     await expect(empty.getByRole('heading', { name: 'Холст пуст' })).toBeVisible();
  36  | 
  37  |     await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
  38  |     await dragPaletteNode(page, 'trigger', { x: 220, y: 180 });
  39  |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
  40  |     await expect(empty).toBeHidden();
  41  |   });
  42  | 
  43  |   test('can add multiple nodes of any palette kind', async ({ page }) => {
  44  |     await page.goto(`/workflow/${createdId}`);
  45  |     await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
  46  | 
  47  |     // Drop three nodes at different positions.
  48  |     await dragPaletteNode(page, 'trigger', { x: 150, y: 150 });
  49  |     await dragPaletteNode(page, 'http', { x: 350, y: 150 });
  50  |     await dragPaletteNode(page, 'ab', { x: 550, y: 150 });
  51  | 
  52  |     await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(3);
  53  | 
  54  |     const info = page.locator('.info-panel');
  55  |     await expect(info).toContainText('Ноды: 3');
  56  |     await expect(info).toContainText('Связи: 0');
  57  |   });
  58  | 
  59  |   test('clicking a node opens the inspector with editable label', async ({ page }) => {
  60  |     await page.goto(`/workflow/${createdId}`);
  61  |     await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
  62  |     await expect(page.locator('.node-wrap')).toHaveCount(1);
  63  | 
  64  |     await page.locator('.node-wrap').first().click();
  65  |     const inspector = page.locator('app-inspector');
  66  |     await expect(inspector).toBeVisible();
  67  |     const labelInput = inspector.locator('input[type="text"]').first();
  68  |     await expect(labelInput).toBeVisible();
  69  | 
  70  |     const newLabel = `Edited-${Date.now()}`;
  71  |     await labelInput.fill(newLabel);
  72  |     await labelInput.blur();
  73  | 
  74  |     // Verify label appears on the node header.
  75  |     await expect(page.locator('.node-wrap').first()).toContainText(newLabel);
  76  |   });
  77  | 
  78  |   test('connecting two nodes via handles creates an edge in the SVG', async ({ page, request }) => {
  79  |     await page.goto(`/workflow/${createdId}`);
  80  |     await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
  81  |     await dragPaletteNode(page, 'http', { x: 500, y: 250 });
  82  |     await expect(page.locator('.node-wrap')).toHaveCount(2);
  83  | 
  84  |     // Use node-wrap to scope handles to canvas nodes only
  85  |     const nodeWraps = page.locator('.node-wrap');
  86  |     const srcHandle = nodeWraps.nth(0).locator('.handle-out');
  87  |     const tgtHandle = nodeWraps.nth(1).locator('.handle-in');
  88  |     
  89  |     const src = await srcHandle.boundingBox();
  90  |     const tgt = await tgtHandle.boundingBox();
  91  |     expect(src, 'source handle box').not.toBeNull();
  92  |     expect(tgt, 'target handle box').not.toBeNull();
  93  |     if (!src || !tgt) throw new Error('no handles');
  94  | 
  95  |     await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  96  |     await page.mouse.down();
  97  |     await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 });
  98  |     await page.mouse.up();
  99  | 
> 100 |     await expect(page.locator('.edge-group')).toHaveCount(1, { timeout: 3_000 });
      |                                               ^ Error: expect(locator).toHaveCount(expected) failed
  101 |     await expect(page.locator('.info-panel')).toContainText('Связи: 1');
  102 | 
  103 |     // Save by navigating away, then verify the connection persisted on the backend.
  104 |     await page.locator('.back-btn').click();
  105 |     await page.waitForURL(/\/$/);
  106 |     await expect.poll(async () => {
  107 |       const wf = await getWorkflowViaApi(request, createdId);
  108 |       return wf.graph.connections.length;
  109 |     }, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  110 |   });
  111 | 
  112 |   test('clicking an edge selects it and the 🗑 button deletes it', async ({ page }) => {
  113 |     await page.goto(`/workflow/${createdId}`);
  114 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
  115 |     await dragPaletteNode(page, 'http', { x: 500, y: 250 });
  116 | 
  117 |     const nodeWraps = page.locator('.node-wrap');
  118 |     const srcHandle = nodeWraps.nth(0).locator('.handle-out');
  119 |     const tgtHandle = nodeWraps.nth(1).locator('.handle-in');
  120 |     
  121 |     const src = await srcHandle.boundingBox();
  122 |     const tgt = await tgtHandle.boundingBox();
  123 |     if (!src || !tgt) throw new Error('no handles');
  124 |     await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  125 |     await page.mouse.down();
  126 |     await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 10 });
  127 |     await page.mouse.up();
  128 | 
  129 |     await expect(page.locator('.edge-group')).toHaveCount(1);
  130 |     // SVG <g class="edge-group"> spans both nodes' bounding boxes; a real click at
  131 |     // any coordinate inside that box gets intercepted by .node-header. dispatchEvent
  132 |     // routes the click straight to the Angular handler without pointer-event hit-testing.
  133 |     await page.locator('.edge-group').first().dispatchEvent('click');
  134 |     const deleteBtn = page.locator('.edge-delete-btn');
  135 |     await expect(deleteBtn).toBeVisible({ timeout: 2_000 });
  136 |     await deleteBtn.click();
  137 |     await expect(page.locator('.edge-group')).toHaveCount(0);
  138 |   });
  139 | 
  140 |   test('zoom controls update the displayed percentage and Reset returns to 100%', async ({ page }) => {
  141 |     await page.goto(`/workflow/${createdId}`);
  142 |     await expect(page.locator('.zoom-info')).toHaveText('100%');
  143 | 
  144 |     // Zoom in via wheel with Ctrl/Cmd modifier (canvas listens for wheel events).
  145 |     const canvas = await page.locator('.canvas-viewport').boundingBox();
  146 |     if (!canvas) throw new Error('canvas not visible');
  147 |     await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  148 |     await page.keyboard.down('Meta');
  149 |     await page.mouse.wheel(0, -200);
  150 |     await page.keyboard.up('Meta');
  151 | 
  152 |     // Zoom level should change (either up or down depending on impl). Just verify it's not 100%.
  153 |     const zoomTextAfter = await page.locator('.zoom-info').innerText();
  154 |     // If wheel did not register (some envs ignore programmatic wheel), at least Reset must restore 100%.
  155 |     await page.getByRole('button', { name: 'Reset' }).click();
  156 |     await expect(page.locator('.zoom-info')).toHaveText('100%');
  157 |     expect(zoomTextAfter).toMatch(/%$/);
  158 |   });
  159 | 
  160 |   test('Center view button does not throw', async ({ page }) => {
  161 |     const errs = attachConsoleSpy(page);
  162 |     await page.goto(`/workflow/${createdId}`);
  163 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
  164 |     await page.getByRole('button', { name: 'Center' }).click();
  165 |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  166 |   });
  167 | });
  168 | 
```