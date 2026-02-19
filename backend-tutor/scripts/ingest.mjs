import fs from 'fs';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const WORKER_URL = 'https://backend-tutor.sanktannagymnasium.workers.dev';
const HTML_FILE = '../index.html';

async function ingest() {
    console.log(`Reading ${HTML_FILE}...`);
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const $ = cheerio.load(html);

    // Extract text from key sections
    const sections = [];

    // General Intro
    sections.push({
        id: 'intro',
        text: "Willkommen bei myAbiFlow. Das ist eine App zum Abiturtraining für Schüler. Sie bietet Module für Englisch, Deutsch, Geschichte, PuG, W+R, Französisch, Italienisch, Ethik, Geographie, Latein, Mathematik und Chemie."
    });

    // Extract from Tour Steps (good summary of features)
    const tourScript = $('script').text();
    const tourMatch = tourScript.match(/var tourSteps = \[(.*?)\];/s);
    if (tourMatch) {
        sections.push({
            id: 'tour-guide',
            text: "Funktionen der App (aus der Tour): " + tourMatch[1]
        });
    }

    // Extract from Module Cards
    $('.module-card, .subject-card').each((i, el) => {
        const title = $(el).find('.subject-title, h3').text().trim();
        const desc = $(el).find('.subject-desc, p').text().trim();
        if (title) {
            sections.push({
                id: `module-${i}`,
                text: `Fach/Modul: ${title}. Beschreibung: ${desc}`
            });
        }
    });

    // Extract from Correction Legend (grading logic)
    const legend = $('.korrektur-legende').text().trim();
    if (legend) {
        sections.push({
            id: 'grading-legend',
            text: `Korrektur-Legende: ${legend}`
        });
    }

    // Send to Worker
    console.log(`Found ${sections.length} sections. Uploading...`);

    for (const section of sections) {
        console.log(`Uploading ${section.id}...`);
        try {
            const res = await fetch(`${WORKER_URL}/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(section)
            });
            const json = await res.json();
            console.log(`Success: ${JSON.stringify(json)}`);
        } catch (e) {
            console.error(`Error uploading ${section.id}:`, e);
        }
    }
}

ingest();
