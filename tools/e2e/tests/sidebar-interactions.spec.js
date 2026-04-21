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
          {
            id: 'T1',
            name: '提交预约',
            role: '',
            steps: [
              { name: '填写预约单信息', type: 'manual', note: '' },
              { name: '校验品种与仓容权限', type: 'check', note: '' },
            ],
          },
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
      {
        id: 'E1',
        name: '仓储仓单',
        group: '仓储仓单管理主题域',
        fields: [
          { name: '仓单编号', type: 'string', note: '' },
          { name: '库存数量', type: 'number', note: '' },
        ],
      },
      {
        id: 'E2',
        name: '监管事项',
        group: '交割服务机构管理主题域',
        fields: [
          { name: '事项名称', type: 'string', note: '' },
        ],
      },
      {
        id: 'E3',
        name: '盘库抽检记录',
        group: '交割服务机构管理主题域',
        fields: [
          { name: '抽检批次', type: 'string', note: '' },
        ],
      },
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

test('左侧目录会显示带标签的顶层统计摘要', async ({ page, request }) => {
  const documentName = `sidebar-count-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.locator('[data-section="process"]')).toContainText(/子域\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/流程组\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/节点\s*1/);
  await expect(page.locator('[data-section="entity"]')).toContainText('主题域 2');
  await expect(page.locator('[data-section="entity"]')).toContainText('实体 3');
  await expect(page.locator('[data-section="entity"]')).toContainText('字段 4');
  await expect(page.locator('[data-subdomain="仓储仓单管理"] .sb-count')).toHaveText('1');
  await expect(page.locator('[data-group="仓储仓单管理主题域"] .sb-count')).toHaveText('1');
  await expect(page.locator('[data-group="交割服务机构管理主题域"] .sb-count')).toHaveText('2');

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await expect(page.locator('[data-process-id="P1"] .sb-count')).toHaveText('1');
});

test('流程组层级样式弱于业务子域并显示流程组标签', async ({ page, request }) => {
  const documentName = `sidebar-flowgroup-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  doc.processes[0].flowGroup = '基础展示屏';

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  const subdomainHead = page.locator('[data-subdomain="仓储仓单管理"]').first();
  await subdomainHead.click();

  const flowGroupHead = page.locator('.sb-subgrp-head').first();
  await expect(flowGroupHead).toContainText('流程组');
  await expect(flowGroupHead).toContainText('基础展示屏');

  const metrics = await page.evaluate(() => {
    const subdomainName = document.querySelector('[data-subdomain="仓储仓单管理"] .sb-name');
    const flowGroupName = document.querySelector('.sb-subgrp-head .sb-name');
    const badge = document.querySelector('.sb-subgrp-badge');
    const subdomainSize = parseFloat(window.getComputedStyle(subdomainName).fontSize || '0');
    const flowGroupSize = parseFloat(window.getComputedStyle(flowGroupName).fontSize || '0');
    return {
      subdomainSize,
      flowGroupSize,
      badgeRadius: window.getComputedStyle(badge).borderRadius,
    };
  });

  expect(metrics.flowGroupSize).toBeLessThan(metrics.subdomainSize);
  expect(metrics.badgeRadius).not.toBe('0px');
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
    paddingRight: parseFloat(window.getComputedStyle(node.parentElement).paddingRight || '0'),
  }));

  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  expect(Math.abs(afterBox.height - beforeBox.height)).toBeLessThanOrEqual(1);
  expect(nameMetrics.scrollHeight - nameMetrics.clientHeight).toBeLessThanOrEqual(1);
  expect(nameMetrics.paddingRight).toBeLessThanOrEqual(16);
});
