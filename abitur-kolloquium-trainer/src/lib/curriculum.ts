/**
 * Lehrplan-Schwerpunkte für das bayerische Abitur-Kolloquium.
 * Basierend auf dem LehrplanPLUS Bayern Gymnasium Oberstufe (G9).
 * Halbjahre: 12/1, 12/2, 13/1, 13/2
 *
 * Quellen:
 * - lehrplanplus.bayern.de (Fachlehrpläne Jgst. 12/13, gA und eA)
 * - ISB Illustrierende Prüfungsaufgaben (Halbjahr-Zuordnung Geographie)
 * - STARK Verlag (Halbjahr-Zuordnung Mathematik)
 *
 * Hinweis: Für Deutsch, Englisch, Französisch und Italienisch definiert der
 * LehrplanPLUS keine offizielle Halbjahr-Zuordnung (2-Jahres-Block 12/13).
 * Die hier verwendete Verteilung orientiert sich an der gängigen Schulpraxis.
 */

export interface SubjectCurriculum {
  halbjahre: Record<string, string[]>;
}

export const CURRICULUM: Record<string, SubjectCurriculum> = {
  'Biologie': {
    halbjahre: {
      '12/1': [
        'Genetik: Speicherung, Realisierung und Regulation genetischer Information',
        'Neukombination und Veränderung genetischer Information (Mutation, Rekombination)',
        'Humangenetik, genetische Erkrankungen und DNA-Analytik',
      ],
      '12/2': [
        'Evolutionsforschung und Belege der Evolution',
        'Mechanismen der Evolution (Selektion, Gendrift, Artbildung)',
        'Verhaltensökologie: Evolution und Angepasstheit von Verhalten',
      ],
      '13/1': [
        'Neuronale Informationsverarbeitung',
        'Stoffwechselphysiologie: Assimilation (Fotosynthese)',
        'Stoffwechselphysiologie: Dissimilation (Zellatmung, Gärung)',
      ],
      '13/2': [
        'Dynamische Prozesse in Ökosystemen',
        'Anthropogene Einflüsse auf Ökosysteme und Biodiversität',
        'Ökologie der Biosphäre und Nachhaltigkeit',
      ],
    },
  },

  'Chemie': {
    halbjahre: {
      '12/1': [
        'Atombau und Analytik',
        'Chemische Bindung (Ionen-, Molekül-, Metallbindung)',
        'Kohlenwasserstoffe als Energieträger und Reaktionspartner',
      ],
      '12/2': [
        'Reaktionsgeschwindigkeit und Katalyse',
        'Chemisches Gleichgewicht und Massenwirkungsgesetz',
        'Redoxgleichgewichte und Elektrochemie',
      ],
      '13/1': [
        'Farbigkeit und Struktur-Eigenschafts-Beziehungen',
        'Säure-Base-Gleichgewichte und quantitative Analytik',
        'Natürliche Makromoleküle: Aminocarbonsäuren und Proteine',
      ],
      '13/2': [
        'Synthetische Makromoleküle und Kunststoffe',
        'Chemie und Nachhaltigkeit',
        'Biomoleküle: Kohlenhydrate und Fette',
      ],
    },
  },

  'Deutsch': {
    // LehrplanPLUS: D12/13 als 2-Jahres-Block, keine offizielle Halbjahr-Zuordnung.
    // Verteilung nach gängiger Schulpraxis und Epochenfolge.
    halbjahre: {
      '12/1': [
        'Klassik und Romantik',
        'Drama und Dramentheorie (Lessing, Schiller, Goethe, Kleist)',
        'Lyrik der Klassik und Romantik',
      ],
      '12/2': [
        'Realismus und Naturalismus im 19. Jahrhundert',
        'Literarische Moderne und Expressionismus (Jahrhundertwende bis Mitte 20. Jh.)',
        'Erzählen und Erzähltheorie (Novelle, Roman)',
      ],
      '13/1': [
        'Nachkriegsliteratur und Aufarbeitung der Vergangenheit (1945–1989)',
        'Literatur seit 1989 (Identität, Globalisierung, Migration)',
        'Pflichtlektüren und vertiefende Textanalyse',
      ],
      '13/2': [
        'Sprachreflexion und Sprachwandel',
        'Medien, Kommunikation und Rhetorik',
        'Sachtextanalyse und materialgestütztes Argumentieren',
      ],
    },
  },

  'Englisch': {
    // LehrplanPLUS: E12/13 als 2-Jahres-Block, keine offizielle Halbjahr-Zuordnung.
    // Themengebiete nach gängiger Schulpraxis gruppiert.
    halbjahre: {
      '12/1': [
        'Ireland: Geography, History, Society and Politics (Troubles, Brexit)',
        'Ethnic Diversity and Immigration in the UK (Empire, Commonwealth)',
        'Regional and Social Identities in the UK (Education, Social Classes)',
      ],
      '12/2': [
        'The American Dream and Multicultural Society in the USA',
        'Political Systems in the UK and the USA',
        'Cultural Life in the UK and the USA (Theatre, Film, Music, Architecture)',
      ],
      '13/1': [
        'Science, Technology and the Environment (Ethical Aspects)',
        'An Anglophone African or Asian Country',
        'Media in the Information Society',
      ],
      '13/2': [
        'Shakespeare and Elizabethan Theatre',
        'The 20th/21st Century Novel (Ganzschrift)',
        'Values, Religion and Social Engagement',
      ],
    },
  },

  'Ethik': {
    // Explizite Zuordnung: 2 Lernbereiche pro Jahrgangsstufe = 1 pro Halbjahr
    halbjahre: {
      '12/1': [
        'Theorie und Praxis des Handelns',
        'Ethische Grundpositionen (Utilitarismus, Deontologie, Tugendethik)',
        'Handlungsfreiheit und moralische Verantwortung',
      ],
      '12/2': [
        'Freiheit und Determination',
        'Willensfreiheit und Determinismus (Hirnforschung, Kompatibilismus)',
        'Schuld, Strafe und Verantwortung',
      ],
      '13/1': [
        'Recht und Gerechtigkeit',
        'Gerechtigkeitstheorien (Rawls, Aristoteles)',
        'Menschenwürde und Menschenrechte',
      ],
      '13/2': [
        'Sinnorientierung und Lebensgestaltung',
        'Glückskonzeptionen und gelingendes Leben',
        'Religion, Weltanschauung und Toleranz',
      ],
    },
  },

  'Französisch': {
    // LehrplanPLUS: F12/13 als 2-Jahres-Block, keine offizielle Halbjahr-Zuordnung.
    // Themengebiete nach gängiger Schulpraxis gruppiert.
    halbjahre: {
      '12/1': [
        'La société française en mutation (multiculturalité, démographie, jeunes)',
        'Paris et la province: urbanisation, centralisme et décentralisation',
        'Régions à forte identité (Corse, Bretagne, Alsace) et patrimoine culturel',
      ],
      '12/2': [
        'Les relations franco-allemandes (histoire, Traité de l\'Élysée, Traité d\'Aix-la-Chapelle)',
        'La France et l\'Europe (V° République, institutions, laïcité)',
        'Politique et histoire: de l\'Absolutisme à la République',
      ],
      '13/1': [
        'La francophonie: histoire, présent et diversité culturelle',
        'La mondialisation et ses conséquences (migration, intégration)',
        'Économie, travail et développement durable',
      ],
      '13/2': [
        'Littérature française (du 17° au 21° siècle)',
        'Le cinéma français et les médias francophones',
        'Arts, chansons et culture en France',
      ],
    },
  },

  'Geographie': {
    // ISB-bestätigte Halbjahr-Zuordnung: 12/1 = LB 2–4, 12/2 = LB 5–7, 13/1 = LB 2–3, 13/2 = LB 4–5
    halbjahre: {
      '12/1': [
        'Klima und Klimawandel (atmosphärische und ozeanische Prozesse)',
        'Mensch-Umwelt-Beziehungen in den Tropen (Vulnerabilität und Nachhaltigkeit)',
        'Globale Bedeutung der Subpolaren und Polaren Zone',
      ],
      '12/2': [
        'Ressourcenkonflikte und Ressourcenmanagement in Europa (Mittlere Breiten, Subtropen)',
        'Nutzung und Vulnerabilität von Hochgebirgsräumen',
        'Gefährdungspotenzial und Risikomanagement (tektonische Ereignisse)',
      ],
      '13/1': [
        'Wirtschaftliche Entwicklungen in einer globalisierten Welt',
        'Ressourcen und nachhaltige Entwicklung',
        'Globale Disparitäten und Entwicklungsstrategien',
      ],
      '13/2': [
        'Bevölkerungsentwicklung und Migration',
        'Stadtentwicklung und urbane Räume',
        'Raumplanung und nachhaltige Stadtentwicklung',
      ],
    },
  },

  'Geschichte': {
    // Explizite Halbjahr-Zuordnung im LehrplanPLUS (G12 1.x = 12/1, G12 2.x = 12/2 usw.)
    halbjahre: {
      '12/1': [
        'Die deutsche Revolution von 1848/49 und bürgerliche Gesellschaft',
        'Politische und gesellschaftliche Modernisierung im Kaiserreich',
        'Demokratisierung und Gesellschaft in der Weimarer Republik',
      ],
      '12/2': [
        'Scheitern der Weimarer Republik, NS-Diktatur und Völkermord',
        'Die Bundesrepublik Deutschland und die DDR',
        'Die Bundesrepublik Deutschland 1990–2009',
      ],
      '13/1': [
        'Die historische Entwicklung des israelisch-palästinensischen Konflikts',
        'USA im 20. und 21. Jahrhundert',
        'Russland und China im 20. und 21. Jahrhundert',
      ],
      '13/2': [
        'Historische Grundlagen moderner demokratischer Staatsordnungen',
        'Von nationalistischer Konfrontation zu europäischer Integration',
        'Erinnerungskultur und Geschichtspolitik',
      ],
    },
  },

  'Italienisch': {
    // LehrplanPLUS: Getrennte Jgst. 12/13, keine offizielle Halbjahr-Zuordnung innerhalb der Jahrgangsstufe.
    halbjahre: {
      '12/1': [
        'L\'Italia di oggi: società, giovani e vita quotidiana',
        'Facetten Italiens: Nord, Centro, Sud (contrasti regionali)',
        'Made in Italy: prodotti, marchi e significato economico',
      ],
      '12/2': [
        'Storia italiana recente: Fascismo, Resistenza, nascita della Repubblica',
        'Arte e architettura italiana (Rinascimento)',
        'Cantautori: dimensione politica e sociale della musica italiana',
      ],
      '13/1': [
        'Immigrazione ed emigrazione nella storia e nel presente',
        'La criminalità organizzata e le sue conseguenze sulla società',
        'La problematica Nord-Sud e la questione meridionale',
      ],
      '13/2': [
        'Istituzioni politiche italiane e il ruolo dell\'Italia nell\'UE',
        'Il cinema italiano e l\'opera lirica',
        'Letteratura italiana del 20°/21° secolo',
      ],
    },
  },

  'Latein': {
    // De facto Halbjahr-Zuordnung: 2 thematische Lernbereiche pro Jahrgangsstufe
    halbjahre: {
      '12/1': [
        '"Philosophandum est" – Philosophische Haltungen (Cicero, Seneca)',
        'Stoische Ethik und Lebensführung (Seneca: Epistulae morales)',
        'Epikureismus und Skepsis (Cicero: De finibus, De natura deorum)',
      ],
      '12/2': [
        '"Difficile est saturam non scribere" – Römische Satire',
        'Catull: Gesellschaftskritik und Liebeslyrik (Carmina)',
        'Petron: Satirische Darstellung römischer Gesellschaft (Cena Trimalchionis)',
      ],
      '13/1': [
        '"Imperium sine fine dedi" – Literatur und Herrschaft im augusteischen Rom',
        'Vergil: Aeneis (Staatsidee und Sendungsbewusstsein)',
        'Augusteische Propaganda und Selbstdarstellung',
      ],
      '13/2': [
        '"Res publica res populi" – Staatsphilosophische Betrachtungen',
        'Cicero: De re publica (Staatsformen und Mischverfassung)',
        'Cicero: De officiis (Pflichtenlehre und politische Verantwortung)',
      ],
    },
  },

  'Mathematik': {
    // STARK-Verlag bestätigte Halbjahr-Zuordnung
    halbjahre: {
      '12/1': [
        'Analysis I: Funktionsuntersuchung (Ableitungsregeln, Stammfunktion)',
        'Kurvendiskussion (ganzrationale, Exponential-, trigonometrische Funktionen)',
        'Flächeninhalt und bestimmtes Integral',
      ],
      '12/2': [
        'Zufallsgrößen und Binomialverteilung',
        'Normalverteilung und einseitiger Signifikanztest',
        'Grundlagen der Koordinatengeometrie im Raum (Vektoren, Geraden)',
      ],
      '13/1': [
        'Analysis II: Gebrochen-rationale, Wurzel- und Logarithmusfunktionen',
        'Geraden und Ebenen im Raum (Lagebeziehungen, Abstände)',
        'Umkehrfunktionen und erweiterte Ableitungsregeln',
      ],
      '13/2': [
        'Anwendungen der Differential- und Integralrechnung',
        'Modellierung mit Funktionen (Wachstum, Zerfall)',
        'Vertiefung Koordinatengeometrie (Winkel, Schnitte, Abstände)',
      ],
    },
  },

  'Physik': {
    halbjahre: {
      '12/1': [
        'Statische elektrische und magnetische Felder',
        'Elektrische Feldstärke, Spannung und Kondensator',
        'Magnetische Flussdichte und Lorentzkraft',
      ],
      '12/2': [
        'Elektromagnetische Induktion und Schwingungen',
        'Elektromagnetische Wellen (Erzeugung, Ausbreitung, Eigenschaften)',
        'Wellenoptik und Interferenz',
      ],
      '13/1': [
        'Grundideen der Quantenphysik (Photoeffekt, Welle-Teilchen-Dualismus)',
        'Atommodell der Quantenphysik und Spektrallinien',
        'Strukturuntersuchungen zum Aufbau der Materie',
      ],
      '13/2': [
        'Kernphysik: Kernmodell und Kernkräfte',
        'Radioaktivität und Zerfallsreihen',
        'Kernenergietechnik (Kernspaltung, Kernfusion, Strahlenschutz)',
      ],
    },
  },

  'Politik und Gesellschaft': {
    // Lernbereiche nach Halbjahren: 12/1 = LB 1–2, 12/2 = LB 3–4, 13/1 = LB 1–3, 13/2 = LB 4
    halbjahre: {
      '12/1': [
        'Frieden und Sicherheit als Motive deutscher Außenpolitik',
        'Das europäische Projekt verstehen und mitgestalten',
        'Deutschland in internationalen Organisationen (NATO, UNO)',
      ],
      '12/2': [
        'Politische Systeme vergleichen und Demokratie wertschätzen',
        'Möglichkeiten der Demokratieförderung beurteilen',
        'Autoritäre und totalitäre Systeme im Vergleich',
      ],
      '13/1': [
        'Modernisierungsprozesse und Zusammenleben in Deutschland',
        'Soziale Ungleichheit und soziale Mobilität',
        'Bedeutung des Sozialstaats und aktuelle Herausforderungen',
      ],
      '13/2': [
        'Internationale Konfliktbearbeitung und Völkerrecht',
        'Menschenrechte und humanitäres Engagement',
        'Globale Herausforderungen und internationale Kooperation',
      ],
    },
  },

  'Wirtschaft und Recht': {
    // 12/1 = LB 1 (BWL), 12/2 = LB 2–3 (VWL + Recht), 13/1 = LB 1 (Recht), 13/2 = LB 2 (VWL)
    halbjahre: {
      '12/1': [
        'Betriebswirtschaftslehre: Unternehmensgründung und -führung',
        'Rechtsformen, Organisation und Unternehmenssteuerung',
        'Marketing, Investition und Finanzierung',
      ],
      '12/2': [
        'VWL: Gesamtwirtschaftliche Lage, Wachstum und Beschäftigung',
        'Einkommen und soziale Sicherung',
        'Rechtstechnische Grundlagen und Zivilrecht (Schuldverhältnisse)',
      ],
      '13/1': [
        'Zivilrecht: Interessenausgleich beim Kauf (Gewährleistung, Verbraucherschutz)',
        'Strafrecht: Grundlagen, Tatbestandsmerkmale, Rechtsfolgen',
        'Jugendstrafrecht und Strafzwecktheorien',
      ],
      '13/2': [
        'VWL: Geld, Preisniveau und Geldpolitik der EZB',
        'Außenhandel, Wechselkurse und Währungspolitik',
        'Europäischer Binnenmarkt und internationale Wirtschaftsbeziehungen',
      ],
    },
  },
};

/** Returns the available Halbjahre after striking one */
export function getAvailableHalbjahre(
  subject: string,
  gestrichenesHalbjahr: '12/1' | '12/2'
): string[] {
  const all = ['12/1', '12/2', '13/1', '13/2'];
  return all.filter(h => h !== gestrichenesHalbjahr);
}

/** Returns Schwerpunkte for a given subject and Halbjahr */
export function getSchwerpunkte(subject: string, halbjahr: string): string[] {
  return CURRICULUM[subject]?.halbjahre[halbjahr] ?? [];
}

/** Returns the two Halbjahre for Teil 2 (excluding the Schwerpunkt Halbjahr) */
export function getWeitereHalbjahre(
  gestrichenesHalbjahr: '12/1' | '12/2',
  schwerpunktHalbjahr: string
): string[] {
  return getAvailableHalbjahre('', gestrichenesHalbjahr)
    .filter(h => h !== schwerpunktHalbjahr);
}
