/**
 * Regression test for the /analyzer/experts gateway timeout.
 *
 * The route used to 504 because getBlendLeaderboard() re-ran the oracle/scout/
 * pairwise leaderboards a second time. It now reuses the already-computed
 * leaderboards via blendLeaderboardFrom(), so the page renders without the
 * redundant work.
 *
 * Run: bunx playwright test tests/experts-route.ts
 *      (requires a server on http://localhost:3001 with a real DB)
 *
 * NOTE: run the local server with SERVE_IDLE_TIMEOUT set high enough to cover
 * local→remote-DB latency, e.g. `SERVE_IDLE_TIMEOUT=250 PORT=3001 bun run src/index.ts`.
 */
import {test, expect, type Page} from '@playwright/test';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'josh803316+clerk_test@yahoo.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'CoolTestAutomation12$';
const CLERK_TEST_CODE = '424242';

async function clerkLogin(page: Page) {
  await page.goto(SITE_URL, {waitUntil: 'networkidle'});

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

test('/analyzer/experts renders without the gateway timeout', async ({page}) => {
  test.setTimeout(300_000);

  await clerkLogin(page);
  console.log('✓ Logged in');

  const start = Date.now();
  const resp = await page.goto(`${SITE_URL}/analyzer/experts`, {
    waitUntil: 'domcontentloaded',
    timeout: 240_000,
  });
  expect(resp?.status(), 'experts status').toBe(200);

  // The Oracle section heading is rendered by expertLeaderboard().
  await expect(page.locator('h3', {hasText: 'ORACLE · Mock Draft Accuracy'})).toBeVisible();
  const ms = Date.now() - start;
  console.log(`✓ /analyzer/experts rendered in ${ms}ms`);
});
