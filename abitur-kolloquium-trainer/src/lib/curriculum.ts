/**
 * Lehrplan-Schwerpunkte für das bayerische Abitur-Kolloquium.
 * Basierend auf dem LehrplanPLUS Bayern Gymnasium Oberstufe (G9).
 * Halbjahre: 12/1, 12/2, 13/1, 13/2
 *
 * Quellen:
 * - lehrplanplus.bayern.de (Fachlehrpläne Jgst. 12/13, gA und eA)
 * - ISB Illustrierende Prüfungsaufgaben (Halbjahr-Zuordnung Geographie)
 *
 * Hinweis: Für Deutsch, Englisch, Französisch und Italienisch definiert der
 * LehrplanPLUS keine offizielle Halbjahr-Zuordnung (2-Jahres-Block 12/13).
 * Die hier verwendete Verteilung orientiert sich an der gängigen Schulpraxis.
 */

export interface SubjectCurriculum {
  halbjahre: Record<string, string[]>;
  halbjahreEA?: Record<string, string[]>;
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
        'Stoffkreisläufe und Energiefluss in Ökosystemen',
      ],
    },
  },

  'Chemie': {
    // C12: LB2 Atombau, LB3 Bindung, LB4 Protonenübergänge, LB5 Elektronenübergänge
    // C13: LB2 Organische Verbindungen, LB3 Farbstoffe, LB4 Makromoleküle, LB5 Nachhaltigkeit
    halbjahre: {
      '12/1': [
        'Atombau: Energiestufen, Orbitalmodell und Periodensystem',
        'Chemische Bindung (Ionen-, Molekül-, Metallbindung)',
        'Molekülstruktur, Polarität und zwischenmolekulare Kräfte',
      ],
      '12/2': [
        'Protonenübergänge: Säure-Base-Gleichgewichte und pH-Wert',
        'Elektronenübergänge: Redoxreaktionen und Elektrochemie',
        'Galvanische Zellen und Elektrolyse',
      ],
      '13/1': [
        'Organische Stoffklassen: Kohlenwasserstoffe und funktionelle Gruppen',
        'Sauerstoffhaltige organische Verbindungen (Alkanole, Alkansäuren, Ester)',
        'Farbigkeit und Struktur von Farbstoffen',
      ],
      '13/2': [
        'Natürliche Makromoleküle: Proteine und Kohlenhydrate',
        'Kunststoffe: Polymerisation, Polykondensation und Recycling',
        'Chemie und Nachhaltigkeit (Stoffkreisläufe, Green Chemistry)',
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
        'Poetischer Realismus und Literatur des 19. Jahrhunderts',
        'Literarische Moderne und Expressionismus (Jahrhundertwende bis Mitte 20. Jh.)',
        'Erzählen und Erzähltheorie (Novelle, Roman)',
      ],
      '13/1': [
        'Exilliteratur und Nachkriegsliteratur (1933–1989)',
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
    // LehrplanPLUS: E12/13 als 2-Jahres-Block (gA + eA), keine offizielle Halbjahr-Zuordnung.
    // Themengebiete nach gängiger Schulpraxis gruppiert. eA-Vertiefungen in Klammern.
    halbjahre: {
      '12/1': [
        'Ireland: Geography, History, Society and Politics (Troubles, Brexit)',
        'Ethnic Diversity and Immigration in the UK and North America (British Empire, Commonwealth, Black Britain, Hispanics, Canadian Mosaic)',
        'Regional and Social Identities in the UK and the USA (Education, Social Classes, Devolution)',
      ],
      '12/2': [
        'The American Dream and Multicultural Society in the USA',
        'Political Systems in the UK and the USA (Magna Carta, Bill of Rights, Declaration of Independence, Constitution)',
        'International Relations: USA – UK – EU, Global Role of the USA, Supranational Organisations, Brexit',
      ],
      '13/1': [
        'Science, Technology and the Environment (Ethical Aspects)',
        'An Anglophone African or Asian Country (Geography, Society, Politics)',
        'Media in the Information Society (Media Literacy, Media Landscape)',
      ],
      '13/2': [
        'Shakespeare: Elizabethan Theatre and Society; Shakespeare Today',
        'Literature and Media: The Novel (Ganzschrift), Drama, Poetry, Short Stories, Film',
        'Values, Religion and Social Engagement (Volunteering, Charity)',
      ],
    },
  },

  'Ethik': {
    // Eth12 gA: LB1 = 12/1 (Theorie und Praxis des Handelns), LB2 = 12/2 (Freiheit und Determination)
    // Eth13 gA: LB1 = 13/1 (Recht und Gerechtigkeit), LB2 = 13/2 (Sinnorientierung und Lebensgestaltung)
    // eA-Vertiefungen in Klammern
    halbjahre: {
      '12/1': [
        'Theorie und Praxis des Handelns: Handlungsbegriff, Platon (Idee des Guten, Seelenlehre), Aristoteles (Tugendethik, Mesoteslehre)',
        'Ethische Grundpositionen: Kant (kategorischer Imperativ, Pflichtethik), Utilitarismus (Handlungs-, Regel-, Präferenzutilitarismus)',
        'Diskursethik (Habermas) und Verantwortungsethik (H. Jonas: Heuristik der Furcht, Nah-/Fernethik)',
        'eA: Mitleidsethik (Schopenhauer), Moralkritik (Nietzsche), Sprachkritik (Wittgenstein), Bereichsethiken, Wissenschaftstheorie (Popper)',
      ],
      '12/2': [
        'Freiheit und Determination: Aristoteles (freiwilliges/unfreiwilliges Handeln), Willensschwäche, positive und negative Freiheit',
        'Philosophische Positionen zur Freiheit: Kant (Autonomie), Sartre (Existentialismus), Bieri (bedingte/unbedingte Freiheit; eA: Schopenhauer, Erkenntnistheorie Kant)',
        'Sozialpsychologie (Konformität, Milgram-Experiment, Bystander-Effekt) und Sozialisation (Status, Rolle; eA: Nudging, Gender)',
        'Neurobiologie und Willensfreiheit: Libet-Experiment, Roth/Singer/Prinz; philosophische Kritik (Qualia, Erklärungslücke, kausale Geschlossenheit)',
      ],
      '13/1': [
        'Recht und Gerechtigkeit: Aristoteles (kommutative/distributive Gerechtigkeit), Rawls (Schleier des Nichtwissens, Differenzprinzip)',
        'Rechtspositivismus, Naturrecht und Radbruch\'sche Formel (eA: Eichmann-Prozess, Arendt)',
        'Strafrecht: Strafzwecktheorien (absolute, relative, Mischform), Kriminalitätstheorien, Tat-/Täterstrafrecht, Strafvollzug',
        'Menschenrechte und globale Friedensordnung (Schutzverantwortung, Völkerrecht, Migration; eA: Galtung, Singer, Pogge, Arendt: Macht und Gewalt)',
      ],
      '13/2': [
        'Sinnorientierung und Lebensgestaltung: Eudaimonie bei Aristoteles, Epikur (Ataraxie, Hedonismus) und Stoa (Apathie, logos, vita activa)',
        'Sinnkonzepte: Frankl (Selbsttranszendenz), Camus (Absurdität, Sisyphos-Mythos; eA: Kant – Würdigkeit zum Glück, Resilienzforschung)',
        'Empirische Glücksforschung: Flow (Csikszentmihalyi), PERMA-Modell (Seligman)',
        'Kommunikationspsychologie (Schulz v. Thun, Berne) und Utopien/Dystopien (eA: Ganzschrift)',
      ],
    },
  },

  'Evangelische Religionslehre': {
    // EvR12 LB2 = 12/1, LB3 = 12/2; EvR13 LB2 = 13/1, LB3 = 13/2
    halbjahre: {
      '12/1': [
        'Sinnfrage und Gottesfrage (Theodizee, Trinität)',
        'Religionskritik: Projektionstheorie (Feuerbach)',
        'Der im-perfekte Mensch: Identität, Fragmentarität, Sünde und Rechtfertigung',
      ],
      '12/2': [
        'Homo faber: Arbeit und Beruf (Luther, Marx)',
        'Schöpfungsglaube und Freiheit eines Christenmenschen (Luther)',
        'Christsein in der Gesellschaft: Zwei-Reiche-Lehre und Königsherrschaft Christi (Luther, Barth)',
      ],
      '13/1': [
        'Ethische Grundmodelle (Kant, Utilitarismus, ggf. Diskursethik)',
        'Christliche Ethik: Dekalog, Bergpredigt und Doppelgebot der Liebe',
        'Angewandte Ethik (Medizinethik, Friedensethik)',
      ],
      '13/2': [
        'Eschatologie: Reich Gottes, „schon und noch nicht"',
        'Tod, Endlichkeit und Auferstehungshoffnung',
        'Christliche Zukunftsvisionen und Lebenssinn',
      ],
    },
  },

  'Katholische Religionslehre': {
    // KR12 LB1 = 12/1 (Personalität), LB2 = 12/2 (Transzendentalität); KR13 LB1 = 13/1 (Sozialität), LB2 = 13/2 (Existentielle Fragen)
    halbjahre: {
      '12/1': [
        'Personalität: Der Mensch und die Frage „Wer bin ich?" (Philosophische Anthropologie, Identität, Menschenwürde)',
        'Das christliche Menschenbild als Leitlinie: Personbegriff, Gottebenbildlichkeit (Gen 1-3), Menschenrechte',
        'Vorstellungen vom Menschsein in Wirtschaft, Politik und Wissenschaft (KI, Transhumanismus)',
      ],
      '12/2': [
        'Transzendentalität: Gottesfrage, Gottesbeweise (Anselm, Thomas v. Aquin, Pascal), Religionskritik (Feuerbach, Marx, Nietzsche)',
        'Bibel als Offenbarung, trinitarisches Gottesbild (Credo), Verhältnis Glaube und Naturwissenschaft',
        'Interreligiöser Vergleich: christliches Offenbarungsverständnis und Gottesbild des Islam',
      ],
      '13/1': [
        'Sozialität – Ethische Grundlegung: deontologische/teleologische Argumentation, Naturrecht, Pflichtethik, Utilitarismus, Verantwortungsethik',
        'Biblische Ethik: Dekalog und Bergpredigt, Gewissensbildung, katholische Moraltheologie',
        'Ethik der Lebensbereiche: Ehe/Familie, Katholische Soziallehre (Personalität, Solidarität, Subsidiarität, Gemeinwohl), Sozialenzykliken, Nachhaltigkeit',
      ],
      '13/2': [
        'Existentielle Fragen: Umgang mit Wahrheitsansprüchen (Exklusivismus, Inklusivismus, Pluralismus, interreligiöser Dialog)',
        'Christliche Ethik als Begründungsoption, Auferstehungshoffnung und Eschatologie (Reich-Gottes-Botschaft Jesu)',
        'Entwicklung eigener Lebensentwürfe: Rückblick auf die vier Kantischen Fragen (Wissen, Tun, Hoffen, Menschsein)',
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
        'Régions à forte identité (Corse, Bretagne, Alsace, Pays basque) et patrimoine culturel',
      ],
      '12/2': [
        'Les relations franco-allemandes (histoire, Traité de l\'Élysée, Traité d\'Aix-la-Chapelle)',
        'La France et l\'Europe (V° République, institutions, laïcité)',
        'Politique et histoire: de l\'Absolutisme à la République',
      ],
      '13/1': [
        'La francophonie: histoire et diversité (Afrique, Québec, Antilles)',
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
    // LehrplanPLUS Geo gA. eA-Schwerpunkte separat in halbjahreEA.
    halbjahre: {
      '12/1': [
        'Klima und Klimawandel (atmosphärische und ozeanische Prozesse, Drei-Zellen-Modell, ENSO)',
        'Mensch-Umwelt-Beziehungen in den Tropen (Immerfeuchte/Wechselfeuchte Tropen, Desertifikation, Nachhaltigkeit)',
        'Subpolare und Polare Zone (Permafrost, geopolitische Bedeutung, Arktis und Antarktis)',
      ],
      '12/2': [
        'Ressourcenkonflikte und Ressourcenmanagement in Europa (Mittlere Breiten, Subtropen, Wasser, Hochwasser, Wald)',
        'Nutzung und Vulnerabilität von Hochgebirgsräumen (Gebirgsbildung, Massenbewegungen, Gletscherrückzug)',
        'Gefährdungspotenzial und Risikomanagement (tektonische Ereignisse, Plattentektonik)',
      ],
      '13/1': [
        'Globalisierung und Entwicklung (Indikatoren, Disparitäten, fragmentierende Entwicklung)',
        'Ferntourismus und nachhaltiger Tourismus (Südostasien, Deutschland)',
        'Rohstofflagerstätten und Rohstoffabbau (Verfügbarkeit, Konflikte, Pipelinenetze)',
        'Regenerative Energien und nachhaltiges Ressourcenmanagement',
      ],
      '13/2': [
        'Bevölkerung und Migration (demographischer Übergang, Flucht und Vertreibung)',
        'Bevölkerungsentwicklung in Deutschland (Zu- und Abwanderung, demographischer Wandel)',
        'Verstädterung, Megastädte und Global Cities',
        'Nachhaltige Stadtentwicklung (Stadtklima, Smart Cities, Bürgerbeteiligung)',
      ],
    },
    // eA-Schwerpunkte: Erweiterte Inhalte laut LehrplanPLUS Geo12/13 eA
    halbjahreEA: {
      '12/1': [
        'Klima und Klimawandel (atmosphärische und ozeanische Prozesse, Drei-Zellen-Modell, Polarfrontjetstream, ENSO, Klima-/Vegetationszonen, Klimamodelle und Emissionsszenarien)',
        'Mensch-Umwelt-Beziehungen in den Tropen (Immerfeuchte/Wechselfeuchte/Trockene Tropen, Wüstentypen, Desertifikation, geopolitische Interessen in den Tropen)',
        'Subpolare und Polare Zone (Permafrost, Kippelemente des Klimasystems, Klimarekonstruktion – Eisbohrkerne/Tiefseesedimente, Geopolitik, Nahrungsmittelproduktion)',
      ],
      '12/2': [
        'Ressourcenkonflikte und Ressourcenmanagement in Europa (Mittlere Breiten, Subtropen, Wasser und Trinkwasserschutz in Deutschland, Hochwasser, Wald, Bodenprofil/-schutz, Landwirtschaft und Klimaschutz, Flächenmanagement)',
        'Nutzung und Vulnerabilität von Hochgebirgsräumen (Gebirgsbildung, Massenbewegungen, Gletscherrückzug, Großbauprojekte, Transitverkehr, nachhaltige Nutzung sensibler Gebirgsräume)',
        'Naturkatastrophen und Risikoforschung (Vulkanismus, Erdbeben, Tsunamis, Plattentektonik, tropische Wirbelstürme, Risikoforschung und Risikomanagement)',
      ],
      '13/1': [
        'Globalisierung, Entwicklung und Disparitäten (Indikatoren, verschiedene Entwicklungstheorien, fragmentierende Entwicklung, Entwicklungsstrategien)',
        'Globalisierung und Standort Deutschland (Standortfaktoren, Wirtschaftsdynamik, wirtschaftsräumliche Disparitäten)',
        'Ferntourismus und nachhaltiger Tourismus (Südostasien, Deutschland, Digitalisierung und Raumwahrnehmung)',
        'Rohstofflagerstätten und Rohstoffabbau (Verfügbarkeit, Konflikte, Pipelinenetze, Extremräume, geopolitische Bedeutung)',
        'Regenerative Energien, nachhaltige Mobilitätskonzepte und lokales Ressourcenmanagement',
      ],
      '13/2': [
        'Bevölkerung und Migration (demographischer Übergang, Flucht und Vertreibung, Steuerung und Geopolitik)',
        'Sozialgeographische Aspekte der Demographie (Familienstruktur, Stellung der Frau, Arbeitswelt, Generationenvertrag)',
        'Bevölkerungsentwicklung in Deutschland, Tragfähigkeit der Erde und Bevölkerungsprognosen',
        'Verstädterung, Megastädte und Global Cities (Lösungsansätze)',
        'Nachhaltige Stadtentwicklung, Ökosystem Stadt, Stadtklima und Urban Gardening',
        'Imageorientierung von Städten (Prestigebauten, Stadtmarketing, Megaevents)',
      ],
    },
  },

  'Geschichte': {
    // G12 LB1 = 12/1, G12 LB2 = 12/2, G13 LB1 = 13/1, G13 LB2 = 13/2
    halbjahre: {
      '12/1': [
        'Die deutsche Revolution von 1848/49 und bürgerliche Gesellschaft',
        'Politische und gesellschaftliche Modernisierung im Kaiserreich',
        'Demokratisierung und Gesellschaft in der Weimarer Republik',
      ],
      '12/2': [
        'Scheitern der Weimarer Republik',
        'NS-Diktatur und Völkermord',
        'Die Bundesrepublik Deutschland und die DDR',
        'Deutsche Einheit und die Bundesrepublik 1990–2009',
      ],
      '13/1': [
        'Die historische Entwicklung des israelisch-palästinensischen Konflikts',
        'USA im 20. und 21. Jahrhundert (Supermacht und Weltordnung)',
        'Russland und China im 20. und 21. Jahrhundert',
      ],
      '13/2': [
        'Historische Grundlagen moderner demokratischer Staatsordnungen',
        'Menschenrechte und ihre historische Entwicklung',
        'Von nationalistischer Konfrontation zu europäischer Integration',
      ],
    },
  },

  'Italienisch': {
    // LehrplanPLUS: Getrennte Jgst. 12/13, keine offizielle Halbjahr-Zuordnung innerhalb der Jahrgangsstufe.
    halbjahre: {
      '12/1': [
        'L\'Italia di oggi: società, giovani e vita quotidiana',
        'Facetten Italiens: Nord, Centro, Sud (contrasti regionali, turismo)',
        'Made in Italy: prodotti, marchi e significato economico',
      ],
      '12/2': [
        'Storia italiana: dal Risorgimento alla nascita della Repubblica (Fascismo, Resistenza)',
        'Arte e architettura italiana (Rinascimento)',
        'Cantautori: dimensione politica e sociale della musica italiana',
      ],
      '13/1': [
        'Immigrazione ed emigrazione nella storia e nel presente',
        'Il miracolo economico, gli anni di piombo e la società contemporanea',
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
    // L12 LB2 = 12/1 (Philosophie), LB3 = 12/2 (Satire), L13 LB2 = 13/1 (Augustus), LB3 = 13/2 (Staatsphilosophie)
    halbjahre: {
      '12/1': [
        '"Philosophandum est" – Philosophische Haltungen (Cicero, Seneca)',
        'Stoische Ethik und Lebensführung (Seneca: Epistulae morales)',
        'Epikureismus und Skepsis (Cicero: Tusculanae disputationes, De finibus)',
      ],
      '12/2': [
        '"Difficile est saturam non scribere" – Römische Satire und Lyrik',
        'Catull: Gesellschaftskritik und Liebeslyrik (Carmina)',
        'Horaz und Petron: Satire und römische Gesellschaft',
      ],
      '13/1': [
        '"Imperium sine fine dedi" – Literatur und Herrschaft im augusteischen Rom',
        'Vergil: Aeneis (Staatsidee und Sendungsbewusstsein)',
        'Res gestae divi Augusti und augusteische Propaganda',
      ],
      '13/2': [
        '"Res publica res populi" – Staatsphilosophische Betrachtungen',
        'Cicero: De re publica (Staatsformen und Mischverfassung)',
        'Cicero: De officiis (Pflichtenlehre und politische Verantwortung)',
      ],
    },
  },

  'Mathematik': {
    // M12: LB2 Analysis, LB3 Stochastik, LB4 Geometrie; M13: LB2 Analysis, LB3 Stochastik, LB4 Geometrie
    halbjahre: {
      '12/1': [
        'Analysis I: Ableitungsregeln und Kurvendiskussion',
        'Funktionstypen: ganzrationale, gebrochen-rationale und Exponentialfunktionen',
        'Umkehrfunktionen, Logarithmus und erweiterte Ableitungsregeln',
      ],
      '12/2': [
        'Zufallsgrößen und Binomialverteilung (Erwartungswert, Standardabweichung)',
        'Wahrscheinlichkeitsverteilungen und Laplace-Experimente',
        'Grundlagen der Koordinatengeometrie im Raum (Vektoren, Geraden)',
      ],
      '13/1': [
        'Analysis II: Stammfunktion, bestimmtes Integral und Flächeninhalte',
        'Normalverteilung und einseitiger Signifikanztest',
        'Geraden und Ebenen im Raum (Lagebeziehungen, Abstände)',
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
        'Kernphysik: Aufbau des Atomkerns und Kernbindungsenergie',
        'Radioaktiver Zerfall und Zerfallsgesetz',
        'Kernspaltung, Kernfusion und Strahlenschutz',
      ],
    },
  },

  'Politik und Gesellschaft': {
    // PuG12: LB1+LB2 = 12/1, LB3+LB4 = 12/2; PuG13: LB1–3 = 13/1, LB4 = 13/2
    halbjahre: {
      '12/1': [
        'Frieden und Sicherheit als Motive deutscher Außenpolitik',
        'Das europäische Projekt verstehen und mitgestalten',
        'Deutschland in internationalen Organisationen (NATO, UNO)',
      ],
      '12/2': [
        'Politische Systeme vergleichen (Demokratie, Autoritarismus, Totalitarismus)',
        'Demokratie wertschätzen und Demokratieförderung',
        'Menschenrechte und Grundrechte im politischen System',
      ],
      '13/1': [
        'Modernisierungsprozesse und Zusammenleben in Deutschland',
        'Soziale Ungleichheit und soziale Mobilität',
        'Bedeutung des Sozialstaats und aktuelle Herausforderungen',
      ],
      '13/2': [
        'Internationale Konfliktbearbeitung und Friedenssicherung',
        'Menschenrechte und humanitäres Engagement',
        'Globalisierung und internationale Kooperation',
      ],
    },
  },

  'Sport': {
    // LehrplanPLUS Sporttheorie (Leistungsfach): LB 1 Trainingslehre = 12/1, LB 2 Bewegungslehre = 12/2,
    // LB 3 Sport und Gesundheit = 13/1, LB 4 Psychologische, soziale und gesellschaftspolitische Aspekte = 13/2
    halbjahre: {
      '12/1': [
        'Trainingslehre: Trainingsprinzipien, Superkompensation und Periodisierung',
        'Sportbiologische Grundlagen: Bewegungsapparat, Muskelfasertypen und Kontraktionsformen',
        'Konditionelle Fähigkeiten: Kraft-, Ausdauer-, Schnelligkeits- und Beweglichkeitstraining',
      ],
      '12/2': [
        'Biomechanik: Körperschwerpunkt, Körperachsen und biomechanische Prinzipien',
        'Motorisches Lernen: Dreiphasenmodell (Grob-, Feinkoordination, variable Verfügbarkeit)',
        'Koordinative Fähigkeiten und deren Training, Technik- und Taktiktraining',
      ],
      '13/1': [
        'Gesundheitsmodelle: Salutogenese, Risikofaktoren und gesundheitsorientierter Sport',
        'Ernährung im Sport: Energiebilanz, Makro-/Mikronährstoffe und Sporternährung',
        'Doping: Substanzen, Methoden, gesundheitliche Risiken und ethische Bewertung',
      ],
      '13/2': [
        'Sportpsychologie: Motivation, Emotion und Aggression im Sport',
        'Soziale Aspekte: Fairness, Kooperation und Gruppenprozesse im Sport',
        'Gesellschaftspolitische Aspekte: Kommerzialisierung, Medien und Sport als Bildungsfaktor',
      ],
    },
  },

  'Wirtschaft und Recht': {
    // WR12 eA: LB1 BWL (54 Std.) = 12/1, LB2 VWL (40 Std.) = 12/2, LB3 Recht (18 Std.) → 13/1
    // WR13 eA: LB1 Recht (48 Std.) → 13/1, LB2 VWL (36 Std.) = 13/2
    halbjahre: {
      '12/1': [
        'Unternehmensaufbau und -ziele: Stakeholder, Zielkonflikte, Aufbau-/Ablauforganisation, Wertschöpfung und Funktionsbereiche',
        'Markt und Produktion: Beschaffungsarten, Break-even-Analyse, Marktsituation, ABC-Analyse und Marktwachstum-Marktanteils-Portfolio',
        'Jahresabschluss und Bilanzanalyse: Bilanz, GuV, Bilanzkennzahlen (Anlageintensität, EK-Quote, Deckungsgrade, Liquiditätsgrade), Rentabilitätskennzahlen und EBIT',
        'Investition und Finanzierung: Gewinnvergleichsrechnung, Amortisationsrechnung, Kapitalwertmethode, Leverage-Effekt',
        'Unternehmensführung und Management: SWOT-Analyse, Wettbewerbsstrategien nach Porter, Kernkompetenzen, Managementfunktionen',
      ],
      '12/2': [
        'Magisches Viereck, Konjunkturzyklus, Konjunkturindikatoren und Zielbeziehungen',
        'Wachstum und Beschäftigung: Wirtschaftspolitik (Nachfrage-/Angebotstheorie), BIP (Verwendungs-/Entstehungsrechnung), Arbeitslosigkeitsarten, Staatsverschuldung, Klimaschutz',
        'Einkommen und soziale Sicherung: Tarifpolitik, Kranken-/Rentenversicherung, demographischer Wandel, soziale Gerechtigkeit (Leistungs-, Chancen-, Bedarfs-, Generationengerechtigkeit)',
      ],
      '13/1': [
        'Rechtstechnische Grundlagen (BGB-Systematik, Gutachtenstil), gesetzliche Schuldverhältnisse: § 823 I BGB, Gefährdungshaftung, Herausgabeanspruch und gutgläubiger Eigentumserwerb',
        'Vertragliche Schuldverhältnisse: Vertragstypen (Werk-, Dienstvertrag), Leistungsstörungen (verspätete Leistung, Unmöglichkeit, Nebenpflichtverletzung), Gewährleistung beim Verbrauchsgüterkauf',
        'Verbraucherschutz: Beweislastumkehr, Widerrufsrecht bei Fernabsatzverträgen, AGB, Vertragsfreiheit in der sozialen Marktwirtschaft',
        'Strafrecht: Aufbau einer Straftat, Rechtfertigungs- und Entschuldigungsgründe, Strafzwecktheorien, Strafzumessung, Radbruchsche Formel',
      ],
      '13/2': [
        'Geld und Preisniveau: Preisniveaustabilität, Geldpolitik der EZB (Transmissionsmechanismus, Mandat, Unabhängigkeit), Wirkungsgrenzen',
        'Außenhandel und Währung: Leistungs-/Kapitalbilanz, Wechselkursbildung, außenhandels- und währungspolitische Maßnahmen',
        'Spieltheorie: Gefangenendilemma, dominante Strategie, Nash-Gleichgewicht, Pareto-Optimum',
        'Vertiefte und vernetzende Betrachtung aktueller gesamtwirtschaftlicher Problemstellungen',
      ],
    },
  },

  'Informatik': {
    // LehrplanPLUS Informatik (G9) gA – verifiziert anhand LIS_PDF_28-02-2026-10/11
    halbjahre: {
      '12/1': [
        'Rekursion: lineare und verzweigte Rekursion, Tiefensuche, rekursive Problemlösung',
        'Listen: einfach verkettete Liste, Stapel (LIFO), Warteschlange (FIFO), Kompositum-Entwurfsmuster',
        'Binärbäume: geordneter Binärbaum, Einfügen/Suchen, Traversierung (Preorder, Inorder, Postorder)',
      ],
      '12/2': [
        'Nebenläufige Prozesse: Synchronisation, Deadlock, Coffman-Bedingungen, Monitorkonzept, Erzeuger-Verbraucher-Problem',
        'Informationssicherheit: Schutzziele (Vertraulichkeit, Integrität, Verfügbarkeit, Authentizität), Gefährdungen und Maßnahmen',
        'Praktische Softwareentwicklung: MVC-Architektur, Wasserfallmodell, agile Methoden, Testen, Refaktorierung',
      ],
      '13/1': [
        'Formale Sprachen und Automaten: EBNF, Syntaxdiagramme, DEA/NEA, reguläre Sprachen, Äquivalenz DEA/NEA',
        'Funktionsweise eines Rechners: Von-Neumann-Architektur, Registermaschine, Assemblersprache, Befehlszyklus',
      ],
      '13/2': [
        'Grenzen der Berechenbarkeit: Laufzeitaufwand (linear, quadratisch, exponentiell, logarithmisch), O-Notation, Brute-Force, Halteproblem',
        'Künstliche Intelligenz: Neuronale Netze (Forward Propagation, Backpropagation), k-Means-Algorithmus, supervised/unsupervised/reinforcement learning',
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

/** Returns Schwerpunkte for a given subject, Halbjahr and optional Anforderungsniveau */
export function getSchwerpunkte(subject: string, halbjahr: string, examLevel?: 'gA' | 'eA'): string[] {
  const entry = CURRICULUM[subject];
  if (!entry) return [];
  if (examLevel === 'eA' && entry.halbjahreEA?.[halbjahr]) {
    return entry.halbjahreEA[halbjahr];
  }
  return entry.halbjahre[halbjahr] ?? [];
}

/** Returns the two Halbjahre for Teil 2 (excluding the Schwerpunkt Halbjahr) */
export function getWeitereHalbjahre(
  gestrichenesHalbjahr: '12/1' | '12/2',
  schwerpunktHalbjahr: string
): string[] {
  return getAvailableHalbjahre('', gestrichenesHalbjahr)
    .filter(h => h !== schwerpunktHalbjahr);
}
