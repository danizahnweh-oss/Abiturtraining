// Schritt 1: Stammdaten aller bayerischen Gymnasien von km.bayern.de holen.
// Strategie: Playwright → Schulart=Gymnasien → AJAX-Suche → /schule/XXXX-Detail
// Output: output/schulen-stammdaten.json

import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUTPUT_DIR = new URL('./output/', import.meta.url).pathname;
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const limit = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : null;
})();
const headed = args.includes('--headed');
const detailDelayMs = parseInt(process.env.DETAIL_DELAY_MS || '700', 10);

const log = (...m) => console.log('[fetch]', ...m);

async function main() {
  log('Starte Browser …');
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    locale: 'de-DE',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  log('Lade /schulsuche …');
  await page.goto('https://www.km.bayern.de/schulsuche', { waitUntil: 'domcontentloaded' });

  // Cookie-Banner
  try {
    const accept = page.getByRole('button', { name: /akzeptieren|alle.*annehmen|zustimmen/i }).first();
    if (await accept.isVisible({ timeout: 1500 })) await accept.click();
  } catch {}

  log('Filter Schulart=Gymnasien, suche …');
  await page.locator('#rxFormSchulart1').selectOption('5');
  await page.locator('a.bigButton.submit').first().click();
  await page.waitForFunction(() => document.querySelector('#schoolNumber')?.value?.length > 0, { timeout: 30000 });

  // Liste aller Schul-Links aus dem .result extrahieren
  const treffer = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.searchSchools .result li a')];
    return items.map(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/schule\/(\d+)/);
      // <br> in <span> wird zu \n in innerText; Pfeil-Icon ist im span davor
      const titleEl = a.querySelector('.rxTitle');
      const titleClone = titleEl ? titleEl.cloneNode(true) : null;
      titleClone?.querySelectorAll('i, .rxIcon').forEach(n => n.remove());
      const name = (titleClone?.innerText || '').replace(/\s+/g, ' ').trim();
      return {
        url: a.href,
        schulnummer: m ? m[1] : '',
        name,
        anschrift: a.querySelector('.rxDescription')?.innerText?.replace(/\s+/g, ' ').trim() || '',
      };
    }).filter(x => x.schulnummer);
  });
  log('Schulen in Trefferliste:', treffer.length);

  const arbeitsliste = limit ? treffer.slice(0, limit) : treffer;
  const ergebnisse = [];

  // Resume-Support
  const outPath = path.join(OUTPUT_DIR, 'schulen-stammdaten.json');
  let bekannt = new Map();
  if (fs.existsSync(outPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      (old.schulen || []).forEach(s => bekannt.set(s.schulnummer, s));
      log('Resume: bereits', bekannt.size, 'Schulen im Output – werden übersprungen');
    } catch {}
  }

  let i = 0;
  for (const s of arbeitsliste) {
    i++;
    if (bekannt.has(s.schulnummer)) {
      ergebnisse.push(bekannt.get(s.schulnummer));
      continue;
    }
    try {
      const resp = await context.request.get(s.url, {
        headers: { 'Referer': 'https://www.km.bayern.de/schulsuche', 'Accept': 'text/html' },
      });
      if (!resp.ok()) {
        log(`  ${i}/${arbeitsliste.length} ${s.schulnummer} HTTP ${resp.status()} – skip`);
        ergebnisse.push({ ...s, fetch_error: `HTTP ${resp.status()}` });
      } else {
        const html = await resp.text();
        const detail = parseDetail(html);
        ergebnisse.push({ ...s, ...detail });
      }
    } catch (e) {
      log(`  ${i}/${arbeitsliste.length} ${s.schulnummer} ERROR ${e.message}`);
      ergebnisse.push({ ...s, fetch_error: e.message });
    }

    if (i % 25 === 0) {
      log(`Fortschritt: ${i}/${arbeitsliste.length} – persistiere`);
      persistieren(outPath, ergebnisse, treffer.length);
    }
    await sleep(detailDelayMs);
  }

  persistieren(outPath, ergebnisse, treffer.length);
  log('Stammdaten gespeichert:', outPath, '(' + ergebnisse.length + ' Schulen)');
  log('Nächster Schritt: npm run emails');
  await browser.close();
}

