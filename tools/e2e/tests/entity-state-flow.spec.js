const { test, expect } = require('@playwright/test');

const { createDocument, createNewDocument, openDocument } = require('./support/app-helpers');

test('数据页支持编辑实体主状态字段并生成状态图', async ({ page }) => {
  const documentName = `entity-state-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('预约单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('预约状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').first().fill('草稿/待审核/审核通过/已作废');
  await page.getByTestId('data-switch-state').click();
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('预约状态');
  await expect(page.getByTestId('entity-state-values-text')).toContainText('草稿/待审核/审核通过/已作废');
  await page.getByTestId('entity-transition-add-button').click();
  await page.getByTestId('entity-transition-from-0').selectOption('草稿');
  await page.getByTestId('entity-transition-to-0').selectOption('待审核');
  await page.getByTestId('entity-transition-action-0').fill('提交审核');
  await page.getByTestId('entity-transition-note-0').fill('提交后进入审核队列');

  await expect(page.getByTestId('entity-state-diagram')).toBeVisible();
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('待审核');
  await expect(page.locator('[data-testid=\"entity-state-graph-canvas\"]')).toBeVisible();
  await expect(page.locator('[data-testid=\"entity-state-graph-link\"]')).toHaveCount(1);
  await expect(page.locator('.entity-transition-row select')).toHaveCount(2);
  await expect(page.getByTestId('entity-state-empty')).toHaveCount(0);

  await page.getByTestId('tab-preview').click();
  await expect(page.locator('.preview-rendered')).toContainText('状态流转');
  await expect(page.locator('.preview-rendered')).toContainText('提交审核');
});

test('数据页允许一个主状态加多个子状态且不增加列', async ({ page }) => {
  const documentName = `entity-status-roles-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('出库单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('主状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').nth(0).fill('草稿/待审核/已完成');

  await page.getByTestId('entity-field-add-after-0').click();
  await page.getByTestId('entity-field-name-1').fill('同步状态');
  await page.getByTestId('entity-field-type-1').selectOption('enum');
  await page.getByTestId('entity-status-role-1').selectOption('secondary');
  await page.locator('.field-td-note textarea').nth(1).fill('未同步/同步中/已同步');

  await page.getByTestId('entity-field-add-after-1').click();
  await page.getByTestId('entity-field-name-2').fill('通知状态');
  await page.getByTestId('entity-field-type-2').selectOption('enum');
  await page.getByTestId('entity-status-role-2').selectOption('primary');
  await page.locator('.field-td-note textarea').nth(2).fill('待通知/通知中/已通知');

  await page.getByTestId('entity-status-role-0').selectOption('');
  await page.getByTestId('entity-status-role-0').selectOption('secondary');

  const statusRoles = await page.locator('[data-testid^="entity-status-role-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value || 'none'),
  );
  expect(statusRoles).toEqual(['secondary', 'secondary', 'primary']);

  const headerCount = await page.locator('.field-table thead th').count();
  expect(headerCount).toBe(6);

  await page.getByTestId('data-switch-state').click();
  const options = await page.getByTestId('entity-state-field-select').locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, text: node.textContent.trim() })),
  );
  expect(options).toEqual([
    { value: '通知状态', text: '主：通知状态' },
    { value: '主状态', text: '子：主状态' },
    { value: '同步状态', text: '子：同步状态' },
  ]);
  await expect(page.getByTestId('entity-state-diagram')).toContainText('主状态字段');
});

test('数据页字段支持行内新增删除和上下移动', async ({ page }) => {
  const documentName = `entity-field-actions-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('预约单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('预约编号');

  const actionCounts = await page.locator('.field-table tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.field-actions button').length),
  );
  expect(actionCounts).toEqual([4]);

  await page.getByTestId('entity-field-add-after-0').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(2);
  await page.getByTestId('entity-field-name-1').fill('预约状态');

  let names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '预约状态']);

  await page.getByTestId('entity-field-move-down-0').click();
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约状态', '预约编号']);

  await page.getByTestId('entity-field-move-up-1').click();
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '预约状态']);

  await page.getByTestId('entity-field-add-after-1').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(3);
  await page.getByTestId('entity-field-name-2').fill('申请日期');

  await page.getByTestId('entity-field-delete-1').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(2);
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '申请日期']);
});

test('旧文档中写在公式约束里的状态串会自动进入状态编辑', async ({ page, request }) => {
  const documentName = `entity-state-note-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '入库预约',
        group: '仓储仓单管理',
        fields: [
          { name: '状态', type: 'enum', is_key: false, is_status: true, note: '草稿/待审核/已通过/已撤销' },
        ],
        state_transitions: [],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await expect(page.getByTestId('entity-state-values-text')).toContainText('草稿/待审核/已通过/已撤销');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('已撤销');
});
