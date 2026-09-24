import test from 'node:test';
import assert from 'node:assert/strict';
import {
  materialZeitbudget,
  zeitbudgetPrompt,
  extractZeitbudget,
  priorisiereZeitbudget,
  pruefeZeitbudget
} from '../../src/time-budget.js';
import { klausurZeitHinweis, zeitanpassung } from '../../src/config.js';
import { callOpenAI } from '../../src/openai.js';

test('30 Minuten erhalten ein realistisches hartes Quellenbudget', () => {
  const budget = materialZeitbudget(30);
  assert.deepEqual(budget, {
    minutes: 30,
    maxMinutes: 30,
    maxTextWords: 220,
    maxWordsPerText: 220,
    maxTextMaterials: 1,
    maxMaterials: 2,
    maxTasks: 2
  });
  const prompt = zeitbudgetPrompt(30);
  assert.match(prompt, /hoechstens 220 Woerter/);
  assert.match(prompt, /AUSNAHMSLOS VORRANG/);
  assert.match(prompt, /400-800 Woerter/);
});

test('das Quellenbudget gilt auch bei passend gewaehlten BE', () => {
  const prompt = klausurZeitHinweis(30, 12, 2.5);
  assert.match(prompt, /HARTES ZEIT- UND QUELLENBUDGET/);
  assert.match(prompt, /Hoechstens 2 Teilaufgaben/);
});

test('FOS kann das Gymnasiums-Quellenbudget gezielt deaktivieren', () => {
  const prompt = klausurZeitHinweis(30, 12, 2.5, { quellenBudget: false });
  assert.equal(prompt, '');
});

test('Abitur-Zeitanpassung senkt bei 30 Minuten auch die BE realistisch', () => {
  const prompt = zeitanpassung(30, 210, 100);
  assert.match(prompt, /insgesamt ca\. 14 BE/);
  assert.match(prompt, /Alle fortlaufenden Textquellen zusammen: hoechstens 220 Woerter/);
});

test('Zeitbudget wird als letzte Systemanweisung priorisiert', () => {
  const messages = [
    { role: 'system', content: `Erzeuge lange Quellen.${zeitbudgetPrompt(30)}` },
    { role: 'user', content: 'Jeder Text muss mindestens 800 Woerter haben.' }
  ];
  const budget = extractZeitbudget(messages);
  const prioritized = priorisiereZeitbudget(messages, budget);
  assert.equal(prioritized.at(-1).role, 'system');
  assert.match(prioritized.at(-1).content, /maximal 220 Woerter/);
  assert.match(prioritized.at(-1).content, /ueberschreiben jede widersprechende Mindestlaenge/);
});

test('zu lange oder zu viele Materialien werden erkannt', () => {
  const longText = Array.from({ length: 230 }, (_, index) => `Wort${index}`).join(' ');
  const output = JSON.stringify({
    materials: [
      { type: 'text', content: longText },
      { type: 'statistik', content: '| A | B |' },
      { type: 'bild', content: 'A compact diagram prompt' }
    ]
  });
  const problem = pruefeZeitbudget(output, materialZeitbudget(30));
  assert.ok(problem);
  assert.equal(problem.totalWords, 230);
  assert.equal(problem.totalMaterials, 3);
  assert.match(problem.problems.join(' '), /230 Textwoerter/);
  assert.match(problem.problems.join(' '), /3 Materialien/);
});

test('kompakte 30-Minuten-Aufgabe besteht die Umfangspruefung', () => {
  const text = Array.from({ length: 180 }, (_, index) => `Wort${index}`).join(' ');
  const output = JSON.stringify({
    task_instruction: '1. Analysieren Sie M1. (8 BE) 2. Beurteilen Sie die Statistik M2. (4 BE)',
    materials: [
      { type: 'text', content: text },
      { type: 'statistik', content: '| A | B |' }
    ]
  });
  assert.equal(pruefeZeitbudget(output, materialZeitbudget(30)), null);
});

test('zu viele Teilaufgaben werden auch bei kompakten Quellen erkannt', () => {
  const output = JSON.stringify({
    aufgabe: 'Kurze Aufgabe',
    teilaufgaben: [
      { id: 'a)', text: 'Nennen Sie einen Aspekt.', be: 2 },
      { id: 'b)', text: 'Erklaeren Sie den Zusammenhang.', be: 4 },
      { id: 'c)', text: 'Beurteilen Sie die Aussage.', be: 6 }
    ],
    materials: []
  });
  const problem = pruefeZeitbudget(output, materialZeitbudget(30));
  assert.ok(problem);
  assert.equal(problem.taskCount, 3);
  assert.match(problem.problems.join(' '), /3 Teilaufgaben statt maximal 2/);
});

test('Platzhalter und ungenutzte Materialien werden abgelehnt', () => {
  const output = JSON.stringify({
    task_instruction: '1. Analysieren Sie M1. 2. Beurteilen Sie die Aussage.',
    materials: [
      { id: 'M1', type: 'text', content: 'Kurzer echter Text.' },
      { id: 'M2', type: 'statistik', content: '| Jahr | EIGENER WERT |' }
    ]
  });
  const problem = pruefeZeitbudget(output, materialZeitbudget(30));
  assert.ok(problem);
  assert.match(problem.problems.join(' '), /Platzhalter/);
  assert.match(problem.problems.join(' '), /nicht verwendete Materialien: M2/);
});

test('Hauptmaterial und Zusatzmaterialien zaehlen gemeinsam', () => {
  const output = JSON.stringify({
    primary_type: 'text',
    primary_text: 'Eine kurze Quelle.',
    zusatz_materialien: [
      { type: 'statistik', content: '| A | B |' },
      { type: 'bild', content: 'A compact diagram prompt' }
    ]
  });
  const problem = pruefeZeitbudget(output, materialZeitbudget(30));
  assert.equal(problem.totalMaterials, 3);
  assert.match(problem.problems.join(' '), /3 Materialien/);
});

test('zu lange KI-Ausgabe wird automatisch komplett neu erzeugt', async () => {
  const originalFetch = globalThis.fetch;
  const longText = Array.from({ length: 230 }, (_, index) => `Lang${index}`).join(' ');
  const shortText = Array.from({ length: 180 }, (_, index) => `Kurz${index}`).join(' ');
  const responses = [
    JSON.stringify({ materials: [{ type: 'text', content: longText }] }),
    JSON.stringify({ materials: [{ type: 'text', content: shortText }] })
  ];
  const requests = [];

  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: responses.shift() }, finish_reason: 'stop' }] })
    };
  };

  try {
    const result = await callOpenAI(
      { OPENAI_API_KEY: 'test' },
      [
        { role: 'system', content: `Antworte als JSON.${zeitbudgetPrompt(30)}` },
        { role: 'user', content: 'Erzeuge eine kurze Klausur.' }
      ],
      1000
    );
    assert.equal(requests.length, 2);
    assert.match(requests[0].messages.at(-1).content, /maximal 220 Woerter/);
    assert.match(requests[1].messages.at(-2).content, /vorige Generierung hat das verbindliche Zeitbudget verletzt/);
    assert.equal(pruefeZeitbudget(result, materialZeitbudget(30)), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
