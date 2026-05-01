/**
 * Smoke test: verify analyzer pages render after the perf-registry refactor.
 * Logs in once via Clerk, then hits dashboard / teams / colleges / a player profile.
 *
 * Run: bunx playwright test tests/analyzer-verification.ts
 *      (requires a server on http://localhost:3001 with a real DB)
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

test('analyzer pages render after perf-registry refactor', async ({page}) => {
  test.setTimeout(120_000);

  await clerkLogin(page);
  console.log('✓ Logged in');

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const dashResp = await page.goto(`${SITE_URL}/analyzer`, {waitUntil: 'domcontentloaded'});
  expect(dashResp?.status(), 'dashboard status').toBe(200);
  await expect(page.locator('text=FRANCHISE INDEX')).toBeVisible();
  await expect(page.locator('text=LEAGUE-WIDE INDEX MOVERS')).toBeVisible();
  console.log('✓ Dashboard rendered');

  // ── TEAMS LEADERBOARD ─────────────────────────────────────────────────────
  const teamsResp = await page.goto(`${SITE_URL}/analyzer/teams`, {waitUntil: 'domcontentloaded'});
  expect(teamsResp?.status(), 'teams status').toBe(200);
  await expect(page.locator('text=Elite Players').first()).toBeVisible();
  const rank1Cards = page.locator('text=Rank #1');
  expect(await rank1Cards.count(), 'teams: at least one ranked card').toBeGreaterThan(0);
  console.log('✓ Teams leaderboard rendered');

  // Grab a "Best Pick" player href to verify a real player profile loads.
  const bestPickHref = await page.locator('a[href^="/analyzer/player/"]').first().getAttribute('href');
  expect(bestPickHref, 'teams page exposes a player link').toBeTruthy();

  // ── COLLEGES LEADERBOARD ──────────────────────────────────────────────────
  const collegesResp = await page.goto(`${SITE_URL}/analyzer/colleges`, {
    waitUntil: 'domcontentloaded',
  });
  expect(collegesResp?.status(), 'colleges status').toBe(200);
  await expect(page.locator('h2', {hasText: 'COLLEGE SCOUT INDEX'})).toBeVisible();
  expect(await page.locator('text=Rank #1').count(), 'colleges: at least one ranked card').toBeGreaterThan(0);
  console.log('✓ Colleges leaderboard rendered');

  // ── PLAYER PROFILE ────────────────────────────────────────────────────────
  const profResp = await page.goto(`${SITE_URL}${bestPickHref}`, {waitUntil: 'domcontentloaded'});
  expect(profResp?.status(), 'player profile status').toBe(200);
  await expect(page.locator('text=Produced Like')).toBeVisible();
  await expect(page.locator('text=Elite Odds')).toBeVisible();
  await expect(page.getByText('LLL Grade', {exact: true})).toBeVisible();
  console.log(`✓ Player profile rendered (${bestPickHref})`);
});
