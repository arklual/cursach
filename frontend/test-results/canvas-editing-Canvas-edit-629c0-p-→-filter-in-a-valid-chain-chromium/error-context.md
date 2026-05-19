# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-editing.spec.ts >> Canvas editing >> can connect trigger → http → filter in a valid chain
- Location: e2e/canvas-editing.spec.ts:188:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.edge-group')
Expected: 2
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('.edge-group')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Test source

```ts
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
  136 | 
  137 |   test('Center view button does not throw', async ({ page }) => {
  138 |     const errs = attachConsoleSpy(page);
  139 |     await page.goto(`/workflow/${createdId}`);
  140 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
  141 |     await page.getByRole('button', { name: 'Center' }).click();
  142 |     expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  143 |   });
  144 | 
  145 |   test('trigger node has no input handle (only output)', async ({ page }) => {
  146 |     await page.goto(`/workflow/${createdId}`);
  147 |     await dragPaletteNode(page, 'trigger', { x: 220, y: 220 });
  148 |     await expect(page.locator('.node-wrap')).toHaveCount(1);
  149 | 
  150 |     const triggerNode = page.locator('.node-wrap').first();
  151 |     await expect(triggerNode.locator('.handle-out')).toHaveCount(1);
  152 |     await expect(triggerNode.locator('.handle-in')).toHaveCount(0);
  153 |   });
  154 | 
  155 |   test('non-trigger nodes have both input and output handles', async ({ page }) => {
  156 |     await page.goto(`/workflow/${createdId}`);
  157 |     await dragPaletteNode(page, 'http', { x: 220, y: 220 });
  158 |     await expect(page.locator('.node-wrap')).toHaveCount(1);
  159 | 
  160 |     const httpNode = page.locator('.node-wrap').first();
  161 |     await expect(httpNode.locator('.handle-in')).toHaveCount(1);
  162 |     await expect(httpNode.locator('.handle-out')).toHaveCount(1);
  163 |   });
  164 | 
  165 |   test('dragging from any source onto a trigger node does not create an edge', async ({ page }) => {
  166 |     await page.goto(`/workflow/${createdId}`);
  167 |     await dragPaletteNode(page, 'http', { x: 200, y: 250 });
  168 |     await dragPaletteNode(page, 'trigger', { x: 500, y: 250 });
  169 |     await expect(page.locator('.node-wrap')).toHaveCount(2);
  170 | 
  171 |     // Drag from http's output handle onto the trigger's body (since it has no input handle).
  172 |     const httpOut = page.locator('.node-wrap').nth(0).locator('.handle-out');
  173 |     const triggerNode = page.locator('.node-wrap').nth(1);
  174 |     const srcBox = await httpOut.boundingBox();
  175 |     const tgtBox = await triggerNode.boundingBox();
  176 |     if (!srcBox || !tgtBox) throw new Error('boxes not found');
  177 | 
  178 |     await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  179 |     await page.mouse.down();
  180 |     await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 8 });
  181 |     await page.mouse.up();
  182 | 
  183 |     // No edge should be created — trigger refuses incoming connections.
  184 |     await expect(page.locator('.edge-group')).toHaveCount(0);
  185 |     await expect(page.locator('.info-panel')).toContainText('Связи: 0');
  186 |   });
  187 | 
  188 |   test('can connect trigger → http → filter in a valid chain', async ({ page, request }) => {
  189 |     page.on('console', msg => {
  190 |       const t = msg.text();
  191 |       if (t.includes('[DEBUG')) console.log('PAGE>', t);
  192 |     });
  193 |     await page.goto(`/workflow/${createdId}`);
  194 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
  195 |     await dragPaletteNode(page, 'http', { x: 200, y: 320 });
  196 |     await dragPaletteNode(page, 'filter', { x: 200, y: 440 });
  197 |     await expect(page.locator('.node-wrap')).toHaveCount(3);
  198 | 
  199 |     const httpOutBB = await page.locator('.node-wrap').nth(1).locator('.handle-out').boundingBox();
  200 |     const filterInBB = await page.locator('.node-wrap').nth(2).locator('.handle-in').boundingBox();
  201 |     console.log('PAGE> [BB] http.out=', httpOutBB, 'filter.in=', filterInBB);
  202 | 
  203 |     await connectNodes(page, 0, 1);
  204 |     await expect(page.locator('.edge-group')).toHaveCount(1);
  205 |     await connectNodes(page, 1, 2);
> 206 |     await expect(page.locator('.edge-group')).toHaveCount(2);
      |                                               ^ Error: expect(locator).toHaveCount(expected) failed
  207 |     await expect(page.locator('.info-panel')).toContainText('Связи: 2');
  208 | 
  209 |     // Persist and verify on backend.
  210 |     await page.locator('.back-btn').click();
  211 |     await page.waitForURL(/\/$/);
  212 |     await expect.poll(async () => {
  213 |       const wf = await getWorkflowViaApi(request, createdId);
  214 |       return wf.graph.connections.length;
  215 |     }, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  216 |   });
  217 | 
  218 |   test('duplicate edges are rejected (idempotent connection)', async ({ page }) => {
  219 |     await page.goto(`/workflow/${createdId}`);
  220 |     await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
  221 |     await dragPaletteNode(page, 'http', { x: 500, y: 250 });
  222 |     await expect(page.locator('.node-wrap')).toHaveCount(2);
  223 | 
  224 |     await connectNodes(page, 0, 1);
  225 |     await expect(page.locator('.edge-group')).toHaveCount(1);
  226 | 
  227 |     // Try connecting the same pair again — should not duplicate.
  228 |     await connectNodes(page, 0, 1);
  229 |     await expect(page.locator('.edge-group')).toHaveCount(1);
  230 |     await expect(page.locator('.info-panel')).toContainText('Связи: 1');
  231 |   });
  232 | });
  233 | 
```