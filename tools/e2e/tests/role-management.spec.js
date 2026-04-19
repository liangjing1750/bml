const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildRoleDoc(documentName) {
  return {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [
      {
        id: 'R1',
        name: '仓库管理员',
        desc: '负责仓库日常业务办理与现场协调',
        status: 'active',
        subDomains: ['仓储仓单管理'],
        tags: ['现场', '办理'],
      },
      {
        id: 'R2',
        name: '现场操作员',
        desc: '负责现场作业与影像留痕',
        status: 'active',
        subDomains: ['仓储仓单管理'],
        tags: ['现场'],
      },
    ],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '入库办理',
        subDomain: '仓储仓单管理',
        trigger: '预约通过且货物到库',
        outcome: '完成入库并生成现货仓单',
        tasks: [
          {
            id: 'T1',
            name: '确认到货',
            role_id: 'R1',
            steps: [{ name: '核对车辆与预约单', type: 'Check', note: '' }],
            entity_ops: [],
            repeatable: false,
          },
          {
            id: 'T2',
            name: '生成现货仓单',
            role_id: 'R1',
            steps: [{ name: '落仓后生成仓单', type: 'Mutate', note: '' }],
            entity_ops: [],
            repeatable: false,
          },
        ],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('角色管理禁止删除使用中角色，并允许删除未使用角色', async ({ page, request }) => {
  const documentName = `role-manage-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.getByTestId('role-management')).toBeVisible();

  await page.locator('[data-role-id="R1"]').click();
  await expect(page.getByTestId('role-delete-button')).toBeDisabled();

  await page.locator('[data-role-id="R2"]').click();
  await expect(page.getByTestId('role-delete-button')).toBeEnabled();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('role-delete-button').click();

  await expect(page.locator('[data-role-id="R2"]')).toHaveCount(0);
});

test('流程角色视图可以按角色聚合流程和任务', async ({ page, request }) => {
  const documentName = `role-view-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-role').click();

  await expect(page.getByTestId('process-role-view')).toBeVisible();
  await expect(page.locator('.proc-role-detail')).toContainText('仓库管理员');
  await expect(page.locator('.proc-role-detail')).toContainText('入库办理');
  await expect(page.locator('.proc-role-detail')).toContainText('确认到货');

  await page.getByTestId('role-view-task-chip').first().click();

  await expect(page.getByTestId('process-overview-view')).toBeVisible();
  await expect(page.locator('.drawer-crumb')).toContainText('确认到货');
});
