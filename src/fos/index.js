import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KEINE_LOESUNGSHINWEISE, BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis } from '../config.js';

// FOS-Lehrplan-Konfigurationen
export const FOS_SUBJECTS = {
  bwr: {
    name: "Betriebswirtschaftslehre mit Rechnungswesen (BwR)",
    shortName: "BwR",
    fachbereiche: {
      rechnungswesen: {
        label: "Rechnungswesen",
        themen: "FOS 11 LB1-3: Finanzbuchhaltung (Bestands-/Erfolgskonten, Buchungssätze, Umsatzsteuer), Bilanz und GuV, Abschreibungen (linear/degressiv/leistungsbezogen), Rückstellungen, Rechnungsabgrenzung. FOS 11 LB4-5: Kosten-/Leistungsrechnung (Vollkostenrechnung, Zuschlagskalkulation, BAB), Deckungsbeitragsrechnung"
      },
      investition: {
        label: "Investition & Finanzierung",
        themen: "FOS 12 LB1-2: Investitionsrechnung (Kostenvergleichsrechnung, Gewinnvergleichsrechnung, Amortisationsrechnung, Kapitalwertmethode), Finanzierungsarten (Eigen-/Fremdfinanzierung, Innen-/Außenfinanzierung), Kreditarten, Leasing, Factoring"
      },
      jahresabschluss: {
        label: "Jahresabschluss & Bilanzanalyse",
        themen: "FOS 12 LB3-4: Jahresabschluss (Bilanz, GuV, Anhang), Bilanzpolitik, Bilanzanalyse (Anlageintensität, Eigenkapitalquote, Liquiditätsgrade I-III, Verschuldungsgrad), Rentabilitäten (Eigenkapital-/Gesamtkapital-/Umsatzrentabilität), Cashflow"
      },
      controlling: {
        label: "Controlling & Kostenmanagement",
        themen: "FOS 13 LB1-4: Plankostenrechnung (starre/flexible Plankostenrechnung, Beschäftigungsabweichung, Verbrauchsabweichung), Controlling (operativ/strategisch, Balanced Scorecard, Kennzahlensysteme), Target Costing, Prozesskostenrechnung, Qualitätsmanagement"
      }
    }
  },
  vwl: {
    name: "Volkswirtschaftslehre (VWL)",
    shortName: "VWL",
    fachbereiche: {
      grundlagen: {
        label: "Grundlagen der Volkswirtschaft",
        themen: "FOS 11 LB1-3: Bedürfnisse und Güter, Ökonomisches Prinzip, Produktionsfaktoren, Markt und Preisbildung (Angebot/Nachfrage, Gleichgewichtspreis, Elastizitäten), Wirtschaftsordnungen (Marktwirtschaft/Planwirtschaft/Soziale Marktwirtschaft), Wettbewerbspolitik"
      },
      geldpolitik: {
        label: "Geld, Währung & Konjunktur",
        themen: "FOS 12 LB1-4: Geld und Geldschöpfung, Europäische Zentralbank (Aufgaben, Instrumente: Leitzins, Mindestreserve, Offenmarktgeschäfte), Inflation/Deflation, Konjunkturzyklus und -indikatoren, BIP (Berechnung, Kritik), Wirtschaftspolitik (Fiskalpolitik, Geldpolitik), Arbeitsmarktpolitik"
      },
      international: {
        label: "Internationale Wirtschaft & Nachhaltigkeit",
        themen: "FOS 13 LB1-6: Außenhandel (komparative Kostenvorteile, Freihandel/Protektionismus), EU-Wirtschaftspolitik (Binnenmarkt, Währungsunion, Stabilitätspakt), Globalisierung (Chancen/Risiken, multinationale Unternehmen), Nachhaltigkeit (Nachhaltigkeitsdreieck, SDGs), Verteilungsgerechtigkeit, Entwicklungspolitik"
      }
    }
  },
  deutsch: {
    name: "Deutsch",
    shortName: "Deutsch",
    fachbereiche: {
      textanalyse: {
        label: "Textanalyse & Interpretation",
        themen: "FOS 11-13: Analyse pragmatischer Texte (Kommentar, Essay, Rede, Interview), Interpretation literarischer Texte (Lyrik, Epik, Drama), Texterschließung (Inhalt, Aufbau, Sprache, Intention), Epochen der deutschen Literatur (Aufklärung bis Gegenwart)"
      },
      eroerterung: {
        label: "Erörterung & Stellungnahme",
        themen: "FOS 11-13: Textgebundene Erörterung (Analyse + eigene Stellungnahme), Freie Erörterung (dialektisch/linear), Argumentationsstrategien, Schlüssigkeit der Argumentation, Materialbezug"
      },
      materialgestuetzt: {
        label: "Materialgestütztes Schreiben",
        themen: "FOS 13: Materialgestütztes Verfassen informierender/argumentierender Texte, Auswertung und Verknüpfung verschiedener Materialien (Texte, Statistiken, Grafiken), Adressaten- und Textsortenorientierung (Kommentar, Rede, Leserbrief, Bericht)"
      },
      literatur: {
        label: "Literaturgeschichte",
        themen: "FOS 11: Literatur des 20./21. Jahrhunderts (Kurzprosa, Jugendliteratur). FOS 12: Literatur des 19./20./21. Jahrhunderts (Epochen: Romantik, Realismus, Expressionismus, Neue Sachlichkeit, Nachkriegsliteratur). FOS 13: Literatur von der Aufklärung bis zur Gegenwart (Sturm und Drang, Klassik, Romantik, Realismus, Moderne)"
      }
    }
  },
  recht: {
    name: "Rechtslehre",
    shortName: "Rechtslehre",
    fachbereiche: {
      privatrecht: {
        label: "Privatrecht / BGB",
        themen: "FOS 11 LB1-3: Rechtssubjekte und Rechtsobjekte, Rechts- und Geschäftsfähigkeit, Willenserklärung (Anfechtbarkeit, Nichtigkeit), Zustandekommen von Verträgen, Vertragsfreiheit und ihre Grenzen, AGB-Recht, Formvorschriften"
      },
      schuldrecht: {
        label: "Schuldrecht & Sachenrecht",
        themen: "FOS 12 LB1-4: Kaufvertrag (Rechte/Pflichten, Mangelfreiheit, Gewährleistung: Nacherfüllung/Rücktritt/Minderung/Schadensersatz), Leistungsstörungen (Unmöglichkeit, Verzug, Schlechtleistung), Sachenrecht (Eigentum/Besitz, Eigentumsübertragung, gutgläubiger Erwerb), Verbraucherschutz (Widerrufsrecht, Fernabsatz)"
      },
      arbeitsrecht: {
        label: "Arbeits- & Wirtschaftsrecht",
        themen: "FOS 13 LB1-4: Arbeitsvertrag (Rechte/Pflichten, Kündigung, Kündigungsschutz), Tarifrecht (Tarifautonomie, Tarifvertrag, Arbeitskampf), Betriebsverfassungsrecht (Betriebsrat, Mitbestimmung), Handelsrecht (Kaufmannseigenschaft, Handelsregister), Gesellschaftsrecht (OHG, KG, GmbH, AG), Insolvenzrecht"
      }
    }
  },
  ibs: {
    name: "International Business Studies (IBV)",
    shortName: "IBV",
    fachbereiche: {
      international_trade: {
        label: "International Trade & Commerce",
        themen: "FOS 11-12: International trade theories (absolute/comparative advantage), INCOTERMS, international payment methods (letter of credit, documentary collection), currency and exchange rates, international logistics and supply chain management"
      },
      marketing: {
        label: "International Marketing & Management",
        themen: "FOS 12-13: International marketing strategies (standardization vs. adaptation), market entry strategies (export, licensing, joint venture, FDI), cross-cultural management (Hofstede, Trompenaars), international human resource management, corporate social responsibility"
      },
      economics: {
        label: "International Economics & EU",
        themen: "FOS 13: European Union (single market, EMU, EU institutions), globalization (opportunities/risks, multinational corporations), trade policy (free trade vs. protectionism, WTO), international financial markets, development economics, sustainability in international business"
      }
    }
  },
  physik: {
    name: "Physik",
    shortName: "Physik",
    fachbereiche: {
      mechanik: {
        label: "Mechanik",
        themen: "FOS 11: Kinematik (gleichförmige/gleichmäßig beschleunigte Bewegung, freier Fall, waagerechter Wurf), Dynamik (Newton'sche Gesetze, Kräfte, Reibung), Energie (kinetische/potentielle Energie, Energieerhaltung, Arbeit/Leistung), Impuls und Stoßvorgänge"
      },
      elektrizitaet: {
        label: "Elektrizitätslehre",
        themen: "FOS 12: Elektrisches Feld (Feldstärke, Kondensator, Kapazität), Magnetisches Feld (Lorentzkraft, Hall-Effekt), Elektromagnetische Induktion (Induktionsgesetz, Lenz'sche Regel, Generator/Transformator), Wechselstromkreise, Schwingkreis"
      },
      optik: {
        label: "Optik & Wellen",
        themen: "FOS 12-13: Wellenoptik (Beugung, Interferenz, Gitter), Quantenoptik (Photoeffekt, Photon, Dualismus Welle-Teilchen), Atomphysik (Bohr'sches Atommodell, Spektrallinien, Energieniveaus), Kernphysik (Radioaktivität, Zerfallsgesetz, Kernspaltung/-fusion)"
      },
      thermodynamik: {
        label: "Thermodynamik",
        themen: "FOS 11: Temperatur und Wärme, Innere Energie, Hauptsätze der Thermodynamik, Wärmekapazität, Zustandsänderungen idealer Gase (isotherm/isobar/isochor/adiabatisch), Wärmekraftmaschinen, Wirkungsgrad"
      }
    }
  },
  biologie: {
    name: "Biologie",
    shortName: "Biologie",
    fachbereiche: {
      zellbiologie: {
        label: "Zellbiologie",
        themen: "FOS 11: Zellaufbau (Prokaryot/Eukaryot, Zellorganellen), Biomembranen (Aufbau, Transportvorgänge), Enzyme (Aufbau, Wirkungsweise, Substrat-/Wirkungsspezifität, Hemmung), Zellteilung (Mitose/Meiose), Zellstoffwechsel (Photosynthese, Zellatmung)"
      },
      genetik: {
        label: "Genetik & Gentechnik",
        themen: "FOS 12: DNA (Aufbau, Replikation), Proteinbiosynthese (Transkription, Translation), Genmutationen, Mendelsche Regeln, Humangenetik (Stammbaumanalyse, Erbkrankheiten), Gentechnik (PCR, Gelelektrophorese, Klonierung, CRISPR/Cas), Bioethik"
      },
      oekologie: {
        label: "Ökologie",
        themen: "FOS 12: Ökologische Grundbegriffe (Biotop, Biozönose, Ökosystem), Abiotische/biotische Faktoren, Populationsökologie (Wachstum, Konkurrenz, Räuber-Beute), Stoffkreisläufe (Kohlenstoff, Stickstoff), Energiefluss, Nachhaltigkeit, Klimawandel"
      },
      evolution: {
        label: "Evolution",
        themen: "FOS 13: Evolutionstheorien (Darwin, Lamarck, Synthetische Theorie), Evolutionsfaktoren (Mutation, Selektion, Gendrift, Isolation), Artbildung, Stammesgeschichte des Menschen, Belege der Evolution (Homologie, Analogie, Fossilien, molekularbiologische Verwandtschaft)"
      },
      neurobiologie: {
        label: "Neurobiologie",
        themen: "FOS 13: Nervenzelle (Aufbau, Ruhepotential, Aktionspotential), Erregungsweiterleitung, Synapse (Erregende/hemmende Synapse, Neurotransmitter), Sinnesorgane (Auge, Ohr), Nervensystem (ZNS, PNS, vegetatives NS), Lernen und Gedächtnis, Neurodegenerative Erkrankungen"
      }
    }
  },
  paedpsych: {
    name: "Pädagogik/Psychologie",
    shortName: "Päd./Psych.",
    fachbereiche: {
      entwicklung: {
        label: "Entwicklungspsychologie",
        themen: "FOS 11: Entwicklungsbegriff, Anlage-Umwelt-Debatte, Bindungstheorie (Bowlby, Ainsworth), Kognitive Entwicklung (Piaget: sensomotorisch/präoperational/konkret-operational/formal-operational), Moralentwicklung (Kohlberg), Identitätsentwicklung (Erikson)"
      },
      lernen: {
        label: "Lerntheorien",
        themen: "FOS 11-12: Klassische Konditionierung (Pawlow), Operante Konditionierung (Skinner: Verstärkung/Bestrafung), Lernen am Modell (Bandura), Kognitivismus (Informationsverarbeitung, Gedächtnismodelle), Konstruktivismus, Lernmotivation (intrinsisch/extrinsisch)"
      },
      erziehung: {
        label: "Erziehung & Sozialisation",
        themen: "FOS 12: Erziehungsstile (autoritär/demokratisch/laissez-faire, Lewin/Tausch&Tausch), Erziehungsziele, Sozialisation (primär/sekundär/tertiär), Sozialisationsinstanzen (Familie, Peers, Medien, Schule), Pädagogische Konzepte (Montessori, Waldorf, Reggio)"
      },
      persoenlichkeit: {
        label: "Persönlichkeitspsychologie",
        themen: "FOS 12-13: Persönlichkeitsmodelle (Big Five, Freud: Es/Ich/Über-Ich, Humanistische Psychologie: Rogers/Maslow), Selbstkonzept, Intelligenz (Intelligenzbegriff, Intelligenzmodelle, Messung), Psychische Störungen (Depression, Angststörungen, Essstörungen), Therapieansätze"
      },
      sozialpsychologie: {
        label: "Sozialpsychologie",
        themen: "FOS 13: Soziale Wahrnehmung (Stereotype, Vorurteile, Attribution), Einstellungen und Einstellungsänderung, Konformität und Gehorsam (Asch, Milgram), Gruppenphänomene (Groupthink, soziales Faulenzen), Aggression, Prosoziales Verhalten, Kommunikation (Schulz von Thun, Watzlawick)"
      }
    }
  },
  gesundheit: {
    name: "Gesundheitswissenschaften",
    shortName: "Gesundheitswiss.",
    fachbereiche: {
      anatomie: {
        label: "Anatomie & Physiologie",
        themen: "FOS 11: Zelle und Gewebe, Bewegungsapparat (Knochen, Gelenke, Muskulatur), Herz-Kreislauf-System (Blutkreislauf, Blutdruck, Blut), Atmungssystem (Gasaustausch, Atemregulation), Verdauungssystem (Organe, Enzyme, Resorption)"
      },
      krankheitslehre: {
        label: "Krankheitslehre",
        themen: "FOS 12: Pathologie (Entzündung, Wundheilung, Tumorentstehung), Infektionskrankheiten (Erreger, Immunsystem, Impfung), Herz-Kreislauf-Erkrankungen (Arteriosklerose, Herzinfarkt, Schlaganfall), Diabetes mellitus (Typ 1/2), Erkrankungen des Bewegungsapparats"
      },
      gesundheitsfoerderung: {
        label: "Gesundheitsförderung & Prävention",
        themen: "FOS 12-13: Gesundheitsmodelle (Salutogenese, Pathogenese, WHO-Definition), Prävention (primär/sekundär/tertiär), Gesundheitsförderung (Setting-Ansatz, Empowerment), Epidemiologie, Gesundheitssystem (GKV/PKV, Versorgungsstrukturen), Public Health"
      },
      pflege: {
        label: "Pflege & Therapie",
        themen: "FOS 13: Pflegeprozess, Pflegetheorien, Rehabilitation, Palliativmedizin, Ernährungslehre (Makro-/Mikronährstoffe, Ernährungsbedingte Erkrankungen), Psychosomatik, Sucht und Abhängigkeit"
      }
    }
  },
  gestaltung: {
    name: "Gestaltung",
    shortName: "Gestaltung",
    fachbereiche: {
      gestaltungstheorie: {
        label: "Gestaltungstheorie",
        themen: "FOS 11-12: Gestaltungselemente (Punkt, Linie, Fläche, Farbe, Form), Kompositionsprinzipien (Symmetrie, Rhythmus, Kontrast, Proportion), Farbenlehre (Farbsysteme, Farbkontraste nach Itten, Farbwirkung), Typografie (Schriftklassifikation, Lesbarkeit, Layout)"
      },
      designgeschichte: {
        label: "Design- & Kunstgeschichte",
        themen: "FOS 12-13: Kunstepochen (Antike, Mittelalter, Renaissance, Barock, Klassizismus, Impressionismus, Expressionismus, Bauhaus, Pop Art, Postmoderne), Designgeschichte (Arts and Crafts, Jugendstil, Art Déco, Bauhaus, Ulmer Schule), Werkanalyse (Beschreibung, Analyse, Interpretation, Bewertung)"
      },
      medien: {
        label: "Mediengestaltung",
        themen: "FOS 12-13: Printmedien (Plakat, Broschüre, Corporate Design), Digitale Medien (Webdesign, UI/UX, Interaction Design), Fotografie (Bildkomposition, Belichtung, Bildbearbeitung), Film/Animation (Storyboard, Schnitt, Montage), Werbung und Kommunikationsdesign"
      },
      werkanalyse: {
        label: "Werkanalyse",
        themen: "FOS 11-13: Systematische Werkanalyse (Beschreibung, formale Analyse, Interpretation, kunsthistorische Einordnung), Bildrhetorik, Semiotik (Zeichen, Codes, Konnotation/Denotation), Vergleichende Werkanalyse, Analyse von Architektur und Produktdesign"
      }
    }
  },
  geschichte: {
    name: "Geschichte",
    shortName: "Geschichte",
    fachbereiche: {
      weimarer_republik: {
        label: "Weimarer Republik",
        themen: "FOS 11: Erster Weltkrieg (Ursachen, Verlauf, Folgen), Novemberrevolution 1918, Weimarer Verfassung, Krisenjahre (Inflation, Ruhrkampf, Putschversuche), Goldene Zwanziger, Weltwirtschaftskrise, Scheitern der Demokratie"
      },
      nationalsozialismus: {
        label: "Nationalsozialismus",
        themen: "FOS 11-12: Aufstieg der NSDAP, Machtergreifung und Gleichschaltung, NS-Ideologie (Rassismus, Antisemitismus, Volksgemeinschaft), Terror und Verfolgung, Holocaust/Shoa, Zweiter Weltkrieg, Widerstand, Erinnerungskultur"
      },
      nachkriegszeit: {
        label: "Nachkriegszeit & Kalter Krieg",
        themen: "FOS 12: Potsdamer Abkommen, Besatzungszonen, Entnazifizierung, Gründung BRD/DDR, Ost-West-Konflikt (NATO/Warschauer Pakt, Mauerbau, Kubakrise, Entspannungspolitik), Wirtschaftswunder, 68er-Bewegung"
      },
      wiedervereinigung: {
        label: "Deutsche Einheit & Europa",
        themen: "FOS 12-13: Friedliche Revolution 1989, Mauerfall, Deutsche Wiedervereinigung, Europäische Integration (EWG, EG, EU, Maastricht, Lissabon), Globalisierung und neue Weltordnung, Migration, Aktuelle Herausforderungen der Demokratie"
      },
      demokratie: {
        label: "Demokratie & Grundgesetz",
        themen: "FOS 13: Demokratietheorien (antike/moderne), Grundgesetz (Grundrechte, Staatsstrukturprinzipien, Verfassungsorgane), Parteien und Wahlen, Föderalismus, Gewaltenteilung, Verfassungsgerichtsbarkeit, Herausforderungen (Populismus, Extremismus, Fake News)"
      }
    }
  },
  chemie: {
    name: "Chemie",
    shortName: "Chemie",
    fachbereiche: {
      atombau: {
        label: "Atombau & Periodensystem",
        themen: "FOS 11: Atommodelle (Dalton, Thomson, Rutherford, Bohr, Orbitalmodell), Elektronenkonfiguration, Periodensystem (Perioden, Gruppen, Trends: Atomradius, Ionisierungsenergie, Elektronegativität), Isotope, Radioaktivität"
      },
      bindungen: {
        label: "Chemische Bindungen",
        themen: "FOS 11: Ionenbindung (Gitterenergie, Eigenschaften), Atombindung (Lewis-Formeln, VSEPR-Modell, Molekülgeometrie), Metallbindung (Elektronengasmodell), Zwischenmolekulare Kräfte (Van-der-Waals, Dipol-Dipol, Wasserstoffbrücken), Polarität"
      },
      reaktionen: {
        label: "Chemische Reaktionen",
        themen: "FOS 12: Chemisches Gleichgewicht (Massenwirkungsgesetz, Le Chatelier), Säure-Base-Reaktionen (Brønsted, pH-Wert, Puffer, Titration), Redoxreaktionen (Oxidationszahlen, Elektrolyse, Galvanische Zelle, Korrosion), Reaktionskinetik (Reaktionsgeschwindigkeit, Katalyse, Aktivierungsenergie)"
      },
      organische_chemie: {
        label: "Organische Chemie",
        themen: "FOS 12-13: Kohlenwasserstoffe (Alkane, Alkene, Alkine, Aromaten), Funktionelle Gruppen (Alkohole, Aldehyde, Ketone, Carbonsäuren, Ester), Isomerie, Reaktionsmechanismen (Substitution, Addition, Elimination), Kunststoffe (Polymerisation, Polykondensation, Polyaddition)"
      },
      biochemie: {
        label: "Biochemie",
        themen: "FOS 13: Kohlenhydrate (Mono-/Di-/Polysaccharide), Lipide (Fette, Phospholipide), Proteine (Aminosäuren, Peptidbindung, Proteinstrukturen), Enzyme (Substratspezifität, Michaelis-Menten-Kinetik), DNA/RNA, Stoffwechsel (Glykolyse, Citratzyklus, Atmungskette)"
      }
    }
  },
  soziologie: {
    name: "Soziologie",
    shortName: "Soziologie",
    fachbereiche: {
      sozialstruktur: {
        label: "Sozialstruktur & Ungleichheit",
        themen: "FOS 11-12: Soziale Schichtung (Klassen, Schichten, Milieus), Soziale Ungleichheit (Einkommen, Bildung, Geschlecht), Armut und Reichtum, Soziale Mobilität, Modelle sozialer Ungleichheit (Geißler, Sinus-Milieus, Bourdieu: Kapitaltheorie)"
      },
      sozialisation: {
        label: "Sozialisation",
        themen: "FOS 11: Sozialisationsprozesse (primär/sekundär/tertiär), Sozialisationsinstanzen (Familie, Schule, Peers, Medien), Rollentheorie (Mead, Dahrendorf), Identitätsbildung, Geschlechtersozialisation, Interkulturelle Sozialisation"
      },
      gesellschaft: {
        label: "Gesellschaftstheorien",
        themen: "FOS 12-13: Gesellschaftstheorien (Marx, Weber, Durkheim, Habermas, Luhmann), Modernisierung und sozialer Wandel, Individualisierung (Beck), Risikogesellschaft, Postmoderne, Digitale Gesellschaft"
      },
      migration: {
        label: "Migration & Integration",
        themen: "FOS 13: Migrationstheorien, Push-/Pull-Faktoren, Integration (Assimilation, Multikulturalismus, Interkulturalität), Flucht und Asyl, Demographischer Wandel, Diversität und Inklusion"
      },
      medien: {
        label: "Medien & Kommunikation",
        themen: "FOS 12: Medientheorien (McLuhan, Postman, Habermas), Öffentlichkeit und Medien, Medienwirkungsforschung, Soziale Medien, Fake News und Medienkompetenz, Digitalisierung und Gesellschaft"
      }
    }
  },
  winf: {
    name: "Wirtschaftsinformatik",
    shortName: "WInf",
    fachbereiche: {
      datenbanken: {
        label: "Datenbanken & SQL",
        themen: "FOS 11-12: Relationale Datenbanken (Entity-Relationship-Modell, Normalisierung 1NF-3NF, Relationsmodell), SQL (SELECT, INSERT, UPDATE, DELETE, JOIN, GROUP BY, Unterabfragen), Datenintegrität (Primärschlüssel, Fremdschlüssel, Referentielle Integrität)"
      },
      programmierung: {
        label: "Programmierung",
        themen: "FOS 11-12: Algorithmen (Sequenz, Selektion, Iteration, Rekursion), Struktogramme/PAP, Objektorientierte Programmierung (Klassen, Objekte, Vererbung, Polymorphie), Datenstrukturen (Arrays, Listen, Stapel, Warteschlange), Softwareentwicklung (Phasenmodell, Agile Methoden)"
      },
      netzwerke: {
        label: "Netzwerke & IT-Sicherheit",
        themen: "FOS 12-13: Netzwerktopologien, OSI-Schichtenmodell, TCP/IP, IP-Adressierung, Routing, Client-Server-Architektur, IT-Sicherheit (Verschlüsselung: symmetrisch/asymmetrisch, Digitale Signatur, Zertifikate), Datenschutz (DSGVO), Bedrohungen (Malware, Phishing, Social Engineering)"
      },
      geschaeftsprozesse: {
        label: "Geschäftsprozesse & ERP",
        themen: "FOS 13: Geschäftsprozessmodellierung (EPK, BPMN), ERP-Systeme (SAP-Grundlagen, Module), E-Commerce (Geschäftsmodelle B2B/B2C, Online-Marketing), Industrie 4.0, Künstliche Intelligenz in der Wirtschaft, IT-Projektmanagement"
      }
    }
  },
  technologie: {
    name: "Technologie/Informatik",
    shortName: "Technologie",
    fachbereiche: {
      elektrotechnik: {
        label: "Elektrotechnik",
        themen: "FOS 11-12: Gleichstromkreise (Ohm'sches Gesetz, Reihen-/Parallelschaltung, Kirchhoff'sche Regeln), Elektrisches Feld, Magnetisches Feld, Wechselstrom (Effektivwerte, Blindwiderstand, Impedanz), Halbleiter (Diode, Transistor), Digitaltechnik (Logikgatter, Boolesche Algebra)"
      },
      informatik: {
        label: "Informatik & Algorithmen",
        themen: "FOS 11-13: Zahlensysteme (Dual, Hexadezimal), Codierung, Algorithmen und Datenstrukturen, Programmierung (Variablen, Schleifen, Funktionen, OOP), Rechnerarchitektur (Von-Neumann), Betriebssysteme, Datenbanken, Netzwerke (TCP/IP, Protokolle)"
      },
      werkstofftechnik: {
        label: "Werkstofftechnik",
        themen: "FOS 11-12: Werkstoffgruppen (Metalle, Kunststoffe, Keramik, Verbundwerkstoffe), Werkstoffprüfung (Zugversuch, Härteprüfung, Kerbschlagbiegeversuch), Eisen-Kohlenstoff-Diagramm, Wärmebehandlung (Härten, Anlassen, Glühen), Korrosion und Korrosionsschutz"
      },
      technische_mechanik: {
        label: "Technische Mechanik",
        themen: "FOS 12-13: Statik (Kräfte, Momente, Gleichgewicht, Freischneiden, Lager, Fachwerke), Festigkeitslehre (Normalspannung, Schubspannung, Biegung, Torsion), Kinematik und Kinetik (Geschwindigkeit, Beschleunigung, Newton'sche Gesetze), Energiemethoden"
      }
    }
  },
  ethik: {
    name: "Ethik",
    shortName: "Ethik",
    fachbereiche: {
      moralphilosophie: {
        label: "Moralphilosophie",
        themen: "FOS 11: Moral und Ethik (Begriffsdifferenzierung), Utilitarismus (Bentham, Mill), Pflichtethik (Kant: Kategorischer Imperativ), Tugendethik (Aristoteles), Diskursethik (Habermas), Verantwortungsethik (Jonas, Weber)"
      },
      menschenwuerde: {
        label: "Menschenwürde & Grundrechte",
        themen: "FOS 11-12: Menschenwürde (philosophische Begründungen), Menschenrechte (Geschichte, UN-Menschenrechtserklärung), Grundrechte im Grundgesetz, Freiheit und Verantwortung, Gerechtigkeit (Rawls: Schleier des Nichtwissens, Gerechtigkeitstheorien)"
      },
      gerechtigkeit: {
        label: "Gerechtigkeit & Gesellschaft",
        themen: "FOS 12-13: Soziale Gerechtigkeit (Verteilungsgerechtigkeit, Chancengerechtigkeit), Recht und Gerechtigkeit (Rechtspositivismus, Naturrecht), Wirtschaftsethik (CSR, Nachhaltigkeit), Globale Gerechtigkeit (Klimagerechtigkeit, Entwicklung), Politische Ethik (Demokratie, Populismus)"
      },
      medizinethik: {
        label: "Medizin- & Bioethik",
        themen: "FOS 13: Medizinethik (Patientenautonomie, Sterbehilfe, Organspende, Abtreibung), Bioethik (Gentechnik, Klonen, Enhancement, Reproduktionsmedizin), Tierethik (Tierwohl, Tierversuche), Technikethik (KI, Autonome Systeme, Datenschutz, Digitale Ethik)"
      }
    }
  },
  religion: {
    name: "Religion",
    shortName: "Religion",
    fachbereiche: {
      gottesfrage: {
        label: "Gottesfrage & Glaube",
        themen: "FOS 11: Gottesvorstellungen (biblisch, philosophisch), Gottesbeweise (Anselm, Thomas von Aquin), Religionskritik (Feuerbach, Marx, Nietzsche, Freud), Theodizee (Leid und Gott), Glaube und Vernunft, Atheismus und Agnostizismus"
      },
      christliche_ethik: {
        label: "Christliche Ethik",
        themen: "FOS 11-12: Biblische Ethik (Dekalog, Bergpredigt, Nächstenliebe), Christliche Soziallehre (Personalität, Solidarität, Subsidiarität, Gemeinwohl), Gewissen und Verantwortung, Bioethik aus christlicher Perspektive, Katholische Soziallehre (Enzykliken)"
      },
      kirche: {
        label: "Kirche & Gesellschaft",
        themen: "FOS 12: Kirchengeschichte (Reformation, Aufklärung, Kirche im Nationalsozialismus, Zweites Vatikanisches Konzil), Kirche in der modernen Gesellschaft, Ökumene, Säkularisierung, Kirche und Staat, Kirchliche Sozialarbeit"
      },
      weltreligionen: {
        label: "Weltreligionen & Dialog",
        themen: "FOS 12-13: Judentum (Tora, Feste, Holocaust-Gedenken), Islam (Koran, Fünf Säulen, Scharia), Buddhismus (Vier Edle Wahrheiten, Achtfacher Pfad), Hinduismus (Karma, Dharma), Interreligiöser Dialog, Fundamentalismus, Religion und Gewalt, Religion und Naturwissenschaft"
      }
    }
  },
  kunstgeschichte: {
    name: "Kunstgeschichte",
    shortName: "Kunstgeschichte",
    fachbereiche: {
      antike: {
        label: "Antike & Mittelalter",
        themen: "FOS 11: Griechische Kunst (Tempelarchitektur, Skulptur: Archaik/Klassik/Hellenismus), Römische Kunst (Ingenieurbaukunst, Porträt), Frühchristliche und Byzantinische Kunst, Romanik (Kirchenbau, Bauplastik), Gotik (Kathedrale, Glasmalerei, Buchmalerei)"
      },
      renaissance: {
        label: "Renaissance & Barock",
        themen: "FOS 11-12: Renaissance (Zentralperspektive, Proportionslehre, Leonardo, Michelangelo, Dürer), Manierismus, Barock (Dynamik, Licht-Schatten: Caravaggio, Rembrandt, Bernini), Rokoko, Klassizismus (David, Canova), Romantik (Friedrich, Turner)"
      },
      moderne: {
        label: "Moderne & Abstraktion",
        themen: "FOS 12: Impressionismus (Monet, Renoir), Postimpressionismus (Cézanne, Van Gogh, Gauguin), Expressionismus (Brücke, Blauer Reiter, Kirchner, Kandinsky), Kubismus (Picasso, Braque), Abstraktion (Mondrian, Malewitsch), Bauhaus (Gropius, Klee), Surrealismus (Dalí, Magritte)"
      },
      zeitgenoessisch: {
        label: "Zeitgenössische Kunst",
        themen: "FOS 13: Abstrakter Expressionismus (Pollock, Rothko), Pop Art (Warhol, Lichtenstein), Minimalismus, Konzeptkunst, Performance Art, Installation, Land Art, Street Art (Banksy), Digitale Kunst, NFTs, Kunstmarkt, Museen und Ausstellungen"
      },
      architektur: {
        label: "Architektur & Design",
        themen: "FOS 11-13: Architekturgeschichte (griechischer Tempel bis Dekonstruktivismus), Bauhaus-Architektur, Funktionalismus (Le Corbusier, Mies van der Rohe), Postmoderne Architektur, Zeitgenössische Architektur (Hadid, Gehry), Nachhaltiges Bauen, Produktdesign, Designtheorie"
      }
    }
  },
  sozialwirtschaft: {
    name: "Sozialwirtschaft",
    shortName: "Sozialwirtschaft",
    fachbereiche: {
      sozialstaat: {
        label: "Sozialstaatsprinzip",
        themen: "FOS 11: Sozialstaatsprinzip im Grundgesetz, Geschichte des Sozialstaats (Bismarck, Weimar, BRD), Soziale Sicherungssysteme im Überblick, Subsidiaritätsprinzip, Wohlfahrtsstaatsmodelle (Esping-Andersen), Herausforderungen (Demographischer Wandel, Finanzierung)"
      },
      sozialversicherung: {
        label: "Sozialversicherung",
        themen: "FOS 11-12: Gesetzliche Krankenversicherung (Solidarprinzip, Leistungen), Rentenversicherung (Generationenvertrag, Drei-Säulen-Modell), Arbeitslosenversicherung (SGB III, Arbeitsförderung), Pflegeversicherung (Pflegegrade, Leistungen), Unfallversicherung"
      },
      sozialhilfe: {
        label: "Sozialhilfe & Grundsicherung",
        themen: "FOS 12: SGB II (Bürgergeld, Bedarfsgemeinschaft, Eingliederungsvereinbarung), SGB XII (Sozialhilfe, Hilfe zum Lebensunterhalt), Existenzminimum, Armutsbekämpfung, Schuldnerberatung, Wohngeld, BAföG"
      },
      jugendhilfe: {
        label: "Kinder- & Jugendhilfe",
        themen: "FOS 12-13: SGB VIII (Kinder- und Jugendhilfegesetz), Hilfen zur Erziehung (ambulant/stationär), Kinderschutz (§8a, Kindeswohl, Inobhutnahme), Jugendarbeit und Jugendsozialarbeit, Kindertagesbetreuung, Eingliederungshilfe"
      },
      nonprofitmanagement: {
        label: "Nonprofit-Management",
        themen: "FOS 13: Nonprofit-Organisationen (Vereine, Stiftungen, gGmbH, Verbände), Finanzierung (Spenden, Fördermittel, Sozialleistungsentgelte), Qualitätsmanagement im Sozialbereich, Sozialplanung, Sozialraumorientierung, Freiwilligenmanagement, Digitalisierung in der Sozialen Arbeit"
      }
    }
  },
  franzoesisch: {
    name: "Französisch",
    shortName: "Französisch",
    fachbereiche: {
      mediation: {
        label: "Sprachmittlung (Médiation)",
        themen: "FOS 11-13: Sinngemäßes Übertragen (Deutsch→Französisch, Französisch→Deutsch), Adressatengerechte Wiedergabe, Interkulturelle Kompetenz, Textsortenspezifik (formeller/informeller Stil), Zusammenfassen und Paraphrasieren, Registerwechsel"
      },
      production: {
        label: "Textproduktion",
        themen: "FOS 12-13: Argumentative Texte (Commentaire, Essai, Lettre), Kreative Texte, Résumé (Zusammenfassung nach Regeln), Analyse de texte (Analyse eines Sachtexts/literarischen Texts), Konnektoren und Textstruktur, Registres de langue"
      },
      comprehension: {
        label: "Textverständnis (Compréhension)",
        themen: "FOS 11-12: Leseverstehen (Sachtexte, literarische Texte, Zeitungsartikel), Hörverstehen, Globalverstehen und Detailverstehen, Texterschließungsstrategien, Worterschließung aus dem Kontext, Interkulturelle Themen (Frankreich, Frankophonie)"
      },
      expression: {
        label: "Mündlicher Ausdruck",
        themen: "FOS 12-13: Monologisches Sprechen (Präsentation, Bildbeschreibung), Dialogisches Sprechen (Diskussion, Rollenspiel), Aussprache und Intonation, Redemittel für Argumentation, Spontanes Sprechen, Interkulturelle Gesprächsführung"
      }
    }
  }
};

