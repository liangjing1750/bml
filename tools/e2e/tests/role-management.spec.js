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
        group: '仓库作业方',
        subDomains: ['仓储仓单管理'],
        tags: ['现场', '办理'],
      },
      {
        id: 'R2',
        name: '现场操作员',
        desc: '负责现场作业与影像留痕',
        status: 'active',
        group: '仓库作业方',
        subDomains: ['仓储仓单管理'],
        tags: ['现场'],
      },
      {
        id: 'R3',
        name: '会员',
        desc: '代表会员单位发起业务申请并查询进度',
        status: 'active',
        group: '业务参与方',
        subDomains: ['仓储仓单管理'],
        tags: ['外部'],
      },
    ],
    language: [
      { term: '现货仓单', definition: '平台内记录仓储实物状态的单据。' },
      { term: '查库', definition: '对仓库进行现场检查、抽样或盘点。' },
    ],
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
      {
        id: 'P2',
        name: '入库预约',
        subDomain: '仓储仓单管理',
        trigger: '客户计划发货入库',
        outcome: '形成待审核预约',
        tasks: [
          {
            id: 'T3',
            name: '提交预约',
            role_id: 'R3',
            steps: [{ name: '填写预约信息', type: 'Fill', note: '' }],
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

test('业务域页以轻量方式展示角色词典，并可从角色条目进入角色视图', async ({ page, request }) => {
  const documentName = `role-summary-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.getByTestId('role-summary-card')).toBeVisible();
  await expect(page.locator('.domain-panel').filter({ hasText: '业务域信息' })).toBeVisible();
  await expect(page.locator('.domain-panel').filter({ hasText: '角色词典' })).toBeVisible();
  await expect(page.locator('.domain-panel').filter({ hasText: '统一语言/术语表' })).toBeVisible();
  await expect(page.getByTestId('role-view-entry')).toBeVisible();
  await expect(page.locator('[data-role-group="仓库作业方"]')).toBeVisible();
  await expect(page.locator('[data-role-group="业务参与方"]')).toBeVisible();
  await expect(page.locator('[data-role-id="R1"]')).toContainText('仓库管理员');
  await expect(page.locator('[data-role-id="R1"]')).toContainText('2T');

  const groupDisplay = await page.locator('.role-light-groups').evaluate((node) => window.getComputedStyle(node).display);
  expect(groupDisplay).toBe('grid');

  await page.locator('[data-role-id="R1"]').click();

  await expect(page.getByTestId('process-role-view')).toBeVisible();
  await expect(page.getByTestId('role-usecase-map')).toBeVisible();
  await expect(page.locator('.proc-role-detail')).toContainText('仓库管理员');
  await expect(page.locator('.proc-role-detail')).toContainText('入库办理');
  await expect(page.locator('.proc-role-detail')).toContainText('分组：仓库作业方');
});

test('业务域页新增角色时可以定义分组与标签', async ({ page, request }) => {
  const documentName = `role-create-${Date.now()}`;
  const doc = buildRoleDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.locator('#role-create-input').fill('质检机构');
  await page.locator('#role-create-group').fill('外部协作方');
  await page.locator('#role-create-tags').fill('外部,质检');
  await page.getByTestId('role-add-button').click();

  await expect(page.locator('[data-role-group="外部协作方"]')).toBeVisible();
  await expect(page.locator('[data-role-id]').filter({ hasText: '质检机构' })).toBeVisible();

  await page.locator('[data-role-id]').filter({ hasText: '质检机构' }).click();
  await expect(page.locator('.proc-role-detail')).toContainText('质检机构');
  await expect(page.locator('.proc-role-detail')).toContainText('分组：外部协作方');
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
  await expect(page.getByTestId('role-usecase-map')).toBeVisible();
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

test('角色视图右侧详情面板启用滚动，并在用例图中展示全局流程节点', async ({ page, request }) => {
  const documentName = `role-map-${Date.now()}`;
  const doc = buildRoleDoc(documentName);
  for (let index = 0; index < 10; index += 1) {
    doc.processes.push({
      id: `PX${index + 1}`,
      name: `扩展流程${index + 1}`,
      subDomain: index % 2 === 0 ? '仓储仓单管理' : '交割服务机构管理',
      trigger: '扩展测试',
      outcome: '验证滚动',
      tasks: [
        {
          id: `TX${index + 1}`,
          name: `扩展任务${index + 1}`,
          role_id: 'R1',
          steps: [{ name: '执行动作', type: 'Mutate', note: '' }],
          entity_ops: [],
          repeatable: false,
        },
      ],
    });
  }

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-role').click();

  await expect(page.getByTestId('role-usecase-map')).toBeVisible();
  await expect(page.locator('.role-usecase-process')).toHaveCount(12);

  const detailMetrics = await page.locator('.proc-role-detail').evaluate((node) => ({
    overflowY: window.getComputedStyle(node).overflowY,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));

  expect(detailMetrics.overflowY).toBe('auto');
  expect(detailMetrics.scrollHeight).toBeGreaterThan(detailMetrics.clientHeight);
});

test('统一语言术语表展开后保留业务域页滚动位置', async ({ page, request }) => {
  const documentName = `domain-language-${Date.now()}`;
  const doc = buildRoleDoc(documentName);
  for (let index = 0; index < 16; index += 1) {
    doc.roles.push({
      id: `R${index + 10}`,
      name: `扩展角色${index + 1}`,
      desc: '用于撑高角色词典区域',
      status: 'active',
      group: index % 2 === 0 ? '业务参与方' : '平台与运维方',
      subDomains: ['仓储仓单管理'],
      tags: [],
    });
  }

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  const domainScroll = page.getByTestId('domain-scroll');
  await domainScroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeToggle = await domainScroll.evaluate((node) => node.scrollTop);

  await page.getByTestId('language-toggle').click();

  await expect(page.locator('[data-panel="language"]')).toContainText('统一语言/术语表');
  const afterToggle = await domainScroll.evaluate((node) => node.scrollTop);

  expect(beforeToggle).toBeGreaterThan(120);
  expect(afterToggle).toBeGreaterThan(120);
  expect(Math.abs(afterToggle - beforeToggle)).toBeLessThan(120);
});
