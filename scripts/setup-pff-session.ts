import {chromium} from 'playwright';
import {join} from 'path';

async function run() {
  const userDataDir = join(process.cwd(), '.pff_user_data');
  console.log('Launching browser with persistent context at:', userDataDir);
  console.log('NOTE: A browser window will open. Please log in to PFF and solve any captchas.');
  console.log('Once you are logged in and see the premium stats page, you can close the browser or wait.');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto('https://premium.pff.com/nfl/positions/2025/REG/passing?position=QB');

  console.log('Waiting for successful login (redirect to premium.pff.com)...');

  try {
    await page.waitForURL('**/premium.pff.com/**', {timeout: 300000}); // 5 minutes for user to log in
    console.log('Detected successful login to Premium PFF!');

    // Check for the table to be sure
    await page.waitForSelector('.pff-player-stats-table, table', {timeout: 30000});
    console.log('Stats table visible. Session saved.');
  } catch {
    console.log('Timeout waiting for login or table.');
  }

  await context.close();
  console.log('Browser closed. Session state is now in .pff_user_data');
}

run().catch(console.error);
