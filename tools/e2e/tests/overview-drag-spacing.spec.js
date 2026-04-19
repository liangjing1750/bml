const { test, expect } = require('@playwright/test');

test('概要视图拖拽后仍保持概要视图的网格间距', async ({ page }) => {
  const documentName = `概要视图拖拽间距-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-overview').click();

  const header = page.locator('.proc-card.ov-card[data-id="P1"] .ovc-header');
  const box = await header.boundingBox();
  if (!box) {
    throw new Error('未找到概要视图中的流程卡片');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(() =>
      page.locator('.proc-card.ov-card[data-id="P1"]').evaluate((element) => element.style.top)
    )
    .toBe('80px');
});
