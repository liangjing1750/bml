const { test, expect } = require('@playwright/test');

const { createDocument } = require('./support/app-helpers');

async function openDocumentFromList(page, name) {
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('domain-scroll')).toBeVisible();
}

function buildDomainModelingDoc(documentName) {
  return {
    meta: {
      title: documentName,
      domain: '交割智慧监管平台-v2',
      author: 'Liang Jing',
      date: '2026-04-24',
    },
    roles: [],
    language: [
      { term: '交割预报', definition: '客户向仓库发货前提交的预报信息。' },
      { term: '现货仓单', definition: '平台内记录仓储实物状态的单据。' },
    ],
    stages: [
      { id: 'S1', name: '预约阶段', subDomain: '交割服务', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '办理阶段', subDomain: '交割服务', pos: { x: 0, y: 0 }, processLinks: [] },
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
      { id: 'P1', name: '预约录入', subDomain: '交割服务', flowGroup: '核心流程', stageId: 'S1', trigger: '', outcome: '', nodes: [] },
      { id: 'P2', name: '账号鉴权', subDomain: '用户管理', flowGroup: '平台支撑', stageId: 'S1', trigger: '', outcome: '', nodes: [] },
      { id: 'P3', name: '视频取证', subDomain: '视频监控', flowGroup: '监控支撑', stageId: 'S2', trigger: '', outcome: '', nodes: [] },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('业务域页术语表支持统一样式的快捷操作', async ({ page, request }) => {
  const documentName = `domain-language-quick-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('term-row')).toHaveCount(2);

  const firstRow = page.getByTestId('term-row').first();
  await expect(firstRow.locator('.stage-quick-btn')).toHaveCount(4);

  await firstRow.getByTestId('term-row-add').click();
  await expect(page.getByTestId('term-row')).toHaveCount(3);
  await expect(page.getByTestId('term-input').nth(1)).toHaveValue('');

  await page.getByTestId('term-input').nth(1).fill('监管指令');
  await page.getByTestId('term-definition-input').nth(1).fill('由监管方发起的处理指令。');
  await page.getByTestId('term-row').nth(1).getByTestId('term-row-move-up').click();
  await expect(page.getByTestId('term-input').first()).toHaveValue('监管指令');

  await page.getByTestId('term-row').first().getByTestId('term-row-remove').click();
  await expect(page.getByTestId('term-row')).toHaveCount(2);
  await expect(page.getByTestId('term-input').first()).toHaveValue('交割预报');
});

test('业务域页显示单图版 DDD 子域地图并支持核心域与通用域切换', async ({ page, request }) => {
  const documentName = `domain-map-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await expect(page.getByTestId('domain-subdomain-map-card')).toBeVisible();
  await expect(page.getByTestId('domain-subdomain-figure')).toBeVisible();
  await expect(page.locator('.domain-map-svg')).toHaveCount(0);
  await expect(page.locator('.domain-map-outline')).toHaveCount(0);
  await expect(page.locator('.domain-map-partition-primary')).toHaveCount(0);
  await expect(page.locator('.domain-map-partition-guide')).toHaveCount(0);
  await expect(page.locator('.subdomain-kind-btn')).toHaveCount(0);
  await expect(page.locator('.domain-subdomain-separator')).toHaveCount(3);
  await expect(page.locator('.domain-map-region-label-core')).toHaveCSS('color', 'rgb(37, 99, 235)');
  await expect(page.locator('.domain-map-region-label-generic')).toHaveCSS('color', 'rgb(4, 120, 87)');
  await expect(page.getByTestId('subdomain-core-oval')).toContainText('交割服务');
  await expect(page.getByTestId('subdomain-generic-oval')).toContainText('用户管理');
  await expect(page.getByTestId('subdomain-generic-oval')).toContainText('视频监控');

  const userNode = page.getByTestId('subdomain-map-node').filter({ hasText: '用户管理' });
  await userNode.click();

  await expect(page.getByTestId('subdomain-core-oval')).toContainText('用户管理');
  await expect(page.getByTestId('subdomain-generic-oval')).not.toContainText('用户管理');
});

test('左侧流程目录支持显式切换按阶段和按子域浏览', async ({ page, request }) => {
  const documentName = `sidebar-browse-switch-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('sidebar-browse-stage')).toBeVisible();
  await expect(page.getByTestId('sidebar-browse-domain')).toBeVisible();

  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();

  const firstSubDomainHead = page.locator('.sb-process-browse .sb-grp-head').filter({ hasText: '交割服务' });
  const firstFlowGroupHead = page.locator('.sb-process-browse .sb-flowgroup-head').filter({ hasText: '核心流程' });
  const firstProcessItem = page.locator('.sb-process-browse .sb-proc-head').filter({ hasText: '预约录入' });

  await firstSubDomainHead.click();
  await expect(firstFlowGroupHead).toBeVisible();
  await expect(firstProcessItem).not.toBeVisible();

  await firstFlowGroupHead.click();
  await expect(firstProcessItem).toBeVisible();

  await firstFlowGroupHead.click();
  await expect(firstProcessItem).not.toBeVisible();

  await firstSubDomainHead.click();
  await expect(firstFlowGroupHead).not.toBeVisible();

  await firstSubDomainHead.click();
  await expect(firstFlowGroupHead).toBeVisible();

  await page.getByTestId('process-switch-stage').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();

  await page.getByTestId('sidebar-browse-domain').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toHaveCount(0);

  await page.getByTestId('sidebar-browse-stage').click();
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
});