function persistieren(outPath, schulen, treffer) {
  fs.writeFileSync(outPath, JSON.stringify({
    fetched_at: new Date().toISOString(),
    treffer_laut_seite: treffer,
    anzahl: schulen.length,
    quelle: 'https://www.km.bayern.de/schulsuche (Schulart=Gymnasien) + /schule/{nr}',
    schulen,
  }, null, 2));
}

function parseDetail(html) {
  const $ = cheerio.load(html);
  const name = $('h1').first().text().trim();

  // Detail-Daten stehen in einem <div class="rxModule"> mit h2-Sections
  const rxModule = $('.rxModule').first();
  const kontaktBlock = sectionAfter(rxModule, $, 'Kontakt');
  const verwaltung = sectionAfter(rxModule, $, 'Verwaltungsangaben');

  let strasse = '', plz = '', ort = '';
  let telefon = '', fax = '', website = '';

  const kontaktPs = kontaktBlock.filter('p');
  if (kontaktPs.length >= 1) {
    const lines = htmlToLines($, kontaktPs.eq(0));
    strasse = lines[0] || '';
    const m = (lines[1] || '').match(/^(\d{5})\s+(.+)$/);
    if (m) { plz = m[1]; ort = m[2].trim(); }
  }
  if (kontaktPs.length >= 2) {
    const txt = kontaktPs.eq(1).text();
    const tm = txt.match(/Telefon:\s*([^\n]+?)(?=\s*Fax:|\s*Web:|$)/i);
    if (tm) telefon = tm[1].trim();
    const fm = txt.match(/Fax:\s*([^\n]+?)(?=\s*Telefon:|\s*Web:|$)/i);
    if (fm) fax = fm[1].trim();
    const webA = kontaktPs.eq(1).find('a.website, a[href^="http"]').first();
    website = webA.attr('href') || '';
  }

  let traeger = '', schulart = 'Gymnasium', schulnummer = '';
  if (verwaltung.length) {
    const txt = verwaltung.filter('p').first().text();
    const sn = txt.match(/Schulnummer:\s*(\S+)/i); if (sn) schulnummer = sn[1];
    const sa = txt.match(/Schulart:\s*([^\n]+?)(?=\s*Rechtlicher|\s*Schulnummer|$)/i); if (sa) schulart = sa[1].trim();
    const rs = txt.match(/Rechtlicher Status:\s*([^\n]+?)(?=\s*Schulart|\s*Schulnummer|$)/i); if (rs) traeger = rs[1].trim();
  }

  let email = '';
  $('a[href^="mailto:"]').each((_, el) => {
    if (!email) email = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
  });

  return {
    name: name || undefined,
    schulnummer_detail: schulnummer,
    strasse, plz, ort,
    telefon, fax, website,
    email_aus_kmsuche: email,
    schulart, traeger,
  };
}

// Sammelt Geschwister-Nodes nach einem <h2> mit gegebenem Text bis zum nächsten h2.
function sectionAfter(rxModule, $, headlineText) {
  const h2 = rxModule.children('h2').filter((_, el) => $(el).text().trim().toLowerCase() === headlineText.toLowerCase()).first();
  if (!h2.length) return $();
  const out = [];
  let cur = h2[0].next;
  while (cur) {
    if (cur.type === 'tag' && cur.name === 'h2') break;
    if (cur.type === 'tag') out.push(cur);
    cur = cur.next;
  }
  return $(out);
}

// Wandelt einen <p>-Inhalt mit <br> in Zeilen-Array um
function htmlToLines($, p) {
  const inner = p.html() || '';
  return inner.split(/<br\s*\/?>/i).map(part => $('<div>' + part + '</div>').text().trim()).filter(Boolean);
}

main().catch(err => { console.error(err); process.exit(1); });
