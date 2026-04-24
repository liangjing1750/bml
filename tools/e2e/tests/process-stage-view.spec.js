const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildStageDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04-23',
    },
    roles: [],
    language: [],
    stages: [
      {
        id: 'S1',
        name: '开户准备',
        subDomain: '账户',
        pos: { x: 0, y: 0 },
        processLinks: [
          { fromProcessId: 'P1', toProcessId: 'P2' },
        ],
      },
      {
        id: 'S2',
        name: '开户完成',
        subDomain: '账户',
        pos: { x: 0, y: 0 },
        processLinks: [],
      },
    ],
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
    ],
    processes: [
      {
        id: 'P1',
        name: '资料录入',
        subDomain: '账户',
        stageId: 'S1',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
      {
        id: 'P2',
        name: '资料审核',
        subDomain: '账户',
        stageId: 'S1',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
      {
        id: 'P3',
        name: '账户开通',
        subDomain: '账户',
        stageId: 'S2',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('左侧目录按业务子域到业务阶段再到流程展示，点击阶段进入阶段详情', async ({ page, request }) => {
  const documentName = `process-stage-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.locator('.sb-grp-head[data-subdomain="账户"]')).toBeVisible();
  await expect(page.locator('.sb-stage-head[data-stage-id="S1"]')).toBeVisible();
  await expect(page.locator('.sb-stage-head[data-stage-id="S2"]')).toBeVisible();

  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-name-input')).toHaveValue('开户准备');
  await expect(page.locator('.stage-member-chip')).toHaveCount(2);
});

test('阶段详情支持关闭编辑并提供统一快捷操作', async ({ page, request }) => {
  const documentName = `process-stage-actions-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('stage-add-button')).toBeVisible();
  await expect(page.getByTestId('stage-delete-button')).toBeVisible();
  await expect(page.getByTestId('stage-drawer-close')).toBeVisible();

  const firstMember = page.locator('.stage-member-chip').first();
  await expect(firstMember.getByTestId('stage-member-view-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-member-move-up')).toBeDisabled();
  await expect(firstMember.getByTestId('stage-member-move-down')).toBeEnabled();
  await expect(firstMember.getByTestId('stage-member-remove-button')).toBeVisible();
  await expect(firstMember.locator('.stage-quick-btn')).toHaveCount(4);
  await expect(page.getByTestId('stage-link-row').first().locator('.stage-quick-btn')).toHaveCount(4);

  await firstMember.getByTestId('stage-member-move-down').click();
  await expect(page.locator('.stage-member-chip .stage-member-label').first()).toContainText('P2 资料审核');
  await expect(page.locator('.stage-member-chip .stage-member-label').nth(1)).toContainText('P1 资料录入');

  await page.getByTestId('stage-drawer-close').click();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('stage-editor-open')).toBeVisible();

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-drawer')).toBeVisible();
});

test('跨阶段、流程和数据切换后支持返回到上一视图', async ({ page, request }) => {
  const documentName = `process-stage-back-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-name-input')).toHaveValue('开户准备');

  await page.locator('.stage-member-chip').first().getByTestId('stage-member-view-button').click();
  await expect(page.getByTestId('process-overview-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();

  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
  await expect(page.getByTestId('nav-back-button')).toBeEnabled();

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('tab-process')).toHaveClass(/active/);
  await expect(page.getByTestId('process-overview-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料录入');

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-name-input')).toHaveValue('开户准备');
  await expect(page.getByTestId('stage-drawer')).toBeVisible();
});