export async function handleFOSRoute(pathname, request, env, handlers) {
  const body = await request.json();
  const fakeReq = { json: async () => body };
  const route = pathname.substring(9); // "/api/fos-" entfernen

  // Externe Handler destrukturieren
  const {
    handleGenerate, handleGrade, handleModelAnswer, handleParseTask,
    handleGradeMathe, handleModelAnswerMathe, handleParseTaskMathe,
    handleGradeAbiturMathe, handleModelAnswerAbiturMathe,
    handleGradeAbiturBWR, handleModelAnswerAbiturBWR,
    handleGradeAbitur13BWR, handleModelAnswerAbitur13BWR,
    handleGradeWR, handleModelAnswerWR, handleParseTaskWR,
    handleParseTaskAbitur,
    handleFOSGenerateRCFromTextEnglisch, handleFOSOCRTextEnglisch
  } = handlers;

  // === ENGLISCH (delegiert an bestehende generische Handler) ===
  if (route === "generate-englisch") return handleGenerate(fakeReq, env);
  if (route === "grade-englisch") return handleGrade(fakeReq, env);
  if (route === "model-answer-englisch") return handleModelAnswer(fakeReq, env);
  if (route === "parse-task-englisch") return handleParseTask(fakeReq, env);
  if (route === "generate-rc-englisch") return handleFOSGenerateRCEnglisch(body, env);
  if (route === "generate-rc-from-text-englisch") return handleFOSGenerateRCFromTextEnglisch(body, env);
  if (route === "ocr-text-englisch") return handleFOSOCRTextEnglisch(body, env);
  if (route === "generate-klausur-englisch") return handleFOSGenerateKlausurEnglisch(body, env);
  if (route === "grade-rc-mediation-englisch") return handleFOSGradeRCMediationEnglisch(body, env);

  // === MATHE (FOS-spezifische Lehrplaninhalte) ===
  if (route === "generate-mathe") return handleFOSGenerateMathe(body, env);
  if (route === "grade-mathe") return handleGradeMathe(fakeReq, env);
  if (route === "model-answer-mathe") return handleModelAnswerMathe(fakeReq, env);
  if (route === "parse-task-mathe") return handleParseTaskMathe(fakeReq, env);

  // === MATHE ABITUR (FOS-Fachabitur) ===
  if (route === "generate-abitur-mathe") return handleFOSGenerateAbiturMathe(body, env);
  if (route === "grade-abitur-mathe") return handleGradeAbiturMathe(fakeReq, env);
  if (route === "model-answer-abitur-mathe") return handleModelAnswerAbiturMathe(fakeReq, env);

  // === MATHE ABITUR 13 (FOS-Abiturprüfung 13. Klasse) ===
  if (route === "generate-abitur13-mathe") return handleFOSGenerateAbitur13Mathe(body, env);
  if (route === "grade-abitur13-mathe") return handleGradeAbitur13Mathe(fakeReq, env);
  if (route === "model-answer-abitur13-mathe") return handleModelAnswerAbitur13Mathe(fakeReq, env);

  // === BWR ABITUR (FOS-Fachabitur) ===
  if (route === "generate-abitur-bwr") return handleFOSGenerateAbiturBWR(body, env);
  if (route === "grade-abitur-bwr") return handleGradeAbiturBWR(fakeReq, env);
  if (route === "model-answer-abitur-bwr") return handleModelAnswerAbiturBWR(fakeReq, env);

  // === BWR ABITUR 13 (Fachgebundene/Allgemeine Hochschulreife) ===
  if (route === "generate-abitur13-bwr") return handleFOSGenerateAbitur13BWR(body, env);
  if (route === "grade-abitur13-bwr") return handleGradeAbitur13BWR(fakeReq, env);
  if (route === "model-answer-abitur13-bwr") return handleModelAnswerAbitur13BWR(fakeReq, env);

  // === IBV ABITUR (FOS-Fachabitur) ===
  if (route === "generate-abitur-ibv") return handleFOSGenerateAbiturIBV(body, env);
  if (route === "grade-abitur-ibv") return handleGradeWR(fakeReq, env);
  if (route === "model-answer-abitur-ibv") return handleModelAnswerWR(fakeReq, env);

  // === DEUTSCH ABITUR (FOS-Fachabitur) ===
  if (route === "generate-abitur-deutsch") return handleFOSGenerateAbiturDeutsch(body, env);
  if (route === "grade-abitur-deutsch") return handleGradeWR(fakeReq, env);
  if (route === "model-answer-abitur-deutsch") return handleModelAnswerWR(fakeReq, env);

  // === ENGLISCH ABITUR (FOS-Fachabitur 12) ===
  if (route === "generate-abitur-englisch") return handleFOSGenerateAbiturEnglisch(body, env);
  if (route === "grade-abitur-englisch") return handleGradeWR(fakeReq, env);
  if (route === "model-answer-abitur-englisch") return handleModelAnswerWR(fakeReq, env);

  // === ENGLISCH ABITUR 13 (Fachgebundene/Allgemeine Hochschulreife) ===
  if (route === "generate-abitur13-englisch") return handleFOSGenerateAbitur13Englisch(body, env);
  if (route === "grade-abitur13-englisch") return handleGradeWR(fakeReq, env);
  if (route === "model-answer-abitur13-englisch") return handleModelAnswerWR(fakeReq, env);

  // === ABITUR PARSE-TASK (generisch für alle Fächer) ===
  const parseAbiturMatch = route.match(/^parse-task-abitur(?:13)?-(.+)$/);
  if (parseAbiturMatch) {
    const fach = parseAbiturMatch[1];
    return handleParseTaskAbitur(fach, fakeReq, env);
  }

  // === PROFILFACH ABITUR (Physik, PädPsych, Bio, Gesundheit, Gestaltung) ===
  const abiturProfilMatch = route.match(/^(generate|grade|model-answer)-abitur-(physik|paedpsych|biologie|gesundheit|gestaltung)$/);
  if (abiturProfilMatch) {
    const [, action, fach] = abiturProfilMatch;
    if (action === "generate") return handleFOSGenerateAbiturProfilfach(fach, body, env);
    if (action === "grade") return handleGradeWR(fakeReq, env);
    if (action === "model-answer") return handleModelAnswerWR(fakeReq, env);
  }

  // === TEXT-FÄCHER (BWR, VWL, Deutsch, Recht, IBV) ===
  const textMatch = route.match(/^(generate|grade|model-answer|parse-task)-(.+)$/);
  if (textMatch) {
    const [, action, subject] = textMatch;
    const config = FOS_SUBJECTS[subject];
    if (config) {
      if (action === "generate") return handleFOSTextGenerate(config, body, env);
      if (action === "grade") return handleGradeWR(fakeReq, env);
      if (action === "model-answer") return handleModelAnswerWR(fakeReq, env);
      if (action === "parse-task") return handleParseTaskWR(fakeReq, env);
    }
  }

  return jsonResponse({ error: "Unbekannte FOS-Route: " + pathname }, 404, env);
}

