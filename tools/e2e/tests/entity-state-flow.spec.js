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
  await page.getByTestId('data-switch-state').click();
  await page.getByTestId('entity-state-field-select').selectOption('0');
  await page.getByTestId('entity-state-values-input').fill('草稿/待审核/审核通过/已作废');
  await page.getByTestId('entity-transition-add-button').click();
  await page.getByTestId('entity-transition-from-0').selectOption('草稿');
  await page.getByTestId('entity-transition-to-0').selectOption('待审核');
  await page.getByTestId('entity-transition-action-0').fill('提交审核');
  await page.getByTestId('entity-transition-note-0').fill('提交后进入审核队列');

  await expect(page.getByTestId('entity-state-diagram')).toBeVisible();
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('待审核');
  await expect(page.getByTestId('entity-state-empty')).toHaveCount(0);

  await page.getByTestId('tab-preview').click();
  await expect(page.locator('.preview-rendered')).toContainText('状态流转');
  await expect(page.locator('.preview-rendered')).toContainText('提交审核');
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

  await expect(page.getByTestId('entity-state-values-input')).toHaveValue('草稿/待审核/已通过/已撤销');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('已撤销');
});
