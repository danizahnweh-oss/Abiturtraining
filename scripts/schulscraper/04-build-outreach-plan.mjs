// Erstellt eine schlanke Outreach-Arbeitsmappe aus den vorhandenen Schuldaten.
// Fokus: Woche 1 mit maximal 50 priorisierten bayerischen Gymnasien.

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const OUTPUT_DIR = new URL('./output/', import.meta.url).pathname;
const IN_PATH = path.join(OUTPUT_DIR, 'schulen-mit-mail.json');
const OUT_XLSX = path.join(OUTPUT_DIR, 'myabiflow-outreach-woche-1.xlsx');
const OUT_MD = path.join(OUTPUT_DIR, 'outreach-templates.md');

const LIMIT = Number(process.env.OUTREACH_LIMIT || 50);

const HEADERS = [
  'Rang',
  'Batch',
  'Schule',
  'Ort',
  'PLZ',
  'Regierungsbezirk',
  'Telefon',
  'Beste Ziel-Mail',
  'Ziel-Rolle',
  'Sekretariat-Mail',
  'Schulleitung-Mail',
  'Oberstufenkoordination-Mail',
  'Digital/Medien/IT-Mail',
  'Website',
  'Score',
  'Prioritätsgrund',
  'Anrufstatus',
  'Zustimmung Mail?',
  'Zustimmung dokumentiert am',
  'Ansprechpartner/in',
  'Info-Mail gesendet am',
  'Follow-up am',
  'Reaktion',
  'Nächster Schritt',
  'Notizen',
];

function regbezirk(plz) {
  const p = Number(plz || 0);
  if (p >= 80000 && p <= 83999) return 'Oberbayern';
  if (p >= 84000 && p <= 84999) return 'Niederbayern';
  if (p >= 85000 && p <= 85999) return 'Oberbayern';
  if (p >= 86000 && p <= 89999) return 'Schwaben';
  if (p >= 90000 && p <= 91999) return 'Mittelfranken';
  if (p >= 92000 && p <= 93999) return 'Oberpfalz';
  if (p >= 94000 && p <= 94999) return 'Niederbayern';
  if (p >= 95000 && p <= 96999) return 'Oberfranken';
  if (p >= 97000 && p <= 97999) return 'Unterfranken';
  if (p >= 63000 && p <= 63999) return 'Unterfranken';
  return '';
}

function mails(s, rolle) {
  return (s.mails_klassifiziert?.[rolle] || [])
    .map(x => x.mail)
    .filter(isUsableMail);
}

function isUsableMail(mail) {
  if (!mail) return false;
  const value = String(mail).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(value)) return false;
  if (value.includes('..')) return false;
  return true;
}

function firstMail(s) {
  const order = [
    ['oberstufe', 'Oberstufenkoordination'],
    ['schulleitung', 'Schulleitung'],
    ['digital', 'Digital/Medien/IT'],
    ['sekretariat', 'Sekretariat'],
    ['fachschaft', 'Fachschaft'],
    ['persoenlich', 'Persönlicher Kontakt'],
    ['sonstige', 'Sonstige'],
  ];
  for (const [key, label] of order) {
    const found = mails(s, key);
    if (found.length) return { mail: found[0], rolle: label };
  }
  return { mail: '', rolle: '' };
}

function scoreSchool(s) {
  const reasons = [];
  let score = 0;
  const reg = regbezirk(s.plz);

  if (reg === 'Oberbayern') {
    score += 40;
    reasons.push('Oberbayern');
  }
  if (['München', 'Muenchen'].includes(s.ort)) {
    score += 15;
    reasons.push('München');
  }
  if (mails(s, 'oberstufe').length) {
    score += 35;
    reasons.push('Oberstufenkoordination-Mail');
  }
  if (mails(s, 'schulleitung').length) {
    score += 25;
    reasons.push('Schulleitung-Mail');
  }
  if (mails(s, 'digital').length) {
    score += 20;
    reasons.push('Digital/Medien-Mail');
  }
  if (mails(s, 'sekretariat').length) {
    score += 10;
    reasons.push('Sekretariat-Mail');
  }
  if ((s.digitalprofil || []).length) {
    score += 10;
    reasons.push('Digitalprofil: ' + s.digitalprofil.join(', '));
  }
  const usableMailCount = ['sekretariat', 'schulleitung', 'oberstufe', 'fachschaft', 'digital', 'persoenlich', 'sonstige']
    .flatMap(role => mails(s, role))
    .length;
  if (usableMailCount > 1) {
    score += Math.min(10, usableMailCount * 2);
    reasons.push(`${usableMailCount} plausible Mail-Kontakte`);
  }

  return { score, reasons: reasons.join(' · ') };
}

