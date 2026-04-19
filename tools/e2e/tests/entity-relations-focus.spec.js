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
  await expect(page.locator('.ef-group-frame')).toHaveCount(3);

  await page.locator('.ef-node[data-id="E1"]').click();

  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(1);
  await expect(page.locator('.ef-node[data-id="E3"]')).toHaveClass(/ef-muted/);
  await expect(page.locator('#ef-svg-entity-diagram path[data-related="false"]')).toHaveCount(1);
});
