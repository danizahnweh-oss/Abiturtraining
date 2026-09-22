import { test, expect } from '@playwright/test';

// Workshop-like manual access has no subscription row and uses plan "free".
// Only the current server status authorizes generation, never the plan label.
for (const active of [true, false]) {
  test(active ? 'Freigabe mit Plan free erlaubt Generierung' : 'Abgelaufene Freigabe sperrt trotz altem Browser-Flag', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('access', '1');
      sessionStorage.setItem('access_token', 'mock-token');
      sessionStorage.setItem('student_id', '42');
      sessionStorage.setItem('student_name', 'Testzugang');
      sessionStorage.setItem('subscription_status', 'active');
      sessionStorage.setItem('free_access', '1');
      localStorage.setItem('myabiflow_tracking_consent', 'rejected');
      localStorage.setItem('onboarding_done', '1');
    });
    await page.route('**/api/**', route => route.fulfill({ json: { success: true } }));
    await page.route('**/api/stripe/subscription-status', route => route.fulfill({ json: {
      status: active ? 'active' : 'none', plan: 'free', is_free_access: active,
      free_access_until: active ? new Date(Date.now() + 86400000).toISOString() : null,
      teacher_credits_available: false, subject_licenses: []
    } }));
    let generationRequests = 0;
    await page.route('**/api/generate', async route => {
      generationRequests++;
      await route.fulfill({ json: { headline: 'Testaufgabe', article_text: 'Ein kurzer Testtext.', task_instruction: 'Write a mediation.' } });
    });
    await page.goto('/mediation.html');
    await page.locator('#generateBtn').click();
    if (active) {
      await expect.poll(() => generationRequests).toBe(1);
      await expect(page).toHaveURL(/mediation\.html$/);
      await expect(page.locator('#task')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('manual-free-access-generation.png') });
    } else {
      await expect(page).toHaveURL(/abo\.html$/);
      expect(generationRequests).toBe(0);
    }
  });
}
