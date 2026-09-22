/* Verbindliche Umfangsgrenzen fuer kurze Gymnasiums-Klausuren. */

const BUDGET_MARKER = 'MYABIFLOW_TIME_BUDGET';

const BUDGETS = [
  { maxMinutes: 30, maxTextWords: 220, maxWordsPerText: 220, maxTextMaterials: 1, maxMaterials: 2, maxTasks: 2 },
  { maxMinutes: 45, maxTextWords: 320, maxWordsPerText: 320, maxTextMaterials: 1, maxMaterials: 2, maxTasks: 3 },
  { maxMinutes: 60, maxTextWords: 450, maxWordsPerText: 350, maxTextMaterials: 2, maxMaterials: 3, maxTasks: 3 },
  { maxMinutes: 90, maxTextWords: 700, maxWordsPerText: 450, maxTextMaterials: 2, maxMaterials: 3, maxTasks: 4 },
  { maxMinutes: 120, maxTextWords: 950, maxWordsPerText: 600, maxTextMaterials: 2, maxMaterials: 4, maxTasks: 5 },
  { maxMinutes: 150, maxTextWords: 1250, maxWordsPerText: 700, maxTextMaterials: 3, maxMaterials: 4, maxTasks: 6 }
];

export function materialZeitbudget(zeitMinuten) {
  const minutes = Number(zeitMinuten);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 150) return null;
  const preset = BUDGETS.find(entry => minutes <= entry.maxMinutes) || BUDGETS[BUDGETS.length - 1];
  return { minutes: Math.round(minutes), ...preset };
}

export function zeitbudgetPrompt(zeitMinuten) {
  const budget = materialZeitbudget(zeitMinuten);
  if (!budget) return '';

  const machineMarker = `[[${BUDGET_MARKER}:${JSON.stringify(budget)}]]`;
  return `\n\n${machineMarker}
HARTES ZEIT- UND QUELLENBUDGET FUER ${budget.minutes} MINUTEN:
- Alle fortlaufenden Textquellen zusammen: hoechstens ${budget.maxTextWords} Woerter.
- Hoechstens ${budget.maxTextMaterials} Textquelle(n), jede einzelne Textquelle hoechstens ${budget.maxWordsPerText} Woerter.
- Insgesamt hoechstens ${budget.maxMaterials} Materialien. Ein zusaetzliches Material muss kompakt sein, z. B. eine kleine Tabelle, Statistik, Karikatur oder Abbildung.
- Hoechstens ${budget.maxTasks} Teilaufgaben. Jede Aufgabe muss innerhalb der Bearbeitungszeit realistisch loesbar sein.
- Jedes Material muss fuer mindestens eine Teilaufgabe wirklich erforderlich sein. Kein Fuellmaterial und keine langen Bildlegenden.
Diese Obergrenzen sind harte Grenzen, keine Zielwerte. Sie haben AUSNAHMSLOS VORRANG vor allen anderen Laengen- oder Mengenangaben im Prompt. Insbesondere sind spaetere oder fruehere Forderungen wie "400-800 Woerter", "mindestens 400 Woerter", "3-5 Materialien" oder "ausfuehrlicher Quellentext" fuer diese kurze Klausur ausser Kraft gesetzt.`;
}

export function extractZeitbudget(messages) {
  let latest = null;
  for (const message of messages || []) {
    const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content || '');
    const pattern = new RegExp(`\\[\\[${BUDGET_MARKER}:(\\{[^\\]]+\\})\\]\\]`, 'g');
    let match;
    while ((match = pattern.exec(content))) {
      try {
        latest = JSON.parse(match[1]);
      } catch {
        // Ein defekter interner Marker darf normale KI-Aufrufe nicht blockieren.
      }
    }
  }
  return latest;
}

export function priorisiereZeitbudget(messages, budget) {
  if (!budget) return messages;
  return [
    ...messages,
    {
      role: 'system',
      content: `LETZTE VERBINDLICHE UMFANGSKONTROLLE: Die Klausur dauert ${budget.minutes} Minuten. Alle Textquellen zusammen duerfen maximal ${budget.maxTextWords} Woerter umfassen; pro Textquelle maximal ${budget.maxWordsPerText} Woerter; maximal ${budget.maxTextMaterials} Textquelle(n), ${budget.maxMaterials} Materialien insgesamt und ${budget.maxTasks} Teilaufgaben. Diese Grenzen ueberschreiben jede widersprechende Mindestlaenge oder Materialzahl in vorherigen System- und Nutzeranweisungen. Antworte vollstaendig, aber strikt innerhalb dieser Grenzen.`
    }
  ];
}

function parseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
    }
  }
}

function wordCount(value) {
  if (typeof value !== 'string') return 0;
  const words = value.trim().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}

function textFromMaterial(material) {
  if (!material || typeof material !== 'object' || Array.isArray(material)) return '';
  const type = String(material.type || material.typ || material.kind || '').toLowerCase();
  if (!/(^|[_ -])(text|quelle|artikel|rede)([_ -]|$)/.test(type)) return '';
  for (const key of ['content', 'text', 'inhalt', 'body']) {
    if (typeof material[key] === 'string') return material[key];
  }
  return '';
}

export function pruefeZeitbudget(outputText, budget) {
  if (!budget) return null;
  const parsed = parseJson(outputText);
  if (!parsed) return null;

  const materialArrays = new Set();
  const textMaterials = [];
  const seen = new Set();

  function walk(value, key = '') {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      if (/material/i.test(key)) materialArrays.add(value);
      for (const item of value) walk(item);
      return;
    }

    const materialText = textFromMaterial(value);
    if (materialText) textMaterials.push(materialText);

    for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
  }

  walk(parsed);

  let primaryMaterials = 0;
  for (const suffix of ['', '_a', '_b']) {
    const type = String(parsed[`primary_type${suffix}`] || '').toLowerCase();
    const text = parsed[`primary_text${suffix}`];
    if (typeof text !== 'string' || !text.trim()) continue;
    if (type || materialArrays.size === 0) primaryMaterials += 1;
    if (type === 'text' || (!type && suffix === '')) textMaterials.push(text);
  }

  const lengths = textMaterials.map(wordCount);
  const totalWords = lengths.reduce((sum, length) => sum + length, 0);
  const totalMaterials = primaryMaterials + [...materialArrays].reduce((sum, materials) => sum + materials.length, 0);
  const problems = [];

  if (lengths.length > budget.maxTextMaterials) problems.push(`${lengths.length} Textquellen statt maximal ${budget.maxTextMaterials}`);
  if (totalWords > budget.maxTextWords) problems.push(`${totalWords} Textwoerter statt maximal ${budget.maxTextWords}`);
  const longest = lengths.length ? Math.max(...lengths) : 0;
  if (longest > budget.maxWordsPerText) problems.push(`${longest} Woerter in einer Textquelle statt maximal ${budget.maxWordsPerText}`);
  if (totalMaterials > budget.maxMaterials) problems.push(`${totalMaterials} Materialien statt maximal ${budget.maxMaterials}`);

  return problems.length ? { problems, totalWords, totalMaterials, textMaterials: lengths.length } : null;
}
