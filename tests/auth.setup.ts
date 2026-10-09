import { test as setup } from '@playwright/test';
import dotenv from 'dotenv';
import { loadTarget, isTodo } from '../test-config/load';

dotenv.config({ path: '.env.test' });
const target = loadTarget();

// Logs in once per role and saves auth/<role>.json. Credentials come from env vars only.
for (const [role, cfg] of Object.entries(target.roles)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const user = process.env[cfg.userEnv];
    const pass = process.env[cfg.passEnv];
    setup.skip(!user || !pass || isTodo(target.baseUrl) || isTodo(target.loginPath),
      'BLOCKED (B-INPUT): missing credentials, baseUrl or loginPath');

    await page.goto(target.loginPath!);
    await page.getByLabel(/user|email/i).fill(user!);
    await page.getByLabel(/password/i).fill(pass!);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await page.waitForLoadState('networkidle');
    // MFA / CAPTCHA => never bypass; let it fail so preflight reports B-AUTH / B-BOT.
    await page.context().storageState({ path: `auth/${role}.json` });
  });
}
