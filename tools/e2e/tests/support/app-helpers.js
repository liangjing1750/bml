const { expect } = require('@playwright/test');

async function createDocument(request, name, doc) {
  const response = await request.post(`/api/save/${encodeURIComponent(name)}`, {
    data: doc,
  });
  expect(response.ok()).toBeTruthy();
}

async function openDocument(page, name) {
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(name);
}

async function createNewDocument(page, name) {
  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(name);
  await page.getByTestId('new-doc-confirm-button').click();
  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(name);
}

async function dragResizeHandle(page, handleLocator, deltaX) {
  const box = await handleLocator.boundingBox();
  if (!box) {
    throw new Error('未找到可拖拽的抽屉拉伸手柄');
  }
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(24, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 12 });
  await page.mouse.up();
}

module.exports = {
  createDocument,
  openDocument,
  createNewDocument,
  dragResizeHandle,
};
