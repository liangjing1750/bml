const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('数据关系图重置布局后保留全部主题域并采用多行分组铺排', async ({ page, request }) => {
  const documentName = `entity-layout-${Date.now()}`;
  const groups = [
    '交割服务机构管理主题域',
    '仓储仓单管理主题域',
    '厂库库存管理主题域',
    '车船板交割管理主题域',
    '基础数据管理主题域',
    '电子仓单同步数据管理主题域',
    '视频监控管理主题域',
  ];

  const doc = {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      { id: 'P1', name: '总流程', trigger: '', outcome: '', tasks: [] },
    ],
    entities: groups.map((group, index) => ({
      id: `E${index + 1}`,
      name: `${group}-实体`,
      group,
      fields: [],
    })),
    relations: groups.slice(1).map((_, index) => ({
      from: `E${index + 1}`,
      to: `E${index + 2}`,
      type: '1:N',
      label: `关系${index + 1}`,
    })),
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-data').click();
  await page.getByRole('button', { name: '重置布局' }).click();

  const groupFrames = page.locator('.ef-group-frame');
  await expect(groupFrames).toHaveCount(groups.length);

  const distinctTopCount = await groupFrames.evaluateAll((frames) => (
    new Set(frames.map((frame) => Math.round(frame.getBoundingClientRect().top))).size
  ));

  expect(distinctTopCount).toBeGreaterThan(1);
});
