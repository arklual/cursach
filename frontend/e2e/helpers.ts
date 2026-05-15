import { Page, expect } from '@playwright/test';

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

export async function createWorkflowViaApi(request: import('@playwright/test').APIRequestContext, name: string) {
  const res = await request.post('http://localhost:8080/v1/workflows', {
    data: { name, description: 'e2e seed' },
  });
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{ meta: { id: string; name: string }; graph: { versionId: string } }>;
}

export async function deleteWorkflowViaApi(request: import('@playwright/test').APIRequestContext, id: string) {
  await request.delete(`http://localhost:8080/v1/workflows/${id}`);
}

/** Удалить все workflow с именем, начинающимся на префикс (используется для cleanup e2e-данных). */
export async function deleteWorkflowsByPrefix(
  request: import('@playwright/test').APIRequestContext,
  prefix: string,
) {
  const res = await request.get('http://localhost:8080/v1/workflows');
  if (!res.ok()) return;
  const list = (await res.json()) as { id: string; name: string }[];
  for (const wf of list) {
    if (wf.name?.startsWith(prefix)) {
      await deleteWorkflowViaApi(request, wf.id);
    }
  }
}
