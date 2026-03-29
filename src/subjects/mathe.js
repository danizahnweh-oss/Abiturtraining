import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { gradeWithWolframVerification } from '../handlers/wolfram-grading.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis, zeitanpassung, skaliereTokens, KEINE_LOESUNGSHINWEISE } from '../config.js';

export async function handleGenerateMathe(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!\nVERBOTEN: Aufgaben zu Themen erstellen, die NICHT in der obigen Liste stehen. Wenn z.B. "Kurvendiskussion" gewählt ist, erstelle KEINE Wachstums-/Abklingaufgaben!'
    : '';

  // Mehrere Beispiele je Unterpunkt für maximale Varianz (zufällige Auswahl)
  const analysisBeispiele = {
    'Ableitungsregeln und Ableitungsfunktion': [
      {
        aufgabe: 'Ein Architekt entwirft eine geschwungene Fassade. Die Höhe $h$ der Fassade (in Metern) wird im Bereich $0 \\le x \\le 20$ ($x$ in Metern ab dem linken Rand) durch $h(x) = -0{,}004x^{3} + 0{,}12x^{2} - 0{,}5x + 8$ beschrieben.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Stellen, an denen die Fassade am steilsten ansteigt bzw. abfällt.', be: 4},
          {id: 'b)', text: 'Der Architekt möchte wissen, an welcher Stelle die Krümmung der Fassade wechselt. Ermitteln Sie diese Stelle.', be: 4}
        ]
      },
      {
        aufgabe: 'Ein Radweg verläuft entlang eines Flussufers. Das Höhenprofil $h$ des Weges (in Metern über NN) wird im Abschnitt $0 \\le x \\le 12$ ($x$ in Kilometern) durch $h(x) = 0{,}5x^{3} - 6x^{2} + 18x + 200$ modelliert.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Steigung des Radwegs an der Stelle $x = 2$ und interpretieren Sie das Ergebnis.', be: 3},
          {id: 'b)', text: 'Ein Rennradfahrer möchte wissen, an welchen Stellen der Weg am steilsten bergauf bzw. bergab führt. Ermitteln Sie diese Stellen.', be: 5}
        ]
      },
      {
        aufgabe: 'Die Temperatur $T$ (in °C) in einem Gewächshaus wird an einem Sommertag im Zeitraum $0 \\le t \\le 14$ ($t$ in Stunden ab 6:00 Uhr) durch $T(t) = -0{,}08t^{3} + 1{,}2t^{2} - 2t + 18$ beschrieben.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die momentane Änderungsrate der Temperatur um 10:00 Uhr.', be: 3},
          {id: 'b)', text: 'Der Gärtner möchte wissen, wann die Temperatur am schnellsten steigt. Ermitteln Sie diesen Zeitpunkt.', be: 5}
        ]
      },
      {
        aufgabe: 'Ein Physiker untersucht die Bewegung eines Modellautos auf einer Teststrecke. Die Position $s$ (in Metern) des Autos wird im Zeitraum $0 \\le t \\le 8$ ($t$ in Sekunden) durch $s(t) = \\frac{1}{3}t^{3} - 4t^{2} + 15t$ beschrieben.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Geschwindigkeit und die Beschleunigung des Modellautos zum Zeitpunkt $t = 3$.', be: 4},
          {id: 'b)', text: 'Ermitteln Sie, zu welchem Zeitpunkt das Auto seine maximale Geschwindigkeit erreicht.', be: 4}
        ]
      }
    ],
    'Kurvendiskussion (Extrema, Wendepunkte, Monotonie)': [
      {
        aufgabe: 'Eine Halfpipe in einem Skatepark hat im Querschnitt die Form des Graphen der Funktion $f$ mit $f(x) = \\frac{1}{8}x^{4} - x^{2} + 2$ ($x$ in Metern, $-3 \\le x \\le 3$). Die Höhe $f(x)$ gibt die Höhe des Randes in Metern über dem Boden an.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die tiefste Stelle der Halfpipe und geben Sie deren Höhe über dem Boden an.', be: 4},
          {id: 'b)', text: 'Ermitteln Sie die Bereiche, in denen ein Skater bergab bzw. bergauf fährt.', be: 4},
          {id: 'c)', text: 'Bestimmen Sie die Stellen, an denen die Krümmung der Halfpipe wechselt, und interpretieren Sie das Ergebnis im Sachzusammenhang.', be: 5}
        ]
      },
      {
        aufgabe: 'Ein Landschaftsarchitekt plant einen künstlichen Hügel in einem Park. Das Querschnittsprofil wird durch $f(x) = -0{,}02x^{4} + 0{,}8x^{2}$ ($x$ in Metern, $-5 \\le x \\le 5$) beschrieben, wobei $f(x)$ die Höhe in Metern über dem Bodenniveau angibt.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die maximale Höhe des Hügels und die Stelle, an der sie erreicht wird.', be: 4},
          {id: 'b)', text: 'Ermitteln Sie die Breite des Hügels auf Bodenniveau.', be: 3},
          {id: 'c)', text: 'Ein Wanderweg soll dort angelegt werden, wo der Hügel am steilsten ist. Bestimmen Sie diese Stellen.', be: 5}
        ]
      },
      {
        aufgabe: 'Der Querschnitt eines Flussbetts wird im Bereich $-4 \\le x \\le 4$ ($x$ in Metern) durch die Funktion $f$ mit $f(x) = 0{,}25x^{4} - 2x^{2} - 1$ modelliert. Dabei gibt $f(x)$ die Tiefe in Metern unter der Wasseroberfläche an (negative Werte = unter Wasser).',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die tiefste Stelle des Flussbetts.', be: 3},
          {id: 'b)', text: 'Untersuchen Sie, ob das Flussbett eine oder mehrere tiefe Rinnen aufweist.', be: 5},
          {id: 'c)', text: 'Ermitteln Sie die Stellen, an denen das Flussbett seine steilsten Böschungen hat.', be: 4}
        ]
      },
      {
        aufgabe: 'Ein Unternehmen stellt Designvasen her. Der Querschnitt einer Vase wird durch $f(x) = x^{3} - 9x^{2} + 27x - 15$ ($0 \\le x \\le 7$, $x$ in cm) beschrieben, wobei $f(x)$ den Radius der Vase in cm auf Höhe $x$ angibt.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die engste und die weiteste Stelle der Vase.', be: 5},
          {id: 'b)', text: 'Untersuchen Sie, ob die Vase eine bauchige oder eine schlanke Form hat, indem Sie die Wendestelle bestimmen.', be: 4},
          {id: 'c)', text: 'Ermitteln Sie die Bereiche, in denen sich die Vase nach oben hin verengt bzw. weitet.', be: 3}
        ]
      },
      {
        aufgabe: 'Die Geschwindigkeit $v$ (in km/h) eines Zuges auf einer Teststrecke wird im Zeitraum $0 \\le t \\le 10$ ($t$ in Minuten) durch $v(t) = -0{,}3t^{3} + 3{,}6t^{2} - 7{,}2t + 60$ modelliert.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die maximale und die minimale Geschwindigkeit des Zuges im gegebenen Zeitraum.', be: 5},
          {id: 'b)', text: 'Ermitteln Sie die Zeitintervalle, in denen der Zug beschleunigt bzw. bremst.', be: 4},
          {id: 'c)', text: 'Bestimmen Sie den Zeitpunkt, an dem die Beschleunigung des Zuges am größten ist.', be: 4}
        ]
      }
    ],
    'Integralrechnung (Stammfunktion, Flächenberechnung)': [
      {
        aufgabe: 'Bei einem Starkregenereignis wird die Zuflussrate $z$ (in m³/h) in ein Regenrückhaltebecken gemessen. Im Zeitraum $0 \\le t \\le 6$ ($t$ in Stunden) lässt sich die Zuflussrate modellhaft durch $z(t) = -2t^{2} + 10t + 3$ beschreiben.',
        teilaufgaben: [
          {id: 'a)', text: 'Berechnen Sie die Gesamtmenge an Wasser, die in den ersten vier Stunden in das Becken fließt.', be: 4},
          {id: 'b)', text: 'Ab einer Zuflussrate von $15$ m³/h droht das Becken überzulaufen. Bestimmen Sie den Zeitraum, in dem Überlaufgefahr besteht.', be: 5}
        ]
      },
      {
        aufgabe: 'Ein Solarpanel erzeugt im Laufe eines Tages eine Leistung $P$ (in kW), die im Zeitraum $0 \\le t \\le 14$ ($t$ in Stunden ab 6:00 Uhr) durch $P(t) = -0{,}04t^{3} + 0{,}48t^{2} - 0{,}2t$ modelliert wird.',
        teilaufgaben: [
          {id: 'a)', text: 'Berechnen Sie die gesamte Energie (in kWh), die das Solarpanel an diesem Tag erzeugt.', be: 4},
          {id: 'b)', text: 'Ein Haushalt benötigt eine konstante Leistung von $1{,}5$ kW. Bestimmen Sie den Zeitraum, in dem das Panel mehr Leistung erzeugt, als der Haushalt verbraucht.', be: 5},
          {id: 'c)', text: 'Berechnen Sie die überschüssige Energiemenge, die in diesem Zeitraum ins Netz eingespeist werden kann.', be: 5}
        ]
      },
      {
        aufgabe: 'Ein Stausee wird über einen Zufluss gespeist und über eine Turbine entleert. Die Zuflussrate beträgt konstant $8$ m³/s. Die Abflussrate $a$ (in m³/s) wird im Zeitraum $0 \\le t \\le 10$ ($t$ in Stunden) durch $a(t) = 3t^{2} - 24t + 56$ beschrieben.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Zeitpunkte, zu denen die Abflussrate gleich der Zuflussrate ist.', be: 4},
          {id: 'b)', text: 'Ermitteln Sie, in welchem Zeitraum der Wasserstand im Stausee steigt.', be: 3},
          {id: 'c)', text: 'Berechnen Sie die Wasserstandsänderung (in m³) im Zeitraum von $t = 2$ bis $t = 6$.', be: 5}
        ]
      },
      {
        aufgabe: 'Bei einem Marathon wird die Laufgeschwindigkeit $v$ (in km/h) eines Läufers im Zeitraum $0 \\le t \\le 4$ ($t$ in Stunden) durch $v(t) = -1{,}5t^{2} + 3t + 12$ modelliert.',
        teilaufgaben: [
          {id: 'a)', text: 'Berechnen Sie die Strecke, die der Läufer in den ersten zwei Stunden zurücklegt.', be: 4},
          {id: 'b)', text: 'Ermitteln Sie, nach welcher Zeit der Läufer die Halbmarathon-Distanz von $21{,}1$ km erreicht.', be: 5}
        ]
      }
    ],
    'Funktionsscharen und Parameter': [
      {
        aufgabe: 'Ein Ingenieur modelliert verschiedene Brückenprofile durch die Funktionenschar $f_a$ mit $f_a(x) = -a \\cdot x^{2} \\cdot (x - 6)$ für $0 \\le x \\le 6$ ($a > 0$, $x$ in Metern). Der Parameter $a$ bestimmt die Höhe des Brückenprofils.',
        teilaufgaben: [
          {id: 'a)', text: 'Zeigen Sie, dass alle Brückenprofile der Schar die gleiche Spannweite haben.', be: 3},
          {id: 'b)', text: 'Bestimmen Sie den Wert von $a$, für den die Brücke eine maximale Höhe von $4$ Metern erreicht.', be: 5}
        ]
      },
      {
        aufgabe: 'Eine Firma produziert parabelförmige Satellitenschüsseln. Der Querschnitt wird durch die Funktionenschar $f_a(x) = a \\cdot x^{2}$ ($a > 0$) beschrieben. Die Schüssel hat jeweils einen Durchmesser von $80$ cm.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Tiefe der Schüssel in Abhängigkeit von $a$.', be: 3},
          {id: 'b)', text: 'Der Brennpunkt einer Parabel $y = a \\cdot x^{2}$ liegt bei $\\frac{1}{4a}$. Bestimmen Sie $a$ so, dass der Brennpunkt genau $20$ cm über dem Scheitel liegt.', be: 4},
          {id: 'c)', text: 'Berechnen Sie das Volumen der Schüssel (Rotationskörper) für den in b) bestimmten Wert von $a$.', be: 5}
        ]
      },
      {
        aufgabe: 'Ein Architekturbüro entwirft Torbögen. Die Form jedes Bogens wird durch $f_k(x) = -k \\cdot x^{2} + 4k$ ($k > 0$, $x$ in Metern) modelliert.',
        teilaufgaben: [
          {id: 'a)', text: 'Zeigen Sie, dass die Höhe aller Torbögen der Schar proportional zu ihrer Spannweite ist.', be: 4},
          {id: 'b)', text: 'Ein Lastwagen mit $3{,}5$ m Höhe und $2{,}4$ m Breite muss durch den Bogen passen. Bestimmen Sie den kleinsten Wert von $k$, für den dies möglich ist.', be: 5}
        ]
      },
      {
        aufgabe: 'In einem Wasserpark werden Rutschen mit verschiedenen Steilheiten gebaut. Die Rutschbahn wird durch $f_t(x) = t \\cdot x^{3} - 3t \\cdot x^{2}$ ($t > 0$, $0 \\le x \\le 3$, $x$ in Metern) modelliert, wobei $f_t(x)$ die Höhe in Metern angibt.',
        teilaufgaben: [
          {id: 'a)', text: 'Zeigen Sie, dass alle Rutschen der Schar am gleichen Punkt den Boden berühren.', be: 3},
          {id: 'b)', text: 'Bestimmen Sie den Wendepunkt der Rutsche in Abhängigkeit von $t$ und beschreiben Sie dessen Bedeutung.', be: 4},
          {id: 'c)', text: 'Ein Sicherheitstest erfordert, dass die maximale Steigung der Rutsche $60°$ nicht überschreitet. Bestimmen Sie den größtmöglichen Wert von $t$.', be: 5}
        ]
      }
    ],
    'Wachstums- und Abnahmeprozesse (e-Funktion, ln)': [
      {
        aufgabe: 'Ein Pharmaunternehmen testet einen neuen Wirkstoff. Die Wirkstoffkonzentration $c$ (in mg/l) im Blut wird im Zeitraum $0 \\le t \\le 24$ ($t$ in Stunden) durch $c(t) = 5{,}4 \\cdot t \\cdot e^{-0{,}35t}$ beschrieben. Ab $2$ mg/l gilt der Wirkstoff als therapeutisch wirksam.',
        teilaufgaben: [
          {id: 'a)', text: 'Ermitteln Sie den Zeitraum, in dem der Wirkstoff therapeutisch wirksam ist.', be: 4},
          {id: 'b)', text: 'Überprüfen Sie, ob die maximale Konzentration tatsächlich etwa zwei Stunden nach Einnahme erreicht wird.', be: 4}
        ]
      },
      {
        aufgabe: 'In einem See wird die Konzentration $k$ eines Schadstoffs (in µg/l) nach einem Chemieunfall gemessen. Für $t \\ge 0$ ($t$ in Tagen) gilt $k(t) = 120 \\cdot e^{-0{,}08t}$. Der Grenzwert für unbedenkliches Wasser liegt bei $10$ µg/l.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie, nach wie vielen Tagen der Grenzwert erstmals unterschritten wird.', be: 4},
          {id: 'b)', text: 'Berechnen Sie die mittlere Schadstoffkonzentration in den ersten $20$ Tagen.', be: 5},
          {id: 'c)', text: 'Beurteilen Sie, ob das Modell für große Zeitwerte realistisch ist.', be: 3}
        ]
      },
      {
        aufgabe: 'Eine Bäckerei untersucht den Abkühlvorgang frisch gebackener Brote. Die Temperatur $T$ (in °C) eines Brotes lässt sich für $t \\ge 0$ ($t$ in Minuten) durch $T(t) = 22 + 178 \\cdot e^{-0{,}03t}$ modellieren. Die Raumtemperatur beträgt $22$ °C.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie, nach welcher Zeit das Brot auf $50$ °C abgekühlt ist.', be: 4},
          {id: 'b)', text: 'Berechnen Sie die momentane Abkühlungsrate $15$ Minuten nach dem Backen.', be: 3},
          {id: 'c)', text: 'Erklären Sie anhand des Modells, warum das Brot anfangs schneller abkühlt als später.', be: 4}
        ]
      },
      {
        aufgabe: 'Eine Biologin untersucht das Wachstum einer Bakterienkultur. Die Anzahl $N$ der Bakterien (in Tausend) wird für $t \\ge 0$ ($t$ in Stunden) durch $N(t) = \\frac{500}{1 + 24 \\cdot e^{-0{,}6t}}$ modelliert (logistisches Wachstum).',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie die Anfangsanzahl der Bakterien und die maximale Kapazität der Kultur.', be: 3},
          {id: 'b)', text: 'Ermitteln Sie den Zeitpunkt, an dem die Bakterienkultur am schnellsten wächst.', be: 5},
          {id: 'c)', text: 'Vergleichen Sie das logistische Modell mit einem rein exponentiellen Wachstumsmodell und beurteilen Sie die Unterschiede.', be: 4}
        ]
      },
      {
        aufgabe: 'Ein Mobilfunkanbieter untersucht die Verbreitung einer neuen App. Die Anzahl $A$ der aktiven Nutzer (in Tausend) wird für $t \\ge 0$ ($t$ in Wochen nach Launch) durch $A(t) = 80 \\cdot t \\cdot e^{-0{,}15t}$ modelliert.',
        teilaufgaben: [
          {id: 'a)', text: 'Bestimmen Sie, wann die App die meisten aktiven Nutzer hat.', be: 4},
          {id: 'b)', text: 'Ab einer Nutzerzahl von $50\\,000$ ist die App profitabel. Bestimmen Sie den Zeitraum, in dem dies der Fall ist.', be: 5},
          {id: 'c)', text: 'Berechnen Sie die durchschnittliche Nutzerzahl in den ersten $20$ Wochen.', be: 5}
        ]
      }
    ]
  };

  // Zufälliges Beispiel aus dem Array wählen
  function getBeispielForUnterpunkte(up) {
    if (!up || up.length === 0) return null;
    for (const u of up) {
      const arr = analysisBeispiele[u];
      if (arr && arr.length > 0) {
        return arr[Math.floor(Math.random() * arr.length)];
      }
    }
    return null;
  }

  const sg = sachgebiet || "analysis";
  const customBeispiel = (sg === 'analysis' || sg.includes('analysis')) ? getBeispielForUnterpunkte(unterpunkte) : null;
  const totalBE = be || 25;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const minTeilaufgaben = Math.max(3, Math.ceil(totalBE / 6));
  const maxTeilaufgaben = Math.max(minTeilaufgaben, Math.ceil(totalBE / 3));

  const sgThemen = {
    analysis: {
      title: "Analysis",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.1.1: Ganzrationale Funktionen (mit Parametern), Stammfunktionen, Funktionenscharen
- M12.1.2: Natürliche Exponentialfunktion, Produkt-/Kettenregel, Wachstums-/Abklingmodelle, Grenzwerte
- M12.1.3: Sinus-/Kosinusfunktion (Ableitungen, einfache Verknüpfungen)
- M12.4.1: Gebrochen-rationale Funktionen, Quotientenregel
- M12.4.2: Wurzelfunktion, Umkehrfunktion, Potenzfunktionen mit rationalen Exponenten
- M12.4.3: Natürliche Logarithmusfunktion als Umkehrfunktion von e^x
Lehrplan-Inhalte Jgst. 13:
- M13.1: Bestimmtes Integral als Flächenbilanz, Hauptsatz, Stammfunktionen, Flächenberechnung, uneigentliche Integrale, Rotationsvolumen
- M13.4: Anwendungen der Differential-/Integralrechnung, Parameterfunktionen, Extremwertprobleme`,
      kontexte: `Wachstums-/Abklingmodelle (Bakterienkultur, Medikament im Blut, Bevölkerung), CO₂-/Feinstaub-Messung, Produktionskosten/-gewinn, Geschwindigkeit und zurückgelegte Strecke, Wasserstand/Pegelstand, Temperaturverlauf, Höhenprofil einer Straße/Rutsche`
    },
    stochastik: {
      title: "Stochastik",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.2: Zufallsgrößen, Wahrscheinlichkeitsverteilung, Erwartungswert, Varianz, Standardabweichung, Bernoulli-Ketten, Binomialverteilung, Binomialkoeffizienten
- M12.3: Einseitiger Signifikanztest, Nullhypothese, Fehler 1. und 2. Art, Ablehnungsbereich, Signifikanzniveau
Lehrplan-Inhalte Jgst. 13:
- M13.2: Normalverteilung, diskrete vs. stetige Zufallsgrößen, Dichtefunktion, kumulative Verteilungsfunktion, Sigma-Regeln`,
      kontexte: `Verkehrszählung (Radfahrer, Helme, E-Bikes), Qualitätskontrolle (Produktionsfehler, fehlerhafte Verpackungen), Wahlumfragen, medizinische Tests (Schnelltest-Zuverlässigkeit), Versicherungen (Pedelecs, Schadenshäufigkeit), Schulveranstaltung (Lose, Glücksrad, CD-Verkauf)`
    },
    geometrie: {
      title: "Geometrie",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.5: Punkte/Figuren/Körper im 3D-Koordinatensystem, Vektoren (Addition, Skalarprodukt, Kreuzprodukt, Betrag), Winkel, Flächeninhalte, Volumina
Lehrplan-Inhalte Jgst. 13:
- M13.3: Geraden und Ebenen (Parameter-, Normalen-, Koordinatenform), Lagebeziehungen, Schnittpunkte/-geraden, Schnittwinkel, Abstände (Punkt-Gerade, Punkt-Ebene, windschiefe Geraden, Hesse'sche Normalform), Kugeln (Koordinatenform, Lage zu Geraden/Ebenen)`,
      kontexte: `Theaterkulisse mit Licht/Schatten, Hügel/Berg mit Weinanbau und Burg, Dach-/Gebäudemodell, Sonnensegel/Zeltdach, Brückenkonstruktion, Aussichtsturm/Sichtlinie, Rampe/Auffahrt`
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.analysis;

  // Beispiel-JSON für den Prompt zusammenbauen (passt sich an gewählte Unterpunkte an)
  const defaultBeispiel = {
    aufgabe: 'Ein Pharmaunternehmen testet einen neuen Wirkstoff. Nach der Einnahme einer Tablette wird die Wirkstoffkonzentration $c$ (in mg/l) im Blut gemessen. Im Zeitraum $0 \\\\le t \\\\le 24$ ($t$ in Stunden nach der Einnahme) lässt sich die Konzentration modellhaft durch die Funktion $c$ mit $c(t) = 5{,}4 \\\\cdot t \\\\cdot e^{-0{,}35t}$ beschreiben. Ab einer Konzentration von $2$ mg/l gilt der Wirkstoff als therapeutisch wirksam.',
    teilaufgaben: [
      {id: 'a)', text: 'Ermitteln Sie den Zeitraum, in dem der Wirkstoff therapeutisch wirksam ist.', be: 4},
      {id: 'b)', text: 'Der Beipackzettel gibt an, dass die maximale Konzentration etwa zwei Stunden nach der Einnahme erreicht wird. Überprüfen Sie diese Angabe mithilfe des Modells.', be: 4},
      {id: 'c)', text: 'Die Gesamtbelastung des Körpers wird durch die Fläche unter dem Konzentrationsgraphen beschrieben. Bei dem alten Wirkstoff beträgt diese Belastung im gleichen Zeitraum $38$ mg·h/l. Vergleichen Sie die Belastung durch den neuen Wirkstoff mit der des alten.', be: 5},
      {id: 'd)', text: 'Eine Ärztin schlägt vor, nach $12$ Stunden eine zweite Tablette einzunehmen. Die Gesamtkonzentration ergibt sich dann aus der Summe beider Einzelkonzentrationen. Beurteilen Sie, ob dabei die kritische Grenze von $8$ mg/l überschritten werden könnte.', be: 4}
    ]
  };
  const beispiel = customBeispiel || defaultBeispiel;
  const beispielJSON = JSON.stringify({
    aufgabe: beispiel.aufgabe,
    teilaufgaben: beispiel.teilaufgaben,
    gesamt_be: totalBE,
    sachgebiet: sg
  }, null, 2);

  const systemPrompt = `Du bist ein Experte für das bayerische Mathematik-Abitur (eA, G9, ab 2026).
Erstelle eine anspruchsvolle, authentische Mathematik-Aufgabe auf ECHTEM ABITURNIVEAU.

AUFGABE:
- Gesamt: EXAKT ${totalBE} BE — die Summe aller Teilaufgaben-BE MUSS EXAKT ${totalBE} ergeben!
- Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Erstelle mindestens ${minTeilaufgaben} und höchstens ${maxTeilaufgaben} Teilaufgaben
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im aufgabe-Feld
- Teilaufgaben nummerieren: "1a)", "1b)", ..., "2a)", "2b)", etc.
- Jede einzelne Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen ' + totalBE + ' BE ergeben.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- VALIDIERUNG: Zähle am Ende nach — die Summe aller "be"-Werte MUSS EXAKT ${totalBE} ergeben!
- Hilfsmittel/CAS erlaubt
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Bestimmen Sie die Extrempunkte (Hoch- und Tiefpunkte, ...)"). Die Schüler sollen selbst herausfinden, welche Methoden anzuwenden sind.

HOHES NIVEAU — KRITISCHE REGELN:
- NIEMALS nackte Mathe-Fragen stellen wie "Bestimmen Sie die erste Ableitung" oder "Berechnen Sie die Nullstellen"!
- STATTDESSEN: Mathematische Operationen IMMER in den Sachkontext einbetten:
  FALSCH: "Bestimmen Sie f'(x)."
  RICHTIG: "Bestimmen Sie den Zeitpunkt, zu dem die Wachstumsrate maximal ist."
  FALSCH: "Berechnen Sie die Nullstellen von f."
  RICHTIG: "Ermitteln Sie, nach wie vielen Stunden der Wirkstoff vollständig abgebaut ist."
  FALSCH: "Bestimmen Sie das Integral von f im Intervall [0; 5]."
  RICHTIG: "Berechnen Sie die Gesamtmenge des freigesetzten CO₂ in den ersten fünf Stunden."
  FALSCH: "Bestimmen Sie die Gleichung der Tangente im Punkt P."
  RICHTIG: "Ein Ingenieur plant eine geradlinige Zufahrt, die den Hang im Punkt P tangential berührt. Bestimmen Sie die Gleichung dieser Zufahrt."
- Der Schüler muss SELBST erkennen, welche mathematische Methode (Ableitung, Integral, Nullstelle, ...) nötig ist — das ist Teil der Aufgabe!
- Aufgaben sollen MEHRSTUFIGES DENKEN erfordern: Mehrere Konzepte kombinieren, nicht isolierte Standardaufgaben
- VARIANZ: Verwende ungewöhnliche Funktionstypen, überraschende Kontexte, und fordere auch Modellkritik/Interpretation

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}
Sachkontext-Ideen: ${sgInfo.kontexte}

ISB-REFERENZFORMAT (orientiere dich an den illustrierenden Prüfungsaufgaben des ISB Bayern 2025):

PFLICHT-REGELN FÜR JEDE TEILAUFGABE:
- Jede Teilaufgabe MUSS einen klaren OPERATOR enthalten — NIEMALS nur eine Formel ohne Anweisung!
  FALSCH: "$f(x) = x^{3} - 6x^{2}$" (Was soll der Schüler tun?!)
  RICHTIG: "Gegeben ist die Funktion $f$ mit $f(x) = x^{3} - 6x^{2}$, $x \\in \\mathbb{R}$. Bestimmen Sie die Nullstellen von $f$."
- Operatoren nach AFB:
  AFB I: "Geben Sie an", "Berechnen Sie", "Bestimmen Sie", "Skizzieren Sie"
  AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie", "Untersuchen Sie"
  AFB III: "Beurteilen Sie", "Formulieren Sie eine Aussage im Sachzusammenhang", "Begründen Sie, ob das Modell sinnvoll ist", "Entwickeln Sie ein Modell"
- AFB-Verteilung: ca. 20% AFB I, 50% AFB II, 30% AFB III — Schwerpunkt auf Transfer und Begründung!
- KEINE reinen Reproduktionsaufgaben! Auch AFB-I-Aufgaben müssen im Sachkontext stehen.

SACHKONTEXT IST PFLICHT:
- JEDE Aufgabe MUSS in einen KONKRETEN, REALISTISCHEN Sachkontext eingebettet sein — auch bei wenigen BE!
- Einleitung: 2-4 Sätze, die den Sachzusammenhang lebendig beschreiben, BEVOR die Funktion/Formel kommt
  Beispiel: "In einer Wetterstation wird die Temperaturentwicklung eines Frühlingstages untersucht. Die Temperatur $T$ (in °C) lässt sich im Zeitraum $0 \\le t \\le 24$ ($t$ in Stunden ab Mitternacht) modellhaft durch die Funktion $T$ beschreiben."
- Die Teilaufgaben fragen IMMER im Kontext — NICHT "Bestimmen Sie die Extremstellen", SONDERN "Bestimmen Sie, wann die Temperatur am höchsten ist"

KONTROLLWERTE:
- Bei mehrstufigen Aufgaben (≥15 BE): Gib bei einem wichtigen Zwischenergebnis einen Kontrollwert an — "(zur Kontrolle: ...)"

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Die Aufgabe muss mathematisch korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Methoden oder Konzepte verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \cdot x$ (NIEMALS $3.6 * x$)
- e-FUNKTION KRITISCH: Exponent IMMER in geschweifte Klammern!
  RICHTIG: $e^{-x}$, $e^{2x}$, $e^{-0{,}5x}$, $e^{-\frac{x}{2}}$
  FALSCH: $e^-x$, $e^(-x)$, $e^{-0.5x}$, $\exp(-x)$
  NIEMALS $e^-x$ (Klammern fehlen!), NIEMALS $\exp(...)$, NIEMALS runde Klammern $e^(...)$
- Brüche: $\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$ (NICHT $e^{-0.12x}$)
- Potenzen: $x^{2}$, $x^{n+1}$ (Klammern bei mehreren Zeichen)
- Wurzeln: $\sqrt{x}$, $\sqrt[3]{x}$
- Vergleiche: $\le$, $\ge$, $\ne$, $\approx$ (NICHT <=, >=)
- Integral: $\int_a^b f(x)\,dx$
- Ableitung: $f'(x)$, $f''(x)$
- Vektoren: $\vec{a}$, $\overrightarrow{AB}$
- Intervall: $0 \le x \le 30$ (NICHT $0 <= x <= 30$)
BEISPIEL: $$p(x) = 3{,}6 \cdot x \cdot e^{-0{,}12x} + 0{,}4 \quad (0 \le x \le 30)$$

GEOGEBRA-VISUALISIERUNG (optional):
Falls die Aufgabe von einer grafischen Darstellung profitiert, füge ein "grafik"-Feld hinzu.
- Analysis: type "graphing" — Funktionsgraphen, Tangenten, Nullstellen
- Geometrie: type "3d" — Punkte, Geraden, Ebenen im 3D-Raum
- Stochastik: type "probability" — nur wenn es die Aufgabe verdeutlicht

KRITISCHE GEOGEBRA-REGELN:
1. Variable ist IMMER x (NICHT t, n, k!). Auch wenn die Aufgabe t verwendet: b(x) = 80*x*exp(-0.2*x)
2. Immer * für Multiplikation: 2*x, NICHT 2x
3. e-Funktion: exp(x), NICHT e^x oder e^(x)
4. Nur EINFACHE Befehle: Funktionsdefinitionen, Punkte, Geraden
5. VERBOTEN: Integral(), Derivative(), Solve(), If(), Sequence(), Zip() — diese erzeugen Fehler!
6. KEINE LaTeX-Syntax ($, \frac, \int, etc.) in GeoGebra-Befehlen!
7. Funktionsnamen: Kleinbuchstaben (f, g, h), NICHT Großbuchstaben (F, G, B)

KORREKT: f(x) = 80*x*exp(-0.2*x), A = (2, f(2))
FALSCH: b(t) = 80*t*e^(-0.2*t), Integral(f, 0, 5), B(x) = ..., SetColor(...)
8. KEINE SetColor-Befehle — Farben werden automatisch gesetzt.
9. "settings" ist NICHT nötig — die Achsen werden automatisch angepasst.

WANN Grafik: NUR wenn die Grafik zum LÖSEN der Aufgabe NOTWENDIG ist!
- Die Aufgabe verlangt, Werte aus einem Graphen abzulesen
- Die Aufgabe bezieht sich auf eine abgebildete geometrische Figur
- Die Aufgabe sagt explizit "Der Graph ist dargestellt" oder "Siehe Abbildung"
WANN KEINE Grafik (= NORMALFALL, meistens KEINE Grafik!):
- Schüler sollen den Graph selbst skizzieren (das ist Teil der Aufgabe!)
- Reine Rechenaufgaben, Ableitungen, Integrale, Gleichungen lösen
- Kurvendiskussion (Schüler sollen Extrema/Nullstellen SELBST berechnen)
- Stochastik, Hypothesentests
- Die Funktion dient nur als Kontext
Im Zweifel: KEINE Grafik. Nur wenige Aufgaben brauchen tatsächlich eine Grafik.

WICHTIG: Das folgende Beispiel zeigt NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Funktionen, Kontexten und Zahlenwerten! Kopiere NIEMALS Inhalte aus dem Beispiel!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
${beispielJSON}
Hinweis: "grafik" ist OPTIONAL — nur wenn eine Visualisierung zum LÖSEN der Aufgabe nötig ist. Grafik-Format: {"type": "graphing", "commands": ["f(x) = 2*x^2 - 3*x + 1"]}
WICHTIG: Generiere EIGENE Aufgaben! Das Beispiel oben ist NUR zur Orientierung.`;

  const unterpunkteHinweis = unterpunkte && unterpunkte.length > 0
    ? `\n⚠️ THEMA: Der Schüler hat explizit "${unterpunkte.join(', ')}" als Schwerpunkt gewählt. Die Aufgabe MUSS sich auf dieses Thema konzentrieren! Erstelle KEINE Wachstumsaufgaben, wenn Kurvendiskussion gewählt wurde, und umgekehrt.`
    : '';

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' anspruchsvolle Mathematik-Aufgaben' : 'eine anspruchsvolle Mathematik-Aufgabe'} (EXAKT ${totalBE} BE gesamt, mindestens ${minTeilaufgaben} Teilaufgaben) im Sachgebiet ${sgInfo.title}.
Die Aufgabe MUSS in einen konkreten, realistischen Sachkontext eingebettet sein — KEINE abstrakten Rechenaufgaben!
ALLE Teilaufgaben im Sachkontext formulieren: Statt "Bestimmen Sie die Ableitung" → "Bestimmen Sie, wann die Geschwindigkeit maximal ist".
Der Schüler muss SELBST erkennen, welche mathematische Methode nötig ist.
Schwerpunkt auf AFB II und III: Begründen, Beurteilen, Modellieren, Transferleistung.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).
PFLICHT: Die Summe aller Teilaufgaben-BE muss EXAKT ${totalBE} ergeben.${unterpunkteHinweis}`;

  const maxTokens = Math.max(6000, 3000 + aufgabenAnzahl * 2000 + totalBE * 80);
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], Math.min(maxTokens, 16000));

  const content = extractJSON(openaiRes);

  // Validierung: BE-Summe prüfen und ggf. korrigieren
  if (content.teilaufgaben && content.teilaufgaben.length > 0) {
    const beSum = content.teilaufgaben.reduce((sum, t) => sum + (parseInt(t.be) || 0), 0);
    if (beSum !== totalBE) {
      content.gesamt_be = beSum;
    }
  }
  if (!content.gesamt_be) content.gesamt_be = totalBE;

  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK: GRADE ================= */
export async function handleGradeMathe(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, aufgabentyp, student_text, student_texts, images } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 5;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  // Build structured student solution text
  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    // Per-Teilaufgabe format
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        // Find matching Teilaufgabe for BE info
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Mathematik-Klausur (Bayern, eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Ansatz, Rechnung/Lösungsweg, Ergebnis
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text-Mathe (z.B. f'(x) = 4x + 3, int_0^1 x^2 dx = 1/3) und LaTeX-Notation ($\\frac{1}{2}$, $\\int_0^1 x^2\\,dx$). Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Mathematik-typische Darstellungsformen sind erwünscht: Formeln, Berechnungen, Skizzen, Tabellen, Gleichungsketten
- Stichpunkte bei Rechenwegen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für mathematische Ausdrücke.
LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 2, "bewertung": "Markdown-Bewertung mit $LaTeX$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n${studentSolutionText}`, images) }
  ];

  // Sandwich-Architektur: WolframAlpha-Verifikation bei Rechenaufgaben
  const openaiRes = await gradeWithWolframVerification(aufgabenInfo, studentSolutionText, images, sachgebiet, messages, env);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      feedback_kurz: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= MATHEMATIK: MODEL ANSWER ================= */
