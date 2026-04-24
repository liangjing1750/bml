const { test, expect } = require('@playwright/test');

const { createNewDocument } = require('./support/app-helpers');

test('流程 tab 默认先显示卡片视图，切到概要视图后再显示流程管理按钮', async ({ page }) => {
  const documentName = `process-home-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('process-card-view')).toBeVisible();
  await expect(page.getByTestId('process-switch-stage')).toBeVisible();
  await expect(page.getByTestId('process-switch-overview')).toBeVisible();
  await expect(page.getByTestId('process-add-button')).toHaveCount(0);
  await expect(page.getByTestId('process-delete-button')).toHaveCount(0);

  await page.getByTestId('process-switch-stage').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('stage-add-button')).toBeVisible();

  await page.getByTestId('process-switch-overview').click();

  await expect(page.getByTestId('process-overview-view')).toBeVisible();
  await expect(page.getByTestId('process-add-button')).toBeVisible();
  await expect(page.getByTestId('process-delete-button')).toBeVisible();
});
