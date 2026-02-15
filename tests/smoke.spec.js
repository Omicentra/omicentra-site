const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('index loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});

test('conferences page loads and renders cards or table', async ({ page }) => {
  await page.goto('/conferences.html');

  // Wait for content
  await page.waitForTimeout(1000);

  const hasCards = await page.locator('.card').count();
  const hasTableRows = await page.locator('tbody tr').count();

  expect(hasCards > 0 || hasTableRows > 0).toBeTruthy();
});

test('JSON data is accessible', async ({ request }) => {
  const response = await request.get('/data/conferences.json');
  expect(response.ok()).toBeTruthy();
});

test('no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/conferences.html');
  await page.waitForTimeout(1000);

  expect(errors).toEqual([]);
});

test('basic accessibility check (axe)', async ({ page }) => {
  await page.goto('/conferences.html');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
