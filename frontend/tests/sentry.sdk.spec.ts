import { test, expect } from '@playwright/test';

test('browser SDK reports errors without leaking a test cookie or query value', async ({ page }) => {
  test.skip(process.env.SENTRY_PRIVACY_TEST !== '1', 'Requires the local fake Sentry DSN');
  const envelopes: string[] = [];
  await page.route('https://example.ingest.sentry.io/**', async (route) => {
    envelopes.push(route.request().postData() || '');
    await route.fulfill({ status: 200, body: '{}' });
  });
  await page.goto('/?private_test_query=demo_query_secret');
  await page.evaluate(() => {
    document.cookie = 'demo_secret_cookie=demo_cookie_secret; path=/';
    setTimeout(() => { throw new Error('DukaPilot synthetic privacy test'); }, 100);
  });
  await expect.poll(() => envelopes.join(''), { timeout: 15000 }).toContain('DukaPilot synthetic privacy test');
  const captured = envelopes.join('');
  expect(captured).not.toContain('demo_cookie_secret');
  expect(captured).not.toContain('demo_query_secret');
});
