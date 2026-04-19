const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildSidebarDoc(documentName, longProcessName) {
  return {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: longProcessName,
        subDomain: '仓储仓单管理',
        trigger: '',
        outcome: '',
        tasks: [
          { id: 'T1', name: '提交预约', role: '', steps: [] },
        ],
      },
      {
        id: 'P2',
        name: '盘库管理',
        subDomain: '交割服务机构管理',
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [
      { id: 'E1', name: '仓储仓单', group: '仓储仓单管理主题域', fields: [] },
      { id: 'E2', name: '监管事项', group: '交割服务机构管理主题域', fields: [] },
    ],
    relations: [],
    rules: [],
  };
}

test('左侧目录默认折叠到业务子域和主题域层级', async ({ page, request }) => {
  const documentName = `sidebar-collapse-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.locator('[data-subdomain="仓储仓单管理"]')).toBeVisible();
  await expect(page.locator('[data-group="仓储仓单管理主题域"]')).toBeVisible();
  await expect(page.locator('[data-process-id="P1"]')).toHaveCount(0);
  await expect(page.locator('[data-entity-id="E1"]')).toHaveCount(0);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await expect(page.locator('[data-process-id="P1"]')).toBeVisible();
  await expect(page.locator('.sb-task-item', { hasText: '提交预约' })).toHaveCount(0);

  await page.locator('[data-group="仓储仓单管理主题域"]').click();
  await expect(page.locator('[data-entity-id="E1"]')).toBeVisible();
});

test('左侧目录悬停显示移动按钮时不应把目录项挤成两行', async ({ page, request }) => {
  const documentName = `sidebar-hover-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程名称很长用于验证悬停后不要换行');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  const processRow = page.locator('[data-process-id="P1"]');
  const processName = processRow.locator('.sb-name');

  const beforeBox = await processRow.boundingBox();
  await processRow.hover();
  const afterBox = await processRow.boundingBox();
  const nameMetrics = await processName.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));

  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  expect(Math.abs(afterBox.height - beforeBox.height)).toBeLessThanOrEqual(1);
  expect(nameMetrics.scrollHeight - nameMetrics.clientHeight).toBeLessThanOrEqual(1);
});
