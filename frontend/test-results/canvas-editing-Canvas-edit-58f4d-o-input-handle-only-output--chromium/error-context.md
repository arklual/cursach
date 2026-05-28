# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-editing.spec.ts >> Canvas editing >> trigger node has no input handle (only output)
- Location: e2e/canvas-editing.spec.ts:145:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('app-palette .palette-item') to be visible

```

# Test source

```ts
  1   | import { Page, expect, APIRequestContext } from '@playwright/test';
  2   | 
  3   | export const API_BASE = 'http://localhost:8080/v1';
  4   | 
  5   | export interface ConsoleErrorBag {
  6   |   errors: { url: string; text: string }[];
  7   | }
  8   | 
  9   | export function attachConsoleSpy(page: Page): ConsoleErrorBag {
  10  |   const bag: ConsoleErrorBag = { errors: [] };
  11  |   page.on('pageerror', err => bag.errors.push({ url: page.url(), text: err.message }));
  12  |   page.on('console', msg => {
  13  |     if (msg.type() === 'error') {
  14  |       bag.errors.push({ url: page.url(), text: msg.text() });
  15  |     }
  16  |   });
  17  |   return bag;
  18  | }
  19  | 
  20  | export async function gotoList(page: Page) {
  21  |   await page.goto('/');
  22  |   await expect(page.getByRole('heading', { name: 'FluxPilot Workflow Lab' })).toBeVisible();
  23  | }
  24  | 
  25  | /**
  26  |  * Set "seen" flags so first-visit modals/banners stay closed during tests.
  27  |  * Should be called before navigating to a page that auto-opens them.
  28  |  */
  29  | export async function suppressFirstVisitHints(page: Page) {
  30  |   await page.addInitScript(() => {
  31  |     try {
  32  |       localStorage.setItem('fluxpilot.introSeen', '1');
  33  |       localStorage.setItem('fluxpilot.guideSeen', '1');
  34  |     } catch { /* SSR / locked-down env — fine, will fall through */ }
  35  |   });
  36  | }
  37  | 
  38  | export async function createWorkflowViaApi(request: APIRequestContext, name: string) {
  39  |   const res = await request.post(`${API_BASE}/workflows`, {
  40  |     data: { name, description: 'e2e seed' },
  41  |   });
  42  |   expect(res.ok()).toBeTruthy();
  43  |   return res.json() as Promise<{ meta: { id: string; name: string }; graph: { versionId: string } }>;
  44  | }
  45  | 
  46  | export async function deleteWorkflowViaApi(request: APIRequestContext, id: string) {
  47  |   await request.delete(`${API_BASE}/workflows/${id}`);
  48  | }
  49  | 
  50  | /** Удалить все workflow с именем, начинающимся на префикс (используется для cleanup e2e-данных). */
  51  | export async function deleteWorkflowsByPrefix(
  52  |   request: APIRequestContext,
  53  |   prefix: string,
  54  | ) {
  55  |   const res = await request.get(`${API_BASE}/workflows`);
  56  |   if (!res.ok()) return;
  57  |   const list = (await res.json()) as { id: string; name: string }[];
  58  |   for (const wf of list) {
  59  |     if (wf.name?.startsWith(prefix)) {
  60  |       await deleteWorkflowViaApi(request, wf.id);
  61  |     }
  62  |   }
  63  | }
  64  | 
  65  | /**
  66  |  * Drag-drop a palette item onto the canvas via synthetic DragEvents.
  67  |  * Playwright's native dragTo() doesn't preserve our custom MIME type
  68  |  * 'application/workflow-node', so we dispatch the events directly.
  69  |  */
  70  | export async function dragPaletteNode(page: Page, kind: string, offset: { x: number; y: number } = { x: 200, y: 200 }) {
  71  |   // Ждём появления палитры и канваса
> 72  |   await page.waitForSelector('app-palette .palette-item', { timeout: 5000 });
      |              ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  73  |   await page.waitForSelector('.canvas-viewport', { timeout: 5000 });
  74  | 
  75  |   await page.evaluate(({ kind, offset }) => {
  76  |     // Accept "kind" or "kind:subtype" — the drop handler splits on ":".
  77  |     const [baseKind, subtype] = kind.split(':');
  78  |     const items = document.querySelectorAll('app-palette .palette-item');
  79  |     let paletteBtn: HTMLElement | null = null;
  80  |     // Prefer an item whose visible label hints at the subtype (or kind).
  81  |     const needle = (subtype || baseKind).toLowerCase();
  82  |     for (const it of Array.from(items)) {
  83  |       const text = (it.textContent || '').toLowerCase();
  84  |       if (text.includes(needle)) { paletteBtn = it as HTMLElement; break; }
  85  |     }
  86  |     if (!paletteBtn) paletteBtn = items[0] as HTMLElement;
  87  |     const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
  88  |     if (!paletteBtn || !canvas) throw new Error('palette or canvas not found');
  89  |     const dt = new DataTransfer();
  90  |     dt.setData('application/workflow-node', kind);
  91  |     paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  92  |     const rect = canvas.getBoundingClientRect();
  93  |     canvas.dispatchEvent(new DragEvent('drop', {
  94  |       bubbles: true, cancelable: true, dataTransfer: dt,
  95  |       clientX: rect.left + offset.x, clientY: rect.top + offset.y,
  96  |     }));
  97  |   }, { kind, offset });
  98  | }
  99  | 
  100 | /**
  101 |  * Connect two nodes by simulating a drag from the source's output handle
  102 |  * to the target's input handle.
  103 |  */
  104 | export async function connectNodes(page: Page, sourceIndex: number, targetIndex: number) {
  105 |   const sourceHandle = page.locator('.node-wrap').nth(sourceIndex).locator('.handle-out');
  106 |   const targetHandle = page.locator('.node-wrap').nth(targetIndex).locator('.handle-in');
  107 |   const srcBox = await sourceHandle.boundingBox();
  108 |   const tgtBox = await targetHandle.boundingBox();
  109 |   if (!srcBox || !tgtBox) throw new Error('handles not found');
  110 |   await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  111 |   await page.mouse.down();
  112 |   await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 8 });
  113 |   await page.mouse.up();
  114 | }
  115 | 
  116 | export async function getWorkflowViaApi(request: APIRequestContext, id: string) {
  117 |   const res = await request.get(`${API_BASE}/workflows/${id}`);
  118 |   expect(res.ok()).toBeTruthy();
  119 |   return res.json() as Promise<{
  120 |     meta: { id: string; name: string };
  121 |     graph: { versionId: string; nodes: Array<{ id: string; type: string }>; connections: Array<{ id: string; source: string; target: string }> };
  122 |   }>;
  123 | }
  124 | 
  125 | export interface TriggerResponse {
  126 |   id: string;
  127 |   workflowId: string;
  128 |   nodeId: string;
  129 |   type: string;
  130 |   config?: Record<string, unknown> | null;
  131 |   token?: string | null;
  132 | }
  133 | 
  134 | export async function listTriggersViaApi(request: APIRequestContext, workflowId: string): Promise<TriggerResponse[]> {
  135 |   const res = await request.get(`${API_BASE}/workflows/${workflowId}/triggers`);
  136 |   expect(res.ok()).toBeTruthy();
  137 |   return res.json();
  138 | }
  139 | 
  140 | /**
  141 |  * Poll `GET /workflows/{id}/triggers` until the predicate is satisfied or timeout expires.
  142 |  * Useful because the editor's auto-save is debounced — triggers appear only after the save lands.
  143 |  */
  144 | export async function waitForTriggers(
  145 |   request: APIRequestContext,
  146 |   workflowId: string,
  147 |   predicate: (list: TriggerResponse[]) => boolean,
  148 |   timeoutMs = 10_000,
  149 | ): Promise<TriggerResponse[]> {
  150 |   const deadline = Date.now() + timeoutMs;
  151 |   let last: TriggerResponse[] = [];
  152 |   while (Date.now() < deadline) {
  153 |     last = await listTriggersViaApi(request, workflowId);
  154 |     if (predicate(last)) return last;
  155 |     await new Promise(r => setTimeout(r, 200));
  156 |   }
  157 |   throw new Error(`waitForTriggers timed out; last list: ${JSON.stringify(last)}`);
  158 | }
  159 | 
  160 | export async function enqueueRunViaApi(
  161 |   request: APIRequestContext,
  162 |   workflowId: string,
  163 |   payload: Record<string, unknown> = {},
  164 | ) {
  165 |   const res = await request.post(`${API_BASE}/workflows/${workflowId}/runs`, { data: payload });
  166 |   expect(res.status(), `enqueue run got ${res.status()}: ${await res.text()}`).toBe(202);
  167 |   return res.json() as Promise<{ id: string; status: string }>;
  168 | }
  169 | 
  170 | export async function listRunsViaApi(request: APIRequestContext, workflowId: string) {
  171 |   const res = await request.get(`${API_BASE}/workflows/${workflowId}/runs`);
  172 |   expect(res.ok()).toBeTruthy();
```