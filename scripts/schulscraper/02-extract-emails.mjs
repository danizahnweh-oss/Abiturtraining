// Schritt 2: Schul-Websites crawlen, alle E-Mails sammeln, nach Rollen
// klassifizieren, Digitalprofil-Signale erkennen.
// Output: output/schulen-mit-mail.json mit strukturierter Mail-/Profil-Info.
//
// Gecrawlte Seiten pro Schule (max. 8): Homepage, Impressum, Kontakt,
// Schulleitung, Oberstufe (Q11/Q12), Fachschaft/Kollegium, Medien/Digital,
// Profil/Schule.
//
// Klassifikation per Lokalpart-Pattern + Quell-URL-Kontext.

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { fetch as undiciFetch } from 'undici';

const OUTPUT_DIR = new URL('./output/', import.meta.url).pathname;
const IN_PATH = path.join(OUTPUT_DIR, 'schulen-stammdaten.json');
const OUT_PATH = path.join(OUTPUT_DIR, 'schulen-mit-mail.json');

const args = process.argv.slice(2);
const limit = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : null;
})();
const concurrency = parseInt(process.env.CONCURRENCY || '5', 10);
const requestDelayMs = parseInt(process.env.DELAY_MS || '500', 10);
const timeoutMs = 12000;
const MAX_SUBPAGES = 8;

const UA = 'myAbiFlow-OutreachBot/1.0 (+https://myabiflow.de)';
const log = (...m) => console.log('[emails]', ...m);

// ---------- Klassifikations-Patterns ----------
// "technisch" wird komplett ausgeschlossen
const RX_TECHNISCH = [
  /^webmaster@/i, /^postmaster@/i, /^noreply@/i, /^no-reply@/i,
  /^datenschutz@?/i, /^datenschutzbeauftrag/i, /^dsb@/i,
  /^abuse@/i, /^hosting@/i, /^domain@/i, /^admin@/i, /^hostmaster@/i,
  /^kontaktformular@/i,
];

// Rolle → Lokalpart-Patterns (Reihenfolge: spezifisch zuerst)
const ROLE_PATTERNS = [
  ['oberstufe', [
    /^(oberstufe|os|ok|osk|oberstufenkoordin\w*|abitur|kollegstufe|q11|q12|q13)(@|[-._])/i,
  ]],
  ['schulleitung', [
    /^(schulleitung|direktion|direktor|direktorat|schulleiter|sl|leitung|principal)(@|[-._])/i,
  ]],
  ['digital', [
    /^(digital|medien|mediencoach|medienkonzept|mebis|it|edv|systembetreuer|systembetreuung|tablet|ipad)(@|[-._])/i,
  ]],
  ['fachschaft', [
    /^(fachschaft|fachschaftsleit|falei|mathe|deutsch|englisch|physik|biologie|chemie|geschichte|kunst|musik|sport|reli|ethik|informatik|geographie|wirtschaft|sozialkunde)(@|[-._])/i,
  ]],
  ['sekretariat', [
    /^(sekretariat|sekretaerin|sekret|verwaltung|kanzlei|office|info|kontakt|gymnasium|schule|verw)(@|[-._])/i,
  ]],
];

// URL-Hinweise für Sub-Pages (Anker-Text + Pfad)
const SUBPAGE_HINTS = [
  { rolle: 'impressum',  patterns: [/impressum/i] },
  { rolle: 'kontakt',    patterns: [/kontakt/i, /anschrift/i] },
  { rolle: 'schulleitung', patterns: [/schulleit/i, /direktion/i, /direktor/i, /schulleitungsteam/i] },
  { rolle: 'oberstufe',  patterns: [/oberstufe/i, /q11/i, /q12/i, /q13/i, /kollegstufe/i, /abitur/i] },
  { rolle: 'fachschaft', patterns: [/fachschaft/i, /lehrer/i, /kollegium/i, /faecher/i, /fächer/i] },
  { rolle: 'digital',    patterns: [/digital/i, /medien/i, /tablet/i, /ipad/i, /mebis/i] },
];

