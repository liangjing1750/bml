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

test('业务域页只展示轻量角色摘要，并可从角色条目进入角色视图', async ({ page, request }) => {
  const documentName = `role-summary-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.getByTestId('role-summary-card')).toBeVisible();
  await expect(page.locator('.role-light-tip')).toContainText('责任视角');
  await expect(page.getByTestId('role-view-entry')).toBeVisible();
  await expect(page.locator('[data-role-id="R1"]')).toContainText('仓库管理员');
  await expect(page.locator('[data-role-id="R1"]')).toContainText('2T');

  await page.locator('[data-role-id="R1"]').click();

  await expect(page.getByTestId('process-role-view')).toBeVisible();
  await expect(page.locator('.proc-role-detail')).toContainText('仓库管理员');
  await expect(page.locator('.proc-role-detail')).toContainText('入库办理');
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

test('业务域页只允许删除未使用角色的轻量词典项', async ({ page, request }) => {
  const documentName = `role-remove-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  const usedRoleWrap = page.locator('.role-light-chip-wrap').filter({ has: page.locator('[data-role-id="R1"]') });
  const unusedRoleWrap = page.locator('.role-light-chip-wrap').filter({ has: page.locator('[data-role-id="R2"]') });

  await expect(usedRoleWrap.locator('.role-light-remove')).toHaveCount(0);
  await expect(unusedRoleWrap.locator('.role-light-remove')).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await unusedRoleWrap.locator('.role-light-remove').click();

  await expect(page.locator('[data-role-id="R2"]')).toHaveCount(0);
});