/* ================= FOS MATHE: GENERATE ================= */
async function handleFOSGenerateMathe(body, env) {
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen.'
    : '';

  const sg = sachgebiet || "analysis";
  const totalBE = be || 25;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const minTeilaufgaben = Math.max(3, Math.ceil(totalBE / 6));
  const maxTeilaufgaben = Math.max(minTeilaufgaben, Math.ceil(totalBE / 3));

  const sgThemen = {
    analysis: {
      title: "Analysis",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 11: Ganzrationale Funktionen (Nullstellen, Symmetrie, Grenzverhalten), Differenzialrechnung (Ableitungsregeln, Potenz-/Summen-/Faktorregel), Tangente, Extremwerte, Monotonie, Wendepunkte
Jgst 12: Differenzialrechnung Vertiefung (Produkt-/Quotientenregel, verkettete Funktionen/Kettenregel), Exponentialfunktion und e-Funktion, Kurvendiskussion (e-Funktionen, Wachstums-/Abklingmodelle), Integralrechnung (Stammfunktion, bestimmtes Integral, Flächenberechnung)
Jgst 13: Gebrochen-rationale Funktionen (Definitionslücken, Asymptoten), ln-Funktion als Umkehrfunktion, komplexe Kurvendiskussion, partielle Integration, uneigentliche Integrale`,
      kontexte: `Wachstums-/Abklingmodelle (Bakterienkultur, Medikament, Bevölkerung), Produktionskosten/-gewinn, Temperaturverlauf, Wasserstand, Geschwindigkeit/Strecke, CO₂-Konzentration`
    },
    stochastik: {
      title: "Stochastik",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 11: Wahrscheinlichkeitsrechnung Grundlagen (Laplace, Baumdiagramm, Pfadregeln), bedingte Wahrscheinlichkeit, Vierfeldertafel, stochastische Unabhängigkeit
Jgst 12: Bernoulli-Ketten und Binomialverteilung, Erwartungswert und Standardabweichung, Sigma-Regeln, Hypothesentests (einseitiger Signifikanztest, Fehler 1. und 2. Art, Ablehnungsbereich)`,
      kontexte: `Qualitätskontrolle, Verkehrszählung, medizinische Tests, Wahlumfragen, Versicherungen, Glücksspiel, Schulveranstaltung`
    },
    geometrie: {
      title: "Geometrie",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 13: Vektoren (Addition, skalare Multiplikation, Linearkombination), Skalarprodukt und Winkelberechnung, Vektorprodukt (Kreuzprodukt, Spatprodukt), Lineare Gleichungssysteme (Gauß-Verfahren), Geraden im Raum (Parameterform, Lagebeziehungen), Ebenen (Parameter-/Normalen-/Koordinatenform), Abstände (Punkt-Ebene, Punkt-Gerade, windschiefe Geraden)`,
      kontexte: `Dachkonstruktion, Sonnensegel, Brückenmodell, Rampe/Auffahrt, Aussichtsturm/Sichtlinie, Theaterkulisse`
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.analysis;

  // Verwende den gleichen Prompt-Aufbau wie Gymnasium-Mathe, aber mit FOS-Lehrplan
  const systemPrompt = `Du bist ein Experte für FOS-Mathematik (Bayern, Fachabitur).
Erstelle eine authentische Mathematik-Aufgabe für die Fachoberschule.

AUFGABE:
- Gesamt: EXAKT ${totalBE} BE — die Summe aller Teilaufgaben-BE MUSS EXAKT ${totalBE} ergeben!
- Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Erstelle mindestens ${minTeilaufgaben} und höchstens ${maxTeilaufgaben} Teilaufgaben
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...), zusammen ' + totalBE + ' BE.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Hilfsmittel/CAS erlaubt
- ${KEINE_LOESUNGSHINWEISE}

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}
Sachkontext-Ideen: ${sgInfo.kontexte}

PFLICHT-REGELN:
- Jede Teilaufgabe MUSS einen klaren OPERATOR enthalten
- AFB I: "Berechnen Sie", "Bestimmen Sie", "Geben Sie an"
- AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie"
- AFB III: "Beurteilen Sie", "Formulieren Sie im Sachzusammenhang"
- Bei ≥15 BE: KONKRETER Sachkontext erforderlich
- LEHRPLAN-TREUE: NUR Inhalte aus dem FOS-Lehrplan!

LATEX-FORMATIERUNG:
- $\\cdot$ statt *, Dezimalkomma $3{,}6$, $\\frac{a}{b}$ statt a/b
- e-Funktion: $e^{-x}$, $e^{-0{,}5x}$ (NIEMALS $e^-x$ oder $\\exp(...)$)

GEOGEBRA (optional): type "graphing", Variable IMMER x, * für Multiplikation, exp(x) für e-Funktion

Antworte NUR mit validem JSON:
{"aufgabe": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 3}], "gesamt_be": ${totalBE}, "sachgebiet": "${sg}"}`;

  const userPrompt = `Erstelle eine FOS-Mathematik-Aufgabe (EXAKT ${totalBE} BE) im Sachgebiet ${sgInfo.title}.
${totalBE >= 15 ? 'Die Aufgabe MUSS in einen konkreten Sachkontext eingebettet sein.' : ''}
Jede Teilaufgabe braucht einen klaren Operator. Alle Formeln in LaTeX.`;

  const maxTokens = Math.max(6000, 3000 + aufgabenAnzahl * 2000 + totalBE * 80);
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], Math.min(maxTokens, 16000));

  const content = extractJSON(openaiRes);
  if (content.teilaufgaben && content.teilaufgaben.length > 0) {
    const beSum = content.teilaufgaben.reduce((sum, t) => sum + (parseInt(t.be) || 0), 0);
    if (beSum !== totalBE) content.gesamt_be = beSum;
  }
  if (!content.gesamt_be) content.gesamt_be = totalBE;
  return jsonResponse(content, 200, env);
}

/* ================= FOS MATHE ABITUR: GENERATE (FAP) ================= */
async function handleFOSGenerateAbiturMathe(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS-Fachabiturprüfung Mathematik (Bayern).
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung mit 100 BE.

PRÜFUNGSSTRUKTUR (FOS Bayern):

TEIL 1 (34 BE, 60 min, OHNE Hilfsmittel/Merkhilfe/CAS):
- Analysis (22 BE): 3-4 kompakte Aufgaben, ohne CAS lösbar, "schöne" Zahlen
- Stochastik (12 BE): 2 kompakte Aufgaben, ohne CAS lösbar

TEIL 2 (66 BE, 120 min, MIT Hilfsmittel/Merkhilfe/CAS):
- Analysis (43 BE): 2 große mehrteilige Aufgaben mit Sachkontext
- Stochastik (23 BE): 1 große mehrteilige Aufgabe mit durchgängigem Sachkontext

WICHTIG: KEINE Geometrie im Fachabitur! Verhältnis Analysis:Stochastik = 65:35

FOS-LEHRPLAN:
Analysis: Ganzrationale Funktionen (Nullstellen, Symmetrie), Differenzialrechnung (Potenz-/Summen-/Faktor-/Produkt-/Quotienten-/Kettenregel), Exponentialfunktion, e-Funktion, Kurvendiskussion, Integralrechnung, gebrochen-rationale Funktionen, ln-Funktion, partielle Integration
Stochastik: Wahrscheinlichkeitsrechnung (Baumdiagramm, Pfadregeln), bedingte Wahrscheinlichkeit, Vierfeldertafel, Bernoulli-Ketten, Binomialverteilung, Erwartungswert, Sigma-Regeln, Hypothesentests (Signifikanztest, Fehler 1./2. Art)

PFLICHT-REGELN:
- JEDE Teilaufgabe MUSS einen klaren OPERATOR haben
- Teil 1 MUSS ohne CAS lösbar sein
- Kontrollwerte bei wichtigen Zwischenergebnissen angeben
- LaTeX-Notation: $\\cdot$ statt *, $e^{-x}$ mit geschweiften Klammern, $\\frac{a}{b}$, Dezimalkomma $3{,}6$

Antworte NUR mit validem JSON:
{
  "teil_a_pflicht": [
    {"id": "A1", "sachgebiet": "Analysis", "be": 7, "text": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 3}]}
  ],
  "teil_a_wahl": [],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 22, "text": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 4}]}
  ]
}
Hinweis: teil_a_pflicht = Teil 1 (ohne Hilfsmittel), teil_b = Teil 2 (mit Hilfsmitteln). teil_a_wahl bleibt leer (kein Wahlteil bei FOS).`;

  const userPrompt = `Erstelle eine vollständige FOS-Fachabiturprüfung Mathematik (100 BE).
Teil 1 (34 BE): Analysis 22 BE + Stochastik 12 BE, ohne CAS
Teil 2 (66 BE): Analysis 43 BE + Stochastik 23 BE, mit CAS
KEINE Geometrie! Jede Teilaufgabe braucht einen klaren Operator.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS MATHE ABITUR 13: GENERATE (Lineare Algebra statt Stochastik) ================= */
async function handleFOSGenerateAbitur13Mathe(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS/BOS-Abiturprüfung Mathematik 13. Klasse (Bayern, Nichttechnische Ausbildungsrichtungen, fachgebundene Hochschulreife).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit exakt 100 BE.

PRÜFUNGSSTRUKTUR (wie echte FOS-Abiturprüfung):

TEIL 1 (34 BE, 60 min, OHNE Hilfsmittel):
- Analysis (22 BE): 3-4 Aufgaben, OHNE Hilfsmittel lösbar, "schöne" Zahlen
- Lineare Algebra / Analytische Geometrie (12 BE): 2 Aufgaben

TEIL 2 (66 BE, 120 min, MIT Hilfsmitteln/Merkhilfe):
- Analysis (43 BE): 2 große mehrteilige Aufgaben mit durchgängigem Sachkontext
- Lineare Algebra / Analytische Geometrie (23 BE): 1 große mehrteilige Aufgabe mit Sachkontext

WICHTIG: KEINE Stochastik in der 13. Klasse! Stattdessen Lineare Algebra/Analytische Geometrie!

STIL DER ECHTEN PRÜFUNG (unbedingt einhalten!):
- JEDE Aufgabe in Teil 2 hat einen REALEN SACHKONTEXT (z.B. Kinderbecken, Skateboardrampe, Solarmodul, Kletterwand, Berglandschaft, Milchsäuregärung, Stromleitung)
- Aufgaben referenzieren Abbildungen ("Die nebenstehende Abbildung zeigt...", "Die untenstehende Abbildung zeigt...")
- Bei schwierigen Zwischenschritten: "Mögliche Teilergebnisse" angeben, z.B. "[Mögliches Teilergebnis: $f'(x) = ...$]"
- Hinweis "Runden Sie Ihre Ergebnisse auf eine/zwei Nachkommastelle(n)." wo nötig
- Hinweis "Auf die Mitführung von Einheiten bei den Rechnungen kann verzichtet werden." bei Sachkontexten
- Teil 1 Analysis: Aufgaben zu gebrochen-rationalen Funktionen (Definitionslücken, Asymptoten, Nullstellen), Gleichungen lösen (e-Funktion, ln), Integrale berechnen
- Teil 1 LinAlg: Punkte/Vektoren im R³, Ebenengleichungen, Flächeninhalt, Orthogonalität zeigen
- Teil 2 Analysis: Komplexe Kurvendiskussionen mit Kontext, Monotonie, Extrema, Wendepunkte, Integrale, Tangenten, Zeichnungen
- Teil 2 LinAlg: Geraden/Ebenen im R³, Abstände, Winkel, Flächeninhalte, LGS lösen

NUMMERIERUNG (wie Original-Prüfungen):
- Teil 1: Aufgaben 1, 2, 3, 4 (durchnummeriert innerhalb Analysis bzw. LinAlg)
- Teilaufgaben: 1.1, 1.2, 2.1, 2.2 etc.
- Zusammengehörige Aufgaben: 1.0 (Kontext ohne eigene BE), 1.1 (erste Teilaufgabe), 1.2, 1.3 etc.
- Teil 2: Ebenfalls 1.0, 1.1, 1.2, ..., 2.0, 2.1, 2.2

FOS-LEHRPLAN (13. Klasse):
Analysis: Gebrochen-rationale Funktionen (Definitionslücken: stetig behebbar vs. Polstelle, senkrechte/waagrechte Asymptoten), ln-Funktion und ihre Eigenschaften, e-Funktion mit komplexeren Exponenten, komplexe Kurvendiskussion (Symmetrie, Nullstellen, Extrema, Wendepunkte, Monotonie, Krümmung), partielle Integration, uneigentliche Integrale, Parameteraufgaben, Tangenten/Normalen, Flächenberechnung
Lineare Algebra/Analytische Geometrie: Vektoren im R³ (Addition, skalare Multiplikation, Linearkombination), Skalarprodukt und Orthogonalität, Kreuzprodukt und Flächeninhalt, Winkelberechnung, Geraden im Raum (Parameterform), Lagebeziehungen von Geraden, Ebenen (Parameter-/Normalen-/Koordinatenform, Umrechnung), Abstände (Punkt-Ebene, Punkt-Gerade), Schnittwinkel, Volumenberechnung, Lineare Gleichungssysteme (3×3)

PFLICHT-REGELN:
- JEDE Teilaufgabe MUSS einen klaren OPERATOR haben (Berechnen Sie, Zeigen Sie, Ermitteln Sie, Geben Sie an, Bestimmen Sie, Zeichnen Sie, Überprüfen Sie, Benennen Sie)
- Teil 1 MUSS ohne Hilfsmittel lösbar sein (einfache Zahlen, keine langen Rechnungen)
- Gesamt EXAKT 100 BE (Teil 1: exakt 34 BE, Teil 2: exakt 66 BE)
- LaTeX-Notation: $\\cdot$ statt *, $e^{-x}$ mit geschweiften Klammern, $\\frac{a}{b}$, Dezimalkomma $3{,}6$, Vektoren $\\vec{AB}$, Matrizen $\\begin{pmatrix}...\\end{pmatrix}$

Antworte NUR mit validem JSON:
{
  "teil_a_pflicht": [
    {"id": "1", "sachgebiet": "Analysis", "be": 6, "text": "Aufgabentext mit $LaTeX$", "teilaufgaben": []},
    {"id": "2", "sachgebiet": "Analysis", "be": 7, "text": "Kontexttext (2.0)", "teilaufgaben": [{"id": "2.1", "text": "...", "be": 3}, {"id": "2.2", "text": "...", "be": 4}]},
    {"id": "3", "sachgebiet": "Analysis", "be": 4, "text": "...", "teilaufgaben": []},
    {"id": "4", "sachgebiet": "Analysis", "be": 5, "text": "...", "teilaufgaben": []},
    {"id": "5", "sachgebiet": "Lineare Algebra / Analytische Geometrie", "be": 9, "text": "Kontexttext (1.0)", "teilaufgaben": [{"id": "1.1", "text": "...", "be": 3}, {"id": "1.2", "text": "...", "be": 3}, {"id": "1.3", "text": "...", "be": 3}]},
    {"id": "6", "sachgebiet": "Lineare Algebra / Analytische Geometrie", "be": 3, "text": "...", "teilaufgaben": [{"id": "2.1", "text": "...", "be": 1}, {"id": "2.2", "text": "...", "be": 2}]}
  ],
  "teil_a_wahl": [],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 30, "text": "Sachkontext mit Abbildungsverweis", "teilaufgaben": [{"id": "1.1", "text": "...", "be": 3}, {"id": "1.2", "text": "...", "be": 10}]},
    {"id": "B2", "sachgebiet": "Analysis", "be": 13, "text": "Zweiter Sachkontext", "teilaufgaben": [{"id": "2.1", "text": "...", "be": 3}]},
    {"id": "B3", "sachgebiet": "Lineare Algebra / Analytische Geometrie", "be": 23, "text": "Sachkontext im R³", "teilaufgaben": [{"id": "1.1", "text": "...", "be": 4}]}
  ]
}
Hinweis: teil_a_pflicht = Teil 1 (ohne Hilfsmittel), teil_b = Teil 2 (mit Hilfsmitteln). teil_a_wahl bleibt leer (kein Wahlteil).
WICHTIG: Die Summe aller BE in teil_a_pflicht MUSS exakt 34 sein. Die Summe aller BE in teil_b MUSS exakt 66 sein.`;

  const userPrompt = `Erstelle eine vollständige FOS-Abiturprüfung Mathematik 13. Klasse (100 BE) im Stil der echten bayerischen Prüfungen.
Teil 1 (34 BE): Analysis 22 BE + Lineare Algebra/Analytische Geometrie 12 BE, ohne Hilfsmittel
Teil 2 (66 BE): Analysis 43 BE + Lineare Algebra/Analytische Geometrie 23 BE, mit Hilfsmitteln
KEINE Stochastik! Jede Teilaufgabe mit Operator. Sachkontexte in Teil 2. Mögliche Teilergebnisse angeben.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS MATHE ABITUR 13: GRADE ================= */
async function handleGradeAbitur13Mathe(request, env) {
  const body = await request.json();
  const { teil_a_pflicht, teil_a_wahl, teil_b, student_text_a, student_text_b, images } = body;

  if (!student_text_a && !student_text_b) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  let aufgabenInfo = "TEIL 1 (34 BE, ohne Hilfsmittel):\n\n";
  aufgabenInfo += "Analysis (22 BE) + Lineare Algebra/Analytische Geometrie (12 BE):\n";
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

  aufgabenInfo += "\n\nTEIL 2 (66 BE, mit Hilfsmitteln):\n";
  aufgabenInfo += "Analysis (43 BE) + Lineare Algebra/Analytische Geometrie (23 BE):\n";
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

  const rubricPrompt = `Du bewertest eine vollständige Mathematik-Abiturprüfung der FOS 13. Klasse (Bayern, fachgebundene Hochschulreife, 100 BE).

