/**
 * CLI smoke test for lll-experience.
 *
 * Unauthenticated checks always run (health, landing, auth redirect).
 * Signed-in checks run when TEST_EMAIL + TEST_PASSWORD are set.
 *
 *   bun run test:smoke
 *   SITE_URL=https://lll-experience.vercel.app bun run test:smoke
 *   SITE_URL=http://localhost:3010 bun run test:smoke
 */
import {test, expect, type Page} from '@playwright/test';

const SITE_URL = (process.env.SITE_URL || 'https://lll-experience.vercel.app').replace(/\/$/, '');
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
const CLERK_TEST_CODE = process.env.CLERK_TEST_CODE || '424242';
const canSignIn = Boolean(TEST_EMAIL && TEST_PASSWORD);

async function clerkLogin(page: Page) {
  await page.goto(SITE_URL, {waitUntil: 'networkidle'});

  if (page.url().includes('/apps')) {
    return;
  }

  const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
  await emailInput.waitFor({timeout: 20000});
  await emailInput.fill(TEST_EMAIL);
  await page.locator('button[data-localization-key="formButtonPrimary"]').first().click();
  await page.waitForTimeout(2000);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({timeout: 15000});
  await passwordInput.fill(TEST_PASSWORD);
  await page.locator('button[data-localization-key="formButtonPrimary"]').first().click();
  await page.waitForTimeout(3000);

  const otpInput = page.locator('input[data-input-otp="true"]').first();
  if (await otpInput.isVisible().catch(() => false)) {
    await otpInput.click();
    for (const digit of CLERK_TEST_CODE) {
      await page.keyboard.press(digit);
    }
  }

  await page.waitForURL('**/apps**', {timeout: 30000});
}

test.describe('smoke (public)', () => {
  test('GET /health returns ok', async ({request}) => {
    const res = await request.get(`${SITE_URL}/health`);
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {status?: string};
    expect(body.status).toBe('ok');
  });

  test('landing page loads', async ({page}) => {
    const res = await page.goto(SITE_URL, {waitUntil: 'domcontentloaded'});
    expect(res?.ok() ?? false).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });

  test('/fantasy redirects unauthenticated visitors to sign-in', async ({page}) => {
    await page.goto(`${SITE_URL}/fantasy`, {waitUntil: 'domcontentloaded'});
    expect(page.url()).toMatch(/redirect_url|\/$|\?/);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('smoke (signed-in)', () => {
  test.skip(!canSignIn, 'Set TEST_EMAIL and TEST_PASSWORD to run signed-in smoke');

  test('apps, fantasy lab, draft, and analyzer respond', async ({page}) => {
    test.setTimeout(180_000);
    await clerkLogin(page);

    await expect(page.getByRole('heading', {name: 'Choose an App'})).toBeVisible({timeout: 15000});
    await expect(page.getByRole('heading', {name: 'UCSB Legacy'})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'NFL Draft Predictor'})).toBeVisible();

    await page.goto(`${SITE_URL}/fantasy`, {timeout: 60000, waitUntil: 'domcontentloaded'});
    await expect(page.getByRole('heading', {name: 'UCSB Legacy'})).toBeVisible({timeout: 30000});
    await expect(page.locator('body')).toContainText('all-play');

    const draft = await page.goto(`${SITE_URL}/draft`, {timeout: 60000, waitUntil: 'domcontentloaded'});
    expect(draft?.ok() ?? false).toBeTruthy();

    const analyzer = await page.goto(`${SITE_URL}/analyzer`, {timeout: 120000, waitUntil: 'domcontentloaded'});
    expect(analyzer?.ok() ?? false).toBeTruthy();
  });
});
