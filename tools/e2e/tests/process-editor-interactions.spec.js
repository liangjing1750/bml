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
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();
  await expect(page.locator('.proc-subdrawer')).toHaveCount(0);
  await expect(page.locator('.orch-card .orch-name').first()).toHaveValue('校验账号状态');
  await expect(page.locator('.orch-card input[type="text"]').nth(1)).toHaveValue('认证服务');
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