export async function handleModelAnswerMathe(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Mathematik-Oberstufenschüler am bayerischen Gymnasium (eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Ableitung mit Kettenregel")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\cdot$ (NIEMALS $*$)
- e-Funktion: Exponent IMMER in geschweifte Klammern! $e^{-x}$, $e^{-0{,}5x}$ (NIEMALS $e^-x$, $e^(-x)$ oder $\exp(...)$)
- Brüche: $\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$
- Vergleiche: $\le$, $\ge$, $\approx$`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= MATHEMATIK: PARSE TASK ================= */
export async function handleParseTaskMathe(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Mathematik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$). LATEX-REGELN: \\cdot statt *, e-Funktion IMMER mit geschweiften Klammern im Exponent: e^{-x}, e^{-0{,}5x} (NIEMALS e^-x oder \\exp(...)), \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { jsonMode: true });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK ABITUR: GENERATE ================= */
export async function handleGenerateAbiturMathe(request, env) {
  const systemPrompt = `Du bist ein Experte für das bayerische Mathematik-Abitur (eA, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE, ANSPRUCHSVOLLE Abiturprüfung mit 100 BE auf ECHTEM PRÜFUNGSNIVEAU.

WICHTIGSTE REGEL — KONTEXTGEBUNDENE AUFGABEN:
ALLE Teilaufgaben müssen im Sachkontext formuliert sein! Der Schüler muss SELBST erkennen, welche mathematische Methode nötig ist.
VERBOTEN: "Bestimmen Sie f'(x)", "Berechnen Sie die Nullstellen", "Bestimmen Sie das Integral"
STATTDESSEN: "Ermitteln Sie, wann die Wachstumsrate am größten ist", "Bestimmen Sie, nach wie vielen Stunden kein Wirkstoff mehr nachweisbar ist", "Berechnen Sie die Gesamtmenge des freigesetzten CO₂"
Die mathematische Methode (Ableiten, Integrieren, Nullstellen, ...) wird NICHT genannt — der Schüler erkennt sie selbst!

PRÜFUNGSSTRUKTUR:

TEIL A (30 BE, ohne CAS/Hilfsmittel, max. 110 min):
- Aufgabengruppe 1 (Pflichtteil, 20 BE):
  - A1 (5 BE): Analysis
  - A2 (5 BE): Analysis
  - A3 (5 BE): Stochastik
  - A4 (5 BE): Geometrie
  Jede Aufgabe: 2-3 Teilaufgaben, ohne CAS lösbar

- Aufgabengruppe 2 (Wahlteil, 10 BE — Schüler wählt 2 von 6):
  - A5 (5 BE): Analysis
  - A6 (5 BE): Analysis
  - A7 (5 BE): Stochastik
  - A8 (5 BE): Stochastik
  - A9 (5 BE): Geometrie
  - A10 (5 BE): Geometrie
  Jede Aufgabe: 2-3 Teilaufgaben, ohne CAS lösbar

TEIL B (70 BE, mit CAS/Hilfsmitteln):
  - B1 (30 BE): Analysis — große mehrteilige Aufgabe
  - B2 (20 BE): Stochastik — große mehrteilige Aufgabe
  - B3 (20 BE): Geometrie — große mehrteilige Aufgabe

LEHRPLAN-INHALTE (G9, Bayern, ab 2026):
Analysis: M12.1 Ganzrationale Funktionen (Parameterscharen, Stammfunktionen), M12.1.2 Natürliche Exponentialfunktion (Produkt-/Kettenregel, Wachstums-/Abklingmodelle), M12.1.3 Sinus-/Kosinusfunktion, M12.4 Gebrochen-rationale Funktionen (Quotientenregel), Wurzel-/Umkehrfunktionen, Logarithmusfunktion. M13.1 Bestimmtes Integral (Flächenbilanz, Hauptsatz, uneigentliche Integrale, Rotationsvolumen), M13.4 Extremwertprobleme, Parameterfunktionen.
Stochastik: M12.2 Zufallsgrößen, Binomialverteilung (Bernoulli-Ketten, Erwartungswert, Standardabweichung), M12.3 Einseitiger Signifikanztest (Fehler 1./2. Art, Ablehnungsbereich), M13.2 Normalverteilung (Dichtefunktion, Sigma-Regeln).
Geometrie: M12.5 Vektoren (Skalar-/Kreuzprodukt, Winkel, Flächeninhalte), M13.3 Geraden/Ebenen (Parameter-/Normalen-/Koordinatenform, Lagebeziehungen, Abstände, Hesse'sche Normalform, Kugeln).

ISB-AUFGABENSTRUKTUR (basierend auf den offiziellen illustrierenden Prüfungsaufgaben Bayern 2025):

TEIL A — KOMPAKTE, ABER ANSPRUCHSVOLLE AUFGABEN (je 5 BE, 2-3 Teilaufgaben, OHNE CAS):
- Teil A Aufgaben MÜSSEN ohne CAS lösbar sein → nur "schöne" Zahlen, keine komplizierten Dezimalzahlen
- TROTZDEM anspruchsvoll: Kombiniere mehrere Konzepte, fordere Begründungen, verlange Transferleistung!
- VARIANZ-PFLICHT: Jede Aufgabe muss sich DEUTLICH von den anderen unterscheiden!
  Analysis: Variiere zwischen Symmetrie-Argumenten, Schar-Parametern, Tangenten-Problemen, Flächenvergleichen, Umkehrfunktionen, Monotonie-Beweisen, Grenzwertbetrachtungen — NICHT immer "Nullstellen + Ableitung"!
  Stochastik: Variiere zwischen bedingter Wahrscheinlichkeit, Kombinatorik, Binomialverteilung, Erwartungswert-Vergleich, Baumdiagramm-Argumenten, Sigma-Regeln — NICHT immer die gleiche Struktur!
  Geometrie: Variiere zwischen Abständen, Winkeln, Spiegelungen, Ebenen-Lagen, Kreuzprodukt-Anwendungen, Kugelberechnungen — NICHT immer "Nachweis + Abstand"!
- JEDE Teil-A-Aufgabe in einen Mini-Sachkontext einbetten (1-2 Sätze reichen)

TEIL B — GROSSE MEHRTEILIGE AUFGABEN:
• B1 Analysis (30 BE): MUSS aus 2-3 NUMMERIERTEN ABSCHNITTEN bestehen (im "text"-Feld mit "1 ...", "2 ...", "3 ..." nummeriert), die AUFEINANDER AUFBAUEN:
  - Abschnitt 1 (ca. 11 BE): Innermathematische Untersuchung einer konkreten Funktion (z.B. ganzrationale Funktion mit Graph). Teilaufgaben: Symmetrie, Krümmung, lokale/mittlere Änderungsrate, Tangente.
  - Abschnitt 2 (ca. 9 BE): Weitere Funktion oder Funktionenschar (z.B. $g_k: x \\mapsto 3x \\cdot e^{kx}$ mit $k \\in \\mathbb{R} \\setminus \\{0\\}$). Teilaufgaben: Extrempunkte der Schar, Parameter bestimmen, Gleichung lösen.
  - Abschnitt 3 (ca. 10 BE): SACHKONTEXT — die Funktionen aus 1 und 2 werden in einem realen Modell verwendet (z.B. Hundewachstum, CO₂-Konzentration, Temperaturverlauf). Teilaufgaben: "Formulieren Sie eine Aussage im Sachzusammenhang", Integration, Modellvergleich, Modellkritik.
  KONTROLLWERTE: Bei 1-2 wichtigen Zwischenergebnissen "(zur Kontrolle: ...)" angeben!

• B2 Stochastik (20 BE): MUSS 3 NUMMERIERTE ABSCHNITTE mit durchgängigem Sachkontext haben!
  - Abschnitt 1 (ca. 6 BE): Vierfeldertafel / bedingte Wahrscheinlichkeit (konkrete Daten: "630 Radfahrer, ein Drittel mit E-Bike, 147 ohne Helm...")
  - Abschnitt 2 (ca. 5 BE): Binomialverteilung mit konkreter Berechnung ("Auf 50 km tritt mit 1,6% Wahrscheinlichkeit eine Reifenpanne auf...")
  - Abschnitt 3 (ca. 9 BE): Hypothesentest oder weiterführende Modellierung mit Interpretation im Sachzusammenhang
  Beispiel-Kontexte: Verkehrszählung/Radfahrer/Helm, Pedelec-Verkauf/Versicherung, Qualitätskontrolle, Schulveranstaltung/CD/Glücksrad

• B3 Geometrie (20 BE): MUSS Sachkontext mit 3D-Koordinatenmodell haben (5-6 Teilaufgaben)!
  - Einleitung: Reales Objekt im Koordinatensystem modellieren (z.B. "Die x₁x₂-Ebene stellt die horizontale Grundfläche dar, auf der sich ein Hügel erhebt. Ein Hang wird durch das Trapez ABCD dargestellt.")
  - Punkte mit konkreten Koordinaten angeben: A(17|−10|0), B(17|20|0), C(2|4|8), D(2|−10|8)
  - Teilaufgaben: Nachweis (rechter Winkel, Parallelogramm), Flächeninhalt, Ebenengleichung in Koordinatenform, Neigungswinkel, Abstand/Sichtlinie, Beurteilung
  - Tabellen/Zusatzinfo einbinden wenn sinnvoll (z.B. Neigungswinkel-Klassifizierung: Flachlage 0°-3°, Hanglage 3°-17°, Steillage ≥17°)
  - KONTROLLWERTE bei 1-2 Zwischenergebnissen angeben
  Beispiel-Kontexte: Hügel/Berg mit Weinanbau und Burg, Dachkonstruktion, Sonnensegel, Brückenmodell

PFLICHT-REGELN FÜR ALLE AUFGABEN:
- JEDE Teilaufgabe MUSS einen klaren OPERATOR haben — NIEMALS nur eine Formel ohne Anweisung!
  VERBOTEN: {"text": "$f(x) = 2x^{3} - 6x^{2}$"}
  VERBOTEN: {"text": "Bestimmen Sie die Nullstellen von $f$."}  ← zu abstrakt, keine Kontexteinbettung!
  RICHTIG: {"text": "Ermitteln Sie, nach wie vielen Monaten der Pegelstand wieder das Ausgangsniveau erreicht."}
- Operatoren nach AFB:
  AFB I: "Geben Sie an", "Berechnen Sie", "Bestimmen Sie", "Skizzieren Sie"
  AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie", "Untersuchen Sie", "Weisen Sie nach"
  AFB III: "Beurteilen Sie", "Formulieren Sie eine Aussage im Sachzusammenhang", "Begründen Sie, ob das Modell sinnvoll ist", "Entwickeln Sie"
- AFB-Verteilung: ca. 20% AFB I, 50% AFB II, 30% AFB III — Schwerpunkt auf Transfer und Begründung!
- AUCH bei AFB-I-Aufgaben: Im Sachkontext formulieren, nicht abstrakt!

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen mathematisch korrekt und eindeutig lösbar sein
- Teil A muss OHNE CAS/Taschenrechner lösbar sein
- Teil B darf CAS voraussetzen
- ${KEINE_LOESUNGSHINWEISE}
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Inhalten.

LATEX-FORMATIERUNG (schreibe echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \cdot x$ (NIEMALS $3.6 * x$)
- e-FUNKTION KRITISCH: Exponent IMMER in geschweifte Klammern!
  RICHTIG: $e^{-x}$, $e^{2x}$, $e^{-0{,}5x}$, $e^{-\frac{x}{2}}$
  FALSCH: $e^-x$, $e^(-x)$, $e^{-0.5x}$, $\exp(-x)$
  NIEMALS $e^-x$ (Klammern fehlen!), NIEMALS $\exp(...)$, NIEMALS runde Klammern $e^(...)$
- Brüche: $\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$ (NICHT $e^{-0.12x}$)
- Potenzen: $x^{2}$, $x^{n+1}$ (Klammern bei mehreren Zeichen)
- Wurzeln: $\sqrt{x}$, $\sqrt[3]{x}$
- Vergleiche: $\le$, $\ge$, $\ne$, $\approx$ (NICHT <=, >=)
- Integral: $\int_a^b f(x)\,dx$
- Ableitung: $f'(x)$, $f''(x)$
- Vektoren: $\vec{a}$, $\overrightarrow{AB}$
- Intervall: $0 \le x \le 30$ (NICHT $0 <= x <= 30$)
BEISPIEL: $$p(x) = 3{,}6 \cdot x \cdot e^{-0{,}12x} + 0{,}4 \quad (0 \le x \le 30)$$

GEOGEBRA-VISUALISIERUNG (optional, pro Aufgabe):
Jede Aufgabe kann ein optionales "grafik"-Feld enthalten, um eine interaktive Grafik anzuzeigen.
- Analysis: type "graphing" — Funktionsgraphen, Tangenten, Nullstellen
- Geometrie: type "3d" — Punkte, Geraden, Ebenen im 3D-Raum
- Stochastik: type "probability" — nur wenn sinnvoll

KRITISCHE GEOGEBRA-REGELN:
1. Variable ist IMMER x (NICHT t, n, k!). Auch wenn die Aufgabe t verwendet: b(x) = 80*x*exp(-0.2*x)
2. Immer * für Multiplikation: 2*x, NICHT 2x
3. e-Funktion: exp(x), NICHT e^x oder e^(x)
4. Nur EINFACHE Befehle: Funktionsdefinitionen, Punkte, Geraden
5. VERBOTEN: Integral(), Derivative(), Solve(), If(), Sequence(), Zip() — diese erzeugen Fehler!
6. KEINE LaTeX-Syntax ($, \frac, \int, etc.) in GeoGebra-Befehlen!
7. Funktionsnamen: Kleinbuchstaben (f, g, h), NICHT Großbuchstaben (F, G, B)

KORREKT: f(x) = 80*x*exp(-0.2*x), A = (2, f(2))
FALSCH: b(t) = 80*t*e^(-0.2*t), Integral(f, 0, 5), B(x) = ..., SetColor(...)
8. KEINE SetColor-Befehle — Farben werden automatisch gesetzt.
9. "settings" ist NICHT nötig — die Achsen werden automatisch angepasst.

WANN Grafik: NUR wenn die Grafik zum LÖSEN der Aufgabe NOTWENDIG ist!
- Die Aufgabe verlangt, Werte aus einem Graphen abzulesen
- Die Aufgabe bezieht sich auf eine abgebildete geometrische Figur
- Die Aufgabe sagt "Der Graph ist dargestellt" oder "Siehe Abbildung"
WANN KEINE Grafik (= NORMALFALL, meistens KEINE Grafik!):
- Schüler sollen den Graph selbst skizzieren (das ist Teil der Aufgabe!)
- Reine Rechenaufgaben, Ableitungen, Integrale, Gleichungen lösen
- Kurvendiskussion (Schüler sollen Extrema/Nullstellen SELBST berechnen)
- Stochastik, Hypothesentests
- Die Funktion dient nur als Kontext
Im Zweifel: KEINE Grafik. Nur wenige Aufgaben brauchen tatsächlich eine Grafik.

WICHTIG: Das folgende Beispiel zeigt NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Funktionen, Kontexten und Zahlenwerten! Kopiere NIEMALS Inhalte aus dem Beispiel!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a_pflicht": [
    {"id": "A1", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben ist die in $\\mathbb{R}^{+}$ definierte Funktion $f: x \\mapsto (\\ln x)^{2}$. Der Graph von $f$ verläuft durch den Punkt $P(e|1)$.", "teilaufgaben": [{"id": "a)", "text": "Die zweite Ableitungsfunktion von $f$ besitzt an der Stelle $x = e$ eine Nullstelle mit Vorzeichenwechsel. Geben Sie die Bedeutung dieser Tatsache für den Graphen von $f$ an.", "be": 1}, {"id": "b)", "text": "Bestimmen Sie eine Gleichung der Tangente an den Graphen von $f$ im Punkt $P$.", "be": 4}]},
    {"id": "A2", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben ist eine in $\\mathbb{R}$ definierte Funktion $f$ mit $f(x) = x^{4} - kx^{2}$, wobei $k$ eine positive reelle Zahl ist.", "teilaufgaben": [{"id": "a)", "text": "Zeigen Sie, dass $f'(x) = 2x \\cdot (2x^{2} - k)$ ein Term der ersten Ableitungsfunktion von $f$ ist.", "be": 1}, {"id": "b)", "text": "Die beiden Tiefpunkte des Graphen von $f$ haben jeweils die $y$-Koordinate $-1$. Ermitteln Sie den Wert von $k$.", "be": 4}]},
    {"id": "A3", "sachgebiet": "Stochastik", "be": 5, "text": "Eine Bäckerei verkauft Brötchen in den Sorten Weizen, Roggen und Dinkel. Aus 20 Brötchen wird eine Tüte zusammengestellt.", "teilaufgaben": [{"id": "a)", "text": "Eine Tüte soll Brötchen in genau zwei verschiedenen Sorten enthalten. Bestimmen Sie die Anzahl der Möglichkeiten, diese Tüte zusammenzustellen.", "be": 2}, {"id": "b)", "text": "In einer Tüte sollen zu jeder der drei Sorten mindestens fünf und höchstens acht Brötchen enthalten sein. Bestimmen Sie die Anzahl der Möglichkeiten.", "be": 3}]},
    {"id": "A4", "sachgebiet": "Geometrie", "be": 5, "text": "In einem Koordinatensystem wird modellhaft ein $8\\,\\text{m}$ breiter Bühnenraum dargestellt. Die Rückwand liegt in der $x_1 x_3$-Ebene. Ein Scheinwerfer wird durch den Punkt $L(3|0|6)$ dargestellt, die Spitze einer Requisite durch den Punkt $S(1|5|2)$.", "teilaufgaben": [{"id": "a)", "text": "Untersuchen Sie rechnerisch, ob der Schatten der Spitze auf die Rückwand fällt.", "be": 5}]}
  ],
  "teil_a_wahl": [
    {"id": "A5", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben sind die in $\\mathbb{R}$ definierten Funktionen $f$ und $g$. Der Graph von $f$ ist symmetrisch bezüglich der $y$-Achse, der Graph von $g$ ist symmetrisch bezüglich des Koordinatenursprungs. Beide Graphen haben einen Hochpunkt im Punkt $(2|1)$.", "teilaufgaben": [{"id": "a)", "text": "Geben Sie für die Graphen von $f$ und $g$ jeweils die Koordinaten und die Art eines weiteren Extrempunkts an.", "be": 2}, {"id": "b)", "text": "Untersuchen Sie die in $\\mathbb{R}$ definierte Funktion $h$ mit $h(x) = f(x) \\cdot (g(x))^{3}$ im Hinblick auf eine mögliche Symmetrie ihres Graphen.", "be": 3}]},
    {"id": "A6", "sachgebiet": "Analysis", "be": 5, "text": "Der Graph der in $\\mathbb{R}$ definierten Funktion $f: x \\mapsto \\frac{1}{4}x^{2}$ und die Gerade mit der Gleichung $y = 1$ schließen ein Flächenstück ein.", "teilaufgaben": [{"id": "a)", "text": "Bestimmen Sie das Volumen des Körpers, der durch Rotation dieses Flächenstücks um die $y$-Achse entsteht.", "be": 5}]},
    {"id": "A7", "sachgebiet": "Stochastik", "be": 5, "text": "Bei einem Spiel werfen zwei Spieler abwechselnd jeweils drei Würfel. Das Spiel endet, wenn ein Spieler die Augensumme 18 erzielt oder die Augensumme des vorausgegangenen Wurfs des anderen Spielers nicht übertrifft. Beim ersten Wurf erzielt ein Spieler die Augensumme 15.", "teilaufgaben": [{"id": "a)", "text": "Berechnen Sie die Wahrscheinlichkeit dafür, dass dieser Spieler die Würfel im selben Spiel noch einmal wirft. Erläutern Sie Ihr Vorgehen.", "be": 5}]},
    {"id": "A8", "sachgebiet": "Stochastik", "be": 5, "text": "Die Abbildung zeigt den Graphen der Dichtefunktion der normalverteilten Zufallsgröße $A$.", "teilaufgaben": [{"id": "a)", "text": "Die Wahrscheinlichkeit dafür, dass $A$ einen Wert aus dem Intervall $[6; 10]$ annimmt, beträgt etwa $68\\%$. Berechnen Sie die Wahrscheinlichkeit dafür, dass $A$ einen Wert annimmt, der größer als $10$ ist.", "be": 2}, {"id": "b)", "text": "Die Zufallsgröße $B$ ist ebenfalls normalverteilt; der Erwartungswert von $B$ ist ebenso groß wie der von $A$, die Standardabweichung von $B$ ist größer. Skizzieren Sie einen möglichen Graphen der Dichtefunktion von $B$.", "be": 3}]},
    {"id": "A9", "sachgebiet": "Geometrie", "be": 5, "text": "Gegeben sind die Punkte $A(0|0|0)$, $B(3|4|1)$, $C(1|7|3)$ und $D(-2|3|2)$.", "teilaufgaben": [{"id": "a)", "text": "Weisen Sie nach, dass das Viereck $ABCD$ ein Parallelogramm ist.", "be": 1}, {"id": "b)", "text": "Der Punkt $T$ liegt auf der Strecke $\\overline{AC}$. Das Dreieck $ABT$ hat bei $B$ einen rechten Winkel. Ermitteln Sie das Verhältnis der Länge von $\\overline{AT}$ zur Länge von $\\overline{CT}$.", "be": 4}]},
    {"id": "A10", "sachgebiet": "Geometrie", "be": 5, "text": "Die Punkte $P$ und $Q$ liegen in der Ebene $E: 5x_1 - 4x_2 + 3x_3 - 6 = 0$ und haben voneinander den Abstand $10$.", "teilaufgaben": [{"id": "a)", "text": "Ermitteln Sie mögliche Koordinaten von $P$ und $Q$.", "be": 5}]}
  ],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 30, "text": "1 Gegeben ist die in $\\mathbb{R}$ definierte Funktion $f: x \\mapsto \\frac{1}{100} \\cdot (2x^{3} - 43x^{2} + 248x)$. Abbildung 1 zeigt den Graphen $G_f$ von $f$ im Bereich $0 \\le x \\le 10$.", "teilaufgaben": [{"id": "1a)", "text": "Begründen Sie anhand des Terms von $f$, dass $G_f$ nicht symmetrisch bezüglich des Koordinatenursprungs ist, und zeigen Sie rechnerisch, dass $G_f$ für $x < 7\\frac{1}{6}$ rechtsgekrümmt ist.", "be": 4}, {"id": "1b)", "text": "Es gibt eine Stelle $x_0 \\in [0; 10]$, an der die lokale Änderungsrate von $f$ mit der mittleren Änderungsrate von $f$ im Intervall $[0; 10]$ übereinstimmt. Ermitteln Sie grafisch einen Näherungswert für $x_0$.", "be": 3}, {"id": "1c)", "text": "Bestimmen Sie eine Gleichung der Tangente $t$ an $G_f$ im Punkt $(10|f(10))$.\\n(zur Kontrolle: Gleichung von $t$: $y = -0{,}12x + 3$)", "be": 4}, {"id": "2a)", "text": "Betrachtet wird die Schar der in $\\mathbb{R}$ definierten Funktionen $g_k: x \\mapsto 3x \\cdot e^{kx}$ mit $k \\in \\mathbb{R} \\setminus \\{0\\}$. Der Graph jeder Funktion $g_k$ hat genau einen Extrempunkt $E_k$. Alle Extrempunkte $E_k$ liegen auf einer Geraden $h$. Bestimmen Sie rechnerisch die Steigung von $h$.", "be": 5}, {"id": "2b)", "text": "Der Graph $G$ einer Funktion dieser Schar besitzt den Hochpunkt $(4|\\frac{12}{e})$. Begründen Sie, dass $G$ der Graph der Funktion $g_k$ mit $k = -0{,}25$ ist.", "be": 2}, {"id": "2c)", "text": "Geben Sie alle Werte $a \\in \\mathbb{R}$ an, für die die Gleichung $3x \\cdot e^{-0{,}25x} = a$ genau eine Lösung besitzt.", "be": 2}, {"id": "3a)", "text": "Junge Hunde wachsen in ihren ersten Lebensmonaten sehr schnell. Zur Beschreibung der Zunahme der Körpermasse werden zwei Modelle betrachtet: Modell A verwendet für $0 \\le x \\le 10$ den Graphen $G_f$ und für $10 \\le x \\le 25$ die Tangente $t$; Modell B verwendet für $0 \\le x \\le 25$ den Graphen von $g_{-0{,}25}$. Die $y$-Koordinate steht jeweils für die momentane Änderungsrate der Körpermasse in kg pro Monat. Formulieren Sie eine Aussage im Sachzusammenhang, die für beide Modelle für $x = 4$ zutrifft.", "be": 1}, {"id": "3b)", "text": "Berechnen Sie auf der Grundlage von Modell A, wie viele Monate nach der Geburt ein Hund erstmals nicht mehr an Körpermasse zunimmt.\\n(zur Kontrolle: 25 Monate)", "be": 2}, {"id": "3c)", "text": "Begründen Sie, dass auf der Grundlage von Modell A die Masse, um die ein Hund in den ersten 25 Monaten insgesamt zunimmt, mit dem Term $\\int_0^{10} f(x)\\,dx + 13{,}5$ berechnet werden kann.", "be": 3}, {"id": "3d)", "text": "Geben Sie für zwei verschiedene in $[0; 10]$ definierte Funktionen, deren Funktionswerte für $x > 0$ zwischen denen von $f$ und $g_{-0{,}25}$ liegen, jeweils einen Funktionsterm an.", "be": 4}]},
    {"id": "B2", "sachgebiet": "Stochastik", "be": 20, "text": "1 Bei einer Verkehrszählung zur Untersuchung des Sicherheitsbewusstseins im Straßenverkehr wurden 630 Radfahrer erfasst. Ein Drittel davon fuhr ein Fahrrad mit Elektromotor, 147 waren mit einem Fahrrad ohne Elektromotor unterwegs und trugen keinen Helm. Insgesamt trugen $40\\%$ der Radfahrer keinen Helm. Betrachtet werden die Ereignisse E: „Die Person fuhr ein Fahrrad mit Elektromotor" und H: „Die Person trug einen Helm".", "teilaufgaben": [{"id": "1a)", "text": "Begründen Sie anhand der vorliegenden Daten, dass $E$ und $H$ stochastisch abhängig sind.", "be": 3}, {"id": "1b)", "text": "Beschreiben Sie das Ereignis $\\bar{E} \\cap H$ im Sachzusammenhang und ermitteln Sie die Wahrscheinlichkeit dafür, dass die Person einen Helm trug, wenn bekannt ist, dass sie auf einem Fahrrad ohne Elektromotor unterwegs war.", "be": 3}, {"id": "2a)", "text": "Nach einer statistischen Erhebung tritt auf einer $50\\,\\text{km}$ langen, mit dem Fahrrad zurückgelegten Strecke mit einer Wahrscheinlichkeit von $1{,}6\\%$ eine Reifenpanne auf. Ermitteln Sie auf $50\\,\\text{km}$ genau, ab welcher Gesamtstrecke die Wahrscheinlichkeit für mindestens eine Reifenpanne mehr als $90\\%$ beträgt.", "be": 5}, {"id": "3a)", "text": "Im Jahr 2020 wurden in Deutschland rund fünf Millionen Fahrräder verkauft, davon $40\\%$ Pedelecs. Unter 200 zufällig ausgewählten Fahrrädern beschreibt $X$ die Anzahl der Pedelecs. Bestimmen Sie $P(70 \\le X \\le 90)$ und beschreiben Sie die Bedeutung im Sachzusammenhang.", "be": 3}, {"id": "3b)", "text": "Für jedes vierte verkaufte Pedelec wurde eine Versicherung abgeschlossen. $Y$ beschreibt die Anzahl der versicherten Pedelecs unter den 200 Fahrrädern. Berechnen Sie $P(Y = 0)$.", "be": 2}, {"id": "3c)", "text": "Ermitteln Sie den größtmöglichen Wert von $k$, für den $P_{0{,}1}^{200}(Y \\ge k) > 0{,}8$ gilt, und interpretieren Sie das Ergebnis im Sachzusammenhang.", "be": 4}]},
    {"id": "B3", "sachgebiet": "Geometrie", "be": 20, "text": "Gegeben sind die Punkte $A(17|-10|0)$, $B(17|20|0)$, $C(2|4|8)$ und $D(2|-10|8)$. Es gilt $\\overline{AB} \\parallel \\overline{CD}$, somit ist das Viereck $ABCD$ ein Trapez. In einem Modell stellt die $x_1 x_2$-Ebene die horizontale Grundfläche dar, auf der sich ein Hügel erhebt. Ein Hang des Hügels wird durch das Trapez $ABCD$ dargestellt. Auf einem Plateau steht eine Burg, deren höchste Stelle der vorderen Fassade durch $S(-6|2|12)$ dargestellt wird. Eine Längeneinheit entspricht $10\\,\\text{m}$.", "teilaufgaben": [{"id": "a)", "text": "Zeigen Sie, dass das Trapez $ABCD$ bei $D$ einen rechten Innenwinkel hat.", "be": 2}, {"id": "b)", "text": "Bestimmen Sie den Flächeninhalt des Trapezes $ABCD$.\\n(zur Kontrolle: $374$)", "be": 3}, {"id": "c)", "text": "Das Trapez $ABCD$ liegt in der Ebene $H$. Bestimmen Sie eine Gleichung von $H$ in Koordinatenform.\\n(zur Kontrolle: $H: 8x_1 + 15x_3 - 136 = 0$)", "be": 3}, {"id": "d)", "text": "Bestimmen Sie die Höhe der vorderen Burgfassade an ihrer höchsten Stelle in Metern.", "be": 2}, {"id": "e)", "text": "Der Hang wird auf seiner gesamten Fläche für den Weinanbau genutzt. Berechnen Sie den Inhalt der Weinanbaufläche in Hektar und untersuchen Sie mithilfe der folgenden Tabelle, um welche Weinanbaulage es sich handelt: Flachlage $0°$ bis $3°$, Hanglage $3°$ bis $17°$, Steillage $17°$ oder mehr.", "be": 5}, {"id": "f)", "text": "Ein Arbeiter steht auf dem Hang an der Stelle $P(5{,}75|-2{,}5|6)$ und versucht, aus einer Blickhöhe von zwei Metern die Burg zu sehen. Beurteilen Sie, ob der Hang die freie Sicht auf die höchste Stelle der vorderen Fassade verhindert.", "be": 5}]}
  ]
}
Hinweis: "grafik" ist OPTIONAL pro Aufgabe.
WICHTIG: Generiere für ALLE Aufgaben VOLLSTÄNDIGE, AUSFORMULIERTE Teilaufgaben mit klaren Operatoren! MINDESTENS 2 Teilaufgaben pro Teil-A-Aufgabe, MINDESTENS 6 Teilaufgaben pro Teil-B-Aufgabe. Verwende KOMPLETT ANDERE Funktionen, Kontexte und Zahlenwerte als im Beispiel! B1 MUSS 2-3 nummerierte Abschnitte haben, B2 und B3 MÜSSEN Sachkontexte haben!`;

  const userPrompt = `Erstelle eine vollständige, ANSPRUCHSVOLLE Mathematik-Abiturprüfung (eA, 100 BE).
