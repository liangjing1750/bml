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

  await page.locator('input[placeholder="2025-01"]').first().fill('2026-04');
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
