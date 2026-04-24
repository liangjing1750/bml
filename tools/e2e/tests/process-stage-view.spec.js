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
