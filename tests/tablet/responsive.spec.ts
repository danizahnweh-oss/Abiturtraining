import { test, expect } from "@playwright/test";
import { TABLET_TEST_PAGES } from "../fixtures/pages";

test.describe("Tablet-Optimierung", () => {
  for (const path of TABLET_TEST_PAGES) {
    test(`${path} – kein horizontaler Overflow`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow, `Horizontaler Overflow auf ${path}`).toBe(false);
    });

    test(`${path} – Input-Felder font-size >= 16px (kein Auto-Zoom)`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const tooSmallInputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll("input, textarea, select");
        const problems: string[] = [];
        inputs.forEach((el) => {
          const htmlEl = el as HTMLElement;
          const style = window.getComputedStyle(htmlEl);
          const rect = htmlEl.getBoundingClientRect();
          const fontSize = parseFloat(style.fontSize);
          const type = htmlEl.getAttribute("type");
          // Nur sichtbare Elemente prüfen, hidden-Inputs überspringen
          const isVisible = style.display !== "none" && style.visibility !== "hidden"
            && rect.width > 0 && rect.height > 0 && type !== "hidden";
          if (isVisible && fontSize < 16) {
            const id = htmlEl.id || el.tagName;
            problems.push(`${id} (${fontSize}px)`);
          }
        });
        return problems;
      });

      expect(tooSmallInputs, `Zu kleine Inputs auf ${path}`).toEqual([]);
    });

    test(`${path} – Touch-Targets >= 44x44px (Hauptaktionen)`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const tooSmall = await page.evaluate(() => {
        // Nur Buttons und Submit-Inputs prüfen (nicht Footer-Links oder Header-Logo)
        const clickable = document.querySelectorAll("button, input[type='submit'], input[type='button']");
        const problems: string[] = [];
        clickable.forEach((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const style = window.getComputedStyle(el as HTMLElement);
          const isInFooter = !!(el as HTMLElement).closest("footer");
          // Nur sichtbare Elemente, Footer ausschließen
          if (
            !isInFooter &&
            rect.width > 0 && rect.height > 0 &&
            style.display !== "none" && style.visibility !== "hidden" &&
            (rect.width < 44 || rect.height < 44)
          ) {
            const id = (el as HTMLElement).id || (el as HTMLElement).className?.toString().slice(0, 30) || el.tagName;
            problems.push(`${id} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
          }
        });
        return problems;
      });

      if (tooSmall.length > 0) {
        console.warn(`⚠ Touch-Target-Warnung auf ${path}:`, tooSmall);
      }
      // Maximal 3 zu kleine Buttons tolerieren
      expect(tooSmall.length, `Zu viele kleine Touch-Targets auf ${path}: ${tooSmall.join(", ")}`).toBeLessThan(3);
    });

    test(`${path} – Viewport-Meta korrekt gesetzt`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const viewport = page.locator('meta[name="viewport"]');
      await expect(viewport).toHaveAttribute("content", /width=device-width/);
      await expect(viewport).toHaveAttribute("content", /initial-scale=1/);
    });
  }
});
