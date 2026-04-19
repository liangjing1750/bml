const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const { workspaceDir } = require('./support/test-env');

test('用户可以修改文档并点击保存落盘', async ({ page }) => {
  const documentName = '端到端保存文档';
  const documentPath = path.join(workspaceDir, `${documentName}.json`);

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-date-input').fill('2026-04');
  await expect(page.locator('#modified-dot')).not.toHaveClass(/hidden/);

  await page.locator('#btn-save').click();
  await expect(page.locator('#modified-dot')).toHaveClass(/hidden/);

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) {
        return null;
      }
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return saved.meta?.date || null;
    }, {
      message: `等待 ${documentName}.json 写入保存后的日期`,
    })
    .toBe('2026-04');
});

test('用户可以通过另存生成新的业务域文档副本', async ({ page }) => {
  const originalName = `原业务域-${Date.now()}`;
  const copiedName = `另存业务域-${Date.now()}`;
  const originalPath = path.join(workspaceDir, `${originalName}.json`);
  const copiedPath = path.join(workspaceDir, `${copiedName}.json`);

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(originalName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-date-input').fill('2026-04-20');
  await page.getByTestId('toolbar-save-as-button').click();
  await page.getByTestId('save-as-name-input').fill(copiedName);
  await page.getByTestId('save-as-confirm-button').click();

  await expect(page.getByTestId('current-file-name')).toHaveText(copiedName);
  await expect(page.getByTestId('save-as-modal')).toHaveClass(/hidden/);

  await expect
    .poll(() => fs.existsSync(originalPath) && fs.existsSync(copiedPath), {
      message: '等待原文档和另存文档都写入工作区',
    })
    .toBeTruthy();

  const copied = JSON.parse(fs.readFileSync(copiedPath, 'utf-8'));
  expect(copied.meta?.domain).toBe(copiedName);
  expect(copied.meta?.title).toBe(copiedName);
  expect(copied.meta?.date).toBe('2026-04-20');
});
