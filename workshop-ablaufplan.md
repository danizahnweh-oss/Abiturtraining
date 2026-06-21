# Ablaufplan – myAbiFlow Workshop (eigenes Kollegium)

**Dauer:** 120 Min · **Teilnehmer:** ~10 Kolleg:innen, die dich kennen · **Datum:** 22.06.2026

> Kein Vertriebstermin. Eigenes Kollegium, lockerer Ton. Du musst dich nicht vorstellen
> und nichts „verkaufen" – du zeigst, woran du gebaut hast, und willst ehrliches Urteil + erste Mitmacher.

---

## Vorab-Checkliste (Abend vorher + 30 Min vor Start)

**Technik**
- [ ] Beamer + Laptop getestet, HDMI/Adapter dabei
- [ ] WLAN: Zugangsdaten **an die Tafel** geschrieben (10 Geräte gleichzeitig drauf)
- [ ] Eigenes Gerät schon **eingeloggt** auf `myabiflow.de/lehrer.html` – nicht erst live einloggen
- [ ] Zweites Fenster offen: `dashboard.html` (für Demo Teil 4)

**Inhalt**
- [ ] **Eine Aufgabe vorab generiert** in einem Fach, das viele unterrichten (Deutsch/Mathe) → liegt bereit als **Fallback**, falls Live-Generierung hängt
- [ ] **Eine Muster-Schülerantwort** als Text in Zwischenablage (für schnelle Korrektur-Demo, kein Tippen vor Publikum)
- [ ] Handout gedruckt, 1 Seite/Person (`workshop-handout.html` → Cmd+P)

**Backend (erledigt ✅)**
- [ ] Rate-Limit 25→**250**/Min (live bestätigt)
- [ ] Korrektur-Queue 1→**4 parallel** (live bestätigt)
- [ ] **Telegram-App am Handy offen** – du schaltest jedes Konto mit einem Tap frei

> Nach dem Workshop zurücksetzen (250→25, 4→1). Sag „Backend zurücksetzen" – ich mach's.

---

## Ablauf (minutengenau)

### 1 · Warum wir hier sind — 10 Min (0:00–0:10)
Kein Pitch. Drei Sätze:
- *„Ich hab ein Tool gebaut, das Abi-Aufgaben erstellt und nach ISB-Kriterien korrigiert. Läuft schon bei echten Klassen."*
- *„Heute will ich, dass ihr's selbst in die Hand nehmt – mit eurem eigenen Fach."*
- *„Und ich brauch euer ehrliches Urteil: Wo nervt's, wo fehlt was."*

Ablauf ansagen, damit keiner fragt: **kurz zuschauen → selber machen → Feedback.**

### 2 · Live-Demo — 20 Min (0:10–0:30)
Du fährst, alle schauen. **Eine durchgehende Schüler-Reise**, laut mitdenken:

1. **(4 Min) Aufgabe generieren.** lehrer.html → Fach + Aufgabentyp wählen → Generieren.
   Währenddessen erklären, was die KI berücksichtigt (Lehrplan, Bearbeitungszeit, BE).
   *Hängt's? Sofort auf die vorab generierte Fallback-Aufgabe wechseln, nicht warten.*
2. **(5 Min) Korrigieren.** Muster-Antwort aus Zwischenablage einfügen → korrigieren lassen.
   Zeigen: **Punkte nach BE, farbig markierte Fehler, Stärken/Schwächen, Übungsvorschläge.**
   Das ist das Argument „spart Korrekturzeit" – hier verweilen.
3. **(4 Min) Eigenes Material.** Ein Foto/PDF einer echten Klausuraufgabe hochladen → KI baut Aufgabe draus.
   Das überzeugt Fachschaften, die eigene Sachen nutzen wollen.
4. **(4 Min) Dashboard.** Ins zweite Fenster wechseln: Heatmap (grün/gelb/rot), Warnsystem bei <5 NP, Klassenüberblick.
5. **(3 Min) Kolloquiumstrainer.** Kurz anspielen – KI stellt Prüferfrage, hört zu, bewertet. Der Wow-Moment, nicht zerreden.