PRÜFUNGSSTRUKTUR:
- Teil 1 (34 BE): Analysis (22 BE) + Lineare Algebra/Analytische Geometrie (12 BE), OHNE Hilfsmittel
- Teil 2 (66 BE): Analysis (43 BE) + Lineare Algebra/Analytische Geometrie (23 BE), MIT Hilfsmitteln
- KEINE Stochastik in der 13. Klasse!
- Gesamt: 100 BE

BEWERTUNGSREGELN:
- Bewerte jede Teilaufgabe einzeln: Ansatz, Rechnung, Ergebnis
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen (korrektes Weiterrechnen mit falschem Zwischenergebnis → Punkte)
- Der Schüler schreibt in einer Mischung aus Plain-Text-Mathe und LaTeX-Notation ($...$). Interpretiere beides großzügig.
- Auch Skizzen/Zeichnungen gelten als Teil der Lösung

ANTWORT-FORMAT:
- Mathematik-typische Darstellungsformen sind erwünscht: Formeln, Berechnungen, Skizzen, Tabellen, Gleichungsketten
- Stichpunkte bei Rechenwegen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (Offizieller FOS-Schlüssel):
96 BE → 15, 91 → 14, 86 → 13, 81 → 12, 76 → 11, 71 → 10
66 → 9, 61 → 8, 56 → 7, 51 → 6, 46 → 5, 41 → 4
34 → 3, 27 → 2, 20 → 1, <20 → 0
Bei x,5 BE wird zugunsten des Prüflings aufgerundet.

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.
LATEX-REGELN: $\\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\\exp(...)$), $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.

Antworte NUR mit validem JSON:
{
  "teil_a_be": <0-34>,
  "teil_b_be": <0-66>,
  "gesamt_be": <0-100>,
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben: Teil 1 Analysis, Teil 1 LinAlg/AnalGeo, Teil 2 Analysis, Teil 2 LinAlg/AnalGeo. Stärken, Fehler, korrekte Lösungswege>"
}`;

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülerlösung Teil 1 (ohne Hilfsmittel):\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülerlösung Teil 2 (mit Hilfsmitteln):\n${truncate(student_text_b, 12000)}`;

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
      // Offizieller FOS-Notenschlüssel
      const table = [[96, 15], [91, 14], [86, 13], [81, 12], [76, 11], [71, 10], [66, 9], [61, 8], [56, 7], [51, 6], [46, 5], [41, 4], [34, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      // Bei x,5 zugunsten des Prüflings aufrunden
      const be = gesamtBE % 1 === 0.5 ? Math.ceil(gesamtBE) : gesamtBE;
      for (const [th, n] of table) { if (be >= th) { np = n; break; } }
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

/* ================= FOS MATHE ABITUR 13: MODEL ANSWER ================= */
async function handleModelAnswerAbitur13Mathe(request, env) {
  const { teil_a_pflicht, teil_a_wahl, teil_b } = await request.json();

  const systemPrompt = `Du bist ein Mathematik-Experte für die FOS-Abiturprüfung 13. Klasse (Bayern, fachgebundene Hochschulreife).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für die GESAMTE Abiturprüfung.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\\exp(...)$), $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- Formatiere als Markdown mit klaren Überschriften:
  ## Teil 1 – Ohne Hilfsmittel (34 BE)
  ### Analysis
  #### Aufgabe 1 (x BE)
  ...
  ### Lineare Algebra / Analytische Geometrie
  #### Aufgabe 1 (x BE)
  ...
  ## Teil 2 – Mit Hilfsmitteln (66 BE)
  ### Analysis
  #### Aufgabe 1 (x BE)
  ...
  ### Lineare Algebra / Analytische Geometrie
  #### Aufgabe 1 (x BE)
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis
- KEINE Stochastik — 13. Klasse hat Lineare Algebra/Analytische Geometrie statt Stochastik`;

  let userContent = "TEIL 1 – OHNE HILFSMITTEL (34 BE):\n";
  userContent += "Analysis (22 BE) + Lineare Algebra/Analytische Geometrie (12 BE):\n";
  if (teil_a_pflicht && teil_a_pflicht.length) {
    for (const a of teil_a_pflicht) {
      userContent += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }
  userContent += "\nTEIL 2 – MIT HILFSMITTELN (66 BE):\n";
  userContent += "Analysis (43 BE) + Lineare Algebra/Analytische Geometrie (23 BE):\n";
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

/* ================= FOS BWR ABITUR: GENERATE (FAP 12) ================= */
async function handleFOSGenerateAbiturBWR(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS-Fachabiturprüfung BwR (Betriebswirtschaftslehre mit Rechnungswesen) in Bayern.
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung.

PRÜFUNGSSTRUKTUR (FOS Bayern, BwR FAP 12. Klasse):
- Bearbeitungszeit: 180 Minuten
- Hilfsmittel: ISB-Merkhilfe BwR, relevante Gesetzestexte, nicht programmierbarer Taschenrechner
- ALLE 3 Aufgaben sind Pflicht (kein Wahlteil!)
- Gesamt: ca. 80-85 BE
- WICHTIG: Es dürfen NUR Themen aus BwR 11 und BwR 12 abgefragt werden! Themen aus BwR 13 sind VERBOTEN!

AUFGABE I (ca. 30-35 BE) – Jahresabschluss & Bewertung:
Durchgängiger Unternehmenskontext (AG, Industrieunternehmen).
Erlaubte Themen (aus BwR 12 LB3):
- Anschaffungskosten, Herstellungskosten, beizulegender Wert ermitteln
- Bewertung nicht abnutzbares Sachanlagevermögen (außerplanmäßige Abschreibung + Wertaufholung)
- Bewertung abnutzbares Anlagevermögen (lineare Abschreibung + außerplanmäßige Abschreibung; KEINE Wertaufholung)
- Bewertung Finanzanlagevermögen (Wertpapiere des Anlagevermögens)
- Bewertung Forderungen (Einzelwertberichtigung EWB, Pauschalwertberichtigung PWB)
- Bewertung Rohstoffe/Fremdbauteile (Durchschnittswertverfahren + Niederstwertprinzip)
- Rückstellungen für Altersversorgung
- GuV nach Gesamtkostenverfahren (§275 (2) HGB, Staffelform)
- Ergebnisverwendungsrechnung AG (Eigenkapitalausweis vor/nach teil./vollständiger Ergebnisverwendung)
- Vorbereitende Abschlussbuchungen und Abschlussbuchungen

AUFGABE II (ca. 25 BE) – Kostenrechnung:
Anderer Unternehmenskontext.
Erlaubte Themen (aus BwR 11 LB5 + BwR 12 LB1):
Vollkostenrechnung (BwR 11 LB5):
- Zuschlagskalkulation (Vorwärts-, Rückwärts-, Differenzkalkulation)
- Maschinenstundensatz (kalkulatorische Abschreibungen vom WBW, kalk. Zinsen, Raumkosten, Energiekosten, Instandhaltung)
- BAB (ein-/mehrstufig, max. 5 Hauptkostenstellen, einfache Kostenumlage)
- Kostenträgerzeitrechnung (2 Kostenträger, Normalkostenbereich)
- Bestandsveränderungen an unfertigen/fertigen Erzeugnissen
Teilkostenrechnung (BwR 12 LB1):
- Stück- und Gesamtdeckungsbeitrag
- Break-even-Analyse (rechnerisch und grafisch, Einproduktunternehmen)
- Mehrstufige Deckungsbeitragsrechnung
- Engpassrechnung (Beschaffung, Produktion, Absatz)
- Eigenfertigung vs. Fremdbezug (kritische Menge rechnerisch + grafisch)
- Kurz- und langfristige Preisuntergrenzen, Zusatzaufträge

AUFGABE III (ca. 25 BE) – Marketing, Finanzierung & Investition:
Dritter Unternehmenskontext.
Erlaubte Themen (aus BwR 12 LB2 + BwR 12 LB4 + BwR 11 LB2):
Marketing (BwR 12 LB2):
- BCG-Matrix (Marktwachstum-Marktanteils-Portfolio), Normstrategien
- Marketingmix: Produktpolitik, Distributionspolitik (Reisender vs. Handelsvertreter), Kontrahierungspolitik, Kommunikationspolitik
Finanzierung (BwR 12 LB4):
- Finanzierungsarten: Beteiligungsfinanzierung (ordentliche Kapitalerhöhung AG), Kreditfinanzierung (Annuitäten-/Abzahlungsdarlehen, Kontokorrentkredit), Selbstfinanzierung (offen + still), Finanzierung aus Rückstellungen/Abschreibung
- Bewegungsbilanz
Investition (BwR 12 LB4):
- NUR statische Verfahren: Kostenvergleichs-, Gewinnvergleichs-, Rentabilitäts- und Amortisationsrechnung
Beschaffung (BwR 11 LB2):
- ABC-Analyse, Bestellpunktverfahren, optimale Bestellmenge (tabellarisch, rechnerisch, grafisch)
- Lieferantenvergleich (Bezugskalkulation, Nutzwertanalyse)

VERBOTENE THEMEN (BwR 13 – NICHT verwenden!):
- Kapitalwertmethode / dynamische Investitionsrechnung
- Plankostenrechnung (Beschäftigungs-/Verbrauchsabweichung)
- Bilanzanalyse / Strukturbilanz / Bilanzkennzahlen (Leverage-Effekt, ROI, Cashflow etc.)
- Balanced Scorecard (BSC)
- Leasing, Factoring
- Lohmann-Ruchti-Effekt (Kapazitätserweiterungseffekt)
- Anpassungsformen (zeitlich, intensitätsmäßig, quantitativ, selektiv)
- Produktionsfunktion Typ B, Verbrauchsfunktionen, Kostenfunktionen
- Nutzkosten, Leerkosten, Kostenremanenz
- Motivationstheorien, Führungsstile, Personalentwicklung

PFLICHT-REGELN:
- Jede Aufgabe hat einen EIGENEN Unternehmenskontext (Name, Branche, Situation)
- BE-Angaben an JEDER Teilaufgabe
- Realistische Zahlen (Geschäftsjahr, Bilanzstichtag etc.)
- Tabellen und Kontoauszüge direkt in der Aufgabe

NUMMERIERUNG DER TEILAUFGABEN (WICHTIG – wie Original-Prüfungen!):
- KEINE Buchstaben a), b), c), d) verwenden! Nur Dezimalnotation!
- Gliederung innerhalb jeder Aufgabe (I, II, III):
  Ebene 1: 1, 2, 3, 4 (Hauptthemen, oft mit Kontexttext/Daten)
  Ebene 2: 1.1, 1.2, 1.3 (Teilaufgaben)
  Ebene 3: 1.2.1, 1.2.2, 1.2.3 (Unteraufgaben, nur wenn nötig)
- Hauptnummern (1, 2, 3) können eigenen Einführungstext mit Daten/Tabellen enthalten, bevor die Teilaufgaben kommen
- Schreibe KEINE Operatoren in Klammern hinter die Aufgaben (KEIN "(Operator: berechnen)" etc.)
- Verwende die Operatoren natürlich im Aufgabentext selbst (z.B. "Berechnen Sie..." oder "Begründen Sie...")
- ${KEINE_LOESUNGSHINWEISE}

TABELLEN FÜR ZAHLENMATERIAL (WICHTIG!):
- Verwende im "kontext"-Feld Markdown-Tabellen für alle tabellarischen Daten:
  Bilanzen, Bilanzauszüge, GuV-Auszüge, Kontoauszüge, T-Konten, BAB, Offene-Posten-Listen, Lagerlisten, Anlagenspiegel, Darlehenspläne, Kalkulationsschemata, Kostenaufstellungen
- Markdown-Tabellen-Format: | Spalte1 | Spalte2 |\\n|---|---|\\n| Wert1 | Wert2 |
- Beispiel Bilanzauszug: "| Aktiva | € | Passiva | € |\\n|---|---|---|---|\\n| Grundstücke | 500.000 | Gezeichnetes Kapital | 400.000 |\\n| Maschinen | 280.000 | Kapitalrücklage | 150.000 |"
- Beispiel Offene-Posten-Liste: "| Kunde | Forderung (netto) | Bemerkung |\\n|---|---|---|\\n| Kunde K1 | 18.000 € | Zahlungsschwierigkeiten |\\n| Kunde K2 | 7.500 € | Insolvenzverfahren eröffnet |"
- Auch Teilaufgaben dürfen Tabellen enthalten, z.B. für Kostendaten oder Produktdaten

Antworte NUR mit validem JSON:
{
  "titel": "Fachabiturprüfung BwR 2025",
  "gesamt_be": 85,
  "zeit": 180,
  "hilfsmittel": "ISB-Merkhilfe BwR, relevante Gesetzestexte, nicht programmierbarer Taschenrechner",
  "aufgaben": [
    {
      "id": "I",
      "titel": "Aufgabe I – Jahresabschluss & Bewertung",
      "kontext": "Ausführlicher Unternehmenskontext mit Unternehmensbeschreibung...",
      "gesamt_be": 35,
      "teilaufgaben": [
        {"nr": "1", "text": "Einleitungstext mit Daten/Tabellen für dieses Thema (Bilanzauszug etc.)...", "be": 0},
        {"nr": "1.1", "text": "Ermitteln und begründen Sie den Bilanzansatz...", "be": 7},
        {"nr": "1.2", "text": "Weiterer Kontexttext für nächste Teilaufgabe...", "be": 0},
        {"nr": "1.2.1", "text": "Beschreiben und beurteilen Sie...", "be": 5},
        {"nr": "1.2.2", "text": "Berechnen Sie...", "be": 3},
        {"nr": "2", "text": "Neues Thema mit eigenem Kontexttext...", "be": 0},
        {"nr": "2.1", "text": "Erstellen Sie...", "be": 10}
      ]
    },
    {"id": "II", "titel": "Aufgabe II – Kostenrechnung", "kontext": "...", "gesamt_be": 25, "teilaufgaben": [...]},
    {"id": "III", "titel": "Aufgabe III – Marketing, Finanzierung & Investition", "kontext": "...", "gesamt_be": 25, "teilaufgaben": [...]}
  ]
}
WICHTIG zur Nummerierung:
- Hauptnummern (1, 2, 3, 4) haben be: 0 wenn sie nur Kontexttext/Daten enthalten und KEINE eigene Aufgabenstellung sind
- Hauptnummern haben be > 0 wenn sie SELBST eine Aufgabenstellung sind (z.B. "Überprüfen Sie rechnerisch...")
- Teilaufgaben (1.1, 1.2, 2.1) haben IMMER be > 0
- NIEMALS a), b), c), d) verwenden!`;

  const userPrompt = `Erstelle eine vollständige FOS-Fachabiturprüfung BwR (ca. 85 BE).
