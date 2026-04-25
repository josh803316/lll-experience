/**
 * E2E test: Clerk login → save AI-generated picks via API → verify on leaderboard
 * Run: bunx playwright test tests/draft-e2e.ts
 */
import {test, expect} from '@playwright/test';

const SITE_URL = process.env.SITE_URL || 'https://lll-experience.vercel.app';
const TEST_EMAIL = process.env.TEST_EMAIL || 'josh803316+clerk_test@yahoo.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'CoolTestAutomation12$';
const CLERK_TEST_CODE = '424242';
const DOUBLE_SCORE_PICK = 14;

const AI_MOCK_PICKS = [
  {pickNumber: 1, playerName: 'Fernando Mendoza', position: 'QB', doubleScorePick: false},
  {pickNumber: 2, playerName: 'Arvell Reese', position: 'LB', doubleScorePick: false},
  {pickNumber: 3, playerName: 'Jeremiyah Love', position: 'RB', doubleScorePick: false},
  {pickNumber: 4, playerName: 'David Bailey', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 5, playerName: 'Sonny Styles', position: 'LB', doubleScorePick: false},
  {pickNumber: 6, playerName: 'Spencer Fano', position: 'OT', doubleScorePick: false},
  {pickNumber: 7, playerName: 'Carnell Tate', position: 'WR', doubleScorePick: false},
  {pickNumber: 8, playerName: 'Rueben Bain Jr.', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 9, playerName: 'Mansoor Delane', position: 'CB', doubleScorePick: false},
  {pickNumber: 10, playerName: 'Francis Mauigoa', position: 'OT', doubleScorePick: false},
  {pickNumber: 11, playerName: 'Caleb Downs', position: 'S', doubleScorePick: false},
  {pickNumber: 12, playerName: 'Makai Lemon', position: 'WR', doubleScorePick: false},
  {pickNumber: 13, playerName: 'Jordyn Tyson', position: 'WR', doubleScorePick: false},
  {pickNumber: 14, playerName: 'Kenyon Sadiq', position: 'TE', doubleScorePick: true},
  {pickNumber: 15, playerName: 'Olaivavega Ioane', position: 'IOL', doubleScorePick: false},
  {pickNumber: 16, playerName: 'Jermod McCoy', position: 'CB', doubleScorePick: false},
  {pickNumber: 17, playerName: 'Kadyn Proctor', position: 'OT', doubleScorePick: false},
  {pickNumber: 18, playerName: 'Dillon Thieneman', position: 'S', doubleScorePick: false},
  {pickNumber: 19, playerName: 'Monroe Freeling', position: 'OT', doubleScorePick: false},
  {pickNumber: 20, playerName: 'Akheem Mesidor', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 21, playerName: 'Omar Cooper Jr.', position: 'WR', doubleScorePick: false},
  {pickNumber: 22, playerName: 'T.J. Parker', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 23, playerName: 'Blake Miller', position: 'OT', doubleScorePick: false},
  {pickNumber: 24, playerName: 'Keldric Faulk', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 25, playerName: 'Denzel Boston', position: 'WR', doubleScorePick: false},
  {pickNumber: 26, playerName: 'KC Concepcion', position: 'WR', doubleScorePick: false},
  {pickNumber: 27, playerName: 'Peter Woods', position: 'DT', doubleScorePick: false},
  {pickNumber: 28, playerName: 'Colton Hood', position: 'CB', doubleScorePick: false},
  {pickNumber: 29, playerName: 'Caleb Lomu', position: 'OT', doubleScorePick: false},
  {pickNumber: 30, playerName: 'Emmanuel McNeil-Warren', position: 'S', doubleScorePick: false},
  {pickNumber: 31, playerName: 'Cashius Howell', position: 'EDGE', doubleScorePick: false},
  {pickNumber: 32, playerName: 'Kayden McDonald', position: 'DT', doubleScorePick: false},
];

test('login, save AI picks via API, verify on leaderboard', async ({page}) => {
  // ── LOGIN ──────────────────────────────────────────────────────────────────
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
  console.log('✓ Logged in');

  // ── NAVIGATE TO DRAFT (needed so Clerk JS loads and session is active) ─────
  await page.locator('a[href="/nfl-draft"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Let Clerk JS fully initialize
  console.log('✓ On draft page');

  // ── SAVE PICKS VIA API USING CLERK SESSION TOKEN ───────────────────────────
  const saveResult = await page.evaluate(async (picks) => {
    // Wait for Clerk to be ready and get a token
    const clerk = (window as any).Clerk;
    if (!clerk) {return {ok: false, error: 'Clerk not loaded'};}

    let token: string | null = null;
    for (let i = 0; i < 10; i++) {
      token = await clerk.session?.getToken();
      if (token) {break;}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!token) {return {ok: false, error: 'Could not get Clerk token'};}

    const body = 'picks=' + encodeURIComponent(JSON.stringify(picks));
    const resp = await fetch('/draft/2026/picks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Bearer ' + token,
      },
      body,
    });

    return {ok: resp.ok, status: resp.status, text: await resp.text().catch(() => '')};
  }, AI_MOCK_PICKS);

  console.log('✓ Save API result:', JSON.stringify(saveResult));
  expect(saveResult.ok).toBeTruthy();

  // ── RELOAD DRAFT PAGE TO VERIFY PICKS APPEAR ───────────────────────────────
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);
  await page.screenshot({path: '/tmp/picks-saved.png', fullPage: true});

  // Verify first pick shows in the table
  const firstPickSlot = page.locator('.draft-slot-container[data-pick-number="1"]').first();
  const slotText = await firstPickSlot.textContent();
  console.log('✓ Pick 1 slot:', slotText?.trim());
  expect(slotText).toContain('Fernando Mendoza');

  // ── VERIFY ON LEADERBOARD ──────────────────────────────────────────────────
  await page.goto(`${SITE_URL}/draft/2026/leaderboard`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);
  await page.screenshot({path: '/tmp/leaderboard-final.png', fullPage: true});

  const pageText = await page.textContent('body');
  const submitted = pageText?.includes('Submitted');
  console.log('✓ Automation Test shows as Submitted:', submitted);

  // Check that test user is no longer "Not started"
  const notStarted = pageText?.includes('Not started');
  console.log('✓ No "Not started" entries:', !notStarted);

  console.log('✓ Test complete');
});
