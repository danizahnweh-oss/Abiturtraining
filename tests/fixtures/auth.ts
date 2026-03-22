import { Page } from "@playwright/test";

/**
 * Tour-Overlays deaktivieren, damit sie nicht die Tests blockieren.
 * Muss VOR page.goto() aufgerufen werden (addInitScript).
 */
export function disableTours(page: Page) {
  page.addInitScript(() => {
    // Alle bekannten Tour-Keys als erledigt markieren
    const tourKeys = [
      "onboarding_done", "mathe_tour_done", "mathe_abi_tour_done",
      "writing_tour_done", "eroerterung_tour_done",
    ];
    tourKeys.forEach((key) => localStorage.setItem(key, "1"));
  });
}

/**
 * Tour-Overlay wegklicken falls vorhanden.
 */
export async function dismissTourIfVisible(page: Page) {
  const skipBtn = page.locator(".tour-skip, [data-tour-action='end']").first();
  if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await skipBtn.click();
    // Kurz warten bis Tour-Elemente entfernt sind
    await page.waitForSelector(".tour-welcome", { state: "detached", timeout: 3_000 }).catch(() => {});
  }
}

/**
 * Login über das shared Login-Modal durchführen.
 * Klickt generateBtn → 401 → Login-Modal → Credentials eingeben.
 */
export async function loginViaGenerateBtn(page: Page, name: string, password: string) {
  // Eventuell Tour erst wegklicken
  await dismissTourIfVisible(page);

  await page.click("#generateBtn");

  // Login-Modal erscheint (durch 401-Response)
  await page.waitForSelector("#sharedLoginOverlay", { state: "visible", timeout: 10_000 });

  // Nochmals Tour-Overlay prüfen (könnte nach Login-Modal erscheinen)
  await dismissTourIfVisible(page);

  await page.fill("#slModalName", name);
  await page.fill("#slModalPw", password);
  await page.click("#slModalBtn");

  // Warten bis Modal verschwindet (Login erfolgreich)
  await page.waitForSelector("#sharedLoginOverlay", { state: "hidden", timeout: 15_000 });
}
