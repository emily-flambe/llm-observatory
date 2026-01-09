import { test, expect } from '@playwright/test';

test.describe('LLM Observatory', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('LLM Observatory');
  });

  test('should show topics list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Topics')).toBeVisible();
  });

  test('should have working health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.status).toBe('ok');
  });

  test('should return topics from API', async ({ request }) => {
    const response = await request.get('/api/topics');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.topics).toBeDefined();
    expect(Array.isArray(json.topics)).toBe(true);
  });
});