Teil A: 4 Pflichtaufgaben + 6 Wahlaufgaben (je 5 BE), ohne CAS lösbar — JEDE Aufgabe mit Mini-Sachkontext, KEINE abstrakten Rechenaufgaben! Maximale VARIANZ zwischen den Aufgaben — jede Aufgabe greift ANDERE Konzepte und Methoden auf!
Teil B: B1 Analysis (30 BE, 2-3 nummerierte Abschnitte mit Sachkontext), B2 Stochastik (20 BE, durchgängiger Sachkontext), B3 Geometrie (20 BE, 3D-Modell mit Sachkontext), mit CAS
KRITISCH: ALLE Teilaufgaben im Sachkontext formulieren! Der Schüler muss SELBST erkennen, welche Mathe-Methode nötig ist (NICHT "Bestimmen Sie die Ableitung", SONDERN "Bestimmen Sie, wann die Zuwachsrate maximal ist").
Alle Formeln in LaTeX-Notation. Hohes Niveau mit viel AFB II und III.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK ABITUR: GRADE ================= */
export async function handleGradeAbiturMathe(request, env) {
  const body = await request.json();
  const { teil_a_pflicht, teil_a_wahl, teil_b, student_text_a, student_text_b, images } = body;

  if (!student_text_a && !student_text_b) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  let aufgabenInfo = "TEIL A (30 BE, ohne CAS):\n\nPflichtteil (20 BE):\n";
  if (teil_a_pflicht && teil_a_pflicht.length) {
    for (const a of teil_a_pflicht) {
      aufgabenInfo += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }
  aufgabenInfo += "\nWahlteil (gewählte Aufgaben, 10 BE):\n";
  if (teil_a_wahl && teil_a_wahl.length) {
    for (const a of teil_a_wahl) {
      aufgabenInfo += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }
  aufgabenInfo += "\n\nTEIL B (70 BE, mit CAS):\n";
  if (teil_b && teil_b.length) {
    for (const b of teil_b) {
      aufgabenInfo += `${b.id} – ${b.sachgebiet} (${b.be} BE): ${truncate(b.text || "", 500)}\n`;
      if (b.teilaufgaben) {
        for (const t of b.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  const rubricPrompt = `Du bewertest eine vollständige Mathematik-Abiturprüfung (Bayern, eA, 100 BE).

BEWERTUNGSREGELN:
- Teil A (30 BE): Pflichtteil (20 BE) + Wahlteil (10 BE aus gewählten Aufgaben)
- Teil B (70 BE): B1 Analysis (30 BE), B2 Stochastik (20 BE), B3 Geometrie (20 BE)
- Bewerte jede Teilaufgabe einzeln: Ansatz, Rechnung, Ergebnis
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Mathe und LaTeX-Notation ($...$). Interpretiere beides großzügig.

ANTWORT-FORMAT:
- Mathematik-typische Darstellungsformen sind erwünscht: Formeln, Berechnungen, Skizzen, Tabellen, Gleichungsketten
- Stichpunkte bei Rechenwegen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.
LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.

Antworte NUR mit validem JSON:
{
  "teil_a_be": <0-30>,
  "teil_b_be": <0-70>,
  "gesamt_be": <0-100>,
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülerlösung Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülerlösung Teil B:\n${truncate(student_text_b, 12000)}`;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const teilABE = parsed.teil_a_be ?? null;
    const teilBBE = parsed.teil_b_be ?? null;
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && teilABE != null && teilBBE != null) {
      gesamtBE = teilABE + teilBBE;
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / 100) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teil_a_be: teilABE,
      teil_b_be: teilBBE,
      gesamt_be: gesamtBE,
      note: np,
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      teil_a_be: null,
      teil_b_be: null,
      gesamt_be: null,
      note: null,
      feedback: openaiRes,
      feedback_kurz: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= MATHEMATIK ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturMathe(request, env) {
  const { teil_a_pflicht, teil_a_wahl, teil_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Mathematik-Oberstufenschüler am bayerischen Gymnasium (eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für die GESAMTE Abiturprüfung.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- Formatiere als Markdown mit klaren Überschriften:
  ## Teil A – Pflichtteil
  ### A1: Analysis
  ...
  ## Teil A – Wahlteil
  ...
  ## Teil B
  ### B1: Analysis
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "TEIL A – PFLICHTTEIL (20 BE):\n";
  if (teil_a_pflicht && teil_a_pflicht.length) {
    for (const a of teil_a_pflicht) {
      userContent += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }
  userContent += "\nTEIL A – WAHLTEIL (gewählte Aufgaben, 10 BE):\n";
  if (teil_a_wahl && teil_a_wahl.length) {
    for (const a of teil_a_wahl) {
      userContent += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }
  userContent += "\nTEIL B (70 BE):\n";
  if (teil_b && teil_b.length) {
    for (const b of teil_b) {
      userContent += `${b.id} – ${b.sachgebiet} (${b.be} BE): ${truncate(b.text || "", 500)}\n`;
      if (b.teilaufgaben) {
        for (const t of b.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= CHEMIE: GENERATE ================= */
