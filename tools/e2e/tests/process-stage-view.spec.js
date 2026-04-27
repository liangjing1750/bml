const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const { createDocument, openDocument } = require('./support/app-helpers');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const deliveryPlatformDocPath = path.join(repoRoot, 'workspace', '交割智慧监管平台', 'manifest.json');

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
  await page.getByTestId('sidebar-browse-stage').click();
  await expect(page.locator('.sb-stage-head[data-stage-id="S1"]')).toBeVisible();
  await expect(page.locator('.sb-stage-head[data-stage-id="S2"]')).toBeVisible();

  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-graph-node"] .stage-flow-node-meta')).toHaveCount(0);
  const nodeBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })
  ));
  expect(nodeBoxes[1].left).toBeGreaterThan(nodeBoxes[0].left);
  const writingMode = await page.locator('[data-testid="stage-graph-node"][data-process-id="P1"] .stage-flow-node-title').evaluate((node) => getComputedStyle(node).writingMode);
  expect(writingMode).toContain('vertical');
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-business-domain-readonly')).toBeVisible();
  await expect(page.getByTestId('stage-name-input')).toHaveCount(0);
  await expect(page.getByTestId('stage-subdomain-input')).toHaveCount(0);
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
});

test('交割智慧监管平台全景编辑态与阅读态都按真实细阶段显示', async ({ page, request }) => {
  const documentName = '交割智慧监管平台';
  const document = JSON.parse(fs.readFileSync(deliveryPlatformDocPath, 'utf8'));
  await createDocument(request, documentName, document);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-panorama').click();

  const matrix = page.getByTestId('value-stream-matrix');
  await expect(matrix).toHaveAttribute('data-editing', 'false');
  const readLabels = await matrix.locator('[data-testid="stage-graph-node"] .stage-graph-node-title').allTextContents();
  expect(readLabels).toContain('登录接入');
  expect(readLabels).toContain('角色与菜单鉴权');
  expect(readLabels).toContain('仓库主体维护');
  expect(readLabels).toContain('仓库资质维护');
  expect(readLabels).toContain('监管事务与查询');

  await page.getByTestId('stage-editor-open').click();
  await expect(matrix).toHaveAttribute('data-editing', 'true');
  const editLabels = await matrix.locator('[data-testid="stage-graph-node"] .stage-graph-node-title').allTextContents();
  expect(editLabels).toEqual(readLabels);

  const loginStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '登录接入' }).first();
  await expect(loginStage.getByTestId('matrix-stage-delete')).toHaveCount(1);
});

