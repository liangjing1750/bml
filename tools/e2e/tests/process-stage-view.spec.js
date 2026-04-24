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
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
      { id: 'SFR3', stageId: 'S2', processId: 'P3', order: 1, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [
      { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
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

function buildSharedFlowDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04-24',
    },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: '预约阶段', subDomain: '交割', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '办理阶段', subDomain: '交割', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
    ],
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
      { id: 'SFR3', stageId: 'S2', processId: 'P2', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR4', stageId: 'S2', processId: 'P3', order: 2, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [
      { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
      { id: 'SFL2', stageId: 'S2', fromRefId: 'SFR3', toRefId: 'SFR4' },
    ],
    processes: [
      { id: 'P1', name: '预约录入', subDomain: '交割', stageId: 'S1', flowGroup: '预约组', trigger: '', outcome: '', nodes: [] },
      { id: 'P2', name: '资料审核', subDomain: '交割', stageId: 'S1', flowGroup: '审核组', trigger: '', outcome: '', nodes: [] },
      { id: 'P3', name: '入库办理', subDomain: '交割', stageId: 'S2', flowGroup: '办理组', trigger: '', outcome: '', nodes: [] },
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

test('同一流程可被两个阶段引用且阶段详情仍指向同一流程实体', async ({ page, request }) => {
  const documentName = `process-stage-shared-${Date.now()}`;
  await createDocument(request, documentName, buildSharedFlowDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();
  await expect(page.locator('.stage-member-chip')).toHaveCount(2);
  await expect(page.locator('.stage-member-chip .stage-member-label').nth(1)).toContainText('P2 资料审核');

  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await expect(page.locator('.stage-member-chip')).toHaveCount(2);
  await expect(page.locator('.stage-member-chip .stage-member-label').first()).toContainText('P2 资料审核');

  await page.locator('.stage-member-chip').first().getByTestId('stage-member-view-button').click();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料审核');
  await expect(page.getByTestId('proc-stage-ref-list')).toBeVisible();
  await expect(page.getByTestId('proc-stage-ref-chip')).toHaveCount(2);
  await expect(page.getByTestId('proc-stage-ref-list')).toContainText('预约阶段');
  await expect(page.getByTestId('proc-stage-ref-list')).toContainText('办理阶段');
  await expect(page.getByTestId('proc-stage-select')).toHaveCount(0);
});

test('从阶段视图打开流程后侧边栏切到按子域浏览并定位同一流程', async ({ page, request }) => {
  const documentName = `process-stage-domain-browse-${Date.now()}`;
  await createDocument(request, documentName, buildSharedFlowDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.locator('.stage-member-chip').first().getByTestId('stage-member-view-button').click();

  await expect(page.getByTestId('process-overview-view')).toBeVisible();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toHaveCount(0);
  await expect(page.locator('.sb-flowgroup-head[data-flow-group="审核组"]')).toBeVisible();
  await expect(page.locator('.sb-proc-head.active')).toContainText('P2 资料审核');
});

test('阶段中加入已有流程只新增引用而不复制流程实体', async ({ page, request }) => {
  const documentName = `process-stage-join-existing-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await expect(page.locator('.stage-member-chip')).toHaveCount(1);

  await page.getByTestId('stage-process-select').selectOption('P2');
  await page.getByTestId('stage-member-join-button').click();

  await expect(page.locator('.stage-member-chip')).toHaveCount(2);
  await expect(page.locator('.stage-member-chip .stage-member-label').nth(1)).toContainText('P2 资料审核');

  const counts = await page.evaluate(() => ({
    processCount: (window.S?.doc?.processes || []).length,
    refPairs: (window.S?.doc?.stageFlowRefs || []).map((ref) => `${ref.stageId}:${ref.processId}`),
  }));

  expect(counts.processCount).toBe(3);
  expect(counts.refPairs).toContain('S2:P2');
  expect(counts.refPairs.filter((item) => item === 'S2:P2')).toHaveLength(1);
});
