import { test, expect } from "@playwright/test";

test.describe("Login-Flow", () => {
  test("Login-Modal erscheint bei Klick auf Generieren (ohne Login)", async ({ page }) => {
    await page.goto("/eroerterung.html");
    await page.click("#generateBtn");
    await expect(page.locator("#sharedLoginOverlay")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("#slModalName")).toBeVisible();
    await expect(page.locator("#slModalPw")).toBeVisible();
    await expect(page.locator("#slModalBtn")).toBeVisible();
  });

  test("Wechsel zwischen Anmelden und Registrieren", async ({ page }) => {
    await page.goto("/eroerterung.html");
    await page.click("#generateBtn");
    await expect(page.locator("#sharedLoginOverlay")).toBeVisible();

    // Zu Registrieren wechseln
    await page.click("#slModeRegister");
    await expect(page.locator("#slRegFields")).toBeVisible();
    await expect(page.locator("#slModalBtn")).toHaveText("Registrieren");

    // Zurück zu Login
    await page.click("#slModeLogin");
    await expect(page.locator("#slRegFields")).toBeHidden();
    await expect(page.locator("#slModalBtn")).toHaveText("Anmelden");
  });

  test("Login mit falschem Passwort zeigt Fehler", async ({ page }) => {
    await page.goto("/eroerterung.html");
    await page.click("#generateBtn");
    await page.fill("#slModalName", "E2E_NichtExistent_12345");
    await page.fill("#slModalPw", "falschesPasswort123");
    await page.click("#slModalBtn");
    await expect(page.locator("#slModalError")).toBeVisible({ timeout: 10_000 });
  });

  test("Modal lässt sich mit Abbrechen schließen", async ({ page }) => {
    await page.goto("/eroerterung.html");
    await page.click("#generateBtn");
    await expect(page.locator("#sharedLoginOverlay")).toBeVisible();

    // "Abbrechen"-Button klicken
    await page.locator("#sharedLoginOverlay button", { hasText: "Abbrechen" }).click();
    await expect(page.locator("#sharedLoginOverlay")).toBeHidden({ timeout: 3_000 });
  });

  test("Modal lässt sich per Klick auf Hintergrund schließen", async ({ page }) => {
    await page.goto("/eroerterung.html");
    await page.click("#generateBtn");
    await expect(page.locator("#sharedLoginOverlay")).toBeVisible();

    // Auf den Overlay-Hintergrund klicken (nicht auf das Formular)
    await page.locator("#sharedLoginOverlay").click({ position: { x: 10, y: 10 } });
    await expect(page.locator("#sharedLoginOverlay")).toBeHidden({ timeout: 3_000 });
  });
});
