const { test, expect } = require('@playwright/test');

test('用户可以在使用手册页签查看简洁阅读布局', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('toolbar-manual-button').click();
  await expect(page.getByTestId('manual-tab')).toBeVisible();
  await expect(page.locator('#tab-bar')).toBeHidden();
  await expect(page.locator('.manual-reader-head')).toBeVisible();
  await expect(page.locator('.manual-panel-title')).toContainText('目录');
  await expect(page.locator('.manual-doc-list')).toHaveCount(0);
  await expect(page.getByTestId('manual-title')).toContainText('用户手册');
  await expect(page.locator('.manual-article img').first()).toBeVisible();
  await expect(page.locator('.manual-outline-group').first()).toBeVisible();

  const firstChildren = page.locator('.manual-outline-children').first();
  await expect(firstChildren).toHaveClass(/collapsed/);
  await page.locator('.manual-outline-toggle').first().click();
  await expect(firstChildren).not.toHaveClass(/collapsed/);
  await expect(page.locator('.manual-outline-link.group-link').first()).toBeVisible();
  await expect(page.locator('.manual-article img').first()).toBeVisible();
  await expect(page.locator('.manual-rail')).toHaveCount(0);

  const manualReaderMetrics = await page.locator('.manual-reader').evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: window.getComputedStyle(node).overflowY,
  }));
  expect(manualReaderMetrics.overflowY).toBe('auto');
  expect(manualReaderMetrics.scrollHeight).toBeGreaterThan(manualReaderMetrics.clientHeight);
});
