// Schritt 3: schulen-mit-mail.json → gymnasien-bayern.xlsx
// Mit Priorisierung A/B/C, mehreren Sheets und CRM-Spalten für manuellen Vertrieb.

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const OUTPUT_DIR = new URL('./output/', import.meta.url).pathname;
const IN_PATH = path.join(OUTPUT_DIR, 'schulen-mit-mail.json');
const OUT_PATH = path.join(OUTPUT_DIR, 'gymnasien-bayern.xlsx');

// CRM-Spalten in fester Reihenfolge
const HEADERS = [
  'Schulnummer', 'Schule', 'Ort', 'PLZ', 'Regierungsbezirk',
  'Träger', 'Telefon', 'Website',
  'Sekretariat-Mail', 'Schulleitung-Mail', 'Oberstufenkoordination-Mail',
  'Fachschaft-Mail', 'Digital/Medien/IT-Mail', 'Sonstige E-Mails',
  'Persönliche Ansprechpartner', 'Gefundene Rollen/Keywords', 'Digitalprofil',
  'Priorität', 'Anzahl Mails',
  // CRM-Workflow (leer für manuelle Pflege)
  'Kontaktstatus', 'Datum Erstmail', 'Follow-up-Datum', 'Reaktion', 'Nächster Schritt', 'Notizen',
];

// PLZ → Regierungsbezirk (Bayern, grobe Ranges)
function plzZuRegbezirk(plz) {
  if (!plz || plz.length < 5) return '';
  const p = parseInt(plz, 10);
  if (p >= 63000 && p <= 63999) return 'Unterfranken';
  if (p >= 80000 && p <= 85999) return 'Oberbayern';
  if (p >= 86000 && p <= 87999) return 'Schwaben';
  if (p >= 88000 && p <= 88599) return 'Schwaben';
  if (p >= 90000 && p <= 91999) return 'Mittelfranken';
  if (p >= 92000 && p <= 93499) return 'Oberpfalz';
  if (p >= 93500 && p <= 93999) return 'Oberpfalz';
  if (p >= 94000 && p <= 94999) return 'Niederbayern';
  if (p >= 95000 && p <= 96999) return 'Oberfranken';
  if (p >= 97000 && p <= 97999) return 'Unterfranken';
  // Schwaben: 86xxx + 87xxx + 88xxx (Allgäu) + 89xxx (Memmingen-Bereich)
  if (p >= 89000 && p <= 89999) return 'Schwaben';
  // Sonderfall München/Oberbayern: 80–82xxx
  if (p >= 82000 && p <= 82999) return 'Oberbayern';
  if (p >= 83000 && p <= 83999) return 'Oberbayern';
  if (p >= 84000 && p <= 84999) return 'Niederbayern'; // grob; Teile auch Oberbayern
  return '';
}

// ---------- Priorisierung ----------
function bestimmePrio(s) {
  const k = s.mails_klassifiziert || {};
  const profil = s.digitalprofil || [];
  const rollen = s.rollen_keywords || [];
  const status = s.email_status || '';
  const hatMail = ['sekretariat','schulleitung','oberstufe','fachschaft','digital','persoenlich','sonstige']
    .some(r => (k[r] || []).length > 0);

  // C: Website-Fehler / keine Mail
  if (status === 'failed' || (!hatMail && status === 'manual-needed')) {
    return { prio: 'C', grund: status === 'failed' ? 'Website nicht erreichbar' : 'keine E-Mail gefunden' };
  }

  const aSignale = [];
  if ((k.oberstufe || []).length) aSignale.push('Oberstufenkoordination-Mail');
  if ((k.fachschaft || []).length) aSignale.push('Fachschaft-Mail');
  if ((k.digital || []).length) aSignale.push('Digital/Medien-Mail');
  const A_PROFIL = ['MINT-EC','Seminarschule','Tabletklasse','iPad-Klasse','Digitale Schule der Zukunft','Referenzschule für Medienbildung'];
  for (const p of A_PROFIL) if (profil.includes(p)) aSignale.push('Profil: ' + p);
  if ((k.persoenlich || []).length >= 2) aSignale.push((k.persoenlich.length) + ' persönliche Ansprechpartner');
  // München/Oberbayern als Signal (laut User-Anforderung)
  const reg = plzZuRegbezirk(s.plz || '');
  if (reg === 'Oberbayern' && (k.persoenlich || []).length >= 1) aSignale.push('Oberbayern + Ansprechpartner');

  if (aSignale.length) return { prio: 'A', grund: aSignale.join(' · ') };

  // B: Sekretariat oder Generika vorhanden
  if ((k.sekretariat || []).length || (k.persoenlich || []).length || (k.sonstige || []).length) {
    return { prio: 'B', grund: 'allgemeine Kontaktadresse vorhanden' };
  }

  return { prio: 'C', grund: 'nur unspezifische / keine verwertbare Mail' };
}

// ---------- Datenzeile ----------
function buildRow(s) {
  const k = s.mails_klassifiziert || {};
  const mail = (arr) => (arr || []).map(x => x.mail).join(', ');
  const reg = plzZuRegbezirk(s.plz || '');
  const { prio, grund } = bestimmePrio(s);

  const persoenlich = (k.persoenlich || []).map(x => x.mail).join(', ');
  const sonstige = (k.sonstige || []).map(x => x.mail).join(', ');
  const anzahl = (s.mails_alle || []).length;

  return {
    row: [
      s.schulnummer || '',
      s.name || '',
      s.ort || '',
      s.plz || '',
      reg,
      s.traeger || '',
      s.telefon || '',
      s.website || '',
      mail(k.sekretariat),
      mail(k.schulleitung),
      mail(k.oberstufe),
      mail(k.fachschaft),
      mail(k.digital),
      sonstige,
      persoenlich,
      (s.rollen_keywords || []).join(', '),
      (s.digitalprofil || []).join(', '),
      prio + ' – ' + grund,
      anzahl,
      // CRM-Workflow leer
      '', '', '', '', '', '',
    ],
    prio,
    failed: s.email_status === 'failed',
    keine_mail: anzahl === 0,
  };
}

