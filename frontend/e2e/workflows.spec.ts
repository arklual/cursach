import { test, expect } from '@playwright/test';
import {
  attachConsoleSpy,
  gotoList,
  createWorkflowViaApi,
  deleteWorkflowViaApi,
  deleteWorkflowsByPrefix,
} from './helpers';

// Глобальный cleanup: до и после каждого теста сносим всё, что осталось с префиксом E2E-.
// Защита от накопления "копий" от теста Duplicate и от случайных недоудалённых.
test.beforeAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});
test.afterAll(async ({ request }) => {
  await deleteWorkflowsByPrefix(request, 'E2E-');
});

test.describe('Workflows list page', () => {
  test('list loads without console errors', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await gotoList(page);
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('shows empty state OR cards', async ({ page, request }) => {
    await gotoList(page);
    const empty = page.getByText('Нет workflows');
    const anyCard = page.locator('.workflow-card').first();
    await expect(empty.or(anyCard)).toBeVisible();
  });

  test('+ Создать workflow → navigates to editor without manual refresh', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await gotoList(page);
    const before = page.url();
    await page.getByRole('button', { name: /Создать workflow/i }).first().click();
    await page.waitForURL(/\/workflow\/[0-9a-f-]{36}$/, { timeout: 8_000 });
    expect(page.url()).not.toBe(before);
    await expect(page.locator('.app-header')).toBeVisible();
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });
});

test.describe('Workflow card', () => {
  let createdId: string;

  test.beforeEach(async ({ request }) => {
    // Изоляция: чистим всё E2E-* перед каждым тестом, чтобы копии от предыдущих тестов
    // (Duplicate / неудачные afterEach) не ломали локаторы.
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-${Date.now()}`);
    createdId = wf.meta.id;
  });

  test.afterEach(async ({ request }) => {
    // Сносим всё E2E-* — оригинал + любые копии, созданные тестом.
    await deleteWorkflowsByPrefix(request, 'E2E-');
    createdId = '';
  });

  test('click on card body navigates to editor', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await gotoList(page);
    const card = page.locator('.workflow-card', { hasText: 'E2E-' }).first();
    await expect(card).toBeVisible();
    await card.locator('.workflow-card-link').click();
    await page.waitForURL(new RegExp(`/workflow/${createdId}$`), { timeout: 8_000 });
    await expect(page.locator('.app-header')).toBeVisible();
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('"Открыть" button navigates to editor', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await gotoList(page);
    const card = page.locator('.workflow-card', { hasText: 'E2E-' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: 'Открыть' }).click();
    await page.waitForURL(new RegExp(`/workflow/${createdId}$`), { timeout: 8_000 });
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('"Копировать" creates a duplicate visible in list', async ({ page }) => {
    await gotoList(page);
    const card = page.locator('.workflow-card', { hasText: 'E2E-' }).first();
    const cardsBefore = await page.locator('.workflow-card').count();
    await card.getByRole('button', { name: 'Копировать' }).click();
    await expect.poll(async () => page.locator('.workflow-card').count(), { timeout: 5_000 }).toBe(cardsBefore + 1);
    await expect(page.locator('.workflow-card', { hasText: 'копия' }).first()).toBeVisible();
  });

  test('"Удалить" removes the card after confirm', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await gotoList(page);
    const card = page.locator('.workflow-card', { hasText: 'E2E-' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Удалить' }).click();
    await expect(card).toHaveCount(0, { timeout: 5_000 });
    createdId = ''; // already deleted
  });
});

test.describe('Workflow editor page', () => {
  let createdId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Editor-${Date.now()}`);
    createdId = wf.meta.id;
  });

  test.afterEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    createdId = '';
  });

  test('opens directly via URL without errors', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('app-workflow-canvas')).toBeVisible();
    await expect(page.locator('app-palette')).toBeVisible();
    await expect(page.locator('app-inspector')).toBeVisible();
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('rename workflow persists', async ({ page, request }) => {
    await page.goto(`/workflow/${createdId}`);
    const input = page.locator('.workflow-name-input');
    await expect(input).toBeVisible();
    const newName = `Renamed-${Date.now()}`;
    await input.fill(newName);
    await input.blur();
    // Reload to verify persistence
    await page.reload();
    await expect(page.locator('.workflow-name-input')).toHaveValue(newName);
  });

  test('back button returns to list', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'FluxPilot Workflow Lab' })).toBeVisible();
  });

  test('switching bottom tabs: Запуски / Триггеры loads without errors', async ({ page }) => {
    const errs = attachConsoleSpy(page);
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    await page.getByRole('button', { name: 'Запуски' }).click();
    await expect(page.locator('app-runs-panel')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Триггеры' }).click();
    await expect(page.locator('app-triggers-panel')).toBeVisible({ timeout: 5_000 });
    expect(errs.errors, JSON.stringify(errs.errors, null, 2)).toEqual([]);
  });

  test('palette is visible with node templates', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    const palette = page.locator('app-palette');
    await expect(palette).toBeVisible();
    // Палитра должна содержать что-то, что выглядит как ноды (Trigger / HTTP / A/B...)
    const paletteText = await palette.innerText();
    expect(paletteText.length).toBeGreaterThan(0);
  });

  test('modals open and close', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.getByRole('button', { name: 'Схема событий' }).click();
    await expect(page.getByText('JSON Schema событий')).toBeVisible();
    // Close
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: 'QA сценарии' }).click();
    await expect(page.getByText('QA сценарии').first()).toBeVisible();
  });
});

