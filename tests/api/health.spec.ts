import { test, expect } from "@playwright/test";

const API = "https://myabiflow.de";

test.describe("API Health-Checks", () => {
  test("POST /api/login – Endpunkt antwortet (kein 5xx)", async ({ request }) => {
    const res = await request.post(`${API}/api/login`, {
      data: { student_name: "e2e-healthcheck", personal_password: "invalid", mode: "login" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/check-student – Endpunkt antwortet", async ({ request }) => {
    const res = await request.post(`${API}/api/check-student`, {
      data: { student_name: "e2e-healthcheck" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/generate – ohne Auth gibt 401/403", async ({ request }) => {
    const res = await request.post(`${API}/api/generate`, {
      data: { subject: "deutsch", type: "eroerterung" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/grade – ohne Auth gibt 401/403", async ({ request }) => {
    const res = await request.post(`${API}/api/grade`, {
      data: { text: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/stripe/subscription-status – Endpunkt antwortet", async ({ request }) => {
    const res = await request.post(`${API}/api/stripe/subscription-status`, {
      data: { student_id: "e2e-healthcheck" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/feedback – Endpunkt antwortet", async ({ request }) => {
    const res = await request.post(`${API}/api/feedback`, {
      data: { message: "E2E-Test – bitte ignorieren", student_name: "e2e-test" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("Kolloquiumstrainer – /kolloquium/ lädt", async ({ request }) => {
    const res = await request.get(`${API}/kolloquium/`);
    expect(res.status()).toBe(200);
  });
});