// ---------- Sheet-Helper ----------
function makeSheet(rows) {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = [
    { wch: 10 }, { wch: 38 }, { wch: 18 }, { wch: 7 }, { wch: 14 },
    { wch: 28 }, { wch: 16 }, { wch: 30 },
    { wch: 32 }, { wch: 32 }, { wch: 32 },
    { wch: 32 }, { wch: 32 }, { wch: 36 },
    { wch: 36 }, { wch: 28 }, { wch: 28 },
    { wch: 36 }, { wch: 8 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 30 },
  ];
  if (rows.length) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: HEADERS.length - 1, r: rows.length } }),
    };
  }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

// ---------- Statistik ----------
function buildStats(schulen, rowsByPrio) {
  const total = schulen.length;
  const failed = schulen.filter(s => s.email_status === 'failed').length;
  const ohneMail = schulen.filter(s => !s.mails_alle?.length).length;
  const mitMail = total - ohneMail;
  const mit = (rolle) => schulen.filter(s => (s.mails_klassifiziert?.[rolle] || []).length > 0).length;

  const profilCounts = new Map();
  for (const s of schulen) for (const p of s.digitalprofil || []) profilCounts.set(p, (profilCounts.get(p) || 0) + 1);
  const regCounts = new Map();
  for (const s of schulen) {
    const r = plzZuRegbezirk(s.plz || '') || '(unbekannt)';
    regCounts.set(r, (regCounts.get(r) || 0) + 1);
  }

  const rows = [
    ['Statistik – Gymnasien Bayern'],
    ['Stand', new Date().toISOString().slice(0, 10)],
    [],
    ['Übersicht'],
    ['Schulen gesamt', total],
    ['Schulen mit mind. einer verwertbaren E-Mail', mitMail],
    ['Schulen ohne E-Mail', ohneMail],
    ['Schulen mit nicht erreichbarer Website', failed],
    [],
    ['E-Mail-Rollen (Anzahl Schulen mit dieser Kategorie)'],
    ['Sekretariatsadressen', mit('sekretariat')],
    ['Schulleitungsadressen', mit('schulleitung')],
    ['Oberstufenkoordination', mit('oberstufe')],
    ['Fachschaftsadressen', mit('fachschaft')],
    ['Digital-/Medien-Ansprechpartner', mit('digital')],
    ['Persönliche Ansprechpartner', mit('persoenlich')],
    [],
    ['Priorisierung'],
    ['Priorität A', rowsByPrio.A.length],
    ['Priorität B', rowsByPrio.B.length],
    ['Priorität C', rowsByPrio.C.length],
    [],
    ['Verteilung nach Regierungsbezirk'],
    ...[...regCounts.entries()].sort((a, b) => b[1] - a[1]),
    [],
    ['Digitalprofil-Treffer'],
    ...[...profilCounts.entries()].sort((a, b) => b[1] - a[1]),
    [],
    ['Hinweise'],
    ['', 'Diese Liste enthält nur generische Sekretariatsadressen + Rollen-/Funktions-Postfächer + persönliche Ansprechpartner aus dem Impressum/der Schulwebsite.'],
    ['', 'Technische Adressen (webmaster, datenschutz, postmaster etc.) wurden automatisch ausgefiltert.'],
    ['', 'Vor jedem Versand: §7 UWG beachten – Bildungsbezug, Opt-Out, vollständiger Impressums-Footer.'],
    ['', 'Liste nicht weiterverteilen – Quelle KM Bayern erlaubt keine Redistribution.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 56 }, { wch: 14 }];
  return ws;
}

// ---------- Main ----------
function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error('Input fehlt:', IN_PATH);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));
  const schulen = data.schulen || [];
  console.log('[excel] Verarbeite', schulen.length, 'Schulen');

  // Sortieren: Regbezirk, Ort, Name
  schulen.sort((a, b) => {
    const ra = plzZuRegbezirk(a.plz || '');
    const rb = plzZuRegbezirk(b.plz || '');
    return (ra + (a.ort || '') + (a.name || '')).localeCompare(rb + (b.ort || '') + (b.name || ''), 'de');
  });

  const rowsByPrio = { A: [], B: [], C: [] };
  const failedRows = [];
  const allRows = [];

  for (const s of schulen) {
    const { row, prio, failed } = buildRow(s);
    allRows.push(row);
    rowsByPrio[prio].push(row);
    if (failed) failedRows.push(row);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeSheet(allRows), 'Alle Schulen');
  XLSX.utils.book_append_sheet(wb, makeSheet(rowsByPrio.A), 'Priorität A');
  XLSX.utils.book_append_sheet(wb, makeSheet(rowsByPrio.B), 'Priorität B');
  XLSX.utils.book_append_sheet(wb, makeSheet(rowsByPrio.C), 'Priorität C');
  XLSX.utils.book_append_sheet(wb, buildStats(schulen, rowsByPrio), 'Statistik');
  if (failedRows.length) {
    XLSX.utils.book_append_sheet(wb, makeSheet(failedRows), 'Fehler & Prüfen');
  }

  XLSX.writeFile(wb, OUT_PATH);
  console.log('[excel] Geschrieben:', OUT_PATH);
  console.log('[excel] Verteilung: A=' + rowsByPrio.A.length, 'B=' + rowsByPrio.B.length, 'C=' + rowsByPrio.C.length);
}

main();