Aufgabe I: Jahresabschluss & Bewertung (~35 BE) – nur BwR 12 LB3-Themen.
Aufgabe II: Kostenrechnung (~25 BE) – nur BwR 11 LB5 + BwR 12 LB1-Themen.
Aufgabe III: Marketing, Finanzierung & Investition (~25 BE) – nur BwR 12 LB2 + LB4 + BwR 11 LB2-Themen.
Jede Aufgabe braucht einen eigenen Unternehmenskontext, realistische Zahlen und BE an jeder Teilaufgabe.
KEINE Themen aus BwR 13 verwenden!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS BWR ABITUR 13: GENERATE (fachgeb./allg. Hochschulreife) ================= */
async function handleFOSGenerateAbitur13BWR(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS/BOS-Abiturprüfung BwR (Betriebswirtschaftslehre mit Rechnungswesen) 13. Klasse in Bayern.
Erstelle eine VOLLSTÄNDIGE Abiturprüfung für die fachgebundene/allgemeine Hochschulreife.
Die Prüfung soll sich am Stil und Niveau der echten FOSBOS-Abiturprüfungen orientieren.

PRÜFUNGSFORMAT:
- Bearbeitungszeit: 180 Minuten (09:00 – 12:00 Uhr)
- Hilfsmittel: ISB-Merkhilfe BwR, relevante Gesetzestexte, nicht programmierbarer Taschenrechner
- BEIDE Aufgaben sind Pflicht (kein Wahlteil!)
- Gesamt: 100 BE (Bewertungseinheiten)
- Hinweise: "Bearbeiten Sie alle Aufgaben. Bei der jeweiligen Lösung sind auch die Ansätze für die einzelnen Lösungsschritte sowie die dazugehörigen Nebenrechnungen niederzuschreiben. Gebräuchliche Abkürzungen sollen verwendet werden. Geldbeträge, Kennzahlen und Prozentsätze sind grundsätzlich auf zwei Kommastellen zu runden. Der Umsatzsteuersatz beträgt 19 % bzw. 7 % für Umsätze im Inland. Für Umsätze mit dem Ausland bleibt die Umsatzsteuer unberücksichtigt."

AUFGABE I (ca. 55 BE) – Bilanzanalyse, Investition, Kostenanpassung & HGB-Bewertung:
Durchgängiger Unternehmenskontext: Eine AG (Industrieunternehmen, fiktiver Name, konkreter Firmensitz in Bayern).

Aufgabe I MUSS folgende 4 Themenbereiche abdecken (wie in echten Prüfungen):

1. BILANZANALYSE (ca. 20-25 BE):
   - Vollständige Bilanz mit 2 Geschäftsjahren (Aktiva + Passiva, Werte in Tsd. €)
   - Bilanzpositionen: Grundstücke, Gebäude, Maschinen, BGA, Finanzanlagen, RHB-Stoffe/Vorräte, Fertigerzeugnisse, Geleistete Anzahlungen, Forderungen aLL, Wertpapiere UV, Kasse, Bank | Gezeichnetes Kapital, Kapitalrücklage, Gesetzliche Rücklage, Andere Gewinnrücklagen, Gewinnvortrag, Jahresüberschuss, Pensionsrückstellungen, Sonstige Rückstellungen, Langfr. Verbindlichkeiten, Erhaltene Anzahlungen, Verbindlichkeiten aLL
   - Kapitalerhöhung oder besondere Dividendenregelung (alte/junge Aktien, zeitanteilig)
   - GuV-Auszug: Abschreibungen, Zinserträge, Zinsaufwendungen (ggf. Umsatzerlöse)
   - Branchenwerte als Vergleich
   - Aufgabenstellung: Ergebnisverwendungsrechnung + Strukturbilanz erstellen (ca. 7 BE)
   - Kennzahlen berechnen und beurteilen (ca. 7 BE): z.B. EK-Quote + dynamischer Verschuldungsgrad ODER AD I + AD II + statischer Verschuldungsgrad
   - EK-Rentabilität + GK-Rentabilität berechnen (ca. 3 BE)
   - Leverage-Effekt diskutieren / Finanzierungsentscheidung begründen (ca. 5 BE)

2. INVESTITIONSRECHNUNG (ca. 13 BE):
   - 2 Investitionsalternativen mit Daten (AK, ND, Kapazität, variable Kosten, Fixkosten)
   - Kostenvergleich oder Amortisationsrechnung (ca. 4 BE)
   - Kapitalwertmethode: Zahlungsreihe über 3-6 Jahre mit Barwertberechnung (ca. 6 BE)
   - Beurteilung/Empfehlung formulieren (ca. 3 BE)
   - ODER: Lohmann-Ruchti-Effekt mit Tabelle (ca. 5 BE) + Kapitalwertmethode (ca. 6 BE)

3. KOSTENANPASSUNG (ca. 14-16 BE):
   - Mehrere Produktionsanlagen (2-3) mit unterschiedlichen Fixkosten, variablen Stückkosten und Kapazitäten
   - Einheitlicher Verkaufspreis
   - Selektive Anpassung: Reihenfolge nach Stückdeckungsbeitrag bestimmen
   - Gesamtgewinnfunktion G(x) abschnittsweise aufstellen (ca. 5 BE)
   - Gewinnschwellenmenge berechnen (ca. 4 BE)
   - Anpassungsmaßnahme prüfen: z.B. intensitätsmäßige Anpassung einer Anlage → neuer db, Empfehlung (ca. 7 BE)
   ODER:
   - Intensitätsmäßige vs. zeitliche Anpassung: Verbrauchsfunktion V(y), optimale Intensität, Überstundenzuschlag berechnen

4. HGB-BEWERTUNG (ca. 7 BE):
   - Tochterunternehmen oder eigene Abteilung
   - Eingangsrechnung (Listenpreis, Rabatt, Transport, Montage, Wartung, USt, Skonto)
   - AK ermitteln (was gehört dazu, was nicht?)
   - Lineare AfA, ggf. monatsgenau
   - Außerplanmäßige Abschreibung (Wasserschaden o.ä. → beizulegender Wert)
   - Bilanzansatz ermitteln und begründen (gemildertes Niederstwertprinzip)
   ODER:
   - Vorratsbewertung: Durchschnittswertverfahren, strenges Niederstwertprinzip

AUFGABE II (ca. 45 BE) – Controlling, Personal & Strategisches Management:
Anderer Unternehmenskontext (anderes Unternehmen, andere Branche, konkreter Firmensitz).
SWOT-Analyse oder Stärken-Schwächen-Profil (mit Wettbewerber-Vergleich) als zentrale Informationsgrundlage!

1. PLANKOSTENRECHNUNG (ca. 12-17 BE):
   - Ein Werk, ein Produkt, monatliche Kapazität
   - Daten für 2 Monate (z.B. Mai und Juni) mit unterschiedlichen Plan-/Ist-Werten
   - Berechnung: Fixkosten (KF), variable Stückkosten (kv), Sollkosten (SK), verrechnete Plankosten (verr. PK), BA, VA
   - Grafische Darstellung (Skizze beschreiben) in der Gesamtbetrachtung
   - BSC-Maßnahme zur Vermeidung der Verbrauchsabweichung (strategisches Ziel, Kennzahl, Maßnahmen)

2. PERSONALMANAGEMENT (ca. 11-16 BE):
   - Bezug auf Stärken-Schwächen-Profil oder SWOT
   - Diskussion einer aktuellen Maßnahme/Situation (z.B. "Job-Turbo", Fachkräftemangel, Umfrageergebnis)
   - Personalentwicklungsmaßnahme beschreiben (on-the-job, off-the-job etc.)
   - Ursache-Wirkungskette über alle 4 BSC-Perspektiven
   - ODER: Verhaltensgitter Blake & Mouton anhand einer Führungskraft-Beschreibung
   - ODER: Motivationsanalyse mit Locke & Latham oder Herzberg

3. STRATEGISCHES MANAGEMENT (ca. 8-13 BE):
   - BCG-Portfolio mit SGE-Daten (Marktwachstum, relativer Marktanteil)
   - Normstrategie für eine SGE ableiten
   - Produktpolitische Maßnahme (Produktvariation, -innovation, -diversifikation, -elimination) zuordnen
   - ODER: Optimale Bestellmenge (Andler-Formel) + Bestellintervall
   - ODER: Lieferantenauswahl mit Nutzwertanalyse

PFLICHT-REGELN:
- Jede Aufgabe hat einen EIGENEN Unternehmenskontext (Name, Branche, Situation)
- BE-Angaben an JEDER Teilaufgabe (Zahl im JSON)
- Realistische Zahlen (Bilanzsummen 5-150 Mio. €, passende Verhältnisse)
- Tabellen als Markdown im kontext-Feld
- Nennwert der Aktien: 5,00 € pro Aktie (wie in echten Prüfungen)
- Alle Geldbeträge mit 2 Dezimalstellen und € oder Tsd. €

NUMMERIERUNG (wie Original-Prüfungen):
- KEINE Buchstaben a), b), c), d)! Nur Dezimalnotation!
- Ebene 1: 1, 2, 3, 4 (Hauptthemen, oft mit Kontexttext/Daten)
- Ebene 2: 1.1, 1.2, 1.3 (Teilaufgaben)
- Ebene 3: 1.2.1, 1.2.2, 1.2.3 (Unteraufgaben)
- KEINE Operatoren in Klammern (KEIN "(Operator: berechnen)")
- Operatoren natürlich im Aufgabentext ("Berechnen Sie...", "Begründen Sie...")
- ${KEINE_LOESUNGSHINWEISE}

TABELLEN IM KONTEXT-FELD:
- Bilanz: Markdown-Tabelle mit Aktiva/Passiva und 2 Geschäftsjahren
- Eingangsrechnung: Als formatierter Text mit Positionen
- Plankostenrechnungsdaten: In Fließtext mit Zahlen eingebettet (wie in echten Prüfungen)
- Stärken-Schwächen-Profil oder SWOT-Analyse: Als Markdown-Tabelle

Antworte NUR mit validem JSON:
{
  "titel": "Abiturprüfung BwR – 13. Klasse",
  "gesamt_be": 100,
  "zeit": 180,
  "hilfsmittel": "ISB-Merkhilfe BwR, relevante Gesetzestexte, nicht programmierbarer Taschenrechner",
  "aufgaben": [
    {
      "id": "I",
      "titel": "Aufgabe I",
      "kontext": "Ausführlicher Unternehmenskontext mit Bilanz-Tabelle (2 Jahre), GuV-Auszug, Branchenwerte, Investitionsdaten, Anlagendaten, Rechnungsdaten...",
      "gesamt_be": 55,
      "teilaufgaben": [
        {"nr": "1", "text": "Einleitungstext zur Bilanzanalyse mit Verweis auf Bilanz im Kontext...", "be": 0},
        {"nr": "1.1", "text": "Erstellen Sie die vollständige Ergebnisverwendungsrechnung für das Jahr 2024 sowie die Strukturbilanz zum 31.12.2024.", "be": 7},
        {"nr": "1.2", "text": "Beschreiben und beurteilen Sie die Eigenkapitalquote sowie den dynamischen Verschuldungsgrad.", "be": 7},
        {"nr": "1.2.1", "text": "...", "be": 3},
        {"nr": "2", "text": "Investitionskontext mit Daten zu 2 Maschinen...", "be": 0},
        {"nr": "2.1", "text": "Formulieren Sie eine Empfehlung...", "be": 4},
        {"nr": "3", "text": "Kostenanpassungs-Kontext mit Anlagendaten...", "be": 0},
        {"nr": "3.1", "text": "Ermitteln Sie die Gesamtgewinnfunktion G(x)...", "be": 5},
        {"nr": "4", "text": "HGB-Bewertungskontext mit Eingangsrechnung...", "be": 7}
      ]
    },
    {
      "id": "II",
      "titel": "Aufgabe II",
      "kontext": "Anderer Unternehmenskontext mit SWOT-Analyse oder Stärken-Schwächen-Profil...",
      "gesamt_be": 45,
      "teilaufgaben": [
        {"nr": "1", "text": "Plankostenrechnungs-Kontext...", "be": 0},
        {"nr": "1.1", "text": "Berechnen Sie die Beschäftigungs- und Verbrauchsabweichung...", "be": 5},
        {"nr": "2", "text": "Personal-Kontext...", "be": 0},
        {"nr": "2.1", "text": "Diskutieren Sie...", "be": 5}
      ]
    }
  ]
}
WICHTIG:
- Hauptnummern (1, 2, 3, 4) mit be: 0 = nur Kontext/Daten, keine Aufgabenstellung
- Hauptnummern mit be > 0 = sind SELBST eine Aufgabenstellung
- Teilaufgaben (1.1, 1.2, 2.1) haben IMMER be > 0
- Summe aller BE einer Aufgabe = gesamt_be dieser Aufgabe
- Summe beider Aufgaben = 100 BE
- NIEMALS a), b), c), d) verwenden!`;

  const userPrompt = `Erstelle eine vollständige FOS/BOS-Abiturprüfung BwR 13. Klasse (100 BE gesamt).
Aufgabe I (~55 BE): Bilanzanalyse mit Ergebnisverwendungsrechnung AG + Strukturbilanz + Kennzahlen (~22 BE) + Investitionsrechnung mit Kapitalwertmethode + Amortisation (~13 BE) + Kostenanpassung mit selektiver Anpassung + Gewinnfunktionen + GSM (~13 BE) + HGB-Bewertung mit Eingangsrechnung + AfA + Bilanzansatz (~7 BE). Ein durchgängiger AG-Unternehmenskontext.
Aufgabe II (~45 BE): Plankostenrechnung mit Abweichungsanalyse + Skizze-Aufgabe (~14 BE) + BSC mit strategischem Ziel + Kennzahl + Maßnahmen (~7 BE) + Personalmanagement mit Führungsstil oder Motivationstheorie + PE-Maßnahme + Ursache-Wirkungskette (~16 BE) + Strategisches Management mit Portfolio-Analyse oder optimaler Bestellmenge (~8 BE). Anderer Unternehmenskontext mit Stärken-Schwächen-Profil oder SWOT-Analyse.
Realistische Zahlen, vollständige Bilanz mit 2 Jahren, Markdown-Tabellen.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS IBV ABITUR: GENERATE (FAP 12) ================= */
async function handleFOSGenerateAbiturIBV(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS-Fachabiturprüfung Internationale Betriebswirtschaftslehre und Volkswirtschaftslehre (IBV) in Bayern.
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung.

PRÜFUNGSSTRUKTUR (FOS Bayern, IBV FAP 12. Klasse):
- Bearbeitungszeit: 180 Minuten
- Hilfsmittel: ISB-Merkhilfe BwR/IBV, relevante Gesetzestexte, nicht programmierbarer Taschenrechner
- ALLE 3 Aufgaben sind Pflicht
- Gesamt: ca. 80-85 BE
- WICHTIG: Es dürfen NUR Themen aus IBV 11 und IBV 12 abgefragt werden! Themen aus IBV 13 sind VERBOTEN!

AUFGABE I (ca. 30-35 BE) – Jahresabschluss & internationaler Geschäftsverkehr:
Durchgängiger internationaler Unternehmenskontext (AG mit Auslandsgeschäft).
Erlaubte Themen (aus IBV 12 LB1):
- Anschaffungskosten, Herstellungskosten, beizulegender Wert
- Bewertung nicht abnutzbares Sachanlagevermögen (außerplanmäßige Abschreibung + Wertaufholung)
- Bewertung abnutzbares Anlagevermögen (lineare AfA + außerplanmäßige Abschreibung; KEINE Wertaufholung)
- Bewertung Finanzanlagevermögen (Wertpapiere)
- Bewertung Forderungen (EWB) + Fremdwährungsforderungen
- Bewertung Fremdwährungsverbindlichkeiten
- Bewertung Rohstoffe (Durchschnittswertverfahren)
- Rückstellungen für Altersversorgung
- GuV nach Gesamtkostenverfahren (§275 (2) HGB, Staffelform)
- Ergebnisverwendung AG
- Vergleich HGB vs. IFRS (Bestandteile der Rechnungslegung)
Zusätzlich aus IBV 11 LB1:
- Internationalisierungsmotive und -dimensionen (Tochtergesellschaft, Joint Venture, Lizenz, Export)

AUFGABE II (ca. 25 BE) – Kostenrechnung:
Anderer internationaler Unternehmenskontext.
Erlaubte Themen (aus IBV 11 LB2 + IBV 12 LB3):
Vollkostenrechnung (IBV 11 LB2):
- Zuschlagskalkulation (Vorwärts-, Rückwärts-, Differenzkalkulation)
- Maschinenstundensatz (kalk. Abschreibungen vom WBW, kalk. Zinsen, Raum-, Energie-, Instandhaltungskosten)
- BAB (ein-/mehrstufig, max. 5 Hauptkostenstellen, einfache Kostenumlage)
- Kostenträgerzeitrechnung (2 Kostenträger, Normalkostenbereich)
Teilkostenrechnung (IBV 12 LB3):
- Stück- und Gesamtdeckungsbeitrag
- Break-even-Analyse (rechnerisch und grafisch, Einproduktunternehmen)
- Mehrstufige Deckungsbeitragsrechnung
- Engpassrechnung (Beschaffung, Produktion, Absatz)
- Eigenfertigung vs. Fremdbezug (kritische Menge)
- Preisuntergrenzen, Zusatzaufträge

AUFGABE III (ca. 25 BE) – Internationales Marketing, Finanzierung & VWL:
Dritter internationaler Unternehmenskontext.
Erlaubte Themen:
Finanzierung & Investition (IBV 12 LB2):
- Finanzierungsarten (Beteiligungsfinanzierung, Kreditfinanzierung, Selbstfinanzierung, Finanzierung aus Rückstellungen/Abschreibung)
- Auslandsinvestition (Direktinvestition, Portfolioinvestition)
- NUR statische Investitionsrechenverfahren (Kostenvergleich, Gewinnvergleich, Rentabilität, Amortisation)
Internationalisierung (IBV 11 LB1):
- Markteintrittsstrategien (Tochtergesellschaft, Joint Venture, Vertragsfertigung, Lizenz, Export)
- Compliancekultur
VWL – Mikroökonomie (IBV 11 LB3):
- Preisbildung bei vollständiger Konkurrenz, Gleichgewichtspreis
- Konsumenten-/Produzentenrente, Gesamtwohlfahrt
- Staatliche Eingriffe in die Preisbildung (marktkonforme/marktkonträre)
- Wechselkurssysteme (freier/fester Wechselkurs, Interventionspunkte)
VWL – Makroökonomie (IBV 11 LB4 + IBV 12 LB4):
- Magisches Sechseck (wirtschaftspolitische Ziele)
- BIP (Entstehung, Verwendung), Konjunktur
- Arbeitslosigkeit (Arten, Ursachen), EZB/Geldpolitik (Zins-/Offenmarktpolitik)
- Inflation/Deflation, Fiskalpolitik, Wirtschaftsordnungen

VERBOTENE THEMEN (IBV 13 – NICHT verwenden!):
- Kapitalwertmethode / dynamische Investitionsrechnung
- Plankostenrechnung (Beschäftigungs-/Verbrauchsabweichung)
- Bilanzanalyse / Strukturbilanz / Bilanzkennzahlen (Leverage-Effekt, ROI, Cashflow etc.)
- Anpassungsformen, Produktionsfunktion Typ B, Nutzkosten/Leerkosten
- Monopol/Oligopol (Cournotscher Punkt, Preiselastizität, Gefangenendilemma)
- Wettbewerbspolitik (Kartellverbot, Fusionskontrolle)
- Angebots-/nachfrageorientierte Wirtschaftspolitik (Keynes/Neoklassik)
- Absolute/komparative Kostenvorteile, Terms of Trade
- Geldschöpfungsmultiplikator, Lorenzkurve, Gini-Koeffizient

PFLICHT-REGELN:
- Jede Aufgabe hat einen eigenen internationalen Unternehmenskontext
- BE-Angaben an jeder Teilaufgabe
- Teilweise englische Fachbegriffe verwenden
- Aufgabentitel dürfen auf Deutsch oder Englisch sein

NUMMERIERUNG DER TEILAUFGABEN (WICHTIG – wie Original-Prüfungen!):
- KEINE Buchstaben a), b), c), d) verwenden! Nur Dezimalnotation!
- Gliederung innerhalb jeder Aufgabe (I, II, III):
  Ebene 1: 1, 2, 3, 4 (Hauptthemen, oft mit Kontexttext/Daten)
  Ebene 2: 1.1, 1.2, 1.3 (Teilaufgaben)
  Ebene 3: 1.2.1, 1.2.2, 1.2.3 (Unteraufgaben, nur wenn nötig)
