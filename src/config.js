/* ================= CONFIG ================= */
/* Konstanten, Prompt-Templates und Zeitanpassungs-Funktionen */

/* ---- Rate Limiting & Auth ---- */
export const RATE_LIMIT_WINDOW = 60 * 1000;
// TEMPORÄR für Lehrer-Workshop 2026-06-22 hochgesetzt (10 Kollegen hinter EINER Schul-IP).
// Standardwert ist 25 — nach dem Workshop (22.06. abends) wieder auf 25 zurücksetzen.
export const MAX_REQUESTS_PER_WINDOW = 250;
export const MAX_LOGIN_ATTEMPTS = 5;
export const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB (Bilder + Text bei Grade-Requests)
export const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 Stunden
export const API_TIMEOUT = 90000; // 90s timeout for external API calls

/* ---- WolframAlpha ---- */
export const WOLFRAM_TIMEOUT = 10000; // 10s Timeout für WolframAlpha API
export const WOLFRAM_MAX_QUERIES_PER_GRADE = 5; // Max Queries pro Korrektur (Kostenbegrenzung)
export const MINT_SUBJECTS_WITH_WOLFRAM = ['mathe', 'physik', 'chemie'];

/* ---- Shared Prompt Constants ---- */
const KEINE_LOESUNGSHINWEISE_BASE = `ABSOLUT KEINE LÖSUNGSHINWEISE IN KLAMMERN: Nenne in den Aufgabenstellungen NIEMALS konkrete Beispiele, Hinweise, Lösungsansätze oder Stichworte in Klammern. VERBOTEN sind z.B. Formulierungen wie "Untersuchen Sie ... (Metapher, Alliteration, ...)" oder "Erörtern Sie ... (Pro/Contra, ...)". Die Aufgabenstellung muss OHNE jegliche Klammer-Beispiele formuliert sein – die Schüler müssen selbst erkennen, welche Aspekte relevant sind. Prüfe jede Aufgabenstellung vor der Ausgabe und entferne alle Klammer-Hinweise!`;

export function keineLoesungshinweise(beispiel) {
  if (!beispiel) return KEINE_LOESUNGSHINWEISE_BASE;
  return `ABSOLUT KEINE LÖSUNGSHINWEISE IN KLAMMERN: Nenne in den Aufgabenstellungen NIEMALS konkrete Beispiele, Hinweise, Lösungsansätze oder Stichworte in Klammern (z.B. NICHT "${beispiel}"). Die Aufgabenstellung muss OHNE jegliche Klammer-Beispiele formuliert sein – die Schüler müssen selbst erkennen, welche Aspekte relevant sind. Prüfe jede Aufgabenstellung vor der Ausgabe und entferne alle Klammer-Hinweise!`;
}
export const KEINE_LOESUNGSHINWEISE = KEINE_LOESUNGSHINWEISE_BASE;

export const ERWARTUNGSHORIZONT = `\n\nBEWERTUNGSMETHODE: Erstelle ZUERST intern einen Erwartungshorizont für JEDE Teilaufgabe, BEVOR du die Schülerlösung bewertest:
1. Welche konkreten Inhalte, Fachbegriffe und Lösungsschritte werden für volle BE erwartet?
2. Wie verteilen sich die BE auf die einzelnen erwarteten Inhaltspunkte?
3. Bewerte dann die Schülerlösung Punkt für Punkt GEGEN diesen Erwartungshorizont — wie ein Lehrer mit Korrekturschlüssel.`;

export const KORREKTUR_SINGLE = ERWARTUNGSHORIZONT + `\n\nZUSÄTZLICH im JSON-Output:
- "feedback_kurz": Array mit 3–5 kurzen Stichpunkten (je max. 1 Satz). Fasse die wichtigsten Stärken und Schwächen der Arbeit zusammen. Format: ["Stärke/Schwäche 1", "Stärke/Schwäche 2", ...]. Beginne positive Punkte mit ✓ und negative mit ✗.
- "feedback": "" (LEER lassen! Das ausführliche Feedback wird separat generiert. Schreibe NICHTS in dieses Feld.)
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

export const KORREKTUR_AB = ERWARTUNGSHORIZONT + `\n\nZUSÄTZLICH im JSON-Output:
- "feedback_kurz": Array mit 3–5 kurzen Stichpunkten (je max. 1 Satz). Fasse die wichtigsten Stärken und Schwächen der Arbeit zusammen. Format: ["Stärke/Schwäche 1", "Stärke/Schwäche 2", ...]. Beginne positive Punkte mit ✓ und negative mit ✗.
- "feedback": "" (LEER lassen! Das ausführliche Feedback wird separat generiert. Schreibe NICHTS in dieses Feld.)
- "korrektur_text_a": Vollständiger Schülertext Teil A mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "korrektur_text_b": Vollständiger Schülertext Teil B mit gleichen Fehlermarkierungen.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

export const LEHRPLAN_TREUE = `LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.`;

