const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test('预览页导出会同时下载 JSON 和 Markdown', async ({ page }) => {
  const documentName = `preview-export-${Date.now()}`;
  const downloads = [];

  page.on('download', (download) => downloads.push(download));

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();
  await page.getByTestId('tab-preview').click();
  await page.getByTestId('preview-export-bundle').click();

  await expect
    .poll(() => downloads.length, {
      message: '等待 JSON 和 Markdown 两个下载同时生成',
    })
    .toBe(2);

  const filenames = downloads.map((download) => download.suggestedFilename()).sort();
  expect(filenames).toEqual([`${documentName}.json`, `${documentName}.md`]);

  const jsonDownload = downloads.find((download) => download.suggestedFilename().endsWith('.json'));
  const mdDownload = downloads.find((download) => download.suggestedFilename().endsWith('.md'));
  const jsonPath = path.join(os.tmpdir(), `${documentName}.json`);
  const mdPath = path.join(os.tmpdir(), `${documentName}.md`);

  await jsonDownload.saveAs(jsonPath);
  await mdDownload.saveAs(mdPath);

  const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  expect(exported.meta.title).toBe(documentName);
  expect(Array.isArray(exported.processes)).toBeTruthy();
  expect(markdown).toContain(`# ${documentName}`);
});