- Hauptnummern (1, 2, 3) können eigenen Einführungstext mit Daten/Tabellen enthalten
- Schreibe KEINE Operatoren in Klammern hinter die Aufgaben (KEIN "(Operator: berechnen)" etc.)
- Verwende die Operatoren natürlich im Aufgabentext selbst (z.B. "Berechnen Sie..." oder "Begründen Sie...")
- ${KEINE_LOESUNGSHINWEISE}

TABELLEN FÜR ZAHLENMATERIAL (WICHTIG!):
- Verwende im "kontext"-Feld Markdown-Tabellen für alle tabellarischen Daten:
  Bilanzen, Bilanzauszüge, GuV-Auszüge, Kontoauszüge, T-Konten, BAB, Offene-Posten-Listen, Lagerlisten, Anlagenspiegel, Darlehenspläne, Kalkulationsschemata, Kostenaufstellungen, Devisenkurse
- Markdown-Tabellen-Format: | Spalte1 | Spalte2 |\\n|---|---|\\n| Wert1 | Wert2 |
- Auch in Teilaufgaben-Texten dürfen Tabellen stehen, z.B. für Kostendaten oder Produktdaten

Antworte NUR mit validem JSON (gleiches Format wie BWR):
{
  "titel": "Fachabiturprüfung IBV 2025",
  "gesamt_be": 85,
  "zeit": 180,
  "hilfsmittel": "ISB-Merkhilfe BwR/IBV, relevante Gesetzestexte, nicht programmierbarer Taschenrechner",
  "aufgaben": [
    {
      "id": "I",
      "titel": "Aufgabe I – Jahresabschluss & internationaler Geschäftsverkehr",
      "kontext": "Ausführlicher internationaler Unternehmenskontext...",
      "gesamt_be": 35,
      "teilaufgaben": [
        {"nr": "1", "text": "Einleitungstext mit Daten/Tabellen...", "be": 0},
        {"nr": "1.1", "text": "Ermitteln und begründen Sie...", "be": 7},
        {"nr": "1.2", "text": "...", "be": 10},
        {"nr": "2", "text": "Neues Thema...", "be": 0},
        {"nr": "2.1", "text": "Erstellen Sie...", "be": 10}
      ]
    },
    {"id": "II", "titel": "Aufgabe II – Kostenrechnung", "kontext": "...", "gesamt_be": 25, "teilaufgaben": [...]},
    {"id": "III", "titel": "Aufgabe III – Internationales Marketing, Finanzierung & VWL", "kontext": "...", "gesamt_be": 25, "teilaufgaben": [...]}
  ]
}
WICHTIG zur Nummerierung:
- Hauptnummern (1, 2, 3, 4) haben be: 0 wenn sie nur Kontexttext/Daten enthalten
- Hauptnummern haben be > 0 wenn sie SELBST eine Aufgabenstellung sind
- Teilaufgaben (1.1, 1.2, 2.1) haben IMMER be > 0
- NIEMALS a), b), c), d) verwenden!`;

  const userPrompt = `Erstelle eine vollständige FOS-Fachabiturprüfung IBV (ca. 85 BE).
Aufgabe I: Jahresabschluss + internationaler Geschäftsverkehr (~35 BE) – nur IBV 12 LB1 + IBV 11 LB1-Themen.
Aufgabe II: Kostenrechnung (~25 BE) – nur IBV 11 LB2 + IBV 12 LB3-Themen.
Aufgabe III: Internationales Marketing, Finanzierung & VWL (~25 BE) – nur IBV 11 LB1/LB3/LB4 + IBV 12 LB2/LB4-Themen.
Jede Aufgabe braucht einen eigenen internationalen Unternehmenskontext, realistische Zahlen und BE an jeder Teilaufgabe.
KEINE Themen aus IBV 13 verwenden!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS DEUTSCH ABITUR: GENERATE (FAP 12) ================= */
async function handleFOSGenerateAbiturDeutsch(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS-Fachabiturprüfung Deutsch in Bayern.
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung mit 3 Aufgaben zur WAHL.

PRÜFUNGSSTRUKTUR (FOS Bayern, Deutsch FAP 12. Klasse):
- Bearbeitungszeit: 240 Minuten
- Hilfsmittel: Rechtschreibwörterbuch
- Der Prüfling wählt EINE von 3 Aufgaben
- Bewertung: 60 BE

AUFGABE 1 – Materialgestütztes Verfassen eines argumentierenden Textes:
- Erörterung ODER Kommentar (~800 Wörter)
- 3 Materialien (Sachtexte, Statistiken, Grafiken)
- Aktuelles, gesellschaftlich relevantes Thema

AUFGABE 2 – Erschließung eines pragmatischen Textes:
- Vollständiger Sachtext (Kommentar, Essay, Rede – ca. 600-800 Wörter)
- Zweiteilige Aufgabe: a) Analysieren Sie den Text + b) Erörtern Sie die Position

AUFGABE 3 – Analyse eines literarischen Textes:
- Prosaauszug oder Dramenszene (ca. 500-700 Wörter)
- Interpretationsaufgabe mit Kontext-Einordnung

MATERIALIEN für Aufgabe 1:
- Material 1: Sachtext/Zeitungsartikel (300-500 Wörter)
- Material 2: Statistik/Grafik (als Markdown-Tabelle)
- Material 3: Weiterer Text/Interview (200-400 Wörter)
- Alle Materialien mit Quellenangabe (Autor, Titel. In: Medium, Datum)

PFLICHT-REGELN:
- Alle 3 Aufgaben MÜSSEN unterschiedliche Themen behandeln
- Texte müssen vollständig und realistisch sein (keine Platzhalter!)
- Operatoren korrekt einsetzen
- LEHRPLAN-TREUE: FOS-Deutsch-Lehrplan Bayern

Antworte NUR mit validem JSON:
{
  "titel": "Fachabiturprüfung Deutsch 2025",
  "zeit": 240,
  "gesamt_be": 60,
  "hilfsmittel": "Rechtschreibwörterbuch",
  "aufgaben": [
    {
      "nr": 1,
      "typ": "materialgestuetztes_argumentieren",
      "titel": "Materialgestütztes Verfassen eines argumentierenden Textes",
      "thema": "Konkretes Thema",
      "aufgabenstellung": "Erörtern Sie...",
      "variante2": "Verfassen Sie einen Kommentar...",
      "materialien": [
        {"nr": "Material 1", "quelle": "Autor, Titel. In: Zeitung (Jahr)", "text": "Vollständiger Text (300-500 Wörter)..."},
        {"nr": "Material 2", "quelle": "Statistisches Bundesamt (2024)", "typ": "statistik", "text": "| Kategorie | Wert |..."},
        {"nr": "Material 3", "quelle": "...", "text": "..."}
      ]
    },
    {
      "nr": 2,
      "typ": "texterschliessung_pragmatisch",
      "titel": "Erschließung eines pragmatischen Textes",
      "thema": "...",
      "text": "Der vollständige Sachtext (600-800 Wörter)...",
      "quelle": "Autor, Titel. In: Medium (Jahr)",
      "aufgabenstellung": "a) Analysieren Sie... b) Erörtern Sie..."
    },
    {
      "nr": 3,
      "typ": "literarische_analyse",
      "titel": "Analyse eines literarischen Textes",
      "thema": "...",
      "text": "Der vollständige Textauszug (500-700 Wörter)...",
      "quelle": "Autor: Titel (Jahr)",
      "aufgabenstellung": "Interpretieren Sie..."
    }
  ]
}`;

  const userPrompt = `Erstelle eine vollständige FOS-Fachabiturprüfung Deutsch mit 3 Aufgaben zur Wahl:
