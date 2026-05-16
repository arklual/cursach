import { Page, expect, APIRequestContext } from '@playwright/test';

export const API_BASE = 'http://localhost:8080/v1';

export interface ConsoleErrorBag {
  errors: { url: string; text: string }[];
}

export function attachConsoleSpy(page: Page): ConsoleErrorBag {
  const bag: ConsoleErrorBag = { errors: [] };
  page.on('pageerror', err => bag.errors.push({ url: page.url(), text: err.message }));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      bag.errors.push({ url: page.url(), text: msg.text() });
    }
  });
  return bag;
}

export async function gotoList(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FluxPilot Workflow Lab' })).toBeVisible();
}

/**
 * Set "seen" flags so first-visit modals/banners stay closed during tests.
 * Should be called before navigating to a page that auto-opens them.
 */
export async function suppressFirstVisitHints(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('fluxpilot.introSeen', '1');
      localStorage.setItem('fluxpilot.guideSeen', '1');
    } catch { /* SSR / locked-down env — fine, will fall through */ }
  });
}

export async function createWorkflowViaApi(request: APIRequestContext, name: string) {
  const res = await request.post(`${API_BASE}/workflows`, {
    data: { name, description: 'e2e seed' },
  });
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{ meta: { id: string; name: string }; graph: { versionId: string } }>;
}

export async function deleteWorkflowViaApi(request: APIRequestContext, id: string) {
  await request.delete(`${API_BASE}/workflows/${id}`);
}

/** Удалить все workflow с именем, начинающимся на префикс (используется для cleanup e2e-данных). */
export async function deleteWorkflowsByPrefix(
  request: APIRequestContext,
  prefix: string,
) {
  const res = await request.get(`${API_BASE}/workflows`);
  if (!res.ok()) return;
  const list = (await res.json()) as { id: string; name: string }[];
  for (const wf of list) {
    if (wf.name?.startsWith(prefix)) {
      await deleteWorkflowViaApi(request, wf.id);
    }
  }
}

/**
 * Drag-drop a palette item onto the canvas via synthetic DragEvents.
 * Playwright's native dragTo() doesn't preserve our custom MIME type
 * 'application/workflow-node', so we dispatch the events directly.
 */
export async function dragPaletteNode(page: Page, kind: string, offset: { x: number; y: number } = { x: 200, y: 200 }) {
  // Ждём появления палитры и канваса
  await page.waitForSelector('app-palette .palette-item', { timeout: 5000 });
  await page.waitForSelector('.canvas-viewport', { timeout: 5000 });
  
  await page.evaluate(({ kind, offset }) => {
    const items = document.querySelectorAll('app-palette .palette-item');
    let paletteBtn: HTMLElement | null = null;
    for (const it of Array.from(items)) {
      const text = (it.textContent || '').toLowerCase();
      if (text.includes(kind.toLowerCase())) { paletteBtn = it as HTMLElement; break; }
    }
    if (!paletteBtn) paletteBtn = items[0] as HTMLElement;
    const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
    if (!paletteBtn || !canvas) throw new Error('palette or canvas not found');
    const dt = new DataTransfer();
    dt.setData('application/workflow-node', kind);
    paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: rect.left + offset.x, clientY: rect.top + offset.y,
    }));
  }, { kind, offset });
}

/**
 * Connect two nodes by simulating a drag from the source's output handle
 * to the target's input handle.
 */
export async function connectNodes(page: Page, sourceIndex: number, targetIndex: number) {
  const sourceHandle = page.locator('.node-wrap').nth(sourceIndex).locator('.handle-out');
  const targetHandle = page.locator('.node-wrap').nth(targetIndex).locator('.handle-in');
  const srcBox = await sourceHandle.boundingBox();
  const tgtBox = await targetHandle.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('handles not found');
  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

export async function getWorkflowViaApi(request: APIRequestContext, id: string) {
  const res = await request.get(`${API_BASE}/workflows/${id}`);
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{
    meta: { id: string; name: string };
    graph: { versionId: string; nodes: Array<{ id: string; type: string }>; connections: Array<{ id: string; source: string; target: string }> };
  }>;
}

export interface TriggerResponse {
  id: string;
  workflowId: string;
  type: string;
  config?: Record<string, unknown> | null;
}

export async function listTriggersViaApi(request: APIRequestContext, workflowId: string): Promise<TriggerResponse[]> {
  const res = await request.get(`${API_BASE}/workflows/${workflowId}/triggers`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function createTriggerViaApi(
  request: APIRequestContext,
  workflowId: string,
  body: { type: string; config?: Record<string, unknown> },
): Promise<TriggerResponse> {
  const res = await request.post(`${API_BASE}/workflows/${workflowId}/triggers`, { data: body });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function deleteTriggerViaApi(request: APIRequestContext, triggerId: string) {
  await request.delete(`${API_BASE}/triggers/${triggerId}`);
}

export async function enqueueRunViaApi(
  request: APIRequestContext,
  workflowId: string,
  payload: Record<string, unknown> = {},
) {
  const res = await request.post(`${API_BASE}/workflows/${workflowId}/runs`, { data: payload });
  expect(res.status(), `enqueue run got ${res.status()}: ${await res.text()}`).toBe(202);
  return res.json() as Promise<{ id: string; status: string }>;
}

export async function listRunsViaApi(request: APIRequestContext, workflowId: string) {
  const res = await request.get(`${API_BASE}/workflows/${workflowId}/runs`);
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<Array<{ id: string; status: string }>>;
}
