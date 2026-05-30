import { test, expect } from '@playwright/test';
import {
  attachConsoleSpy,
  connectNodes,
  createWorkflowViaApi,
  deleteWorkflowsByPrefix,
  dragPaletteNode,
  getWorkflowViaApi,
  suppressFirstVisitHints,
} from './helpers';

test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Canvas editing', () => {
  let createdId: string;

  test.beforeEach(async ({ page, request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Canvas-${Date.now()}`);
    createdId = wf.meta.id;
    await suppressFirstVisitHints(page);
  });
  test.afterEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
  });

  test('empty-state shows on fresh workflow and disappears after first node', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    const empty = page.locator('.canvas-empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('heading', { name: 'Холст пуст' })).toBeVisible();

    await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
    await dragPaletteNode(page, 'trigger', { x: 220, y: 180 });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
    await expect(empty).toBeHidden();
  });

  test('can add multiple nodes of any palette kind', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-palette .palette-item').first()).toBeVisible();

    await dragPaletteNode(page, 'trigger', { x: 150, y: 150 });
    await dragPaletteNode(page, 'http', { x: 350, y: 150 });
    await dragPaletteNode(page, 'ab', { x: 550, y: 150 });

    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(3);

    const info = page.locator('.info-panel');
    await expect(info).toContainText('Ноды: 3');
    await expect(info).toContainText('Связи: 0');
  });

  test('clicking a node opens the inspector with editable label', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);

    await page.locator('.node-wrap').first().click();
    const inspector = page.locator('app-inspector');
    await expect(inspector).toBeVisible();
    const labelInput = inspector.locator('input[type="text"]').first();
    await expect(labelInput).toBeVisible();

    const newLabel = `Edited-${Date.now()}`;
    await labelInput.fill(newLabel);
    await labelInput.blur();

    await expect(page.locator('.node-wrap').first()).toContainText(newLabel);
  });

  test('connecting two nodes via handles creates an edge in the SVG', async ({ page, request }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
    await dragPaletteNode(page, 'http', { x: 500, y: 250 });
    await expect(page.locator('.node-wrap')).toHaveCount(2);

    await connectNodes(page, 0, 1);

    await expect(page.locator('.edge-group')).toHaveCount(1, { timeout: 3_000 });
    await expect(page.locator('.info-panel')).toContainText('Связи: 1');

    await page.locator('.back-btn').click();
    await page.waitForURL(/\/$/);
    await expect.poll(async () => {
      const wf = await getWorkflowViaApi(request, createdId);
      return wf.graph.connections.length;
    }, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  });

  test('clicking an edge selects it and the 🗑 button deletes it', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
    await dragPaletteNode(page, 'http', { x: 500, y: 250 });

    await connectNodes(page, 0, 1);
    await expect(page.locator('.edge-group')).toHaveCount(1);
    await page.locator('.edge-group').first().dispatchEvent('click');
    const deleteBtn = page.locator('.edge-delete-btn');
    await expect(deleteBtn).toBeVisible({ timeout: 2_000 });
    await deleteBtn.click();
    await expect(page.locator('.edge-group')).toHaveCount(0);
  });

  test('zoom controls update the displayed percentage and Reset returns to 100%', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.zoom-info')).toHaveText('100%');

    const canvas = await page.locator('.canvas-viewport').boundingBox();
    if (!canvas) throw new Error('canvas not visible');
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.keyboard.down('Meta');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Meta');

    const zoomTextAfter = await page.locator('.zoom-info').innerText();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.zoom-info')).toHaveText('100%');
    expect(zoomTextAfter).toMatch(/%$/);
  });

  test('Center view button does not throw', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
    await page.getByRole('button', { name: 'Center' }).click();
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('trigger node has no input handle (only output)', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);

    const triggerNode = page.locator('.node-wrap').first();
    await expect(triggerNode.locator('.handle-out')).toHaveCount(1);
    await expect(triggerNode.locator('.handle-in')).toHaveCount(0);
  });

  test('non-trigger nodes have both input and output handles', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'http', { x: 220, y: 220 });
    await expect(page.locator('.node-wrap')).toHaveCount(1);

    const httpNode = page.locator('.node-wrap').first();
    await expect(httpNode.locator('.handle-in')).toHaveCount(1);
    await expect(httpNode.locator('.handle-out')).toHaveCount(1);
  });

  test('dragging from any source onto a trigger node does not create an edge', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'http', { x: 200, y: 250 });
    await dragPaletteNode(page, 'trigger', { x: 500, y: 250 });
    await expect(page.locator('.node-wrap')).toHaveCount(2);

    const httpOut = page.locator('.node-wrap').nth(0).locator('.handle-out');
    const triggerNode = page.locator('.node-wrap').nth(1);
    const srcBox = await httpOut.boundingBox();
    const tgtBox = await triggerNode.boundingBox();
    if (!srcBox || !tgtBox) throw new Error('boxes not found');

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('.edge-group')).toHaveCount(0);
    await expect(page.locator('.info-panel')).toContainText('Связи: 0');
  });

  test('can connect trigger → http → filter in a valid chain', async ({ page, request }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 200 });
    await dragPaletteNode(page, 'http', { x: 200, y: 320 });
    await dragPaletteNode(page, 'filter', { x: 200, y: 440 });
    await expect(page.locator('.node-wrap')).toHaveCount(3);

    await connectNodes(page, 0, 1);
    await expect(page.locator('.edge-group')).toHaveCount(1);
    await connectNodes(page, 1, 2);
    await expect(page.locator('.edge-group')).toHaveCount(2);
    await expect(page.locator('.info-panel')).toContainText('Связи: 2');

    await page.locator('.back-btn').click();
    await page.waitForURL(/\/$/);
    await expect.poll(async () => {
      const wf = await getWorkflowViaApi(request, createdId);
      return wf.graph.connections.length;
    }, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  });

  test('duplicate edges are rejected (idempotent connection)', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await dragPaletteNode(page, 'trigger', { x: 200, y: 250 });
    await dragPaletteNode(page, 'http', { x: 500, y: 250 });
    await expect(page.locator('.node-wrap')).toHaveCount(2);

    await connectNodes(page, 0, 1);
    await expect(page.locator('.edge-group')).toHaveCount(1);

    await connectNodes(page, 0, 1);
    await expect(page.locator('.edge-group')).toHaveCount(1);
    await expect(page.locator('.info-panel')).toContainText('Связи: 1');
  });
});