1. Materialgestütztes Argumentieren (mit 3 vollständigen Materialien, aktuelles Thema)
2. Erschließung eines pragmatischen Textes (vollständiger Sachtext 600-800 Wörter)
3. Literarische Analyse (Prosaauszug 500-700 Wörter)
Alle Texte müssen vollständig und realistisch sein!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS ENGLISCH ABITUR: GENERATE (FAP 12) ================= */
async function handleFOSGenerateAbiturEnglisch(body, env) {
  const systemPrompt = `You are an expert on the Bavarian FOS Fachabiturprüfung (FAP) in English.
Create a COMPLETE exam with Reading Comprehension + Material-Based Writing.

EXAM STRUCTURE (FOS Bayern, English FAP 12th grade):
Total: 48 BE (Reading 24 + Writing 24)

PART 1 – READING COMPREHENSION (24 BE, 90 min):
3 Texts (total ~2,700 words), 3 Task groups:

Text I (~900 words, i.e. 850-950): Non-fiction article on a current topic
TASK I (8 BE):
- Part 1: Multiple Matching (5 BE) – Match statements A-H to people/sections 1-5 (3 distractors)
- Part 2: Short Answer Questions (3 BE) – 3 questions, brief answers from text

Text II (~900 words, i.e. 850-950): Non-fiction article, different topic
TASK II (8 BE):
- Part 1: Gapped Summary (6 BE) – Fill 6 gaps using words from text
- Part 2: Short Answer Questions (2 BE) – 2 questions

Text III (~900 words, i.e. 850-950): Literary text (short story)
TASK III (8 BE):
- Part 1: Multiple Choice (3 BE) – 3 MC questions, 4 options each (A-D)
- Part 2: Mediation EN→DE (5 BE) – 5 questions answered in GERMAN
- NEVER add category labels like (Inhalt), (Deutung), (Analyse), (Zusammenfassung), (Interpretation) etc. in parentheses within or after the questions. Just write the plain question.

PART 2 – MATERIAL-BASED WRITING (24 BE):
2 Tasks to choose from (student picks ONE), min. 300 words each.
Each task: argumentative essay/comment with 3 materials.
WRITING TASK FORMAT:
- "anweisung" must be SHORT and DIRECT (1-2 sentences max!), e.g. "Write a comment on the role of social media in education. Use the materials provided."
- NO long introductory text, NO background explanation, NO context paragraphs – just the task instruction.
- The materials speak for themselves – the student does NOT need a long text explaining the topic.
MATERIAL RULES:
- Maximum ONE text (short excerpt, 80-150 words). The other materials MUST be non-text types.
- Use a DIVERSE MIX from: quote (famous person, expert, politician), statistik (table, survey results, percentages), grafik (detailed description of a chart/graph/diagram), cartoon (detailed description of a political/editorial cartoon with visual elements, caption, message).
- Each task should have a DIFFERENT combination of material types.
- Statistik: Present as realistic data with source, year, specific numbers/percentages. MUST also include a "chart_data" object for visual rendering (see below).
- Grafik: MUST include a "chart_data" object for visual rendering AND a short "text" with source attribution only.
- Cartoon: Describe the visual scene, characters, speech bubbles, captions, symbols – detailed enough to analyze.
- Quote: Include the person's name, role/profession, and the full quote with context.
- Materials can be in English or German (mark typ accordingly: quote_en, quote_de, statistik, grafik, cartoon, text_en, text_de).

CHART_DATA FORMAT (REQUIRED for statistik and grafik):
"chart_data": {
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Chart title with source and year",
  "labels": ["Label1", "Label2", ...],
  "datasets": [
    {"label": "Dataset name", "data": [10, 20, 30, ...]}
  ]
}
- Use realistic, plausible data points (numbers, percentages).
- For pie/doughnut: use a single dataset. For bar/line: can use 1-3 datasets.
- Labels and dataset labels should be in the language matching the material context.

IMPORTANT:
- All texts COMPLETE and realistic, B2 level
- MC options plausible
- Multiple Matching: exactly 5 matches + 3 distractors
- Gapped Summary: gaps as ______(1), ______(2) etc.
- CORRECT ANSWERS for all Reading tasks
- Writing materials: diverse types (NOT just texts!)

Respond ONLY with valid JSON:
{
  "titel": "Fachabiturprüfung Englisch 2025",
  "gesamt_be": 48,
  "reading": {
    "be": 24,
    "zeit": 90,
    "texte": [
      {"nr": "Text I", "titel": "Title", "text": "Full text ~900 words (850-950)..."},
      {"nr": "Text II", "titel": "...", "text": "Full text ~900 words (850-950)..."},
      {"nr": "Text III", "titel": "Short Story Title", "text": "Full text ~900 words (850-950)..."}
    ],
    "tasks": [
      {
        "nr": "I", "be": 8, "referenz_text": "Text I",
        "teile": [
          {"typ": "multiple_matching", "be": 5,
           "anweisung": "Match statements A-H with people/paragraphs 1-5.",
           "items": ["1: Name/Section", "2: ...", "3: ...", "4: ...", "5: ..."],
           "statements": ["A: ...", "B: ...", "C: ...", "D: ...", "E: ...", "F: ...", "G: ...", "H: ..."],
           "loesung": {"1": "C", "2": "A", "3": "F", "4": "H", "5": "B"}},
          {"typ": "short_answer", "be": 3,
           "fragen": [
             {"nr": "2.1", "frage": "Which expression...", "be": 1, "loesung": "answer"},
             {"nr": "2.2", "frage": "...", "be": 1, "loesung": "..."},
             {"nr": "2.3", "frage": "...", "be": 1, "loesung": "..."}
           ]}
        ]
      },
      {
        "nr": "II", "be": 8, "referenz_text": "Text II",
        "teile": [
          {"typ": "gapped_summary", "be": 6,
           "text": "The article discusses ______(1) and explains that ______(2)...",
           "loesungen": {"1": "word", "2": "word", "3": "...", "4": "...", "5": "...", "6": "..."}},
          {"typ": "short_answer", "be": 2,
           "fragen": [
             {"nr": "2.1", "frage": "...", "be": 1, "loesung": "..."},
             {"nr": "2.2", "frage": "...", "be": 1, "loesung": "..."}
           ]}
        ]
      },
      {
        "nr": "III", "be": 8, "referenz_text": "Text III",
        "teile": [
          {"typ": "multiple_choice", "be": 3,
           "fragen": [
             {"nr": 1, "frage": "Question...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "D"},
             {"nr": 2, "frage": "...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "B"},
             {"nr": 3, "frage": "...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "A"}
           ]},
          {"typ": "mediation_en_de", "be": 5,
           "anweisung": "Beantworten Sie die folgenden Fragen auf DEUTSCH.",
           "fragen": [
             {"nr": "2.1", "frage": "Mit welcher Situation...", "be": 1, "loesung": "Deutsche Antwort..."},
             {"nr": "2.2", "frage": "...", "be": 1, "loesung": "..."},
             {"nr": "2.3", "frage": "...", "be": 1, "loesung": "..."},
             {"nr": "2.4", "frage": "...", "be": 1, "loesung": "..."},
             {"nr": "2.5", "frage": "...", "be": 1, "loesung": "..."}
           ]}
        ]
      }
    ]
  },
  "writing": {
    "be": 24,
    "tasks": [
      {"nr": 1, "thema": "Topic", "anweisung": "Comment on...", "materialien": [
        {"nr": 1, "typ": "quote_en", "text": "\"Quote text...\" – Name, Role (Year)"},
        {"nr": 2, "typ": "statistik", "text": "Survey by [Source] (2024): 67% of young Europeans...", "chart_data": {"type": "bar", "title": "Youth attitudes towards X – Source (2024)", "labels": ["Strongly agree", "Agree", "Neutral", "Disagree"], "datasets": [{"label": "Percentage", "data": [27, 40, 22, 11]}]}},
        {"nr": 3, "typ": "cartoon", "text": "The cartoon shows... [detailed visual description]"}
      ]},
      {"nr": 2, "thema": "Topic 2", "anweisung": "Discuss...", "materialien": [
        {"nr": 1, "typ": "text_en", "text": "Short excerpt (80-150 words)..."},
        {"nr": 2, "typ": "grafik", "text": "Source: IAB, Arbeitsweltmonitor 2025", "chart_data": {"type": "line", "title": "Average weekly commuting days (2019-2025) – IAB 2025", "labels": ["2019", "2020", "2021", "2022", "2023", "2024", "2025"], "datasets": [{"label": "Days per week", "data": [4.6, 1.2, 2.0, 2.6, 2.8, 3.0, 3.1]}]}},
        {"nr": 3, "typ": "quote_de", "text": "\"Zitat...\" – Name, Rolle (Jahr)"}
      ]}
    ]
  }
}`;

  const userPrompt = `Create a complete FOS Fachabiturprüfung English (48 BE):
Part 1 Reading (24 BE): 3 texts (~900 words each, i.e. 850-950 words), Task I (Multiple Matching + Short Answer), Task II (Gapped Summary + Short Answer), Task III (MC + Mediation EN→DE).
Part 2 Writing (24 BE): 2 tasks to choose from (essay, 300+ words, 3 materials each).
IMPORTANT for Writing materials: Use max. 1 text per task. Other materials MUST be quotes, statistics, chart/graph descriptions, or cartoon descriptions. Each task should use a DIFFERENT combination.
ALL texts complete and realistic. Include correct answers for Reading.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS ENGLISCH: ABITUR 13 (Fachgebundene/Allgemeine Hochschulreife) ================= */
async function handleFOSGenerateAbitur13Englisch(body, env) {
  const systemPrompt = `You are an expert on the Bavarian FOS/BOS Abiturprüfung (13th grade) in English for the "fachgebundene/allgemeine Hochschulreife".
Create a COMPLETE exam following the official format exactly.

EXAM STRUCTURE (FOS/BOS Bayern, English 13th grade):
Total: 60 BE (Reading 24 BE + Writing 36 BE)
Duration: 210 min (90 min Reading + 30 min break + 90 min Writing)

PART 1 – READING COMPREHENSION (24 BE, 90 min):
3 Texts (total ~2,900 words), 3 Task groups:

Text I (~900 words, i.e. 850-950): Non-fiction article on a current societal topic (e.g. media, technology, society)
TASK I: Multiple Matching (6 BE)
- 6 gaps in the text. Match each gap (1-6) with the most suitable sentence from A-I (9 sentences, 3 distractors).
- The text should have clear gap positions marked as _GAP 1_, _GAP 2_ etc.

Text II (~900 words, i.e. 850-950): Non-fiction article on science/ethics/technology
TASK II: Gapped Summary (8 BE)
- 8 gaps to fill with words/expressions from the CORRESPONDING sections of the text.
- Students must also provide the line number where they found the word.
- One word per gap line (some gaps may require two words).

Text III (~1,100 words): Literary text (novel excerpt, short story)
TASK III: Mediation Englisch-Deutsch (10 BE)
- 6 questions answered in GERMAN about the English text.
- Mix of comprehension, analysis, and interpretation questions.
- Point distribution: typically 1-2 points per question, totaling 10.
- NEVER add category labels like (Inhalt), (Deutung), (Analyse), (Zusammenfassung), (Interpretation) etc. in parentheses within or after the questions. Just write the plain question.

PART 2 – WRITING (36 BE, 90 min):

TASK IV: Mediation Deutsch→Englisch (12 BE)
- 2 German source texts (~250-300 words each) on a topic.
- Student writes a coherent English text (~150 words) covering specific aspects listed.
- 4 bullet point aspects to address.

TASK V: Material-Based Writing (24 BE)
- 2 tasks to choose from (student picks ONE), at least 300 words each.
- Each task: argumentative essay/comment/discussion with 3 materials.
- Materials mix: English text, German text, statistics/infographic, cartoon description.
- Task types: "Comment on..." or "Discuss..."
- For materials with typ "statistik" or "grafik": MUST include a "chart_data" object for visual chart rendering:
  "chart_data": {"type": "bar"|"line"|"pie"|"doughnut", "title": "Chart title with source", "labels": ["Label1","Label2",...], "datasets": [{"label": "Name", "data": [10,20,...]}]}
- The "text" field for statistik/grafik should contain ONLY the source attribution (e.g. "Source: Institut XY, 2024").

IMPORTANT:
- All texts COMPLETE and realistic, C1 level (higher than 12th grade!)
- Text I must have actual gap positions in the text body
- Gapped Summary gaps as ______(1), ______(2) etc.
- CORRECT ANSWERS for ALL Reading tasks
- Writing materials: mix of English and German
- Literary text for Task III should be from a novel or sophisticated short story

Respond ONLY with valid JSON:
{
  "titel": "Abiturprüfung Englisch 2025 – 13. Klasse",
  "gesamt_be": 60,
  "reading": {
    "be": 24,
    "zeit": 90,
    "texte": [
      {"nr": "Text I", "titel": "Title", "text": "Full text ~900 words (850-950) with _GAP 1_, _GAP 2_ etc. embedded in the text body..."},
      {"nr": "Text II", "titel": "...", "text": "Full text ~900 words (850-950) with line-numbered content..."},
      {"nr": "Text III", "titel": "Literary Title", "text": "Full literary text ~1100 words..."}
    ],
    "tasks": [
      {
        "nr": "I", "be": 6, "referenz_text": "Text I",
        "teile": [
          {"typ": "multiple_matching", "be": 6,
           "anweisung": "There are six gaps in the text. Match each gap (1-6) with the most suitable sentence (A-I). There are three more options than you need.",
           "items": ["1", "2", "3", "4", "5", "6"],
           "statements": ["A: Full sentence...", "B: ...", "C: ...", "D: ...", "E: ...", "F: ...", "G: ...", "H: ...", "I: ..."],
           "loesung": {"1": "G", "2": "D", "3": "I", "4": "A", "5": "E", "6": "B"}}
        ]
      },
      {
        "nr": "II", "be": 8, "referenz_text": "Text II",
        "teile": [
          {"typ": "gapped_summary", "be": 8,
           "anweisung": "Fill the gaps in the summary with appropriate words or expressions (one word per line) from the corresponding sections of the text. Do not make any changes. Please also provide the number of the line.",
           "text": "The article explains that ______(1) ... research shows ______(2) ...",
           "loesungen": {"1": "word", "2": "word", "3": "...", "4": "...", "5": "...", "6": "...", "7": "...", "8": "..."}}
        ]
      },
      {
        "nr": "III", "be": 10, "referenz_text": "Text III",
        "teile": [
          {"typ": "mediation_en_de", "be": 10,
           "anweisung": "Bearbeiten Sie die folgenden Aufgaben auf Deutsch.",
           "fragen": [
             {"nr": "1", "frage": "Was ist konkret damit gemeint, wenn...", "be": 1, "loesung": "Deutsche Antwort..."},
             {"nr": "2", "frage": "Inwiefern unterscheiden sich...", "be": 2, "loesung": "..."},
             {"nr": "3", "frage": "Welcher bildhafte Vergleich...", "be": 2, "loesung": "..."},
             {"nr": "4", "frage": "Inwiefern unterscheidet sich...", "be": 2, "loesung": "..."},
             {"nr": "5", "frage": "Welche beiden Ziele...", "be": 2, "loesung": "..."},
             {"nr": "6", "frage": "Weshalb ist ... irritiert...", "be": 1, "loesung": "..."}
           ]}
        ]
      }
    ]
  },
  "writing": {
    "be": 36,
    "mediation_de": {
      "be": 12,
      "anweisung": "Prepare an overview for a presentation. Write a coherent English text (ca. 150 words) using the two source texts below. Address the following aspects:",
      "aspekte": ["Aspect 1", "Aspect 2", "Aspect 3", "Aspect 4"],
      "texte": [
        {"titel": "Text 1: German Title", "text": "German source text 1 (~250-300 words)..."},
        {"titel": "Text 2: German Title", "text": "German source text 2 (~250-300 words)..."}
      ]
    },
    "tasks": [
      {"nr": 1, "thema": "Topic", "anweisung": "Comment on the importance of... and ways to achieve it. Write at least 300 words. Include information from all the material provided.", "materialien": [
        {"nr": 1, "typ": "text_de", "text": "German source..."},
        {"nr": 2, "typ": "statistik", "text": "Source: Institut XY (2024)", "chart_data": {"type": "bar", "title": "Survey results – Institut XY (2024)", "labels": ["Category A", "Category B", "Category C"], "datasets": [{"label": "Percentage", "data": [45, 32, 23]}]}},
        {"nr": 3, "typ": "cartoon/image", "text": "Cartoon/image description..."}
      ]},
      {"nr": 2, "thema": "Topic 2", "anweisung": "Discuss how... Write at least 300 words. Include information from all the material provided.", "materialien": [
        {"nr": 1, "typ": "text_en", "text": "English source..."},
        {"nr": 2, "typ": "grafik", "text": "Source: Eurostat 2025", "chart_data": {"type": "line", "title": "Trend data – Eurostat 2025", "labels": ["2020", "2021", "2022", "2023", "2024"], "datasets": [{"label": "Value", "data": [12, 18, 25, 31, 38]}]}},
        {"nr": 3, "typ": "text_de", "text": "German source..."}
      ]}
    ]
  }
}`;

  const userPrompt = `Create a complete FOS/BOS Abiturprüfung English 13th grade (60 BE, fachgebundene/allgemeine Hochschulreife):
Part 1 Reading (24 BE): Text I (~900 words, 850-950) with Multiple Matching (6 BE, 6 gaps, 9 sentences A-I), Text II (~900 words, 850-950) with Gapped Summary (8 BE, 8 gaps with line numbers), Text III (~1100 words, literary) with Mediation EN→DE (10 BE, 6 questions in German).
Part 2 Writing (36 BE): Task IV Mediation D→E (12 BE, 2 German source texts ~250-300 words each, student writes ~150 words English), Task V Material-Based Writing (24 BE, 2 tasks to choose from, 300+ words, 3 materials each).
ALL texts complete, realistic, C1 level. Reading texts MUST be at least 850 words. Include correct answers for Reading. Use current, relevant topics.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

// Themen-Mapping für lesbare Prompt-Beschreibungen
const FOS_ENGLISCH_TOPIC_MAP = {
  "society": "Gesellschaft & Medien",
  "globalisation": "Globalisierung",
  "environment": "Umwelt & Nachhaltigkeit",
  "technology": "Technologie & Digitalisierung",
  "education": "Bildung & Beruf",
  "culture": "Kultur & Identität",
  "politics": "Politik & Demokratie",
  "demographic-change": "Gesellschaftliche Herausforderungen: demografischer Wandel, Gender issues, soziale Ungleichheit",
  "social-inequality": "Werte und Wertekonflikte: Freiheit vs. Sicherheit, Wissenschaft und Ethik",
  "globalisation-conflicts": "Globalisierung: internationale Beziehungen, Konflikte, Terrorismus",
  "migration": "Ursachen von Migration, internationale Beziehungen und Konflikte",
  "language-power": "Sprache und Kommunikation: Macht und Manipulation, Sprachenvielfalt, Jugendsprache",
  "literature": "Literatur (literarische Ganzschrift zu gesellschaftlichen Themen)",
  "current-events": "Aktuelle Ereignisse und Entwicklungen",
  "science-ethics": "Wissenschaft und Ethik, gesellschaftliche Verantwortung"
};

function getFOSEnglischTopicHint(topic) {
  if (!topic || topic === "random") return "\nTHEMA: Wähle ein aktuelles, interessantes Thema.";
  const desc = FOS_ENGLISCH_TOPIC_MAP[topic] || topic;
  return `\nTHEMA: Der Text soll sich mit dem Thema "${desc}" befassen.`;
}

/* ================= FOS ENGLISCH: READING COMPREHENSION KLAUSURTRAINING ================= */
async function handleFOSGenerateRCEnglisch(body, env) {
  const taskTypes = body.taskTypes || ["gapped_summary", "multiple_matching", "multiple_choice"];
  const topic = body.topic || "random";
  const stufe = body.stufe || "11-12";
  const is13 = stufe === "13";

  const niveau = is13 ? "C1" : "B2";
  const klasse = is13 ? "13. Klasse" : "12. Klasse";
  const textLen = is13 ? "850-1000" : "850-950";

  // Dynamisch die angeforderten Aufgabentypen in den Prompt einbauen
  const typInstructions = [];
  if (taskTypes.includes("gapped_summary")) {
    if (is13) {
      typInstructions.push(`GAPPED SUMMARY (8 BE):
- Schreibe eine Zusammenfassung des Textes mit 8 Lücken.
- Lücken als ______(1), ______(2) etc. markieren.
- Schüler müssen auch die Zeilennummer angeben, wo sie das Wort gefunden haben.
- Lösungen sind einzelne Wörter oder kurze Phrasen aus dem Text.
- JSON: {"typ": "gapped_summary", "be": 8, "anweisung": "Fill the gaps in the summary with appropriate words or expressions from the corresponding sections of the text. Do not make any changes. Please also provide the number of the line.", "text": "The article explains that ______(1)...", "loesungen": {"1": "word", "2": "word", "3": "...", "4": "...", "5": "...", "6": "...", "7": "...", "8": "..."}}`);
    } else {
      typInstructions.push(`GAPPED SUMMARY (6 BE):
- Schreibe eine Zusammenfassung des Textes mit 6 Lücken.
- Lücken als ______(1), ______(2) etc. markieren.
- Lösungen sind einzelne Wörter oder kurze Phrasen aus dem Text.
- JSON: {"typ": "gapped_summary", "be": 6, "text": "The article discusses ______(1)...", "loesungen": {"1": "word", "2": "word", ...}}`);
    }
  }
  if (taskTypes.includes("multiple_matching")) {
    if (is13) {
      typInstructions.push(`MULTIPLE MATCHING (6 BE):
- 6 Lücken im Text. Der Text enthält Lücken markiert als _GAP 1_, _GAP 2_ etc.
- 9 Sätze (A-I) zum Einsetzen, davon 3 Distraktoren.
- Schüler ordnen jedem Gap den passenden Satz zu.
- JSON: {"typ": "multiple_matching", "be": 6, "anweisung": "There are six gaps in the text. Match each gap (1-6) with the most suitable sentence (A-I). There are three more options than you need.", "items": ["1", "2", "3", "4", "5", "6"], "statements": ["A: Full sentence...", "B: ...", "C: ...", "D: ...", "E: ...", "F: ...", "G: ...", "H: ...", "I: ..."], "loesung": {"1": "G", "2": "D", "3": "I", "4": "A", "5": "E", "6": "B"}}`);
    } else {
      typInstructions.push(`MULTIPLE MATCHING (5 BE):
- 5 Items (Personen/Abschnitte) und 8 Statements (A-H, davon 3 Distraktoren).
- Schüler ordnen Statements den Items zu.
- JSON: {"typ": "multiple_matching", "be": 5, "anweisung": "Match statements A-H with sections 1-5.", "items": ["1: ...", "2: ...", "3: ...", "4: ...", "5: ..."], "statements": ["A: ...", "B: ...", ...], "loesung": {"1": "C", "2": "A", ...}}`);
    }
  }
  if (taskTypes.includes("multiple_choice")) {
    typInstructions.push(`MULTIPLE CHOICE (3 BE):
- 3 Fragen mit je 4 Optionen (A-D), nur eine richtig.
- Optionen plausibel formuliert.
- JSON: {"typ": "multiple_choice", "be": 3, "fragen": [{"nr": 1, "frage": "...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "B"}, ...]}`);
  }
  if (taskTypes.includes("mediation_en_de")) {
    if (is13) {
      typInstructions.push(`MEDIATION EN→DE (10 BE):
- 6 Fragen auf DEUTSCH über den englischen Text. Der Text soll ein LITERARISCHER Text sein (Romanauszug oder Short Story).
- Mischung aus Verständnis-, Analyse- und Interpretationsfragen.
- NIEMALS Kategorien wie (Inhalt), (Deutung), (Analyse) etc. in Klammern bei den Fragen hinzufügen.
- Punkteverteilung: 1-2 Punkte pro Frage, insgesamt 10.
- Antworten müssen auf DEUTSCH gegeben werden.
- JSON: {"typ": "mediation_en_de", "be": 10, "anweisung": "Bearbeiten Sie die folgenden Aufgaben auf Deutsch.", "fragen": [{"nr": "1", "frage": "Was ist konkret damit gemeint, wenn...", "be": 1, "loesung": "Deutsche Antwort..."}, {"nr": "2", "frage": "Inwiefern...", "be": 2, "loesung": "..."}, ...]}`);
    } else {
      typInstructions.push(`MEDIATION EN→DE (5 BE):
- 5 Fragen auf DEUTSCH über den englischen Text.
- Antworten müssen auf DEUTSCH gegeben werden.
- JSON: {"typ": "mediation_en_de", "be": 5, "anweisung": "Beantworten Sie die folgenden Fragen auf DEUTSCH.", "fragen": [{"nr": "1", "frage": "Welches Problem...", "be": 1, "loesung": "Deutsche Antwort..."}, ...]}`);
    }
  }

  const topicHint = getFOSEnglischTopicHint(topic);

  const textHint = (is13 && taskTypes.includes("mediation_en_de"))
    ? `\nWICHTIG: Da Mediation ausgewählt ist, soll der Text ein LITERARISCHER Text sein (Romanauszug oder Short Story, C1-Niveau).`
    : "";

  const systemPrompt = `Du bist ein Experte für FOS-Englisch-Klausuren (Bayern, ${klasse}, ${niveau}-Niveau).
Erstelle EINEN englischen ${(is13 && taskTypes.includes("mediation_en_de")) ? "literarischen Text" : "Sachtext"} (~${textLen} Wörter) und die angeforderten Reading-Comprehension-Aufgaben.
${topicHint}${textHint}

Der Text soll authentisch wirken, sprachlich anspruchsvoll sein (${niveau}-Niveau) und genug Inhalt für alle Aufgabentypen bieten.${is13 ? " Die Aufgaben entsprechen dem Format der FOS-Abiturprüfung 13. Klasse." : ""}

ANGEFORDERTE AUFGABENTYPEN:
${typInstructions.join("\n\n")}

WICHTIG:
- Alle Texte KOMPLETT und realistisch (${niveau}-Niveau)
- Korrekte Antworten für ALLE Aufgaben angeben
${is13 ? "- Multiple Matching: genau 6 Lücken im Text (_GAP 1_ etc.) + 9 Sätze (A-I, 3 Distraktoren)" : "- Multiple Matching: genau 5 Zuordnungen + 3 Distraktoren"}
${is13 ? "- Gapped Summary: 8 Lücken als ______(1) etc. mit Zeilenangabe" : "- Gapped Summary: Lücken als ______(1), ______(2) etc."}
- Erfinde plausiblen Autor und Quelle

Antworte NUR mit validem JSON:
{
  "titel": "Reading Comprehension: ...",
  "reading": {
    "be": <Summe aller BE>,
    "texte": [{"nr": "Text I", "titel": "...", "text": "Vollständiger Text ~${textLen} Wörter", "source_info": "Autor, Quelle, Datum"}],
    "tasks": [{
      "nr": "I",
      "be": <Summe>,
      "referenz_text": "Text I",
      "teile": [
        <hier die angeforderten Aufgabentypen als JSON-Objekte>
      ]
    }]
  }
}`;

  const userPrompt = `Erstelle einen Reading-Comprehension-Test (${niveau}-Niveau, ${klasse}) mit folgenden Aufgabentypen: ${taskTypes.join(", ")}.
Ein Text (~${is13 ? "900-1000" : "900"} Wörter, mindestens 850), dazu die passenden Aufgaben. Alle Antworten angeben.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], is13 ? 12000 : 10000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS ENGLISCH: GESAMTE KLAUSUR (RC + MEDIATION) ================= */
async function handleFOSGenerateKlausurEnglisch(body, env) {
  const topic = body.topic || "random";
  const stufe = body.stufe || "11-12";
  const is13 = stufe === "13";

  const niveau = is13 ? "C1" : "B2";
  const klasse = is13 ? "13. Klasse" : "12. Klasse";
  const textLen = is13 ? "850-1000" : "850-950";

  // Zufällig einen RC-Typ wählen
  const rcTypes = ["gapped_summary", "multiple_matching", "multiple_choice"];
  const chosenRC = rcTypes[Math.floor(Math.random() * rcTypes.length)];

  const topicHint = getFOSEnglischTopicHint(topic);

  const rcInstructions12 = {
    gapped_summary: `GAPPED SUMMARY (6 BE):
{"typ": "gapped_summary", "be": 6, "text": "The article discusses ______(1)...", "loesungen": {"1": "word", ...}}`,
    multiple_matching: `MULTIPLE MATCHING (5 BE):
{"typ": "multiple_matching", "be": 5, "anweisung": "Match statements A-H with sections 1-5.", "items": ["1: ...", ...], "statements": ["A: ...", ...], "loesung": {"1": "C", ...}}`,
    multiple_choice: `MULTIPLE CHOICE (3 BE):
{"typ": "multiple_choice", "be": 3, "fragen": [{"nr": 1, "frage": "...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "B"}, ...]}`
  };

  const rcInstructions13 = {
    gapped_summary: `GAPPED SUMMARY (8 BE):
- 8 Lücken, Schüler geben auch die Zeilennummer an.
{"typ": "gapped_summary", "be": 8, "anweisung": "Fill the gaps with appropriate words from the corresponding sections. Also provide the line number.", "text": "The article explains that ______(1)...", "loesungen": {"1": "word", "2": "word", "3": "...", "4": "...", "5": "...", "6": "...", "7": "...", "8": "..."}}`,
    multiple_matching: `MULTIPLE MATCHING (6 BE):
- 6 Lücken im Text (_GAP 1_ bis _GAP 6_), 9 Sätze (A-I), 3 Distraktoren.
{"typ": "multiple_matching", "be": 6, "anweisung": "There are six gaps in the text. Match each gap (1-6) with the most suitable sentence (A-I). There are three more options than you need.", "items": ["1", "2", "3", "4", "5", "6"], "statements": ["A: ...", "B: ...", "C: ...", "D: ...", "E: ...", "F: ...", "G: ...", "H: ...", "I: ..."], "loesung": {"1": "G", "2": "D", ...}}`,
    multiple_choice: `MULTIPLE CHOICE (3 BE):
{"typ": "multiple_choice", "be": 3, "fragen": [{"nr": 1, "frage": "...", "optionen": ["A: ...", "B: ...", "C: ...", "D: ..."], "loesung": "B"}, ...]}`
  };

  const rcInstructions = is13 ? rcInstructions13 : rcInstructions12;
  const medBE = is13 ? 6 : 4;
  const medTotal = is13 ? 10 : 4;
  const medAnweisung = is13 ? "Bearbeiten Sie die folgenden Aufgaben auf Deutsch." : "Beantworten Sie die folgenden Fragen auf DEUTSCH.";

  const systemPrompt = `Du bist ein Experte für FOS-Englisch-Klausuren (Bayern, ${klasse}, ${niveau}-Niveau).
Erstelle eine GESAMTE KLAUSUR bestehend aus:
1. Einem englischen Sachtext (~${textLen} Wörter)
2. Einer Reading-Comprehension-Aufgabe (${chosenRC.replace(/_/g, " ")})
3. Einer Mediationsaufgabe (${medTotal} BE): ${medBE} deutsche Fragen zum englischen Text, auf Deutsch zu beantworten
${topicHint}

AUFGABENTYPEN:

${rcInstructions[chosenRC]}

MEDIATION EN→DE (${medTotal} BE):
${is13 ? '- NIEMALS Kategorien wie (Inhalt), (Deutung), (Analyse) etc. in Klammern bei den Fragen hinzufügen.\n' : ''}{"typ": "mediation_en_de", "be": ${medTotal}, "anweisung": "${medAnweisung}", "fragen": [{"nr": "1", "frage": "...", "be": ${is13 ? "1" : "1"}, "loesung": "..."}, ...]}

WICHTIG:
- Text KOMPLETT und realistisch (${niveau}-Niveau)
- Korrekte Antworten für ALLE Aufgaben
- Erfinde plausiblen Autor und Quelle

Antworte NUR mit validem JSON:
{
  "titel": "Klausur Englisch: ...",
  "reading": {
    "be": <Summe aller BE>,
    "texte": [{"nr": "Text I", "titel": "...", "text": "...", "source_info": "..."}],
    "tasks": [{
      "nr": "I",
      "be": <Summe>,
      "referenz_text": "Text I",
      "teile": [
        <RC-Aufgabe>,
        <Mediation-Aufgabe>
      ]
    }]
  }
}`;

  const userPrompt = `Erstelle eine Englisch-Klausur (${niveau}, ${klasse}): 1 Text + ${chosenRC.replace(/_/g, " ")} + Mediation. Alle Antworten angeben.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], is13 ? 12000 : 10000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS ENGLISCH: RC MEDIATION BEWERTUNG ================= */
async function handleFOSGradeRCMediationEnglisch(body, env) {
  const text = body.text || "";
  const fragen = body.fragen || [];
  const maxBE = body.maxBE || fragen.length;

  if (!fragen.length) return jsonResponse({ results: [], totalBE: 0, maxBE: 0 }, 200, env);

  const fragenText = fragen.map((f, i) => {
    return `Frage ${f.nr || (i + 1)}: "${f.frage}"
Erwartete Antwort: "${f.correctAnswer}"
Schüler-Antwort: "${f.userAnswer}"
Maximale BE: ${f.be || 1}`;
  }).join("\n\n");

  const systemPrompt = `Du bist ein strenger Englischlehrer an einer bayerischen FOS. Bewerte die Mediationsantworten der Schüler.

Die Schüler haben einen englischen Text gelesen und müssen Fragen auf DEUTSCH beantworten.

ENGLISCHER ORIGINALTEXT (Auszug):
${text.substring(0, 2000)}

BEWERTUNGSREGELN:
- Vergib pro Frage 0 oder die volle BE-Zahl (${fragen[0]?.be || 1} BE)
- Die Antwort muss inhaltlich korrekt sein und die wesentliche Information enthalten
- Kleine sprachliche Fehler im Deutschen sind akzeptabel
- Die Antwort muss auf Deutsch sein
- Sinngemäß richtige Antworten akzeptieren (nicht nur wörtliche Übereinstimmung)

FRAGEN UND ANTWORTEN:
${fragenText}

Antworte NUR mit validem JSON:
{
  "results": [
    {"nr": "1", "be": 1, "maxBe": 1, "isCorrect": true, "feedback": "Kurzes Feedback..."},
    ...
  ],
  "totalBE": <Summe der erreichten BE>,
  "maxBE": ${maxBE},
  "feedback": "Kurzes Gesamtfeedback zur Mediationsleistung (2-3 Sätze, auf Deutsch)."
}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Bewerte die Mediationsantworten." }
  ], 2000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS PROFILFACH ABITUR: GENERATE (Physik, PädPsych, Bio, Gesundheit, Gestaltung) ================= */
const FOS_ABITUR_PROFILFAECHER = {
  physik: {
    name: "Physik", zeit: 180, gesamt_be: 100,
    hilfsmittel: "ISB-Merkhilfe Physik, nicht programmierbarer Taschenrechner",
    beschreibung: "Fachabiturprüfung Physik (Technik-Zweig)",
    aufgaben: [
      { titel: "Mechanik & Energie", be: 35, themen: "Kinematik (gleichförmig/gleichmäßig beschleunigte Bewegung, freier Fall, schiefer Wurf), Dynamik (Newton'sche Gesetze, Kraft, Impuls, Impulserhaltung), Energie (kinetische/potentielle Energie, Energieerhaltung, Arbeit, Leistung, Wirkungsgrad)" },
      { titel: "Elektrische und magnetische Felder", be: 35, themen: "Elektrisches Feld (Coulomb-Kraft, Feldstärke, Spannung, Plattenkondensator, Kapazität), Magnetisches Feld (Lorentzkraft, Induktion, Lenz'sche Regel, Selbstinduktion), Wechselstromkreise (Effektivwerte)" },
      { titel: "Wellen & Quantenphysik", be: 30, themen: "Schwingungen (harmonische Schwingung, Federschwinger, Pendel, Resonanz), Wellen (Interferenz, stehende Wellen, Beugung am Spalt/Gitter), Quantenphysik (Photoeffekt, Photon, de-Broglie-Wellenlänge)" }
    ]
  },
  paedpsych: {
    name: "Pädagogik/Psychologie", zeit: 180, gesamt_be: 80,
    hilfsmittel: "keine",
    beschreibung: "Fachabiturprüfung Pädagogik/Psychologie (Sozialwesen-Zweig)",
    aufgaben: [
      { titel: "Fallanalyse – Entwicklung & Erziehung", be: 30, themen: "Entwicklungspsychologie (Piaget, Erikson, Kohlberg), Erziehungsstile (Lewin, Baumrind), Bindungstheorie (Bowlby, Ainsworth), Resilienz, Anlage-Umwelt-Debatte" },
      { titel: "Lern- und Verhaltenspsychologie", be: 25, themen: "Klassische Konditionierung (Pawlow), Operante Konditionierung (Skinner), Modelllernen (Bandura), Kognitive Lerntheorien, Gedächtnismodelle, Verhaltensauffälligkeiten" },
      { titel: "Sozialpsychologie & Kommunikation", be: 25, themen: "Gruppenpsychologie (Normen, Rollen, Konformität), Kommunikationsmodelle (Schulz von Thun, Watzlawick), Konfliktlösung, Vorurteile, Prosoziales Verhalten, Aggression" }
    ]
  },
  biologie: {
    name: "Biologie", zeit: 180, gesamt_be: 80,
    hilfsmittel: "keine",
    beschreibung: "Fachabiturprüfung Biologie (ABU/Gesundheit-Zweig)",
    aufgaben: [
      { titel: "Zellbiologie & Genetik", be: 30, themen: "Zellaufbau (Prokaryoten/Eukaryoten), Zellteilung (Mitose, Meiose), Proteinbiosynthese, Genetischer Code, Mutationen, Mendel'sche Regeln, Humangenetik (Stammbaumanalyse), Gentechnik" },
      { titel: "Stoffwechsel & Ökologie", be: 25, themen: "Enzyme, Fotosynthese, Zellatmung, Ökosystem (Nahrungsketten, Stoffkreisläufe, Energiefluss), Populationsökologie, Biodiversität" },
      { titel: "Evolution & Neurobiologie", be: 25, themen: "Evolutionstheorien (Darwin), Evolutionsfaktoren (Mutation, Selektion, Gendrift), Artbildung, Neurobiologie (Nervenzelle, Ruhepotential, Aktionspotential, Synapse)" }
    ]
  },
  gesundheit: {
    name: "Gesundheitswissenschaften", zeit: 180, gesamt_be: 80,
    hilfsmittel: "keine",
    beschreibung: "Fachabiturprüfung Gesundheitswissenschaften (Gesundheit-Zweig)",
    aufgaben: [
      { titel: "Anatomie & Physiologie", be: 30, themen: "Herz-Kreislauf-System, Atmungssystem (Gasaustausch), Verdauungssystem, Immunsystem (angeborene/adaptive Immunabwehr, Impfung, Allergien), Hormonsystem (Regelkreis, Diabetes)" },
      { titel: "Krankheitslehre & Prävention", be: 25, themen: "Infektionskrankheiten, Zivilisationskrankheiten, Prävention (primär/sekundär/tertiär), Gesundheitsförderung (Ottawa-Charta, Salutogenese Antonovsky), Epidemiologie" },
      { titel: "Ernährung & Pflege", be: 25, themen: "Ernährungslehre (Makro-/Mikronährstoffe, Energiebilanz), Diätetik, Pflegemodelle, Pflegeprozess, Ethik im Gesundheitswesen (Patientenrechte, Sterbebegleitung)" }
    ]
  },
  gestaltung: {
    name: "Gestaltung", zeit: 240, gesamt_be: 80,
    hilfsmittel: "Zeichenmaterial",
    beschreibung: "Fachabiturprüfung Gestaltung (Gestaltung-Zweig)",
    aufgaben: [
      { titel: "Gestaltungstheorie & Analyse", be: 30, themen: "Gestaltungsgesetze (Nähe, Ähnlichkeit, Geschlossenheit), Farbtheorie (Farbkreis, Kontraste nach Itten), Typografie (Schriftklassifikation, Lesbarkeit), Komposition (Goldener Schnitt, Bildaufbau), Designgeschichte (Bauhaus, Swiss Design)" },
      { titel: "Medien & Kommunikationsdesign", be: 25, themen: "Bildanalyse (Perspektive, Licht, Kontrast), Corporate Design (Logo, CI), Plakatgestaltung (AIDA), Verpackungsdesign, Interfacedesign (Usability, UX), Medienethik" },
      { titel: "Konzeptionelle Gestaltungsaufgabe", be: 25, themen: "Entwurfskonzept (Briefing, Moodboard, Scribbles), Farbwahl begründen, Typografische Gestaltung, Layout-Entwurf. Beschreibe deinen Entwurf und begründe deine Gestaltungsentscheidungen detailliert." }
    ]
  }
};

async function handleFOSGenerateAbiturProfilfach(fach, body, env) {
  const config = FOS_ABITUR_PROFILFAECHER[fach];
  if (!config) return jsonResponse({ error: "Unbekanntes Profilfach: " + fach }, 400, env);

  let aufgabenStruktur = "";
  const roemisch = ["I", "II", "III"];
  for (let i = 0; i < config.aufgaben.length; i++) {
    const a = config.aufgaben[i];
    aufgabenStruktur += `\nAUFGABE ${roemisch[i]} (${a.be} BE) – ${a.titel}:\n${a.themen}\n`;
  }

  const systemPrompt = `Du bist ein Experte für die ${config.beschreibung} in Bayern.
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung.

PRÜFUNGSFORMAT:
- Fach: ${config.name} (FOS Bayern, 12. Klasse)
- Bearbeitungszeit: ${config.zeit} Minuten
- Hilfsmittel: ${config.hilfsmittel}
- ALLE Aufgaben sind Pflicht
- Gesamt: ${config.gesamt_be} BE

AUFGABENSTRUKTUR:${aufgabenStruktur}

PFLICHT-REGELN:
- Jede Aufgabe hat einen EIGENEN Kontext (Fallbeispiel, Situation, Szenario)
- BE-Angaben an JEDER Teilaufgabe
- Operatoren mit steigendem Anforderungsniveau:
  AFB I (20%): nennen, beschreiben, darstellen
  AFB II (40%): erläutern, analysieren, vergleichen, anwenden
  AFB III (40%): beurteilen, erörtern, Stellung nehmen
- Pro Aufgabe 4-6 Teilaufgaben
- Materialien wo sinnvoll (Tabellen, Fallbeispiele, Abbildungen als Text)

NUMMERIERUNG DER TEILAUFGABEN (WICHTIG – wie Original-Prüfungen!):
- KEINE Buchstaben a), b), c), d) verwenden! Nur Dezimalnotation!
- Gliederung innerhalb jeder Aufgabe (I, II, III):
  Ebene 1: 1, 2, 3, 4 (Hauptthemen, oft mit Kontexttext/Daten)
  Ebene 2: 1.1, 1.2, 1.3 (Teilaufgaben)
  Ebene 3: 1.2.1, 1.2.2, 1.2.3 (Unteraufgaben, nur wenn nötig)
- Hauptnummern (1, 2, 3) können eigenen Einführungstext mit Daten/Tabellen enthalten
- Schreibe KEINE Operatoren in Klammern hinter die Aufgaben (KEIN "(Operator: erläutern)" etc.)
- Verwende die Operatoren natürlich im Aufgabentext selbst (z.B. "Erläutern Sie..." oder "Beurteilen Sie...")
- ${KEINE_LOESUNGSHINWEISE}

TABELLEN FÜR ZAHLENMATERIAL:
- Verwende im "kontext"-Feld Markdown-Tabellen für tabellarische Daten (Statistiken, Messwerte, Laborergebnisse, Versuchsdaten, Vergleichstabellen etc.)
- Markdown-Tabellen-Format: | Spalte1 | Spalte2 |\\n|---|---|\\n| Wert1 | Wert2 |

Antworte NUR mit validem JSON:
{
  "titel": "Fachabiturprüfung ${config.name} 2025",
  "gesamt_be": ${config.gesamt_be},
  "zeit": ${config.zeit},
  "hilfsmittel": "${config.hilfsmittel}",
  "aufgaben": [
    {
      "id": "I",
      "titel": "Aufgabe I – ${config.aufgaben[0].titel}",
      "kontext": "Ausführlicher Situationstext / Fallbeispiel...",
      "gesamt_be": ${config.aufgaben[0].be},
      "teilaufgaben": [
        {"nr": "1", "text": "Einleitungstext mit Daten...", "be": 0, "afb": ""},
        {"nr": "1.1", "text": "...", "be": 5, "afb": "I"},
        {"nr": "1.2", "text": "...", "be": 8, "afb": "II"}
      ]
    },
    {"id": "II", "titel": "...", "kontext": "...", "gesamt_be": ${config.aufgaben[1].be}, "teilaufgaben": [...]},
    {"id": "III", "titel": "...", "kontext": "...", "gesamt_be": ${config.aufgaben[2].be}, "teilaufgaben": [...]}
  ]
}`;

  const aufgabenBeschreibung = config.aufgaben.map((a, i) => `Aufgabe ${roemisch[i]}: ${a.titel} (${a.be} BE)`).join(', ');
  const userPrompt = `Erstelle eine vollständige ${config.beschreibung} (${config.gesamt_be} BE).
${aufgabenBeschreibung}.
Jede Aufgabe braucht einen eigenen Kontext, BE an jeder Teilaufgabe, steigende AFB.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS TEXT-FÄCHER: GENERISCHER GENERATE ================= */
async function handleFOSTextGenerate(config, body, env) {
  const { niveau, fachbereich, sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ')
    : '';

  const gesamtBE = be || 60;
  const zeitMinuten = zeit || 135;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, gesamtBE, 2.5);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  // Fachbereich-Inhalte zusammenstellen
  const fbKey = sachgebiet || fachbereich || Object.keys(config.fachbereiche)[0];
  let fbLabel, fbThemen;
  if (config.fachbereiche[fbKey]) {
    fbLabel = config.fachbereiche[fbKey].label;
    fbThemen = config.fachbereiche[fbKey].themen;
  } else {
    fbLabel = config.shortName;
    fbThemen = Object.values(config.fachbereiche).map(f => f.themen).join("\n\n");
  }

  const systemPrompt = `Du bist ein Experte für das Fach ${config.name} an der bayerischen Fachoberschule (FOS).
Erstelle eine authentische Klausuraufgabe.

PRÜFUNGSFORMAT:
- Fach: ${config.name} (FOS Bayern)
- Gesamt: ${gesamtBE} BE (Bewertungseinheiten), Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- 2-3 Aufgabenblöcke
- 3-4 Materialien (Texte, Tabellen, Gesetzestexte, Statistiken)
- Schwerpunkt: ${fbLabel}${schwerpunktZusatz}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgabenblöcke` : ''}

LEHRPLAN-INHALTE (FOS Bayern):
${fbThemen}

AUFGABENSTRUKTUR:
- 2-4 Teilaufgaben pro Block mit steigendem Anforderungsniveau
- AFB I (20%): beschreiben, nennen, darstellen, zusammenfassen
- AFB II (40%): erläutern, analysieren, vergleichen, berechnen
- AFB III (40%): beurteilen, erörtern, Stellung nehmen
- ${KEINE_LOESUNGSHINWEISE}
- LEHRPLAN-TREUE: NUR FOS-Lehrplan-Inhalte verwenden!

MATERIALIEN:
- Textmaterialien: 300-600 Wörter pro Material
- Tabellen/Statistiken: Markdown-Tabelle mit plausiblen Zahlen
- 1 Material vom Typ "bild" (KI-generiert): inhalt = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Einleitender Situationstext",
  "aufgabenbloecke": [{"nr": 1, "titel": "...", "teilaufgaben": [{"nr": "1.1", "text": "...", "be": 5, "afb": "I"}], "be_gesamt": 15}],
  "materialien": [{"nr": "M1", "titel": "...", "typ": "text", "inhalt": "...", "quelle": "..."}, {"nr": "M2", "titel": "Schaubild: ...", "typ": "bild", "inhalt": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "quelle": ""}],
  "gesamt_be": ${gesamtBE},
  "fachbereich": "${fbLabel}",
  "thema": "Konkretes Thema"
}`;

  const userPrompt = `Erstelle eine ${config.shortName}-Klausuraufgabe (FOS Bayern):
- Schwerpunkt: ${fbLabel}
- Gesamt-BE: ${gesamtBE}
- Erstelle 3-4 Materialien (Texte 300-600 Wörter, Tabellen, 1 Bild).
Jedes Textmaterial MUSS ausführlich sein (300-600 Wörter).`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}
