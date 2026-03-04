import { Ai } from '@cloudflare/ai'

/* ───────── Gemini 2.5 Flash Helper ───────── */
async function callGemini(apiKey, systemPrompt, userMessage, maxTokens = 4000) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userMessage }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: maxTokens,
                }
            })
        }
    );

    const data = await res.json();
    if (!res.ok) {
        const errMsg = data.error?.message || JSON.stringify(data).substring(0, 300);
        throw new Error(`Gemini API ${res.status}: ${errMsg}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("Gemini: Keine Antwort erhalten. Response: " + JSON.stringify(data).substring(0, 300));
    }
    return text;
}

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
            try {
                const { prompt, studentName, taskContext } = await request.json();
                const ai = new Ai(env.AI);

                // 1. Generate Embedding for Question (bleibt bei Cloudflare AI)
                const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', {
                    text: [prompt]
                });
                const queryVector = data[0];

                // 2. Search Vector Index
                const matches = await env.VECTORIZE.query(queryVector, {
                    topK: 3,
                    returnMetadata: true
                });

                // 3. Build RAG Context
                let ragContext = "";
                if (matches.matches && matches.matches.length > 0) {
                    ragContext = matches.matches.map(m => m.metadata.text).join("\n\n---\n\n");
                }

                // 4. Build task context block
                let taskBlock = "";
                if (taskContext) {
                    taskBlock = `
Der Schüler arbeitet gerade an folgender Aufgabe:
--- AKTUELLE AUFGABE ---
${taskContext}
--- AUFGABE ENDE ---

Beziehe dich konkret auf diese Aufgabe, wenn die Frage dazu passt.
Gib keine fertigen Lösungen, sondern hilf dem Schüler Schritt für Schritt.
Wenn der Schüler bereits eine Antwort geschrieben hat, gib konstruktives Feedback dazu.`;
                }

                // 5. System-Prompt
                const systemPrompt = `SPRACHE: Du antwortest IMMER und AUSSCHLIESSLICH auf DEUTSCH. Egal in welcher Sprache der Schüler schreibt — deine Antwort ist IMMER auf Deutsch. Kein Englisch, kein Denglisch. Alle Fachbegriffe auf Deutsch (oder mit deutscher Erklärung).

Du bist Flowie, eine freundliche und hilfsbereite Abi-Trainerin für ${studentName || 'den Schüler'}.
Sprich den Schüler mit Vornamen an, wenn möglich.
Dein Tonfall:
- Begrüßung und Smalltalk: Locker, motivierend, umgangssprachlich ("Hey", "Cool", "Kein Stress").
- Fachliche Erklärungen: Präzise, verständlich, aber nicht steif.

WICHTIGSTE REGEL — Niemals vollständige Lösungen geben:
- Gib NIEMALS eine fertige Lösung, einen fertigen Text oder eine komplette Antwort auf eine Aufgabe.
- Stattdessen: Stelle gezielte Gegenfragen, gib Denkanstöße, erkläre Konzepte oder nenne den nächsten Schritt.
- Wenn der Schüler direkt nach der Lösung fragt ("Wie lautet die Antwort?", "Löse die Aufgabe für mich"), lehne freundlich ab und biete stattdessen einen Hinweis an.
- Bei Schülerantworten: Gib konstruktives Feedback (was ist gut, was fehlt, wo ist ein Denkfehler), aber schreibe nicht die korrigierte Version komplett aus.
- Dein Ziel ist es, dass der Schüler selbst auf die Lösung kommt.
${taskBlock}
Nutze auch die folgenden Hintergrundinformationen, falls sie relevant sind.
Wenn die Informationen nicht ausreichen, sage ehrlich, dass du es nicht weißt, aber versuche hilfreich zu sein.

ERINNERUNG: Deine GESAMTE Antwort MUSS auf Deutsch sein. Kein einziger englischer Satz.

--- WISSENSKONTEXT ANFANG ---
${ragContext}
--- WISSENSKONTEXT ENDE ---
`;

                // 6. Antwort generieren via Gemini 2.5 Flash
                const answer = await callGemini(env.GOOGLE_AI_API_KEY, systemPrompt, prompt, 3000);

                return new Response(JSON.stringify({ answer, context: matches.matches }), {
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });

            } catch (err) {
                console.error("Flowie Tutor Error:", err);
                return new Response(JSON.stringify({
                    answer: "Entschuldigung, ich habe gerade technische Probleme. Bitte versuche es gleich nochmal! 😓",
                    error: err.message
                }), {
                    status: 500,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            }
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

        return new Response('AI Tutor Backend Active (Gemini 2.5 Flash)', { headers });
    }
};
