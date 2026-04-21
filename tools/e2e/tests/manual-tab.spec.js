const { test, expect } = require('@playwright/test');

test('用户可以在使用手册页签查看文档目录和截图', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('toolbar-manual-button').click();
  await expect(page.getByTestId('manual-tab')).toBeVisible();
  await expect(page.getByTestId('manual-doc-design')).toBeVisible();
  await expect(page.getByTestId('manual-title')).toContainText('设计文档');
  await expect(page.locator('.manual-article img').first()).toBeVisible();

  await page.getByTestId('manual-doc-user-manual').click();
  await expect(page.getByTestId('manual-title')).toContainText('用户手册');
  await expect(page.locator('.manual-outline-link').first()).toBeVisible();
  await expect(page.locator('.manual-article img').first()).toBeVisible();
});
