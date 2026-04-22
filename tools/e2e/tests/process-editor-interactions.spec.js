const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildProcessEditorDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04',
    },
    roles: [
      { id: 'R1', name: '用户', desc: '' },
    ],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '统一登录',
        subDomain: '用户管理',
        flowGroup: '',
        trigger: '',
        outcome: '',
        tasks: [
          {
            id: 'T1',
            name: '登录校验',
            role_id: 'R1',
            steps: [
              { name: '选择认证方式', type: 'Query', note: '展示认证入口' },
              { name: '输入账号密码', type: 'Input', note: '录入登录凭证' },
            ],
            orchestrationTasks: [
              { name: '校验账号状态', type: 'Check', querySourceKind: '', target: '认证服务', note: '冻结账号不可继续' },
              { name: '生成登录会话', type: 'Service', querySourceKind: '', target: '会话服务', note: '写入登录态' },
            ],
          },
          {
            id: 'T2',
            name: '生成首页上下文',
            role_id: 'R1',
            steps: [
              { name: '查看工作台', type: 'View', note: '进入首页后展示默认工作台' },
            ],
            orchestrationTasks: [
              { name: '加载首页菜单', type: 'Query', querySourceKind: 'QueryService', target: '门户服务', note: '返回角色菜单和快捷入口' },
            ],
          },
        ],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

async function openTaskEditor(page, name) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();
  await page.locator('.ovc-body').first().click();
  await page.locator('#proc-diagram .pf-task[data-id="T1"]').click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('登录校验');
}

test('节点在当前编辑区内展示编排任务与任务级流程图', async ({ page, request }) => {
  const documentName = `process-orchestration-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await expect(page.getByTestId('node-perspective-switch')).toBeVisible();
  await page.getByTestId('node-perspective-engineering').click();
  await expect(page.locator('.node-perspective-btn.active')).toContainText('任务级视图');
  await expect(page.getByTestId('orchestration-section')).toBeVisible();
  await expect(page.getByTestId('user-steps-section')).toHaveCount(0);
   await expect(page.getByTestId('global-orchestration-flow')).toBeVisible();
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();
  await expect(page.locator('.proc-subdrawer')).toHaveCount(0);
  await expect(page.locator('.orch-card .orch-name').first()).toHaveValue('校验账号状态');
  await expect(page.locator('.orch-card input[type="text"]').nth(1)).toHaveValue('认证服务');
  await expect(page.locator('.ptf-node-frame')).toHaveCount(2);
  await expect(page.locator('.ptf-node-frame').first()).toContainText('登录校验');
  await expect(page.locator('.ptf-node-frame').nth(1)).toContainText('生成首页上下文');
});

test('任务级视图切回用户步骤视图后步骤区不重复插入操作按钮', async ({ page, request }) => {
  const documentName = `process-toggle-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.getByTestId('node-perspective-user').click();

  const stepRows = page.locator('.step-row');
  await expect(stepRows).toHaveCount(2);
  await expect(page.getByTestId('user-steps-section')).toBeVisible();
  await expect(page.locator('.step-row .step-actions')).toHaveCount(2);

  const actionsPerRow = await page.locator('.step-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.step-actions').length),
  );
  expect(actionsPerRow).toEqual([1, 1]);
});

test('任务级视图支持放大缩小和重置', async ({ page, request }) => {
  const documentName = `process-taskflow-zoom-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();

  const taskFlow = page.locator('#proc-diagram .ptf-wrap');
  await expect(taskFlow).toBeVisible();

  const zoomButtons = page.locator('.drawer-diag.taskflow-mode .zoom-btn');
  await zoomButtons.nth(0).click();

  let zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.2');

  await zoomButtons.nth(0).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.4');

  await zoomButtons.nth(2).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1.2');

  await zoomButtons.nth(1).click();
  zoomValue = await taskFlow.evaluate((node) => node.style.zoom);
  expect(zoomValue).toBe('1');
});

test('用户操作步骤支持行内插入并可上下调整顺序', async ({ page, request }) => {
  const documentName = `process-steps-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);

  const firstStep = page.locator('.step-row').first();
  await firstStep.locator('.step-add-after').click();
  await expect(page.locator('.step-row')).toHaveCount(3);

  const insertedName = page.locator('.step-row').nth(1).locator('.step-name');
  await insertedName.fill('校验登录环境');

  let names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '校验登录环境', '输入账号密码']);

  await page.locator('.step-row').nth(1).locator('.step-move-down').click();
  names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '输入账号密码', '校验登录环境']);
});

test('节点关联实体后保持抽屉滚动位置', async ({ page, request }) => {
  const documentName = `process-entity-op-scroll-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.entities = [
    { id: 'E1', name: '账号', group: '用户主题域', fields: [] },
    { id: 'E2', name: '会话', group: '用户主题域', fields: [] },
    { id: 'E3', name: '登录日志', group: '审计主题域', fields: [] },
  ];
  doc.processes[0].tasks[0].steps = Array.from({ length: 16 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const drawerBody = page.locator('.proc-drawer .drawer-body');
  await drawerBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const beforeSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(beforeScrollTop).toBeGreaterThan(0);
  expect(beforeSelectTop).not.toBeNull();

  await page.locator('.add-eop-row select').selectOption('E1');
  await page.locator('.add-eop-row .btn').click();

  await expect(page.locator('.eop-tag')).toHaveCount(1);
  const afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const afterSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(afterScrollTop).toBeGreaterThan(0);
  expect(afterSelectTop).not.toBeNull();
  expect(Math.abs(afterSelectTop - beforeSelectTop)).toBeLessThanOrEqual(4);
});
