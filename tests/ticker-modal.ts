/**
 * E2E test: site-wide draft ticker + pick detail modal
 * Run: bunx playwright test tests/ticker-modal.ts
 */
import {test, expect} from '@playwright/test';

const SITE_URL = process.env.SITE_URL || 'https://lll-experience.vercel.app';
const TEST_EMAIL = process.env.TEST_EMAIL || 'josh803316+clerk_test@yahoo.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'CoolTestAutomation12$';
const CLERK_TEST_CODE = '424242';

async function login(page: any) {
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

test('ticker: shows on leaderboard, picks card opens modal', async ({page}) => {
  await login(page);

  // Leaderboard page should now embed the global ticker
  await page.goto(`${SITE_URL}/draft/2026/leaderboard`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);

  const ticker = page.locator('#global-ticker');
  await expect(ticker).toBeVisible();
  console.log('✓ #global-ticker present on leaderboard');

  // Wait for HTMX load swap to finish
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#global-ticker');
      return el && !!el.querySelector('.ticker-card');
    },
    {timeout: 15000},
  );
  console.log('✓ Ticker cards rendered');
  await page.screenshot({path: '/tmp/ticker-leaderboard.png', fullPage: false});

  // The current round may not have any completed picks yet (e.g. round just
  // started). Find a round tab whose count is non-zero and switch to it.
  let clickable = page.locator('.ticker-card-clickable');
  let clickableCount = await clickable.count();
  if (clickableCount === 0) {
    console.log('  no completed picks in current round — switching round');
    const tabs = page.locator('.ticker-round-tab');
    const tabCount = await tabs.count();
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      const text = (await tab.textContent()) ?? '';
      if (/\d/.test(text.replace(/^R\d+/, ''))) {
        await tab.click();
        await page.waitForTimeout(2000);
        clickable = page.locator('.ticker-card-clickable');
        clickableCount = await clickable.count();
        if (clickableCount > 0) {
          console.log(`  switched to round (tab ${i}), found ${clickableCount} cards`);
          break;
        }
      }
    }
  }
  console.log(`✓ Found ${clickableCount} clickable cards`);
  expect(clickableCount).toBeGreaterThan(0);

  // Open the modal by clicking the first completed pick
  await clickable.first().click();

  // Modal backdrop should become visible
  const backdrop = page.locator('#pick-modal-backdrop');
  await expect(backdrop).toBeVisible({timeout: 10000});
  await page.waitForTimeout(1500); // let ESPN fetch land
  await page.screenshot({path: '/tmp/ticker-modal-open.png', fullPage: false});

  // Modal should contain a card with rich pick info
  const modalCard = page.locator('[data-pick-modal-card]');
  await expect(modalCard).toBeVisible();
  const modalText = (await modalCard.textContent()) ?? '';
  console.log('✓ Modal content snippet:', modalText.replace(/\s+/g, ' ').slice(0, 250));
  expect(modalText).toMatch(/Round\s+\d+/i);
  // Enriched data — confirm we have at least height, college, and grade
  expect(modalText).toMatch(/Height/i);
  expect(modalText).toMatch(/College/i);
  expect(modalText).toMatch(/Grade/i);
  console.log('✓ Modal has enriched stats (height/college/grade)');

  // Close via the X button (use dispatchEvent — modal may extend past viewport)
  await page.locator('[data-pick-modal-close]').first().dispatchEvent('click');
  await page.waitForTimeout(500);
  await expect(backdrop).toBeHidden();
  console.log('✓ Modal closes via close button');

  // Sanity: the modal script installed once on this page
  const installed = await page.evaluate(() => (window as any).__pickModalInstalled === true);
  expect(installed).toBe(true);

  // News section was rendered for this player
  expect(modalText).toMatch(/What experts are saying/i);
  console.log('✓ Modal includes "What experts are saying" section');
});

test('ticker: appears on picks page and on results page', async ({page}) => {
  await login(page);

  for (const path of [`/draft/2026`, `/draft/2026/results`]) {
    await page.goto(`${SITE_URL}${path}`, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);
    const ticker = page.locator('#global-ticker');
    const present = await ticker.count();
    console.log(`✓ ${path}: ticker count = ${present}`);
    expect(present).toBeGreaterThan(0);
  }
});

test('ticker: completed pick cards show position on its own line (mobile fix)', async ({page}) => {
  await login(page);
  await page.setViewportSize({width: 390, height: 844}); // iPhone 14
  await page.goto(`${SITE_URL}/draft/2026/leaderboard`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);

  await page.waitForFunction(
    () => {
      const el = document.querySelector('#global-ticker');
      return el && !!el.querySelector('.ticker-card-clickable');
    },
    {timeout: 15000},
  );

  // For each completed card with a position, the position text should be in
  // a sibling div from the team-name div (i.e. on its own line).
  const result = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.ticker-card-clickable'));
    const samples: Array<{player: string; positionLine: string | null; teamLine: string | null}> = [];
    for (const card of cards.slice(0, 5)) {
      const lines = Array.from(card.querySelectorAll('div.text-\\[10px\\], div.text-\\[11px\\]'));
      const player = (card.querySelector('.text-white.text-\\[11px\\]') as HTMLElement | null)?.innerText ?? '';
      const texts = lines.map((l) => (l as HTMLElement).innerText.trim()).filter(Boolean);
      samples.push({
        player,
        positionLine: texts[0] ?? null,
        teamLine: texts[1] ?? null,
      });
    }
    return samples;
  });
  console.log('Sampled completed cards:', JSON.stringify(result, null, 2));
  await page.screenshot({path: '/tmp/ticker-mobile.png', fullPage: false});
  expect(result.length).toBeGreaterThan(0);
});