### 3 · Hands-on — 45 Min (0:30–1:15) — **Kernstück, hier passiert alles**

**Phase A – Einloggen (0:30–0:40)**
- Alle öffnen `myabiflow.de/lehrer.html` → **Registrieren** (Name, E-Mail, Passwort, Fächer).
- Du hast Telegram offen: pro Registrierung kommt eine Nachricht → **„✅ Freischalten" tippen.**
  Laut sagen: *„Ich schalte euch grad frei – kurz neu einloggen."*
- Stockt jemand? Reihenfolge halten, niemand bleibt hängen.

**Phase B – Eigene Aufgabe bauen (0:40–1:00)**
- Klarer Einzelauftrag an die Tafel:
  > **„Erstelle eine Aufgabe für deinen eigenen Kurs. Lass dann eine kurze Antwort korrigieren."**
- Du läufst rum, hilfst am Gerät. Achte auf die zwei typischen Stolperstellen:
  Fach/Typ nicht gefunden → gemeinsam suchen. Korrektur „dauert" → ist die Queue, kommt nach paar Sek.

**Phase C – An die Klasse denken (1:00–1:15)**
- Jeder legt einen **Klassen-Code** an (Handout Schritt 3) und sieht: *so kommt das morgen zu den Schülern.*
- Wer mag, gibt den Code dem Sitznachbarn → der spielt „Schüler" auf myabiflow.de → Ergebnis taucht im Dashboard des Kollegen auf. Aha-Moment.

### 4 · Datenschutz + offene Fragen — 20 Min (1:15–1:35)
Kommt im Kollegium garantiert – **proaktiv ansprechen, bevor jemand fragt:**
- Hosting **Deutschland (Hetzner Nürnberg)**, DSGVO-konform.
- Schülerdaten gehen **nicht** in Werbung/Training.
- Schüler brauchen **kein Konto** – nur Code, Name frei wählbar.
- Beim Kolloquium: Sprachdaten werden zur Auswertung verarbeitet – Schüler vorher informieren.
- Danach offene Runde: alles fragen lassen.

### 5 · Konkreter nächster Schritt — 15 Min (1:35–1:50)
- **Direkt fragen:** *„Wer probiert es nächste Woche mit einer echten Klasse?"* → **Namen notieren.** Das ist das eigentliche Ziel heute.
- Wunsch-/Kritikliste einsammeln (1 Satz pro Person reihum) → dein wertvollstes Feedback.

### 6 · Puffer — 10 Min (1:50–2:00)
Nachzügler-Fragen, Einzelgespräche, Technik-Reste. Lieber Puffer als Hetze.

---

## Risiken & Fallbacks

| Risiko | Vorsorge |
|---|---|
| Live-Generierung hängt | Vorab generierte Aufgabe sofort einspringen lassen |
| 10× gleichzeitig = Überlast | Rate-Limit 250 + Queue 4 parallel (live) ✅ |
| WLAN schwach / 10 Geräte | Notfalls Handy-Hotspot; Demo zur Not nur über dein Gerät |
| Telegram-Freischaltung stockt | Du bist Admin – Konten der Reihe nach durchklicken |
| Korrektur „dauert lange" | Ist normal (KI rechnet) – ansagen, nicht doppelt klicken lassen |
| Kollege bleibt skeptisch | Nicht überzeugen – eigenes Ausprobieren + Pilot-Angebot wirkt |

---

## Nach dem Workshop
1. **Test-Konten der Kollegen löschen**, falls nur zum Ausprobieren angelegt (DSGVO/Sauberkeit).
2. **Backend zurücksetzen:** Rate-Limit 250→25, Queue 4→1 (sag „Backend zurücksetzen").
3. **Pilot-Namen + Feedback festhalten** – fürs Produkt und nächste Schritte.
