/**
 * Smoke the UCSB Legacy GM lab after a Sleeper ingest.
 * Run: SITE_URL=http://localhost:3010 bunx playwright test tests/fantasy-pages.ts
 */
import {test, expect, type Page} from '@playwright/test';

const SITE_URL = process.env.SITE_URL || 'http://localhost:3010';
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

test('UCSB Legacy app card and GM lab pages', async ({page}) => {
  test.setTimeout(180_000);
  await clerkLogin(page);

  await expect(page.getByRole('heading', {name: 'Choose an App'})).toBeVisible({timeout: 15000});
  await expect(page.getByRole('heading', {name: 'UCSB Legacy'})).toBeVisible();
  await page.getByRole('heading', {name: 'UCSB Legacy'}).click();

  await page.waitForURL('**/fantasy**', {timeout: 30000});
  await expect(page.getByRole('heading', {name: 'UCSB Legacy'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Josh', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Tim', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Finn', exact: true})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Champion');
  await expect(page.locator('body')).toContainText('all-play, no playoffs');
  await expect(page.getByRole('heading', {name: 'How we score'})).toBeVisible();
  await expect(page.getByText('PF/week').first()).toBeVisible();
  await expect(page.locator('body')).toContainText('Are cheap picks bargains if they score?');
  await expect(page.locator('body')).toContainText('not a bargain');
  await page.getByRole('button', {name: 'What PF/week means'}).first().click();
  await expect(page.getByRole('tooltip')).toContainText('average best-ball score');
  await page.getByRole('button', {name: 'What Grade means'}).first().click();
  await expect(page.getByRole('tooltip')).toContainText('Top fifth get A');

  await page.goto(`${SITE_URL}/fantasy/season/2025`);
  await expect(page.getByRole('heading', {name: '2025 standings'})).toBeVisible();
  await expect(page.getByText('Victor')).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/draft/2025`);
  await expect(page.getByRole('heading', {name: '2025 auction'})).toBeVisible();
  await expect(page.getByText('Saquon Barkley')).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/wire/2025`);
  await expect(page.getByRole('heading', {name: '2025 wire'})).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/bargains`);
  await expect(page.getByRole('heading', {name: 'Late-round bargains'})).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/rankings`);
  await expect(page.getByRole('heading', {name: 'Finish over time'})).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/manager/tim`);
  await expect(page.getByRole('heading', {name: 'Tim'})).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/season/2023`, {timeout: 60000});
  await expect(page.getByRole('heading', {name: '2023 standings'})).toBeVisible();
  await expect(page.getByText('6 teams')).toBeVisible();

  await page.goto(`${SITE_URL}/fantasy/season/2026`, {timeout: 60000});
  await expect(page.getByText('auction has not started')).toBeVisible({timeout: 15000});

  await page.goto(`${SITE_URL}/fantasy`, {timeout: 60000});
  await page.screenshot({path: 'test-results/fantasy-desktop.png', fullPage: false});

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${SITE_URL}/fantasy`, {timeout: 60000});
  await expect(page.getByText('All-time')).toBeVisible();
  await page.screenshot({path: 'test-results/fantasy-mobile.png', fullPage: false});
});