test('阶段详情支持画布编辑并提供统一快捷操作', async ({ page, request }) => {
  const documentName = `process-stage-actions-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-stage').click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);

  await expect(page.getByTestId('stage-detail-title')).toContainText('开户准备');
  await page.locator('[data-testid="stage-detail-title"] .stage-detail-name-text').dblclick();
  await expect(page.getByTestId('stage-name-inline-input')).toHaveValue('开户准备');
  await page.getByTestId('stage-name-inline-input').fill('开户资料准备');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stage-detail-title')).toContainText('开户资料准备');
  await expect(page.locator('.sb-stage-head[data-stage-id="S1"]')).toContainText('开户资料准备');
  await expect.poll(() => page.evaluate(() => S.doc.stages.find((stage) => stage.id === 'S1')?.name)).toBe('开户资料准备');

  const firstMember = page.locator('[data-testid="stage-graph-node"][data-process-id="P1"]');
  await expect(firstMember.getByTestId('stage-member-view-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-flow-link-source-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-member-remove-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-member-delete-button')).toBeVisible();
  await expect(firstMember.locator('.stage-quick-btn')).toHaveCount(4);
  await expect(page.getByTestId('stage-process-link-row')).toHaveCount(0);
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(1);

  await page.getByTestId('stage-process-link-remove-button').click();
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(0);
  await firstMember.getByTestId('stage-flow-link-source-button').click();
  await expect(firstMember).toHaveClass(/is-link-source/);
  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-flow-link-target-button').click();
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(1);

  const linkPath = page.locator('.stage-flow-link').first();
  const beforePath = await linkPath.getAttribute('d');
  const secondMember = page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]');
  const secondBox = await secondMember.boundingBox();
  expect(secondBox).not.toBeNull();
  await page.mouse.move(secondBox.x + 4, secondBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 4, secondBox.y + 244, { steps: 6 });
  await expect.poll(async () => linkPath.getAttribute('d')).not.toBe(beforePath);
  const verticalPath = await linkPath.getAttribute('d');
  const pathNumbers = (verticalPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  expect(pathNumbers.length).toBeGreaterThanOrEqual(8);
  const lastSegmentStartX = pathNumbers[pathNumbers.length - 4];
  const lastSegmentEndX = pathNumbers[pathNumbers.length - 2];
  expect(lastSegmentEndX).toBeGreaterThan(lastSegmentStartX);
  await page.mouse.up();

  await firstMember.getByTestId('stage-flow-name-input').fill('资料录入调整');
  await expect(firstMember.getByTestId('stage-flow-name-input')).toHaveValue('资料录入调整');
  await expect.poll(async () => page.evaluate(() => S.doc.processes.find((proc) => proc.id === 'P1')?.name)).toBe('资料录入调整');

  const beforeAddBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { processId: node.dataset.processId, top: rect.top };
    })
  ));
  await page.getByTestId('stage-flow-node-add-button').click();
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(3);
  const afterAddBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { processId: node.dataset.processId, top: rect.top };
    })
  ));
  const linkedTop = beforeAddBoxes.find((item) => item.processId === 'P1').top;
  const newNodeTop = afterAddBoxes.find((item) => item.processId === 'P4').top;
  expect(newNodeTop).toBeGreaterThan(linkedTop);

  await page.getByTestId('stage-editor-hide').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toHaveCount(0);
  await expect(page.getByTestId('stage-editor-open')).toBeVisible();

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
});

test('跨阶段、流程和数据切换后支持返回到上一视图', async ({ page, request }) => {
  const documentName = `process-stage-back-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-stage').click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();

  await page.locator('[data-testid="stage-graph-node"][data-process-id="P1"]').getByTestId('stage-member-view-button').click();
  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();

  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
  await expect(page.getByTestId('nav-back-button')).toBeEnabled();

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('tab-process')).toHaveClass(/active/);
  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料录入');

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
});

test('同一流程可被两个阶段引用且阶段详情仍指向同一流程实体', async ({ page, request }) => {
  const documentName = `process-stage-shared-${Date.now()}`;
  await createDocument(request, documentName, buildSharedFlowDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-stage').click();

  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-flow-name-input"][data-process-id="P2"]')).toHaveValue('资料审核');

  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-flow-name-input"][data-process-id="P2"]')).toHaveValue('资料审核');

  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-member-view-button').click();
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

  await page.getByTestId('sidebar-browse-stage').click();
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-member-view-button').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await page.getByTestId('sidebar-browse-domain').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
  await page.locator('.sb-grp-head').first().click();
  await expect(page.locator('.sb-flowgroup-head[data-flow-group="审核组"]')).toBeVisible();
  await page.locator('.sb-flowgroup-head[data-flow-group="审核组"]').click();
  await expect(page.locator('.sb-proc-head.active')).toContainText('P2 资料审核');
});

test('阶段中加入已有流程只新增引用而不复制流程实体', async ({ page, request }) => {
  const documentName = `process-stage-join-existing-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await page.getByTestId('sidebar-browse-stage').click();
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(1);

  await page.getByTestId('stage-process-select').selectOption('P2');

  await expect(page.getByTestId('stage-graph-node')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]')).toBeVisible();

  const counts = await page.evaluate(() => ({
    processCount: (S.doc?.processes || []).length,
    refPairs: (S.doc?.stageFlowRefs || []).map((ref) => `${ref.stageId}:${ref.processId}`),
  }));

  expect(counts.processCount).toBe(3);
  expect(counts.refPairs).toContain('S2:P2');
  expect(counts.refPairs.filter((item) => item === 'S2:P2')).toHaveLength(1);
});
