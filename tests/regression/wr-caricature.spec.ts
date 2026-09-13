import { expect, test } from "@playwright/test";

test.describe("Wirtschaft-Abitur: Karikatur-Material", () => {
  test("rendert auch einen unsauber formatierten Karikatur-Typ immer als Bild", async ({ page }) => {
    const prompt = "Create an editorial-style cartoon in a supermarket aisle.";

    await page.addInitScript(() => {
      sessionStorage.setItem("access", "1");
      sessionStorage.setItem("free_access", "1");
      sessionStorage.setItem("student_name", "regressionstest");
      sessionStorage.setItem("student_id", "regressionstest");
      sessionStorage.setItem("access_token", "regressionstest-token");
      sessionStorage.setItem("subscription_status", "active");
      sessionStorage.setItem("subscription_plan", "monthly");
    });

    await page.route("**/api/stripe/subscription-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "active", plan: "monthly" })
      });
    });

    await page.route("**/api/generate-image", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          credit: "Regressionstest",
          caption: "Eine Karikatur über widersprüchliche Erwartungen."
        })
      });
    });

    await page.goto("/wr-abitur.html");
    await page.waitForFunction(() => typeof (window as any).renderTask === "function");

    const imageRequest = page.waitForRequest("**/api/generate-image");
    await page.evaluate(({ prompt }) => {
      (window as any).renderTask({
        _niveau: "gA",
        task_instruction: "Analysieren Sie die Karikatur.",
        aufgabenbloecke: [],
        materialien: [{
          nr: "M5",
          titel: "Karikatur: Nachhaltigkeit",
          typ: "  Karikatur\u200B ",
          inhalt: prompt,
          quelle: "Karikatur, KI-generiert"
        }]
      });
      document.querySelectorAll("main > section").forEach((section) => section.classList.remove("active"));
      document.getElementById("sec-task")?.classList.add("active");
    }, { prompt });

    const request = await imageRequest;
    expect(request.postDataJSON()).toMatchObject({ prompt, style: "karikatur" });

    const material = page.locator("#materialien1Container .material-card").first();
    await expect(material.locator("img.edu-img")).toBeVisible();
    await expect(material).not.toContainText(prompt);
    await expect(material.locator("summary")).toContainText("karikatur");
  });
});