function makeSheet(rows) {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = [
    { wch: 6 }, { wch: 8 }, { wch: 42 }, { wch: 18 }, { wch: 7 },
    { wch: 16 }, { wch: 18 }, { wch: 34 }, { wch: 18 }, { wch: 34 },
    { wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 8 },
    { wch: 50 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 36 },
  ];
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: HEADERS.length - 1, r: rows.length } }),
  };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function buildRows(schools) {
  return schools.map((s, i) => {
    const target = firstMail(s);
    const scored = scoreSchool(s);
    return [
      i + 1,
      `Tag ${Math.floor(i / 10) + 1}`,
      s.name || '',
      s.ort || '',
      s.plz || '',
      regbezirk(s.plz),
      s.telefon || '',
      target.mail,
      target.rolle,
      mails(s, 'sekretariat').join(', '),
      mails(s, 'schulleitung').join(', '),
      mails(s, 'oberstufe').join(', '),
      mails(s, 'digital').join(', '),
      s.website || '',
      scored.score,
      scored.reasons,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
  });
}

function templatesMd() {
  return `# myAbiFlow Outreach - Woche 1

## Ablauf

1. Öffne \`myabiflow-outreach-woche-1.xlsx\`.
2. Arbeite pro Tag nur den jeweiligen Batch \`Tag 1\` bis \`Tag 5\` ab.
3. Rufe maximal 10 Schulen pro Tag an.
4. Sende eine Info-Mail nur, wenn die Schule am Telefon zugestimmt hat oder ein bestehender persönlicher Kontakt vorliegt.
5. Dokumentiere Zustimmung, Ansprechpartner und nächsten Schritt direkt in der Tabelle.

## Telefon-Skript

Guten Tag, Zahnweh mein Name, ich bin Gymnasiallehrer in Bayern.

Ich habe eine Plattform zur Abiturvorbereitung für Bayern G9 entwickelt. Darf ich der Schulleitung oder Oberstufenkoordination eine kurze Info mit Demo-Link per Mail senden?

## Wenn Zustimmung kommt

Vielen Dank. An welche Adresse soll ich die kurze Info am besten schicken? Ich notiere dazu, dass Sie der Zusendung heute zugestimmt haben.

## Wenn unklar

Kein Problem. Gibt es eine passende Adresse oder ein Kontaktformular, über das ich kurz anfragen darf, ob eine Vorstellung für die Oberstufe interessant wäre?

## Wenn kein Interesse besteht

Verstanden, vielen Dank für die kurze Rückmeldung. Dann nehme ich Ihre Schule aus meiner Liste.

## Info-Mail nach Zustimmung

Betreff: Kurze Info zu myAbiFlow für Bayern G9

Sehr geehrte Frau/Herr [Name],

vielen Dank für das kurze Telefonat. Wie besprochen sende ich Ihnen eine knappe Information zu myAbiFlow.

myAbiFlow ist eine KI-gestützte Übungsplattform für das bayerische G9-Abitur. Schülerinnen und Schüler können Abituraufgaben in über 17 Fächern üben und erhalten sofort individuelles Feedback. Besonders hilfreich ist der Kolloquiums-Trainer, der mündliche Prüfungssituationen per Sprach-KI simuliert. Für Lehrkräfte gibt es ein Dashboard, mit dem Übungsfortschritte sichtbar werden, ohne zusätzlichen Korrekturaufwand zu erzeugen.

Die Plattform orientiert sich am LehrplanPLUS und ist datenschutzbewusst umgesetzt.

Weitere Informationen finden Sie hier:
https://myabiflow.de/schulen.html

Ich stelle myAbiFlow gerne in einer kurzen 20- bis 30-minütigen Online-Demo vor. Wäre das für Ihre Schule oder die Oberstufenkoordination grundsätzlich interessant?

Falls kein Interesse besteht, genügt eine kurze Rückmeldung; ich melde mich dann nicht erneut.

Mit freundlichen Grüßen
Daniel Zahnweh
Gymnasiallehrer
info@myabiflow.de
https://myabiflow.de

## Mini-Brief / Kontaktformular

Sehr geehrte Damen und Herren,

ich bin Daniel Zahnweh, Gymnasiallehrer in Bayern, und habe mit myAbiFlow eine KI-gestützte Übungsplattform speziell für das bayerische G9-Abitur entwickelt.

Die Plattform bietet Abiturtraining in über 17 Fächern, sofortiges KI-Feedback, einen Kolloquiums-Trainer für mündliche Prüfungen und ein Lehrer-Dashboard für Kurse und Jahrgänge.

Ich würde myAbiFlow Ihrer Schule gerne in einer kurzen Online-Demo vorstellen. Informationen finden Sie unter:
https://myabiflow.de/schulen.html

Mit freundlichen Grüßen
Daniel Zahnweh
info@myabiflow.de
`;
}

function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error('Input fehlt:', IN_PATH);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));
  const schools = data.schulen || [];
  const candidates = schools
    .map(s => ({ ...s, _score: scoreSchool(s).score }))
    .filter(s => regbezirk(s.plz) === 'Oberbayern')
    .filter(s => firstMail(s).mail || s.telefon)
    .sort((a, b) => b._score - a._score || (a.ort || '').localeCompare(b.ort || '', 'de') || (a.name || '').localeCompare(b.name || '', 'de'));

  const weekOne = candidates.slice(0, LIMIT);
  const rest = candidates.slice(LIMIT);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeSheet(buildRows(weekOne)), 'Woche 1 Top 50');
  XLSX.utils.book_append_sheet(wb, makeSheet(buildRows(rest)), 'Reserve Oberbayern');
  XLSX.writeFile(wb, OUT_XLSX);

  fs.writeFileSync(OUT_MD, templatesMd(), 'utf8');

  console.log('[outreach] Kandidaten Oberbayern:', candidates.length);
  console.log('[outreach] Woche 1:', weekOne.length);
  console.log('[outreach] Geschrieben:', OUT_XLSX);
  console.log('[outreach] Geschrieben:', OUT_MD);
}

main();