// Digitalprofil-Keywords aus Schul-Website-Text
const PROFIL_KEYWORDS = [
  { key: 'MINT-EC',                      rx: /\bMINT[- ]?EC\b/i },
  { key: 'Seminarschule',                rx: /\bSeminarschule\b/i },
  { key: 'Tabletklasse',                 rx: /\bTablet[- ]?klasse(n)?\b/i },
  { key: 'iPad-Klasse',                  rx: /\biPad[- ]?Klasse(n)?\b/i },
  { key: 'Digitale Schule der Zukunft',  rx: /\bDigitale Schule der Zukunft\b/i },
  { key: 'Referenzschule für Medienbildung', rx: /\bReferenzschule für Medienbildung\b/i },
  { key: 'Mediencoach',                  rx: /\bMediencoach\b/i },
  { key: 'Medienkonzept',                rx: /\bMedienkonzept\b/i },
  { key: 'Schulprofil Inklusion',        rx: /\bSchulprofil[ -]?Inklusion\b/i },
  { key: 'Europaschule',                 rx: /\bEuropaschule\b/i },
  { key: 'Umweltschule',                 rx: /\bUmweltschule\b/i },
  { key: 'Schule ohne Rassismus',        rx: /\bSchule ohne Rassismus\b/i },
];

// Rollen-Keywords (für rollen_keywords-Spalte) – aus Site-Text
const ROLE_KEYWORDS = [
  { key: 'Oberstufenkoordination', rx: /\bOberstufen[- ]?Koordinat\w*\b/i },
  { key: 'Schulleitung',           rx: /\bSchulleitung\b/i },
  { key: 'Stellv. Schulleitung',   rx: /\b(stellv\.|stellvertretende)\s+Schulleit\w*\b/i },
  { key: 'Mediencoach',            rx: /\bMediencoach\b/i },
  { key: 'Systembetreuer',         rx: /\bSystem[- ]?betreuer\w*\b/i },
  { key: 'Fachbetreuer',           rx: /\bFachbetreu\w+\b/i },
  { key: 'Fachschaftsleitung',    rx: /\bFachschafts[- ]?leitung\b/i },
];

// ---------- Mail-Extraktion ----------
function extractEmailsFromHtml(html) {
  const $ = cheerio.load(html);
  const candidates = [];
  const push = (mail, ctx = '') => {
    if (!mail || !/@/.test(mail)) return;
    const clean = mail.toLowerCase().trim().replace(/[.,;:)\]}>"']+$/, '');
    if (clean.length > 80) return;
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) return;
    candidates.push({ mail: clean, ctx });
  };

  // 1) mailto:
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.replace(/^mailto:/i, '').split('?')[0];
    // Kontext: 200 Zeichen vor dem Element (im Parent-Text) → kann auf Rolle hinweisen
    const ctx = ($(el).parent().text() + ' ' + $(el).text()).replace(/\s+/g, ' ').slice(0, 250).trim();
    push(m, ctx);
  });

  // 2) Cloudflare-obfuscated (data-cfemail)
  $('[data-cfemail]').each((_, el) => {
    const dec = decodeCfEmail($(el).attr('data-cfemail'));
    const ctx = $(el).parent().text().replace(/\s+/g, ' ').slice(0, 250).trim();
    push(dec, ctx);
  });

  // 3) Klartext im Body – Word-Boundary + TLD-Whitelist gegen false positives
  const text = $('body').text();
  const rxMail = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.(?:de|com|org|net|eu|info|bayern|at|ch|edu|gov)\b/gi;
  for (const m of text.matchAll(rxMail)) {
    const idx = m.index || 0;
    const ctx = text.slice(Math.max(0, idx - 120), idx + m[0].length + 30).replace(/\s+/g, ' ').trim();
    push(m[0], ctx);
  }

  // 4) "name (at) domain (dot) de" / "name [at] domain [dot] de"
  const rxObf = /([a-z0-9._%+-]+)\s*[\[\(]?\s*(?:at|\(at\)|\[at\])\s*[\]\)]?\s*([a-z0-9.-]+)\s*[\[\(]?\s*(?:dot|punkt|\.)\s*[\]\)]?\s*([a-z]{2,})/gi;
  for (const m of text.matchAll(rxObf)) push(`${m[1]}@${m[2]}.${m[3]}`);

  return candidates;
}

function decodeCfEmail(hex) {
  if (!hex || hex.length < 4) return null;
  try {
    const r = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ r);
    return out;
  } catch { return null; }
}

// ---------- HTTP ----------
async function safeFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await undiciFetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const ct = res.headers.get('content-type') || '';
    if (!/html|text/i.test(ct)) return { ok: false, reason: 'not-html' };
    const html = await res.text();
    return { ok: true, html, finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally { clearTimeout(t); }
}

