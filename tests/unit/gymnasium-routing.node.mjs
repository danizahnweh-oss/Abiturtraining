import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import '../../src/index.js';
import { GRADE_HANDLER_MAP } from '../../src/handlers/grading.js';
import { handleGenerateKunst } from '../../src/subjects/kunst.js';
import { handleModelAnswerFrench, handleModelAnswerFrenchWriting, handleParseTaskFrench } from '../../src/subjects/franzoesisch.js';

test('Jede Gymnasiums-Abgabe hat einen registrierten Hintergrund-Handler', () => {
  for (const file of readdirSync(new URL('../../', import.meta.url)).filter(file => file.endsWith('.html'))) {
    const source = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    if (!source.includes('src="gymnasium-recovery.js')) continue;
    const endpoints = [...source.matchAll(/apiCallAsync\("([^"]+)"/g)].map(match => match[1]);
    if (file.includes('listening')) endpoints.push(file.startsWith('francais') ? 'grade-listening-french' : 'grade-listening');
    for (const endpoint of endpoints) assert.equal(typeof GRADE_HANDLER_MAP[endpoint], 'function', file + ': ' + endpoint);
  }
});

test('Kunst erzeugt Kunstmaterial statt Ethik; Spanisch-Hilfen verwenden Spanisch', async () => {
  const original = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (url, options) => {
    prompts.push(JSON.stringify(JSON.parse(options.body).messages));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ task_instruction: 'Werk analysieren', materials: [{ type: 'bild', content: 'An original fictional sculpture' }] }) }, finish_reason: 'stop' }] }));
  };
  const env = { OPENAI_API_KEY: 'test-only' };
  try {
    const response = await handleGenerateKunst({ json: async () => ({ lernbereich: '12_1', zeit: 90 }) }, env);
    assert.equal(response.status, 200);
    assert.match(prompts[0], /Readymade/);
    assert.doesNotMatch(prompts[0], /Pflichtkunst|Kant/);
    await handleModelAnswerFrench({ json: async () => ({ source_text_de: 'Quelle', task_fr: 'Tarea' }) }, env, 'Spanisch');
    await handleModelAnswerFrenchWriting({ json: async () => ({ article_text: 'Artículo', task_1: 'Tarea' }) }, env, 'Spanisch');
    await handleParseTaskFrench({ json: async () => ({ images: ['test'] }) }, env, 'Spanisch');
    for (const prompt of prompts.slice(1)) { assert.match(prompt, /Spanisch|SPANISCH/); assert.doesNotMatch(prompt, /Französisch|FRANZÖSISCH/); }
  } finally { globalThis.fetch = original; }
});
