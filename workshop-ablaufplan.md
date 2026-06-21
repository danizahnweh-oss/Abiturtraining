# Moderations-Ablaufplan – myAbiFlow Workshop

**Dauer:** 120 Min · **Teilnehmer:** ~10 Kolleg:innen · **Datum:** 22.06.2026

---

## Vorab-Checkliste (heute Abend / 30 Min vor Start)

- [ ] **Beamer + eigenes Gerät** getestet, HDMI/Adapter dabei
- [ ] **Gäste-WLAN** geklärt – Zugangsdaten an die Tafel schreiben
- [ ] **Telegram am Handy offen** – du schaltest die Lehrer-Konten live frei (Klick auf „✅ Freischalten")
- [ ] **Ein echtes Fach** vorbereitet (z.B. Deutsch/Mathe), Aufgabe schon generiert als **Fallback** falls Live-Generierung hakt
- [ ] **Handout ausgedruckt** (`workshop-handout.html` → drucken, 1 Seite/Person)
- [ ] **Backend ist vorbereitet:** Rate-Limit auf 250/Min hochgesetzt, Korrektur-Queue auf 4 parallel – hält 10 gleichzeitige Nutzer aus ✅

> **Wichtig nach dem Workshop (22.06. abends):** Backend zurücksetzen lassen
> (Rate-Limit 250 → 25, Queue-Concurrency 4 → 1). Siehe Abschnitt unten.

---

## Ablauf

### 1 · Aufschlag — 15 Min (0:00–0:15)
- Begrüßung, kurz wer du bist.
- **Ein Satz Problem:** „Schüler üben fürs Abi allein – ohne Feedback. Korrigieren frisst unsere Zeit."
- **Ein Satz Lösung:** „myAbiFlow erstellt Aufgaben, korrigiert nach ISB-Kriterien, zeigt den Lernstand."
- Keine Feature-Liste. Neugier wecken, nicht erklären.

### 2 · Live-Demo, du fährst — 25 Min (0:15–0:40)
Kollegen schauen nur zu. Eine komplette Schüler-Reise:
1. **Aufgabe generieren** (1 Min, dein vorbereitetes Fach).
2. **Muster-Antwort** eingeben → KI korrigiert → Punkte, markierte Fehler, Stärken/Schwächen.
3. **Dashboard** zeigen: Heatmap, Warnsystem.
4. **Kolloquiumstrainer** kurz – der Wow-Moment. KI stellt Prüferfrage, hört zu, bewertet.

> Hakt etwas? Ruhig bleiben, Fallback-Aufgabe nutzen, weitermachen.

### 3 · Hands-on — 40 Min (0:40–1:20) — **Kernstück**
- **Alle registrieren sich** auf `myabiflow.de/lehrer.html` (Handout Schritt 1).
- Du schaltest **live per Telegram frei**, während sie tippen.
- Klarer Auftrag: **„Erstelle eine Aufgabe für deinen eigenen Kurs und lass eine Lösung korrigieren."**
- Du läufst rum, hilfst am Gerät. Hier entstehen die Aha-Momente.

### 4 · Dashboard + Datenschutz — 20 Min (1:20–1:40)
- Klassen-Code anlegen, an Schüler verteilen (Handout Schritt 3).
- Aktivitäts-Feed, Stärken/Schwächen-Analyse zeigen.
- **Datenschutz proaktiv ansprechen** (kommt immer): Hosting DE/Hetzner, DSGVO, Schüler anonym, keine Werbe-Weitergabe. Bei Kolloquium: Hinweis zur Sprachdaten-Verarbeitung.

### 5 · Diskussion + nächster Schritt — 20 Min (1:40–2:00)
- Fragen, Bedenken, Wünsche sammeln → **das ist dein wertvollstes Feedback.**
- **Konkreter Call-to-Action:** „Wer probiert es nächste Woche mit einer echten Klasse?" → Pilot-Kandidaten notieren.
- Handout + Kontakt mitgeben.

---

## Risiken & Fallbacks

| Risiko | Vorsorge |
|---|---|
| Live-Generierung hängt | Vorbereitete Aufgabe als Fallback bereit |
| 10× gleichzeitig = Überlast | Rate-Limit (250) + Queue (4 parallel) gebumpt ✅ |
| WLAN schwach | Zur Not Handy-Hotspot, Demo zur Not nur über dein Gerät |
| Telegram-Freischaltung stockt | Du hast Admin-Zugriff – notfalls Konten der Reihe nach |
| Kollege bleibt skeptisch | Nicht überzeugen wollen – eigenes Ausprobieren wirkt |

---

## Nach dem Workshop

1. **Test-Konten löschen** (DSGVO/Sauberkeit): die heute angelegten Kollegen-Konten, falls nur Test.
2. **Backend zurücksetzen:**
   - `src/config.js`: `MAX_REQUESTS_PER_WINDOW` 250 → **25**, deployen.
   - `hetzner-backend/src/queue-adapter.js`: `concurrency` 4 → **1**, deployen.
   - *(Sag mir einfach „Backend zurücksetzen" – ich mach's.)*
3. **Feedback festhalten** – in Memory/Notizen, fürs Produkt.