function findSubpages($, baseUrl, schulDomain) {
  const links = new Map(); // url → {rolle, text}
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const text = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (!href || /^#/.test(href) || /^mailto:/i.test(href)) return;
    let abs;
    try { abs = new URL(href, baseUrl).href.split('#')[0]; } catch { return; }
    // nur gleiche Domain
    if (!abs.startsWith('http')) return;
    try {
      const u = new URL(abs);
      const dom = u.hostname.replace(/^www\./, '');
      if (schulDomain && dom !== schulDomain && !dom.endsWith('.' + schulDomain) && !schulDomain.endsWith('.' + dom)) return;
    } catch { return; }
    // Hint matchen
    const haystack = (text + ' ' + abs).toLowerCase();
    for (const hint of SUBPAGE_HINTS) {
      if (hint.patterns.some(rx => rx.test(haystack))) {
        if (!links.has(abs)) links.set(abs, { rolle: hint.rolle, text });
        break;
      }
    }
  });
  return [...links.entries()].slice(0, MAX_SUBPAGES).map(([url, meta]) => ({ url, ...meta }));
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ---------- Klassifikation ----------
// Strikt: nur Lokalpart-basiert. Kontext/Sub-Page-Hinweise sind zu fehleranfällig
// (Lehrer-Listen verwenden zufällig die Wörter "Schulleitung", "Oberstufe").
function classifyMail(mail) {
  if (RX_TECHNISCH.some(rx => rx.test(mail))) return { rolle: 'technisch', score: 0 };
  for (const [rolle, patterns] of ROLE_PATTERNS) {
    if (patterns.some(rx => rx.test(mail))) return { rolle, score: 100 };
  }
  // Personal: vorname.nachname@ oder n.nachname@ oder nachname@ (mit mind. 2 zeichen)
  const local = mail.split('@')[0];
  if (/^[a-zäöü]+[._-][a-zäöü]+$/i.test(local) || /^[a-z]\.[a-zäöü]+$/i.test(local)) {
    return { rolle: 'persoenlich', score: 30 };
  }
  return { rolle: 'sonstige', score: 10 };
}

function dedupeAndPickByRole(allMails) {
  // allMails: [{mail, sourceRolle, ctx, sourceUrl}]
  const seen = new Map();
  for (const e of allMails) {
    if (RX_TECHNISCH.some(rx => rx.test(e.mail))) continue;
    if (!seen.has(e.mail)) seen.set(e.mail, []);
    seen.get(e.mail).push(e);
  }
  const klassen = { sekretariat: [], schulleitung: [], oberstufe: [], fachschaft: [], digital: [], persoenlich: [], sonstige: [] };
  for (const [mail, occurrences] of seen) {
    const r = classifyMail(mail);
    const first = occurrences[0] || {};
    const eintrag = { mail, ctx: first.ctx || '', sourceUrl: first.sourceUrl || '' };
    if (klassen[r.rolle]) klassen[r.rolle].push(eintrag);
    else klassen.sonstige.push(eintrag);
  }
  return klassen;
}

// ---------- Pro Schule ----------
async function processSchule(s) {
  const url = (s.website || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return finishSchule(s, [], [], 'manual-needed', 'keine-website');
  }

  const schulDomain = getDomain(url);
  const home = await safeFetch(url);
  if (!home.ok) {
    await sleep(requestDelayMs);
    return finishSchule(s, [], [], 'failed', home.error || `HTTP ${home.status}`);
  }

  const allMails = [];
  const visitedTexts = []; // für Profil-Keyword-Suche
  const visited = new Set();

  const addPage = (rolle, html, finalUrl) => {
    const $ = cheerio.load(html);
    visitedTexts.push($('body').text());
    extractEmailsFromHtml(html).forEach(({ mail, ctx }) => {
      allMails.push({ mail, sourceRolle: rolle, ctx, sourceUrl: finalUrl });
    });
    return $;
  };

  const $home = addPage('home', home.html, home.finalUrl || url);
  visited.add(home.finalUrl || url);

  // Sub-Page-Links bestimmen, dedupen, queue
  const subs = findSubpages($home, home.finalUrl || url, schulDomain).filter(s => !visited.has(s.url));

  for (const sub of subs) {
    if (visited.size >= 1 + MAX_SUBPAGES) break;
    visited.add(sub.url);
    await sleep(requestDelayMs);
    const r = await safeFetch(sub.url);
    if (r.ok) addPage(sub.rolle, r.html, r.finalUrl || sub.url);
  }

  // Profil-Keywords aus zusammen-Text
  const fullText = visitedTexts.join('\n').slice(0, 200000); // Cap auf 200k
  const digitalprofil = PROFIL_KEYWORDS.filter(p => p.rx.test(fullText)).map(p => p.key);
  const rollen_keywords = ROLE_KEYWORDS.filter(p => p.rx.test(fullText)).map(p => p.key);

  // Klassifizieren + dedupe
  const klassen = dedupeAndPickByRole(allMails);

  // Status
  const hatMail = Object.values(klassen).some(arr => arr.length > 0);
  const status = hatMail ? 'auto-extracted' : 'manual-needed';

  await sleep(requestDelayMs);
  return finishSchule(s, allMails, [...visited], status, '', { klassen, digitalprofil, rollen_keywords, schulDomain });
}