export const KORREKTUR_LATEIN = ERWARTUNGSHORIZONT + `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Markierter Schülertext Teil A. Markiere Übersetzungsfehler mit <mark class='fehler-ue' title='Korrektur: RICHTIG (Fehlertyp: S/L/H)'>FALSCH</mark>.
- "korrektur_text_b": Markierter Schülertext Teil B. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teil/Aufgabe", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

export const UEBUNGSAUFGABEN_ANWEISUNG = ERWARTUNGSHORIZONT + `\n- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

export const BILDER_HINWEIS_MINT = `\n\nBILDER: Die Schülerlösung liegt auch als Foto(s) bei. Interpretiere Handschrift, mathematische Formeln, Diagramme, Skizzen und Reaktionsgleichungen direkt aus den Bildern. Der beigefügte Text ist eine automatische Transkription — bei Widersprüchen zwischen Text und Bild vertraue dem Bild. WICHTIG: Durchgestrichene Wörter oder Textpassagen KOMPLETT IGNORIEREN — diese sind ungültig und dürfen weder transkribiert noch bewertet werden.`;

export const BILDER_HINWEIS_TEXT = `\n\nBILDER: Die Schülerlösung liegt auch als Foto(s) bei. Interpretiere die Handschrift direkt aus den Bildern. Der beigefügte Text ist eine automatische Transkription — bei Widersprüchen zwischen Text und Bild vertraue dem Bild. WICHTIG: Durchgestrichene Wörter oder Textpassagen KOMPLETT IGNORIEREN — diese sind ungültig und dürfen weder transkribiert noch bewertet werden.`;

export const KORREKTURHILFE_GEWAEHRLEISTUNG = `
KORREKTURHILFE GEWÄHRLEISTUNGSRECHT (bei Rechtsaufgaben zum Thema Mängelrecht/Gewährleistung anwenden):

1. MANGELBEGRIFF – Was Schüler können müssen:
- Mangel identifizieren unter Rückgriff auf die Systematik
- Fachsprache verwenden: subjektive Anforderungen, objektive Anforderungen, Montage-/Installations-/Integrationsanforderungen, Aliud-Lieferung
- Mangelfreiheit erfordert Erfüllung ALLER Anforderungskategorien gleichrangig (kein Vorrang der vereinbarten Beschaffenheit!)
- Subjektive Anforderungen: vereinbarte Beschaffenheit, vereinbarte Verwendung, vereinbartes Zubehör/Anleitungen/Aktualisierungen
- Objektive Anforderungen: gewöhnliche Verwendung, übliche Beschaffenheit (Haltbarkeit, Funktionalität, Kompatibilität, Sicherheit), erwartbares Zubehör/Verpackung/Anleitungen, erwartbare Aktualisierungen
- Montage-/Installationsanforderungen: sachgemäße Durchführung ODER unsachgemäß, aber nicht bedingt durch Verkäufer/mangelhafte Anleitung
- Aliud-Lieferung = Lieferung einer anderen als der geschuldeten Sache steht einem Mangel gleich
- KEINE aktive Zuordnung zu den vier Regelkreisen (§ 434, § 475b, § 475c, §§ 327e/f) erforderlich
- Paragrafen sind NUR Merkhilfe, nicht zu fordern

2. STUFENSTRUKTUR (Kernwissen!):
Stufe 1 – Vorrang der Nacherfüllung:
- Nacherfüllung hat Vorrang (pacta sunt servanda)
- Käufer hat Wahlrecht: Nachbesserung (Reparatur) ODER Neulieferung (Ersatzlieferung)
- Verkäufer trägt Kosten
- Frist: angemessene Frist ab Information über Mangel – KEINE aktive Fristsetzung durch Verbraucher beim Verbrauchsgüterkauf mehr nötig!
- Verkäufer kann bei unverhältnismäßigen Kosten verweigern

Stufe 2 – Nachrangige Rechte (Rücktritt/Vertragsbeendigung, Minderung, SE statt der Leistung):
Übergang möglich wenn EINE der folgenden Voraussetzungen erfüllt:
(1) Fristablauf: Nacherfüllung nicht innerhalb angemessener Frist nach Unterrichtung über Mangel
(2) Fehlgeschlagene Nacherfüllung (grundsätzlich nach 1. Fehlversuch beim Verbrauchsgüterkauf)
(3) Schwerwiegender Mangel: sofortiges Lösen gerechtfertigt
(4) Verweigerung: Verkäufer verweigert Nacherfüllung (muss NICHT "ernsthaft und endgültig" sein!)
(5) Offensichtlichkeit: offensichtlich keine ordnungsgemäße Nacherfüllung
(6) Unmöglichkeit (nur eA)

Zusätzliche Voraussetzung für Rücktritt + SE statt Leistung: Mangel muss ERHEBLICH sein
Minderung: gleiche Voraussetzungen wie Rücktritt, aber OHNE Erheblichkeit

3. SCHADENSERSATZ – Wichtige Unterscheidung:
- SE NEBEN der Leistung (Mangelfolgeschaden): steht NEBEN Nacherfüllung, ist KEIN nachrangiges Recht! Voraussetzung: Pflichtverletzung + Vertretenmüssen. Betrifft Integritätsinteresse (Schäden an anderen Rechtsgütern).
- SE STATT der Leistung: nachrangiges Recht (gleiche Voraussetzungen wie Rücktritt) + Vertretenmüssen + erheblicher Mangel + kausaler Schaden

4. VERBRAUCHERSCHUTZ:
- Beweislastumkehr: 1 Jahr ab Gefahrübergang (Tiere: 6 Monate)
- Keine aktive Fristsetzung mehr nötig (§ 475 V BGB)
- Aktualisierungspflicht: Mangel wegen fehlender Aktualisierung kann auch NACH Gefahrübergang entstehen

5. HÄUFIGE SCHÜLERFEHLER (besonders beachten bei Bewertung!):
- Sofort Rücktritt fordern ohne Nacherfüllung zu berücksichtigen → Punktabzug
- SE neben der Leistung als nachrangiges Recht behandeln → Punktabzug
- Minderung mit Rücktritt gleichsetzen (Minderung braucht KEINE Erheblichkeit) → Punktabzug
- "Frist setzen" als Voraussetzung nennen (beim Verbrauchsgüterkauf nicht mehr nötig) → Hinweis im Feedback
- Bei Aktualisierungspflicht vergessen, dass Gefahrübergang nicht allein maßgeblich ist → Hinweis
`;

