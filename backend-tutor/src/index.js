import { Ai } from '@cloudflare/ai'

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // HEADERS for CORS
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        if (url.pathname === '/query' && request.method === 'POST') {
            const { prompt, studentName } = await request.json();
            const ai = new Ai(env.AI);

            // 1. Generate Embedding for Question
            const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', {
                text: [prompt]
            });
            const queryVector = data[0];

            // 2. Search Vector Index
            const matches = await env.VECTORIZE.query(queryVector, {
                topK: 3,
                returnMetadata: true
            });

            // 3. Build Context
            let context = "";
            if (matches.matches && matches.matches.length > 0) {
                context = matches.matches.map(m => m.metadata.text).join("\n\n---\n\n");
            }

            // 4. Generate Answer with Context
            const systemPrompt = `Du bist ein freundlicher und hilfreicher Abi-Coach für ${studentName || 'den Schüler'}.
      Sprich den Schüler mit Vornamen an, wenn möglich.
      Dein Tonfall:
      - Begrüßung und Smalltalk: Locker, motivierend, umgangssprachlich ("Hey", "Cool", "Kein Stress").
      - Fachliche Erklärungen: Präzise, verständlich, aber nicht steif.
      
      Nutze NUR die folgenden Informationen, um die Frage zu beantworten.
      Wenn die Informationen nicht ausreichen, sage ehrlich, dass du es nicht weißt, aber versuche hilfreich zu sein.
      Antworte auf Deutsch.

      --- KONTEXT ANFANG ---
      ${context}
      --- KONTEXT ENDE ---
      `;

            const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ]
            });

            return new Response(JSON.stringify({ answer: response.response, context: matches.matches }), {
                headers: { ...headers, 'Content-Type': 'application/json' }
            });
        }

        if (url.pathname === '/ingest' && request.method === 'POST') {
            // PROTECT THIS ENDPOINT IN PRODUCTION! (For now open for setup)
            const { text, id } = await request.json();
            const ai = new Ai(env.AI);

            const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', {
                text: [text]
            });
            const vector = data[0];

            // Insert into Vectorize
            await env.VECTORIZE.insert([{
                id: id || crypto.randomUUID(),
                values: vector,
                metadata: { text: text }
            }]);

            return new Response(JSON.stringify({ success: true, id }), {
                headers: { ...headers, 'Content-Type': 'application/json' }
            });
        }

        return new Response('AI Tutor Backend Active', { headers });
    }
};
