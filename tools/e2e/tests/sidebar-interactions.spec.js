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

  await expect(page.locator('[data-section="process"]')).toContainText(/流程\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/节点\s*1/);
  await expect(page.locator('[data-section="process"]')).toContainText(/任务\s*0/);
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

test('目录层级三角与对应标题等大等色且切换状态不改变大小，流程层不再展开步骤', async ({ page, request }) => {
  const documentName = `sidebar-hierarchy-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  doc.processes[0].flowGroup = '基础展示层';

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();

  const expandedMetrics = await page.evaluate(() => {
    function readLevel(head) {
      const name = head?.querySelector('.sb-name');
      const caret = head?.querySelector('.sb-caret');
      return {
        nameFontSize: parseFloat(window.getComputedStyle(name).fontSize || '0'),
        caretFontSize: parseFloat(window.getComputedStyle(caret).fontSize || '0'),
        nameColor: window.getComputedStyle(name).color,
        caretColor: window.getComputedStyle(caret).color,
      };
    }

    const subdomainHead = document.querySelector('[data-subdomain="仓储仓单管理"]');
    const flowGroupHead = document.querySelector('[data-flow-group="基础展示层"]');
    const processHead = document.querySelector('[data-process-id="P1"]');
    const processTaskItem = document.querySelector('.sb-task-item');
    return {
      subdomain: readLevel(subdomainHead),
      flowGroup: readLevel(flowGroupHead),
      processNameFontSize: parseFloat(window.getComputedStyle(processHead?.querySelector('.sb-name')).fontSize || '0'),
      processPaddingLeft: parseFloat(window.getComputedStyle(processHead).paddingLeft || '0'),
      processCaretCount: processHead?.querySelectorAll('.sb-caret').length || 0,
      processTaskItemCount: processTaskItem ? 1 : 0,
      flowGroupPaddingLeft: parseFloat(window.getComputedStyle(flowGroupHead).paddingLeft || '0'),
    };
  });

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  const subdomainCollapsedCaretSize = await page.evaluate(() => {
    const caret = document.querySelector('[data-subdomain="仓储仓单管理"] .sb-caret');
    return parseFloat(window.getComputedStyle(caret).fontSize || '0');
  });

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('[data-flow-group="基础展示层"]').click();
  const flowGroupCollapsedCaretSize = await page.evaluate(() => {
    const caret = document.querySelector('[data-flow-group="基础展示层"] .sb-caret');
    return parseFloat(window.getComputedStyle(caret).fontSize || '0');
  });

  expect(expandedMetrics.processPaddingLeft).toBeGreaterThan(expandedMetrics.flowGroupPaddingLeft);
  expect(expandedMetrics.subdomain.nameFontSize).toBeGreaterThan(expandedMetrics.flowGroup.nameFontSize);
  expect(expandedMetrics.flowGroup.nameFontSize).toBeGreaterThan(expandedMetrics.processNameFontSize);
  expect(expandedMetrics.subdomain.caretFontSize).toBe(expandedMetrics.subdomain.nameFontSize);
  expect(expandedMetrics.flowGroup.caretFontSize).toBe(expandedMetrics.flowGroup.nameFontSize);
  expect(expandedMetrics.subdomain.caretColor).toBe(expandedMetrics.subdomain.nameColor);
  expect(expandedMetrics.flowGroup.caretColor).toBe(expandedMetrics.flowGroup.nameColor);
  expect(expandedMetrics.processCaretCount).toBe(0);
  expect(expandedMetrics.processTaskItemCount).toBe(0);
  expect(subdomainCollapsedCaretSize).toBe(expandedMetrics.subdomain.caretFontSize);
  expect(flowGroupCollapsedCaretSize).toBe(expandedMetrics.flowGroup.caretFontSize);
});

test('业务子域和主题域显示轻量标签且标签字体弱于名称', async ({ page, request }) => {
  const documentName = `sidebar-badge-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.locator('[data-subdomain="仓储仓单管理"]').click();

  const metrics = await page.evaluate(() => {
    const subdomainHead = document.querySelector('[data-subdomain="仓储仓单管理"]');
    const themeHead = document.querySelector('[data-group="仓储仓单管理主题域"]');
    const subdomainBadge = subdomainHead?.querySelector('.sb-grp-badge');
    const themeBadge = themeHead?.querySelector('.sb-grp-badge');
    const subdomainName = subdomainHead?.querySelector('.sb-name');
    const processName = document.querySelector('[data-process-id="P1"] .sb-name');
    return {
      subdomainBadgeText: subdomainBadge?.textContent?.trim() || '',
      themeBadgeText: themeBadge?.textContent?.trim() || '',
      badgeFontSize: parseFloat(window.getComputedStyle(subdomainBadge).fontSize || '0'),
      nameFontSize: parseFloat(window.getComputedStyle(subdomainName).fontSize || '0'),
      processNameFontSize: parseFloat(window.getComputedStyle(processName).fontSize || '0'),
      badgeRadius: window.getComputedStyle(themeBadge).borderRadius,
    };
  });

  expect(metrics.subdomainBadgeText).toBe('业务子域');
  expect(metrics.themeBadgeText).toBe('主题域');
  expect(metrics.badgeFontSize).toBeLessThan(metrics.nameFontSize);
  expect(metrics.nameFontSize).toBeGreaterThan(metrics.processNameFontSize);
  expect(metrics.badgeRadius).not.toBe('0px');
});

test('数据目录主题域三角与标题等大等色且切换状态不改变大小', async ({ page, request }) => {
  const documentName = `sidebar-entity-caret-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  const themeHead = page.locator('[data-group]').first();

  const expandedMetrics = await themeHead.evaluate((head) => {
    const name = head.querySelector('.sb-name');
    const caret = head.querySelector('.sb-caret');
    return {
      nameFontSize: parseFloat(window.getComputedStyle(name).fontSize || '0'),
      caretFontSize: parseFloat(window.getComputedStyle(caret).fontSize || '0'),
      nameColor: window.getComputedStyle(name).color,
      caretColor: window.getComputedStyle(caret).color,
    };
  });

  await themeHead.click();
  const collapsedCaretSize = await themeHead.evaluate((head) => {
    const caret = head.querySelector('.sb-caret');
    return parseFloat(window.getComputedStyle(caret).fontSize || '0');
  });

  expect(expandedMetrics.caretFontSize).toBe(expandedMetrics.nameFontSize);
  expect(expandedMetrics.caretColor).toBe(expandedMetrics.nameColor);
  expect(collapsedCaretSize).toBe(expandedMetrics.caretFontSize);
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
