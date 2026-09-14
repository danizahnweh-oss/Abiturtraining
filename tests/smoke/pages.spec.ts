import { test, expect } from "@playwright/test";
import { ROOT_PAGES, CRITICAL_ASSETS } from "../fixtures/pages";

test.describe("Smoke: Alle Seiten laden", () => {
  for (const path of ROOT_PAGES) {
    test(`${path} – HTTP 200, kein JS-Fehler`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => jsErrors.push(err.message));

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      // HTTP-Status prüfen (404.html liefert trotzdem 200 auf statischem Hosting)
      expect(response?.status()).toBe(200);
      // Gastseiten können über index.html zur Landingpage weiterleiten.
      if (path === '/' || path === '/index.html' || path === '/profil.html') {
        await page.waitForURL('**/landing.html');
      }
      await page.waitForLoadState('load');

      // Keine JavaScript-Fehler
      expect(jsErrors, `JS-Fehler auf ${path}: ${jsErrors.join(", ")}`).toEqual([]);

      // Viewport-Meta vorhanden (Tablet-Pflicht)
      const viewport = page.locator('meta[name="viewport"]');
      await expect(viewport).toHaveAttribute("content", /width=device-width/);

      // Titel vorhanden
      await expect(page).toHaveTitle(/\S/);
    });
  }
});

test.describe("Smoke: Kritische Assets erreichbar", () => {
  for (const asset of CRITICAL_ASSETS) {
    test(`${asset} – HTTP 200`, async ({ request }) => {
      const res = await request.get(asset);
      expect(res.status()).toBe(200);
    });
  }
});
