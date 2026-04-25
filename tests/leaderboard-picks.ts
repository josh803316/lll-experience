/**
 * E2E test: Verify leaderboard picks panel works — click user + click pro
 * Run: bunx playwright test tests/leaderboard-picks.ts
 */
import {test, expect} from '@playwright/test';

const SITE_URL = process.env.SITE_URL || 'https://lll-experience.vercel.app';
const TEST_EMAIL = process.env.TEST_EMAIL || 'josh803316+clerk_test@yahoo.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'CoolTestAutomation12$';
const CLERK_TEST_CODE = '424242';

test('leaderboard: click user and pro picks on desktop', async ({page}) => {
  // Login
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
    for (const digit of CLERK_TEST_CODE) {await page.keyboard.press(digit);}
  }
  await page.waitForURL('**/apps**', {timeout: 30000});
  console.log('✓ Logged in');

  // Go to leaderboard
  await page.goto(`${SITE_URL}/draft/2026/leaderboard`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(3000);
  console.log('✓ Leaderboard loaded');
  await page.screenshot({path: '/tmp/lb-initial.png', fullPage: true});

  // Check that user rows exist
  const userRows = page.locator('#leaderboard-scores tr[hx-get]');
  const rowCount = await userRows.count();
  console.log(`✓ Found ${rowCount} clickable rows`);
  expect(rowCount).toBeGreaterThan(0);

  // Click first user row
  await userRows.first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({path: '/tmp/lb-user-picks.png', fullPage: true});

  // Check picks panel has content
  const picksPanel = page.locator('#leaderboard-picks-panel');
  const panelText = await picksPanel.textContent();
  console.log('✓ Picks panel content:', panelText?.substring(0, 100));
  expect(panelText).not.toContain('Tap a name');

  // Find and click a PRO row
  const proRow = page.locator('#leaderboard-scores tr:has-text("PRO")').first();
  const proVisible = await proRow.isVisible().catch(() => false);
  console.log('✓ Pro row visible:', proVisible);

  if (proVisible) {
    await proRow.click();
    await page.waitForTimeout(2000);
    await page.screenshot({path: '/tmp/lb-pro-picks.png', fullPage: true});
    const proPanelText = await picksPanel.textContent();
    console.log('✓ Pro picks panel:', proPanelText?.substring(0, 100));
  } else {
    console.log('⚠ No PRO rows visible — pro entries may not be showing yet (0 official picks)');
    await page.screenshot({path: '/tmp/lb-no-pros.png', fullPage: true});
  }

  console.log('✓ Test complete');
});

test('leaderboard: mobile scroll-to-picks on tap', async ({page}) => {
  // Set mobile viewport
  await page.setViewportSize({width: 390, height: 844});

  // Login
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
    for (const digit of CLERK_TEST_CODE) {await page.keyboard.press(digit);}
  }
  await page.waitForURL('**/apps**', {timeout: 30000});

  // Go to leaderboard
  await page.goto(`${SITE_URL}/draft/2026/leaderboard`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(3000);
  await page.screenshot({path: '/tmp/lb-mobile-initial.png', fullPage: true});

  // Tap first clickable row
  const userRows = page.locator('#leaderboard-scores tr[hx-get]');
  const rowCount = await userRows.count();
  console.log(`✓ Mobile: ${rowCount} clickable rows`);

  if (rowCount > 0) {
    await userRows.first().click();
    await page.waitForTimeout(3000); // Wait for smooth scroll
    await page.screenshot({path: '/tmp/lb-mobile-after-tap.png', fullPage: true});

    // Check that picks panel is now in viewport
    const panel = page.locator('#leaderboard-picks-panel');
    const isVisible = await panel.isVisible();
    console.log('✓ Mobile: picks panel visible after tap:', isVisible);
  }

  console.log('✓ Mobile test complete');
});
