const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('实体编辑抽屉只展示当前实体关系，并在关系图中突出当前实体邻域', async ({ page, request }) => {
  const documentName = `entity-focus-${Date.now()}`;
  const doc = {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      { id: 'P1', name: '主流程', trigger: '', outcome: '', tasks: [] },
    ],
    entities: [
      { id: 'E1', name: '订单', group: '交易主题域', fields: [] },
      { id: 'E2', name: '仓单', group: '仓储主题域', fields: [] },
      { id: 'E3', name: '监管记录', group: '监管主题域', fields: [] },
    ],
    relations: [
      { from: 'E1', to: 'E2', type: '1:N', label: '订单关联仓单' },
      { from: 'E2', to: 'E3', type: '1:N', label: '仓单触发监管' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-data').click();
  await expect(page.locator('.live-diagram-toolbar .zoom-controls')).toHaveCount(0);
  await expect(page.locator('.ef-group-frame')).toHaveCount(3);

  await page.locator('.ef-node[data-id="E1"]').click();

  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(1);
  await expect(page.locator('.ef-node[data-id="E3"]')).toHaveClass(/ef-muted/);
  await expect(page.locator('#ef-svg-entity-diagram path[data-related="false"]')).toHaveCount(1);
});

test('实体关系支持快捷新增删除上下移并保持抽屉滚动位置', async ({ page, request }) => {
  const documentName = `entity-rel-actions-${Date.now()}`;
  const doc = {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '订单',
        group: '交易主题域',
        fields: Array.from({ length: 14 }, (_, index) => ({
          name: `字段${index + 1}`,
          type: 'string',
          is_key: false,
          is_status: false,
          note: '',
        })),
      },
      { id: 'E2', name: '仓单', group: '仓储主题域', fields: [] },
      { id: 'E3', name: '监管记录', group: '监管主题域', fields: [] },
    ],
    relations: [
      { from: 'E1', to: 'E2', type: '1:N', label: '订单关联仓单' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.locator('.ef-node[data-id="E1"]').click();

  const drawerBody = page.locator('.entity-drawer .drawer-body');
  await drawerBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  expect(beforeScrollTop).toBeGreaterThan(0);

  const actionCounts = await page.locator('[data-testid="entity-relation-list"] .rel-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.rel-actions button').length),
  );
  expect(actionCounts).toEqual([4]);

  await page.getByTestId('entity-relation-add-after-0').click();
  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(2);
  await page.getByTestId('entity-relation-label-1').fill('订单关联监管记录');

  let labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联仓单', '订单关联监管记录']);

  let afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  expect(afterScrollTop).toBeGreaterThanOrEqual(beforeScrollTop - 24);
  expect(afterScrollTop - beforeScrollTop).toBeLessThanOrEqual(48);

  await page.getByTestId('entity-relation-move-up-1').click();
  labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联监管记录', '订单关联仓单']);

  await page.getByTestId('entity-relation-delete-0').click();
  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(1);
  labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联仓单']);
});