/* ---- Zeitanpassung: Materialumfang an Prüfungsdauer anpassen ---- */
export function zeitanpassung(bearbeitungszeit, referenzzeit, referenzBE) {
  if (!bearbeitungszeit || bearbeitungszeit >= referenzzeit * 0.8) return '';

  const faktor = bearbeitungszeit / referenzzeit;

  const textMin = Math.max(100, Math.round(400 * faktor));
  const textMax = Math.max(200, Math.round(800 * faktor));
  const maxMaterialien = Math.max(1, Math.round(3 * faktor));
  const maxTeilaufgaben = Math.max(2, Math.round(4 * faktor));
  const skalBE = Math.max(20, Math.round(referenzBE * faktor));

  let teilB = '';
  if (bearbeitungszeit < 90) {
    teilB = '\n- Teil B ENTFÄLLT komplett — generiere NUR Teil A';
  } else if (bearbeitungszeit < 150) {
    teilB = '\n- Teil B: maximal 1 kurze Teilaufgabe';
  }

  return `\n\nWICHTIG – ZEITANPASSUNG: Diese Prüfung dauert nur ${bearbeitungszeit} Minuten (statt der üblichen ${referenzzeit} Min.). Passe den Umfang STRIKT an:
- Textmaterialien: ${textMin}–${textMax} Wörter pro Text (statt 400–800)
- Anzahl Materialien: maximal ${maxMaterialien}
- Teilaufgaben: maximal ${maxTeilaufgaben}
- Bewertungseinheiten: insgesamt ca. ${skalBE} BE${teilB}
Die Aufgabenqualität und Anforderungsniveaus (AFB I–III) bleiben gleich — nur der UMFANG wird reduziert.`;
}

export function klausurZeitHinweis(zeitMinuten, totalBE, minProBE) {
  if (!zeitMinuten || !totalBE || !minProBE) return '';
  const erwarteteZeit = totalBE * minProBE;
  const faktor = zeitMinuten / erwarteteZeit;

  if (faktor >= 0.75 && faktor <= 1.25) return '';

  if (faktor < 0.75) {
    const maxTeilaufgaben = Math.max(2, Math.round((totalBE / 5) * faktor));
    return `\n\nWICHTIG – ZEITANPASSUNG: ${zeitMinuten} Min. für ${totalBE} BE ist knapp bemessen (üblich wären ca. ${Math.round(erwarteteZeit)} Min.).
- Aufgaben kompakt und direkt formulieren, keine langen Einleitungstexte
- Maximal ${maxTeilaufgaben} Teilaufgaben
- Materialien auf das Nötigste reduzieren
- Mehr AFB I/II, weniger AFB III (zeitaufwändig)
- Berechnungen mit einfachen Zahlenwerten`;
  } else {
    return `\n\nZEIT-HINWEIS: ${zeitMinuten} Min. für ${totalBE} BE ist großzügig bemessen (üblich wären ca. ${Math.round(erwarteteZeit)} Min.).
- Aufgaben dürfen ausführlichere Kontexte und Materialien enthalten
- Mehr Raum für Transfer- und Diskussionsaufgaben (AFB III)
- Komplexere Berechnungen und mehrstufige Lösungswege möglich`;
  }
}

export function skaliereTokens(basisTokens, bearbeitungszeit, referenzzeit) {
  if (!bearbeitungszeit || bearbeitungszeit >= referenzzeit * 0.8) return basisTokens;
  const faktor = Math.max(0.3, bearbeitungszeit / referenzzeit);
  return Math.max(4000, Math.round(basisTokens * faktor));
}
