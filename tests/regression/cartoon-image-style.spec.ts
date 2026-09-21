import { expect, test } from '@playwright/test';
import { handleGenerateImage } from '../../src/handlers/media.js';

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

for (const style of ['cartoon', 'karikatur', 'diagram', 'foto']) {
  test(`Bild-Endpunkt: ${style} verwendet den passenden Stil`, async () => {
    const originalFetch = globalThis.fetch;
    let sentPrompt = '';
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      sentPrompt = body.contents[0].parts[0].text;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: pixel } }] } }] }));
    };
    try {
      const response = await handleGenerateImage(new Request('https://example.test/api/generate-image', { method: 'POST', body: JSON.stringify({ prompt: 'A scene for analysis.', style, noText: style === 'cartoon' }) }), {});
      expect(response.status).toBe(200);
      expect((await response.json()).url).toMatch(/^data:image\/png;base64,/);
      if (style === 'cartoon') {
        expect(sentPrompt).toContain('English editorial cartoon');
        expect(sentPrompt).toContain('application adds English speech bubbles separately');
        expect(sentPrompt).not.toContain('Clean, precise');
      } else if (style === 'karikatur') expect(sentPrompt).toContain('German text in speech bubbles');
      else if (style === 'foto') expect(sentPrompt).toContain('realistic, high-quality photograph');
      else expect(sentPrompt).toContain('educational diagram');
    } finally { globalThis.fetch = originalFetch; }
  });
}

test('Englischer Cartoon: auch der Ersatzanbieter verbietet keine Figuren', async () => {
  const originalFetch = globalThis.fetch;
  let fallback: any;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('googleapis')) return new Response('{}', { status: 503 });
    if (url.includes('ideogram.ai')) {
      fallback = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ url: 'https://example.test/image.png' }] }));
    }
    if (url.includes('image.png')) return new Response(Buffer.from(pixel, 'base64'), { headers: { 'Content-Type': 'image/png' } });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Testbild' } }] }));
  };
  try {
    const response = await handleGenerateImage(new Request('https://example.test/api/generate-image', { method: 'POST', body: JSON.stringify({ prompt: 'A scene for analysis.', style: 'cartoon', noText: true }) }), { IDEOGRAM_API_KEY: 'test-key' });
    expect(response.status).toBe(200);
    expect(fallback.prompt).toContain('English editorial cartoon');
    expect(fallback.negative_prompt).not.toMatch(/people|persons|faces|caricatures/);
    expect(fallback.negative_prompt).toContain('speech bubbles');
  } finally { globalThis.fetch = originalFetch; }
});

test('Bild-Endpunkt: Textpayload wird verworfen und durch ein echtes Fallback-Bild ersetzt', async () => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('googleapis')) {
      const model = url.match(/models\/([^:]+)/)?.[1] || '';
      models.push(model);
      const data = model === 'gemini-3-pro-image' ? btoa('kein bild') : pixel;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] }));
    }
    throw new Error('Unerwarteter Provider');
  };
  try {
    const response = await handleGenerateImage(new Request('https://example.test/api/generate-image', { method: 'POST', body: JSON.stringify({ prompt: 'A cartoon.', style: 'karikatur' }) }), {});
    expect(response.status).toBe(200);
    expect(models).toEqual(['gemini-3-pro-image', 'gemini-3.1-flash-image']);
    expect((await response.json()).url).toContain(pixel);
  } finally { globalThis.fetch = originalFetch; }
});
