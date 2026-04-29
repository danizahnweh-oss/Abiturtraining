import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'de-DE', userAgent: 'Mozilla/5.0' });
const page = await ctx.newPage();
await page.goto('https://www.km.bayern.de/schulsuche', { waitUntil: 'domcontentloaded' });
await page.locator('#rxFormSchulart1').selectOption('5');
await page.locator('a.bigButton.submit').first().click();
await page.waitForFunction(() => document.querySelector('#schoolNumber')?.value?.length > 0, { timeout: 30000 });
const resultHtml = await page.evaluate(() => document.querySelector('.searchSchools .result')?.outerHTML || '');
console.log('--- Anzahl chars: ' + resultHtml.length + ' ---');
// Erste 3000 Zeichen
console.log(resultHtml.slice(0, 3000));
console.log('--- Linktypen ---');
const links = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.searchSchools .result a')];
  return all.slice(0, 5).map(a => ({ href: a.href, text: a.innerText.slice(0,80) }));
});
console.log(JSON.stringify(links, null, 2));
await browser.close();
