const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test('预览页支持导出 JSON 文档', async ({ page }) => {
  const documentName = `preview-export-${Date.now()}`;
  const downloadPath = path.join(os.tmpdir(), `${documentName}.json`);

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();
  await page.getByTestId('tab-preview').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('preview-export-json').click(),
  ]);

  expect(download.suggestedFilename()).toBe(`${documentName}.json`);
  await download.saveAs(downloadPath);

  const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf-8'));
  expect(exported.meta.title).toBe(documentName);
  expect(Array.isArray(exported.processes)).toBeTruthy();
  expect(Array.isArray(exported.entities)).toBeTruthy();
});
