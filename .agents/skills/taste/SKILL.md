---
name: taste
description: Anti-Slop-Design-Skill für myAbiFlow. Nutze ihn beim Bauen, Redesignen, Polieren oder Auditieren von Marketing-/Landing-/Info-Seiten (landing.html, schulen.html, schueler-praesentation.html, demo.html etc.) und UI im Kolloquiumstrainer. Verhindert die typischen KI-Design-Tells (Em-Dash, AI-Purple, generische Cards, Inter-Default, Fake-Screenshots). Stack-angepasst auf Vanilla HTML + shared.js + shared-v4.css sowie React 19 + Tailwind 4. Triggert auf "Anti-Slop", "Design auffrischen", "sieht nach KI aus", "Landingpage besser machen", "Tells entfernen", "Pre-Flight-Check".
version: 1.0.0
user-invocable: true
argument-hint: "[seite.html | komponente | url]  z.B. landing.html"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, WebFetch
---

# taste – Anti-Slop-Design für myAbiFlow

> Adaptiert aus [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) („The Anti-Slop Frontend Framework").
> Hier reduziert auf die **stack-unabhängigen Prinzipien** und an myAbiFlow angepasst.
> Antworte auf **Deutsch** (Projekt-Regel). Jede Regel ist **kontextabhängig** – erst Brief lesen, dann nur ziehen, was passt.

---

## 0. PROJEKT-KONTEXT (Stack-Anpassung – zuerst lesen)

myAbiFlow hat **zwei** Frontends. Welcher Teil betroffen ist, entscheidet die Umsetzung:

| Bereich | Stack | Was hier gilt |
|---|---|---|
| **Statische Seiten** (Root: `landing.html`, `schulen.html`, `schueler-praesentation.html`, `demo.html`, `agb.html`, `impressum.html`, `dsfa.html`, `tom.html`) | Vanilla HTML + `shared.js` + `shared-v4.css` | Alle Prinzipien gelten, ABER: **kein React/Next/Tailwind/Motion**. Animationen via CSS + IntersectionObserver. Fonts self-hosted via `@font-face`. Bestehende Tokens in `shared-v4.css` wiederverwenden, nicht neu erfinden. |
| **Kolloquiumstrainer** (`abitur-kolloquium-trainer/`) | Vite + React 19 + TS + Tailwind 4 | Hier sind Tailwind-Utilities, React-Komponenten und ggf. eine Motion-Bibliothek legitim. Trainer ist eher Produkt-UI → die Landing-/Hero-Regeln nur dort anwenden, wo es echte Marketing-/Onboarding-Flächen sind. |

**Vor jeder Änderung:** Service-Worker-Regel beachten – bei Änderungen an HTML/`shared.js`/`shared-v4.css` muss `CACHE_NAME` in `sw.js` gebumpt werden. Deploy + Tablet-Optimierung laut `CLAUDE.md`.

---

## 1. BRIEF INFERENCE (Read the Room)

Bevor du Code anfasst: **was will der Nutzer wirklich?** Schlechtes KI-Design entsteht, weil das Modell sofort in eine Default-Ästhetik springt.

1. **Seitentyp** – Marketing-Landing (Schulen/Lehrer), Schüler-Akquise, rechtlich (AGB/Impressum/DSFA), Produkt-UI (Trainer)?
2. **Zielgruppe** – Lehrkräfte/Schulleitungen (Vertrauen, seriös, B2B), Schüler (modern, nahbar, mobil), Behörde/Datenschutz (nüchtern, klar)?
3. **Bestehende Marke** – myAbiFlow hat Flowie, Logo, Splash-Video, definierte Farben/Tokens in `shared-v4.css`. Das ist **Ausgangsmaterial**, kein optionaler Input.
4. **Stille Constraints** – DSGVO/Datenschutz-sensible Zielgruppe, Schulkontext → Vertrauen schlägt Verspieltheit.

**Ein-Satz „Design Read" vor dem Bauen**, z.B.:
*„Lese das als: B2B-Landing für Schulleitungen, vertrauensorientiert, ruhige Variante der myAbiFlow-Marke, bestehende Tokens aus `shared-v4.css`."*

Bei echter Mehrdeutigkeit: **genau eine** Rückfrage. Sonst Design Read deklarieren und loslegen.

### Anti-Default-Disziplin
Greife NICHT automatisch zu: AI-Purple-Verläufen, zentriertem Hero über dunklem Mesh, drei gleichen Feature-Cards, generischem Glassmorphism überall, Inter + slate-900, Endlos-Mikro-Animationen. Das sind die LLM-Defaults.

---

## 2. DIE DREI REGLER

Nach dem Design Read drei Werte setzen (konversationell, nicht in dieser Datei editieren):

* **`DESIGN_VARIANCE`** – 1 = symmetrisch … 10 = asymmetrisch/künstlerisch
* **`MOTION_INTENSITY`** – 1 = statisch … 10 = cinematisch
* **`VISUAL_DENSITY`** – 1 = luftig … 10 = dicht

**Presets für myAbiFlow:**

| Fläche | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Landing Schulen/Lehrer (Vertrauen, B2B) | 5–6 | 4 | 4 |
| Schüler-Seite (modern, nahbar) | 7 | 6 | 3–4 |
| Rechtlich (AGB/Impressum/DSFA/ToM) | 3 | 2 | 5 |
| Trainer-UI / Onboarding | 5 | 5 | 4–5 |

Vertrauensorientierte Flächen bleiben bewusst ruhiger – Schulleitungen sind kein Awwwards-Publikum.

---

## 3. DESIGN-DIREKTIVEN (Bias-Korrektur)

### 3.1 Typografie
* **Kein Inter als Default-Reach**, außer es ist explizit gewünscht oder für Behörden-/Accessibility-Flächen. Für myAbiFlow: die bereits in `shared-v4.css` definierte Schriftfamilie verwenden – nicht ad-hoc eine neue laden.
* **Serif sehr zurückhaltend.** „Wirkt edel/kreativ" ist KEIN Grund. **Fraunces** und **Instrument Serif** sind als Defaults gebannt.
* Betonung im Headline-Wort: **kursiv/fett derselben Schrift**, nie eine fremde Serif in eine Sans-Headline mischen.
* **Italic-Unterlängen-Clearance:** kursive Display-Wörter mit `y g j p q` brauchen min. `line-height: 1.1` + etwas `padding-bottom`, sonst clippen die Unterlängen.

### 3.2 Farbe
* **Max. 1 Akzentfarbe.** Bestehende myAbiFlow-Akzente aus `shared-v4.css` nutzen.
* **Die Lila-Regel:** kein automatischer „AI-Purple/Blau-Glow". Neutrale Basis + ein hochkontrastiger Akzent. (Override: wenn die Marke explizit den Ton hat.)
* **Consistency Lock:** ein Akzent auf der GANZEN Seite. Kein blaues CTA in Sektion 7, wenn der Rest warmgrau ist.

### 3.3 Layout
* **Anti-Center-Bias** bei `DESIGN_VARIANCE > 4`: Split-Screen, links-Text/rechts-Asset, asymmetrischer Weißraum statt immer zentriert. (Override: zentriert OK für Manifest-/Announcement-Hero.)
* **Keine 3 gleichen Feature-Cards** nebeneinander – die generische „drei identische Karten"-Reihe ist gebannt. Stattdessen Zickzack, asymmetrisches Grid, oder Bento mit Rhythmus.
* **Section-Layout-Wiederholung:** eine Layout-Familie max. 1× pro Seite. Eine Seite mit 8 Sektionen nutzt ≥ 4 verschiedene Familien.
* **Zickzack-Cap:** max. 2 aufeinanderfolgende „Bild+Text-Split"-Sektionen, dann brechen.
* **Shape Lock:** EIN Radius-System für die ganze Seite (alles scharf / alles soft / Pills für Interaktiv – mit dokumentierter Regel).

### 3.4 Hero-Disziplin (Hard Rules)
* **Hero passt in den ersten Viewport.** Headline ≤ 2 Zeilen, Subtext ≤ 20 Wörter und ≤ 4 Zeilen, CTA ohne Scroll sichtbar.
* **Max. 4 Textelemente** im Hero: (Eyebrow ODER Brand-Strip), Headline, Subtext, CTAs (1 primär + max. 1 sekundär). **Gebannt im Hero:** Mini-Tagline unter CTAs, Trust-Microstrip, Feature-Bullets, Avatar-Reihe → eigene Sektion darunter.
* **„Genutzt von / Vertraut von"-Logowall** gehört UNTER den Hero, nicht hinein.
* **Hero-Top-Padding** max. ~6rem desktop, sonst schwebt der Inhalt.
* **Navigation einzeilig** am Desktop, Höhe ≤ 80px.

### 3.5 Interaktive Zustände
Immer den vollen Zyklus bauen, nicht nur „Success":
* **Loading:** Skeleton in Ziel-Form, kein generischer Spinner.
* **Empty/Error:** sauber komponiert, inline bei Formularen.
* **Tactile:** auf `:active` ein `translateY(1px)` / `scale(0.98)`.
* **Button-Kontrast (a11y, Pflicht):** jedes CTA WCAG AA (4.5:1 Text, 3:1 für ≥18px). Kein Weiß-auf-Weiß, kein transparenter Button ohne Border über Foto.
* **CTA bricht nicht um** am Desktop (Label kürzen oder Button breiter).
* **Keine doppelte CTA-Intention:** „Jetzt testen" + „Loslegen" + „Kostenlos starten" = dieselbe Intention → ein Label pro Intention auf der ganzen Seite.
* **Formulare:** Label ÜBER Input, Fehler DARUNTER, nie Placeholder-als-Label. Eingabefelder min. `font-size: 16px` (Tablet-Zoom-Schutz, siehe `CLAUDE.md`).

### 3.6 Theme-Konsistenz
Eine Seite = ein Theme. Keine Sektion invertiert mitten im Scroll. Kein reines `#000`/`#fff` – Off-Black/Off-White für Tiefe.

---

## 4. BILDER & ASSETS
* **Echte Bilder statt Div-Attrappen.** Auch minimalistische Seiten brauchen echte Bilder (Hero + 1–2 Stütz-Assets). Bestehende myAbiFlow-Assets (Flowie, Screenshots, Splash) nutzen.
* **Div-basierte Fake-Screenshots sind gebannt** – nie eine Produkt-UI aus gestylten `<div>`-Rechtecken nachbauen. Echter Screenshot, echtes Mini-Component-Preview, oder weglassen.
* **Keine handgemalten Deko-SVGs** als Default. Icons aus einer Bibliothek, nicht selbst Pfade zeichnen, eine Familie pro Projekt.
* **Logowall = nur Logos**, keine Branchen-Labels darunter.

---

## 5. KI-TELLS (gebannt, außer der Brief verlangt es explizit)

### 5.1 Der Em-Dash-Bann (wichtigste Regel)
**Geviertstrich `—` ist KOMPLETT verboten** – in Headlines, Eyebrows, Pills, Body, Zitaten, Attribution, Captions, Button-Text, Alt-Text. Auch Halbgeviertstrich `–` als Trenner (Datumsbereiche/Zahlen → normaler Bindestrich `-`). Erlaubt sind nur normaler Bindestrich `-` und Minuszeichen in Mathe. **Ein einziges `—` irgendwo sichtbar = Pre-Flight-Fail.** (Binär, nicht „sparsam".)

### 5.2 Visuell
* Kein Neon/Outer-Glow als Default. Kein reines `#000`. Keine übersättigten Akzente. Kein exzessiver Gradient-Text. Keine Custom-Mauszeiger.

### 5.3 Eyebrows & Micro-Labels
* **Eyebrow-Rationierung:** max. 1 Eyebrow pro 3 Sektionen (Hero zählt als 1). Sonst entstehen identische Templates-Rhythmen. Im Zweifel: weglassen, die Headline reicht.
* **Keine Section-Nummern** (`001 · Capabilities`, `06 · how it works`, `00 / INDEX`).
* **Keine `01 / 4`-Paginierung** auf Bildern/Tiles. Keine `Scroll · 001`-Cues.
* **Mittelpunkt `·` rationiert** – max. 1 pro Metadaten-Zeile, nicht als Default-Trenner für alles.
* **Keine Deko-Status-Dots** vor jedem Nav-Link/Listenpunkt/Badge. Nur bei echtem semantischem Status.

### 5.4 Copy-Tells
* **Keine generischen Namen** („John Doe", „Sarah Chan") → realistische, lokal passende Namen (für myAbiFlow: deutsche Schüler-/Lehrernamen).
* **Keine generischen Startup-Namen** („Acme", „Nexus", „SmartFlow").
* **Keine Füll-Verben** („Elevate", „Seamless", „Unleash", „Next-Gen", „Revolutionize") → konkrete Verben.
* **Keine fake-präzisen Zahlen** (`92%`, `4.1×`) ohne echte Datenquelle oder `<!-- mock -->`-Label.
* **Keine performativ-poetischen Labels** („Field notes", „From the field", „Quietly trusted by") → schlichte Funktionslabels („Erfahrungsberichte", „Aktuelles").
* **Keine Scroll-Cues** („Scroll", „↓ scroll", „Scroll to explore").
* **Keine Version-Labels im Hero** (`BETA`, `v2.0`, `EARLY ACCESS`), außer es ist ein echter Launch.
* **Keine Locale/Zeit/Wetter-Strips** („Lisbon 14:23 · 18°C"), außer der Brief ist standortbezogen.
* **Copy Self-Audit (Pflicht vor Ship):** jeden sichtbaren String nochmal lesen – grammatisch kaputtes, halluziniertes oder gekünstelt-poetisches Zeug rauswerfen. Im Zweifel schlichten Funktionssatz.

### 5.5 Listen & Daten
* **Kein `border-t` + `border-b` auf jeder Zeile** langer Listen/Spec-Tabellen.
* **Listen > 5 Items** brauchen eine andere UI (2-Spalten-Gruppen, Card-Grid, Tabs/Akkordeon, Scroll-Snap-Pills), nicht ein längeres `<ul>`.
* **Keine 20-Zeilen-Datentabellen** auf Marketing-Seiten – Top 3–5 + „Alle anzeigen".

---

## 6. MOTION (stack-spezifisch)

* **Motion muss motiviert sein:** jede Animation in einem Satz begründbar (Hierarchie / Storytelling / Feedback / Zustandswechsel). „Sah cool aus" zählt nicht.
* **Statische Seiten (Vanilla):** CSS-`transition`/`@keyframes` + `IntersectionObserver` für Scroll-Reveals. **Nie** `window.addEventListener('scroll', …)` für Frame-Arbeit (Jank). Nur `transform`/`opacity` animieren.
* **Trainer (React):** falls eine Motion-Lib genutzt wird, kontinuierliche Werte (Maus/Scroll) NICHT über `useState`. Animationen in isolierten Client-Leafs.
* **Reduced Motion (Pflicht):** alles über `MOTION_INTENSITY > 3` respektiert `@media (prefers-reduced-motion: reduce)` → kollabiert auf statisch.
* **Marquee max. 1× pro Seite.** Endlos-Loops nicht auf jeder Card.

---

## 7. PERFORMANCE & A11Y
* Nur `transform`/`opacity` animieren, nie `top/left/width/height`.
* `will-change` sparsam. Grain/Noise nur auf `fixed`, `pointer-events:none`-Layern, nie auf scrollenden Containern.
* WCAG AA für Body-Text, AAA-Ziel für Hero-Copy, in beiden Modi falls Dark Mode.
* Tablet-Regeln aus `CLAUDE.md` sind Pflicht: Touch-Targets ≥ 44×44px, Inputs ≥ 16px, kein Hover-Only, `env(safe-area-inset-*)`, beide Orientierungen.
* Lighthouse vor „fertig": LCP < 2.5s, INP < 200ms, CLS < 0.1.

---

## 8. REDESIGN-PROTOKOLL (bestehende Seiten)

myAbiFlow-Seiten existieren bereits → meist **Redesign, nicht Greenfield**.

* **Erst auditieren:** bestehende Marken-Tokens (`shared-v4.css`), IA, Conversion-Pfade, was Arbeit leistet vs. Füller, SEO-Baseline (Titles/Meta/Structured Data).
* **Bewahren:** IA, URL-Slugs, Anchor-IDs, primäre Nav-Labels, Marken-Akzentfarbe (Lila-Override greift, wenn Marke den Ton hat), Copy-Stimme, bestehende A11y-Wins, Analytics-relevante Element-IDs/Namen.
* **Nie still ändern:** URL-Struktur, Nav-Labels, Formularfeld-Namen/-Reihenfolge, Logo, rechtliche/Consent-Texte.
* **Modernisierungs-Hebel (Reihenfolge):** 1) Typo, 2) Spacing/Rhythmus, 3) Farb-Recalibration, 4) Motion-Layer, 5) Hero/Key-Section neu, 6) voller Block-Ersatz (nur wenn unrettbar).

---

## 9. PRE-FLIGHT-CHECK (vor dem Ausliefern)

Jede Box ehrlich abhaken. Bei einem Fail: erst fixen, dann liefern.

- [ ] **Design Read** in einem Satz deklariert?
- [ ] **Regler** explizit & aus dem Brief begründet (nicht still Default)?
- [ ] **Richtiger Stack** beachtet (Vanilla-Seite vs. React-Trainer)?
- [ ] **ZERO Em-Dashes (`—`/`–`)** irgendwo sichtbar?
- [ ] **Ein Theme** für die ganze Seite, keine invertierte Sektion?
- [ ] **Ein Akzent**, konsistent über alle Sektionen?
- [ ] **Ein Radius-System** konsistent?
- [ ] **Button-Kontrast** WCAG AA, kein CTA-Umbruch am Desktop?
- [ ] **Keine doppelte CTA-Intention?**
- [ ] **Formular-Kontrast** AA, Label über Input, Inputs ≥ 16px?
- [ ] **Serif-Disziplin** (nicht Fraunces/Instrument Serif ohne Begründung)?
- [ ] **Italic-Unterlängen-Clearance** geprüft?
- [ ] **Hero** passt in Viewport (Headline ≤ 2 Zeilen, Subtext ≤ 20 Wörter, CTA sichtbar)?
- [ ] **Hero-Stack** ≤ 4 Textelemente, keine Tagline/Trust-Strip im Hero?
- [ ] **Eyebrow-Count** ≤ ceil(Sektionen / 3)?
- [ ] **Keine Section-Nummern / Scroll-Cues / Version-Labels / Locale-Strips?**
- [ ] **Keine 3 gleichen Cards**, ≥ 4 Layout-Familien bei 8 Sektionen, Zickzack ≤ 2 in Folge?
- [ ] **Logowall = nur Logos**, unter dem Hero?
- [ ] **Echte Bilder**, keine Div-Fake-Screenshots, keine Deko-SVGs?
- [ ] **Lange Listen** in passender UI (nicht `<ul>`/`divide-y` bei > 5)?
- [ ] **Keine `border-t`+`border-b` auf jeder Zeile?**
- [ ] **Copy Self-Audit** gemacht (kein halluziniertes/poetisches/Füllverb-Zeug)?
- [ ] **Motion motiviert**, Reduced Motion respektiert, kein `addEventListener('scroll')` für Frames?
- [ ] **Marquee ≤ 1×?**
- [ ] **Icons** aus einer Bibliothek, eine Familie?
- [ ] **Tablet-Regeln** (`CLAUDE.md`): Touch-Targets ≥ 44px, beide Orientierungen, Safe-Areas?
- [ ] **Bei Änderung an HTML/`shared.js`/`shared-v4.css`:** `CACHE_NAME` in `sw.js` gebumpt?
- [ ] **Core Web Vitals** plausibel (LCP/INP/CLS)?

Kann eine Box nicht ehrlich abgehakt werden, ist die Seite nicht fertig.

---

## 10. OUT OF SCOPE

Dieser Skill ist NICHT für: dichte Datentabellen, Admin-/Dashboard-UI, mehrstufige Wizards, Code-Editoren, native Mobile. Wenn der Brief das ist → sag es explizit und wende nur die Marketing-/Landing-Teile dort an, wo sie passen.