function finishSchule(s, allMails, gecrawlte_urls, status, error, extra = {}) {
  const klassen = extra.klassen || { sekretariat: [], schulleitung: [], oberstufe: [], fachschaft: [], digital: [], persoenlich: [], sonstige: [] };
  return {
    ...s,
    schul_domain: extra.schulDomain || '',
    email_status: status,
    email_error: error || '',
    gecrawlte_urls,
    digitalprofil: extra.digitalprofil || [],
    rollen_keywords: extra.rollen_keywords || [],
    mails_klassifiziert: klassen,
    mails_alle: [...new Set(allMails.map(e => e.mail).filter(m => !RX_TECHNISCH.some(rx => rx.test(m))))],
    mails_technisch: [...new Set(allMails.map(e => e.mail).filter(m => RX_TECHNISCH.some(rx => rx.test(m))))],
  };
}

// ---------- Main ----------
async function main() {
  if (!fs.existsSync(IN_PATH)) throw new Error(`Input fehlt: ${IN_PATH} – erst 'npm run fetch' ausführen.`);
  const data = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));
  let schulen = data.schulen || [];
  if (limit) schulen = schulen.slice(0, limit);
  log(`Verarbeite ${schulen.length} Schulen, Concurrency ${concurrency}, Delay ${requestDelayMs}ms`);

  // Resume
  let done = [];
  if (fs.existsSync(OUT_PATH)) {
    try { done = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')).schulen || []; } catch {}
  }
  const doneByKey = new Map(done.map(s => [s.schulnummer || s.name, s]));
  const todo = schulen.filter(s => !doneByKey.has(s.schulnummer || s.name));
  log(`Bereits verarbeitet: ${done.length}, offen: ${todo.length}`);

  const lim = pLimit(concurrency);
  const results = [...done];
  let counter = 0;
  const persist = () => fs.writeFileSync(OUT_PATH, JSON.stringify({
    processed_at: new Date().toISOString(),
    anzahl: results.length,
    schulen: results,
  }, null, 2));

  await Promise.all(todo.map(s => lim(async () => {
    const r = await processSchule(s);
    results.push(r);
    counter++;
    if (counter % 10 === 0) {
      const found = r.mails_alle?.length || 0;
      log(`${counter}/${todo.length} ${r.name?.slice(0,50)} → ${r.email_status} (${found} Mails, ${r.digitalprofil.length} Profil)`);
      persist();
    }
  })));
  persist();

  // Statistik
  const stats = results.reduce((a, r) => {
    a[r.email_status] = (a[r.email_status] || 0) + 1;
    if (r.mails_klassifiziert?.sekretariat?.length) a.mit_sekretariat = (a.mit_sekretariat || 0) + 1;
    if (r.mails_klassifiziert?.schulleitung?.length) a.mit_schulleitung = (a.mit_schulleitung || 0) + 1;
    if (r.mails_klassifiziert?.oberstufe?.length) a.mit_oberstufe = (a.mit_oberstufe || 0) + 1;
    if (r.mails_klassifiziert?.fachschaft?.length) a.mit_fachschaft = (a.mit_fachschaft || 0) + 1;
    if (r.mails_klassifiziert?.digital?.length) a.mit_digital = (a.mit_digital || 0) + 1;
    return a;
  }, {});
  log('Status-Verteilung:', stats);
  log('Output:', OUT_PATH);
  log('Nächster Schritt: npm run excel');
}

main().catch(e => { console.error(e); process.exit(1); });
