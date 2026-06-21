# Ablaufplan – myAbiFlow Workshop (eigenes Kollegium)

**Dauer:** 120 Min · **Teilnehmer:** ~10 Kolleg:innen, die dich kennen · **Datum:** 22.06.2026

> **Ziel des Tages:** Jede:r geht mit etwas **Brauchbarem** raus – einer fertigen Aufgabe fürs eigene
> Fach und dem Wissen, wie das Korrigieren abnimmt. Kein Pitch, kein Verkauf. Du hilfst Kolleg:innen,
> ihren Alltag leichter zu machen. Wer's danach nutzt, entscheidet jede:r selbst.

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

### 1 · Worum es geht — 10 Min (0:00–0:10)
Kein Pitch. Bei der gemeinsamen Belastung ansetzen:
- *„Wir korrigieren alle zu viel und die Schüler üben fürs Abi allein, ohne Rückmeldung."*
- *„Ich hab ein Tool gebaut, das Aufgaben erstellt und nach ISB-Kriterien korrigiert – das will ich euch heute in die Hand geben."*
- *„Am Ende hat jede:r eine fertige Aufgabe fürs eigene Fach. Wenn's hilft, super; wenn nicht, sagt mir warum."*

Ablauf ansagen: **kurz zuschauen → selber machen → eure Aufgabe mitnehmen.**

### 2 · Live-Demo — 20 Min (0:10–0:30)
Du fährst, alle schauen. **Eine durchgehende Schüler-Reise**, am konkreten Nutzen entlang:

1. **(4 Min) Aufgabe generieren.** lehrer.html → Fach + Aufgabentyp wählen → Generieren.
   Erklären, was die KI berücksichtigt (Lehrplan, Bearbeitungszeit, BE) – *das spart die Aufgaben-Bastelei.*
   *Hängt's? Sofort auf die vorab generierte Fallback-Aufgabe wechseln, nicht warten.*
2. **(5 Min) Korrigieren.** Muster-Antwort aus Zwischenablage einfügen → korrigieren lassen.
   Zeigen: **Punkte nach BE, farbig markierte Fehler, Stärken/Schwächen, Übungsvorschläge.**
   Hier verweilen – *das ist die Stunde Korrekturzeit, die wegfällt.*
3. **(4 Min) Eigenes Material.** Foto/PDF einer echten Klausuraufgabe hochladen → KI baut Aufgabe draus.
   *Eigene Sachen bleiben nutzbar, nichts muss neu gemacht werden.*
4. **(4 Min) Dashboard.** Zweites Fenster: Heatmap (grün/gelb/rot), Warnsystem bei <5 NP, Klassenüberblick.
   *So siehst du früh, wer abrutscht – ohne 30 Hefte durchzublättern.*
5. **(3 Min) Kolloquiumstrainer.** Kurz anspielen – KI stellt Prüferfrage, hört zu, bewertet. Hilfe für die mündliche Vorbereitung.

### 3 · Hands-on — 45 Min (0:30–1:15) — **Kernstück, hier entsteht der Nutzen**

**Phase A – Einloggen (0:30–0:40)**
- Alle öffnen `myabiflow.de/lehrer.html` → **Registrieren** (Name, E-Mail, Passwort, Fächer).
- Du hast Telegram offen: pro Registrierung kommt eine Nachricht → **„✅ Freischalten" tippen.**
  Laut sagen: *„Ich schalte euch grad frei – kurz neu einloggen."*
- Stockt jemand? Reihenfolge halten, niemand bleibt hängen.

**Phase B – Eigene Aufgabe bauen (0:40–1:00)**
- Klarer Einzelauftrag an die Tafel:
  > **„Erstelle eine Aufgabe, die du in deiner nächsten Stunde wirklich brauchen kannst."**
- Du läufst rum und hilfst **fachbezogen** – nicht „klick hier", sondern *„was steht bei dir als Nächstes an?"*
- Zwei typische Stolperstellen: Fach/Typ nicht gefunden → gemeinsam suchen. Korrektur „dauert" → ist die Queue, kommt nach paar Sek.
- **Ziel der Phase:** Jede:r hat am Ende eine Aufgabe, die er/sie tatsächlich einsetzen würde.

**Phase C – So kommt's zu den Schülern (1:00–1:15)**
- Jeder legt einen **Klassen-Code** an (Handout Schritt 3) und sieht: *so einfach kriegen die Schüler das.*
- Wer mag, gibt den Code dem Sitznachbarn → der spielt „Schüler" auf myabiflow.de → Ergebnis taucht im Dashboard des Kollegen auf. Der ganze Kreislauf an einem Beispiel.

### 4 · Datenschutz + offene Fragen — 20 Min (1:15–1:35)
Kommt im Kollegium garantiert – **proaktiv ansprechen, bevor jemand fragt:**
- Hosting **Deutschland (Hetzner Nürnberg)**, DSGVO-konform.
- Schülerdaten gehen **nicht** in Werbung/Training.
- Schüler brauchen **kein Konto** – nur Code, Name frei wählbar.
- Beim Kolloquium: Sprachdaten werden zur Auswertung verarbeitet – Schüler vorher informieren.
- Danach offene Runde: alles fragen lassen.

### 5 · Mitnehmen + ehrliches Feedback — 15 Min (1:35–1:50)
- **Sichern, was jede:r gebaut hat:** Wo finde ich meine Aufgabe wieder, wie teile ich sie. Damit der Nutzen nicht im Raum bleibt.
- **Reihum ein Satz:** *„Was würde dir im Alltag wirklich helfen / was hat genervt?"* → das verbessert das Tool für alle.
- Kein Druck, keine Pilot-Liste. Wer Lust hat weiterzumachen, meldet sich von selbst – Tür offen lassen.

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
| Kollege bleibt skeptisch | Nicht überzeugen – es soll helfen, nicht gewinnen. Nutzen sprechen lassen |

---

## Nach dem Workshop
1. **Test-Konten der Kollegen löschen**, falls nur zum Ausprobieren angelegt (DSGVO/Sauberkeit).
2. **Backend zurücksetzen:** Rate-Limit 250→25, Queue 4→1 (sag „Backend zurücksetzen").
3. **Feedback festhalten** – was Kolleg:innen im Alltag wirklich helfen würde, fürs Produkt.
