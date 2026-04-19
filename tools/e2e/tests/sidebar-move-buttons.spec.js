const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildSidebarDoc(documentName) {
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
        name: '仓储入库预约',
        subDomain: '仓储仓单管理',
        trigger: '',
        outcome: '',
        tasks: [],
      },
      {
        id: 'P2',
        name: '查库管理',
        subDomain: '交割服务机构管理',
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [
      { id: 'E1', name: '仓储仓单', group: '仓储仓单管理主题域', fields: [] },
    ],
    relations: [],
    rules: [],
  };
}

test('左侧目录分组行的上下移动按钮纵向排列且不遮挡加号', async ({ page, request }) => {
  const documentName = `sidebar-move-${Date.now()}`;
  const doc = buildSidebarDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  const groupRow = page.locator('[data-subdomain="交割服务机构管理"]');
  await groupRow.hover();

  const addButton = groupRow.locator('.sb-add-btn');
  const moveButtons = groupRow.locator('.sb-move-btn');
  const moveWrap = groupRow.locator('.sb-move-btns');

  await expect(addButton).toBeVisible();
  await expect(moveWrap).toBeVisible();
  await expect(moveButtons).toHaveCount(2);

  const addBox = await addButton.boundingBox();
  const moveWrapBox = await moveWrap.boundingBox();
  const upBox = await moveButtons.nth(0).boundingBox();
  const downBox = await moveButtons.nth(1).boundingBox();

  expect(addBox).not.toBeNull();
  expect(moveWrapBox).not.toBeNull();
  expect(upBox).not.toBeNull();
  expect(downBox).not.toBeNull();

  expect(moveWrapBox.x + moveWrapBox.width).toBeLessThanOrEqual(addBox.x + 1);
  expect(downBox.y).toBeGreaterThan(upBox.y);
});
