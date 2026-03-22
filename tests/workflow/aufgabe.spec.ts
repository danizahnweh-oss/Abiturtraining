import { test, expect } from "@playwright/test";
import { disableTours, dismissTourIfVisible } from "../fixtures/auth";

const E2E_USER = process.env.E2E_USER || "";
const E2E_PASS = process.env.E2E_PASS || "";

test.describe("Aufgabe generieren + bewerten", () => {
  test.skip(!E2E_USER || !E2E_PASS, "E2E_USER / E2E_PASS nicht gesetzt");

  test.beforeEach(async ({ page }) => {
    disableTours(page);
  });

  /**
   * Login durchführen: Session direkt in sessionStorage setzen,
   * dann Seite neu laden, damit der Login-Check greift.
   */
  async function setupLogin(page: import("@playwright/test").Page, url: string) {
    await page.goto(url);
    await dismissTourIfVisible(page);

    // Erst den Login über das Modal machen
    await page.click("#generateBtn");
    await page.waitForSelector("#sharedLoginOverlay", { state: "visible", timeout: 10_000 });
    await page.fill("#slModalName", E2E_USER);
    await page.fill("#slModalPw", E2E_PASS);
    await page.click("#slModalBtn");
    await page.waitForSelector("#sharedLoginOverlay", { state: "hidden", timeout: 15_000 });

    // Login erfolgreich – jetzt sind wir auf sec-setup.
    // Aufgabe nochmal generieren (Button ist jetzt sichtbar und klickbar)
    await page.waitForTimeout(500);
  }

  test("Erörterung: Aufgabe generieren → Text schreiben → Bewertung erhalten", async ({ page }) => {
    test.setTimeout(180_000);

    await setupLogin(page, "/eroerterung.html");

    // Nochmal "Aufgabe generieren" klicken (jetzt eingeloggt)
    await page.click("#generateBtn");

    // Setup-Loader erscheint, dann sec-task wird aktiv
    await page.waitForFunction(
      () => document.querySelector("#sec-task")?.classList.contains("active"),
      { timeout: 60_000 }
    );

    // Aufgabenstellung prüfen
    const taskText = await page.locator("#taskInstruction").textContent();
    expect(taskText!.length).toBeGreaterThan(20);

    // Zum Schreiben navigieren
    await page.locator("nav button", { hasText: /schreib/i }).click();
    await page.waitForFunction(
      () => document.querySelector("#sec-write")?.classList.contains("active"),
      { timeout: 5_000 }
    );

    // Text eingeben (mind. 100 Wörter nötig)
    const testText = "Dies ist ein automatisierter Testtext für die E2E-Prüfung der myAbiFlow Plattform. " +
      "Die Erörterung behandelt das gegebene Thema aus verschiedenen und vielfältigen Perspektiven. " +
      "Einerseits lässt sich überzeugend argumentieren, dass der technologische Fortschritt viele bedeutende Vorteile für die gesamte Gesellschaft bietet. " +
      "Andererseits gibt es durchaus berechtigte und nachvollziehbare Bedenken hinsichtlich der weitreichenden gesellschaftlichen Auswirkungen dieser Entwicklung. " +
      "Zusammenfassend lässt sich festhalten, dass eine differenzierte und ausgewogene Betrachtung der verschiedenen Aspekte unbedingt notwendig und sinnvoll ist. " +
      "Darüber hinaus sollte man bedenken, dass technologische Innovationen immer sowohl Chancen als auch Risiken mit sich bringen. " +
      "Es liegt an der Gesellschaft, verantwortungsvoll mit diesen Veränderungen umzugehen und die richtigen Weichen für die Zukunft zu stellen. " +
      "Abschließend möchte ich betonen, dass nur durch einen offenen und konstruktiven Dialog zwischen allen Beteiligten eine zukunftsfähige Lösung gefunden werden kann. ";
    await page.fill("#studentText", testText);

    // Abgeben
    await page.click("#submitBtn");

    // Feedback-Bereich wird aktiv
    await page.waitForFunction(
      () => document.querySelector("#sec-feedback")?.classList.contains("active"),
      { timeout: 15_000 }
    );

    // Feedback kommt (KI braucht bis zu 2 Minuten)
    await page.waitForFunction(
      () => {
        const el = document.getElementById("feedbackContent");
        return el && el.style.display !== "none";
      },
      { timeout: 120_000 }
    );

    // Note vorhanden
    const score = await page.locator("#scoreTotal").textContent();
    expect(score).not.toBe("–");
    expect(score).not.toBe("");
  });

  test("Mathe: Aufgabe generieren", async ({ page }) => {
    test.setTimeout(120_000);

    await setupLogin(page, "/mathe.html");

    await page.click("#generateBtn");

    await page.waitForFunction(
      () => document.querySelector("#sec-task")?.classList.contains("active"),
      { timeout: 60_000 }
    );

    const taskText = await page.locator("#taskInstruction").textContent();
    expect(taskText!.length).toBeGreaterThan(10);
  });
});