test.describe('Smoke — API/WS connectivity', () => {
  test('backend /v1/workflows responds', async ({ request }) => {
    const res = await request.get('http://localhost:8080/v1/workflows');
    expect(res.ok()).toBeTruthy();
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
  });

  test('SockJS info endpoint reachable (под context-path /v1)', async ({ request }) => {
    const res = await request.get('http://localhost:8080/v1/ws/info?t=' + Date.now());
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('Workflow editor — interactions', () => {
  let createdId: string;

  test.beforeEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    const wf = await createWorkflowViaApi(request, `E2E-Inter-${Date.now()}`);
    createdId = wf.meta.id;
  });

  test.afterEach(async ({ request }) => {
    await deleteWorkflowsByPrefix(request, 'E2E-');
    createdId = '';
  });

  test('non-existent workflow → editor показывает loadError', async ({ page }) => {
    await page.goto('/workflow/00000000-0000-0000-0000-000000000000');
    await expect(page.locator('.editor-error-banner')).toBeVisible({ timeout: 5_000 });
  });

  test('Simulate 500 users → execution log получает строки', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    const logsBefore = await page.locator('.log-entry').count();
    await page.getByRole('button', { name: 'Simulate 500 users' }).click();
    await expect.poll(async () => page.locator('.log-entry').count(), { timeout: 5_000 })
      .toBeGreaterThan(logsBefore);
  });

  test('Escape закрывает модалку', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.getByRole('button', { name: 'Схема событий' }).click();
    const modalTitle = page.getByRole('heading', { name: 'JSON Schema событий' });
    await expect(modalTitle).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modalTitle).toBeHidden({ timeout: 2_000 });
  });

  test('Click по backdrop закрывает модалку', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await page.getByRole('button', { name: 'QA сценарии' }).click();
    const modalTitle = page.getByRole('heading', { name: 'QA сценарии' });
    await expect(modalTitle).toBeVisible();
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(modalTitle).toBeHidden({ timeout: 2_000 });
  });

  test('addNode работает в non-secure context (без crypto.randomUUID)', async ({ page }) => {
    // Эмулируем HTTP-прод без TLS, где Web Crypto API не отдаёт randomUUID.
    // У `crypto.randomUUID` в Chromium свойство configurable=true, поэтому redefine работает.
    // Скрипт ставится через addInitScript — гарантированно выполняется ДО любого app-кода.
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true });
    });
    await page.goto(`/workflow/${createdId}`);
    // Sanity: убеждаемся что override применился именно в этой странице.
    const noRandomUUID = await page.evaluate(() => typeof window.crypto.randomUUID !== 'function');
    expect(noRandomUUID).toBe(true);
    await page.evaluate(() => {
      const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
      const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/workflow-node', 'trigger');
      paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: rect.left + 200, clientY: rect.top + 200,
      }));
    });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 3_000 });
  });

  test('Drag node из палитры → нода появляется на canvas', async ({ page }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    // Через dispatchEvent эмулируем drag+drop (Playwright's dragTo не переносит
    // кастомный mime 'application/workflow-node').
    await page.evaluate(() => {
      const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
      const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
      if (!paletteBtn || !canvas) throw new Error('palette or canvas not found');
      const dt = new DataTransfer();
      dt.setData('application/workflow-node', 'trigger');
      paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: rect.left + 200, clientY: rect.top + 200,
      }));
    });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 3_000 });
  });

  test('Multi-cycle: add → leave → reopen sохраняет все ноды', async ({ page, request }) => {
    const dragOneNode = async () => {
      await page.evaluate(() => {
        const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
        const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
        const dt = new DataTransfer();
        dt.setData('application/workflow-node', 'trigger');
        paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer: dt,
          clientX: rect.left + 200 + Math.random() * 100, clientY: rect.top + 200 + Math.random() * 100,
        }));
      });
    };

    // Цикл 1: 1 нода
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
    await dragOneNode();
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/$/);

    // Reopen, проверяем что нода осталась
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 5_000 });

    // Цикл 2: добавляем ещё ноду, выходим через browser back
    await dragOneNode();
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(2);
    await page.goBack();
    await page.waitForURL(/\/$/);

    // Reopen, проверяем что обе ноды на месте
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(2, { timeout: 5_000 });

    // На уровне backend тоже должно быть 2 ноды
    const wf = await (await request.get(`http://localhost:8080/v1/workflows/${createdId}`)).json();
    expect(wf.graph.nodes.length).toBe(2);
  });

  test('F5 reload сохраняет ноды (beforeunload + keepalive)', async ({ page, request }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
    await page.evaluate(() => {
      const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
      const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/workflow-node', 'trigger');
      paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: rect.left + 200, clientY: rect.top + 200,
      }));
    });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
    // F5 — beforeunload → keepalive fetch
    await page.reload();
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1, { timeout: 5_000 });
    const wf = await (await request.get(`http://localhost:8080/v1/workflows/${createdId}`)).json();
    expect(wf.graph.nodes.length).toBe(1);
  });

  test('Browser back из редактора сохраняет ноды (BUG-7 repro)', async ({ page, request }) => {
    await page.goto('/');
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('.app-header')).toBeVisible();
    await page.evaluate(() => {
      const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
      const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/workflow-node', 'trigger');
      paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: rect.left + 200, clientY: rect.top + 200,
      }));
    });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
    // Эмулируем browser back (не клик по .back-btn)
    await page.goBack();
    await page.waitForURL(/\/$/);
    // Дадим время фоновым запросам долететь
    await page.waitForTimeout(500);
    const wf = await (await request.get(`http://localhost:8080/v1/workflows/${createdId}`)).json();
    expect(wf.graph?.nodes?.length).toBeGreaterThan(0);
  });

  test('Drag node + save → нода персистится на бэке', async ({ page, request }) => {
    await page.goto(`/workflow/${createdId}`);
    await expect(page.locator('app-palette .palette-item').first()).toBeVisible();
    await page.evaluate(() => {
      const paletteBtn = document.querySelector('app-palette .palette-item') as HTMLElement;
      const canvas = document.querySelector('.canvas-viewport') as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('application/workflow-node', 'trigger');
      paletteBtn.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: rect.left + 200, clientY: rect.top + 200,
      }));
    });
    await expect(page.locator('app-workflow-canvas .node-wrap')).toHaveCount(1);
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/$/);
    const wf = await (await request.get(`http://localhost:8080/v1/workflows/${createdId}`)).json();
    expect(wf.graph?.nodes?.length).toBeGreaterThan(0);
  });
});
