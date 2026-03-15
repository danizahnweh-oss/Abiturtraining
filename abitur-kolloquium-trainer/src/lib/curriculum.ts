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
 *
 * Regel: Maximal 3 Schwerpunkte pro Halbjahr.
 */

export interface SubjectCurriculum {
  halbjahre: Record<string, string[]>;
  halbjahreEA?: Record<string, string[]>;
}

export const CURRICULUM: Record<string, SubjectCurriculum> = {
  'Biologie': {
    // B12: LB2 Genetik/Gentechnik, LB3 Evolution, LB4 Verhaltensökologie
    // B13: LB2 Neurobiologie, LB3 Stoffwechsel, LB4 Ökologie/Biodiversität
    halbjahre: {
      '12/1': [
        'Genetik: Speicherung, Realisierung und Regulation genetischer Information (Proteinbiosynthese, Epigenetik)',
        'Vervielfältigung, Neukombination und Veränderung genetischer Information (Replikation, PCR, Meiose, Mutation, Gentechnik)',
        'Weitergabe genetischer Information, Humangenetik und DNA-Analytik (Mendelsche Regeln, Erbgänge, Stammbaumanalyse)',
      ],
      '12/2': [
        'Evolutionsforschung: molekulare Homologien, Stammbäume und Artbestimmung',
        'Mechanismen der Evolution (Selektion, Gendrift, Artbildung, Koevolution)',
        'Verhaltensökologie: Fitness, Kooperation, Aggression und Fortpflanzungsstrategien',
      ],
      '13/1': [
        'Neuronale Informationsverarbeitung (Nervenzelle, Potentiale, Synapse, Depression)',
        'Stoffwechselphysiologie: Photosynthese (lichtabhängige und lichtunabhängige Reaktionen)',
        'Stoffwechselphysiologie: Enzyme, Dissimilation (Zellatmung, Gärung)',
      ],
      '13/2': [
        'Dynamische Prozesse in Ökosystemen (ökologische Potenz, Nische, Populationsentwicklung)',
        'Anthropogene Einflüsse auf Ökosysteme und Wert der Biodiversität (Ökosystemleistungen)',
        'Ökologie der Biosphäre: globale Vernetzung und nachhaltige Lebensweise',
      ],
    },
    halbjahreEA: {
      '12/1': [
        'Genetik: Speicherung, Realisierung und Regulation (Proteinbiosynthese, alternatives Spleißen, HI-Virus, Antisense-RNA, Antibiotika, Epigenetik mit RNA-Interferenz und Histonmodifikation)',
        'Vervielfältigung, Neukombination und Veränderung (Replikation, PCR, DNA-Reparatur, Meiose, Apoptose/Tumor, Onkogene, Genkopplung/Crossing-over, Gentechnik)',
        'Weitergabe, Humangenetik und DNA-Analytik (Mendelsche Regeln, epigenetische Vererbung, genomische Prägung, PID, personalisierte Medizin)',
      ],
      '12/2': [
        'Evolutionsforschung: molekulare Homologien, Stammbäume, Evolution des Menschen (Ursprung, Fossilgeschichte)',
        'Mechanismen der Evolution (Selektion, Gendrift, Artbildung, Koevolution, kulturelle Evolution, Sozialdarwinismus)',
        'Verhaltensökologie: Fitness, Kooperation, Kommunikation (Sender-Empfänger-Modell), Aggression, Fortpflanzung, Sozialverhalten von Primaten',
      ],
      '13/1': [
        'Neuronale Informationsverarbeitung (Potentiale, erregende und hemmende Synapsen, EPSP/IPSP, Summation, ENG/EKG, neuronale Plastizität, MS, Parkinson, Depression)',
        'Neuroendokrine Steuerung: Stressachsen (Sympathikus-NNM, Hypophysen-NNR), Cortisol-Regelung, Signaltransduktion im Auge (Rhodopsin)',
        'Stoffwechselphysiologie: Photosynthese (Tracer-Methode, zyklischer Elektronentransport, C4-Pflanzen), Enzyme, Dissimilation (β-Oxidation, energetisches Modell Atmungskette)',
      ],
      '13/2': [
        'Dynamische Prozesse in Ökosystemen (ökologische Potenz, Nische, K-/r-Strategie, Lotka-Volterra-Modell, Wiederfangmethode, Stickstoffatomkreislauf)',
        'Anthropogene Einflüsse auf Ökosysteme, Biodiversität und ökologischer Fußabdruck',
        'Ökologie der Biosphäre: Biom-Wechselwirkungen (Nietenhypothese, Passagierhypothese), Mikroplastik, hormonartig wirkende Substanzen',
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
    // Themengebiete nach gängiger Schulpraxis gruppiert.
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
    halbjahre: {
      '12/1': [
        'Theorie und Praxis des Handelns: Handlungsbegriff, Platon (Idee des Guten, Seelenlehre), Aristoteles (Tugendethik, Mesoteslehre)',
        'Ethische Grundpositionen: Kant (kategorischer Imperativ, Pflichtethik), Utilitarismus (Handlungs-, Regel-, Präferenzutilitarismus)',
        'Diskursethik (Habermas) und Verantwortungsethik (H. Jonas: Heuristik der Furcht, Nah-/Fernethik)',
      ],
      '12/2': [
        'Freiheit und Determination: Aristoteles (freiwilliges/unfreiwilliges Handeln), Willensschwäche, positive und negative Freiheit',
        'Philosophische Positionen zur Freiheit: Kant (Autonomie), Sartre (Existentialismus), Bieri (bedingte/unbedingte Freiheit)',
        'Sozialpsychologie (Konformität, Milgram-Experiment, Bystander-Effekt), Neurobiologie und Willensfreiheit (Libet-Experiment, Roth/Singer/Prinz)',
      ],
      '13/1': [
        'Recht und Gerechtigkeit: Aristoteles (kommutative/distributive Gerechtigkeit), Rawls (Schleier des Nichtwissens, Differenzprinzip)',
        'Rechtspositivismus, Naturrecht und Radbruch\'sche Formel; Strafrecht: Strafzwecktheorien (absolute, relative, Mischform)',
        'Menschenrechte und globale Friedensordnung (Schutzverantwortung, Völkerrecht, Migration)',
      ],
      '13/2': [
        'Sinnorientierung und Lebensgestaltung: Eudaimonie bei Aristoteles, Epikur (Ataraxie, Hedonismus) und Stoa (Apathie, logos, vita activa)',
        'Sinnkonzepte: Frankl (Selbsttranszendenz), Camus (Absurdität, Sisyphos-Mythos)',
        'Empirische Glücksforschung: Flow (Csikszentmihalyi), PERMA-Modell (Seligman), Kommunikationspsychologie (Schulz v. Thun)',
      ],
    },
    // eA-Schwerpunkte: Erweiterte Inhalte laut LehrplanPLUS Ethik 12/13 eA
    halbjahreEA: {
      '12/1': [
        'Theorie und Praxis des Handelns: Platon, Aristoteles, Kant (kategorischer Imperativ), Utilitarismus, Diskursethik (Habermas), Verantwortungsethik (Jonas)',
        'Mitleidsethik (Schopenhauer), Moralkritik (Nietzsche), Sprachkritik (Wittgenstein)',
        'Bereichsethiken, Wissenschaftstheorie (Popper) und kritische Auseinandersetzung mit ethischen Grundpositionen',
      ],
      '12/2': [
        'Freiheit und Determination: Aristoteles, Kant (Autonomie), Sartre (Existentialismus), Bieri, Schopenhauer, Erkenntnistheorie (Kant)',
        'Sozialpsychologie (Konformität, Milgram, Bystander-Effekt, Nudging, Gender) und Sozialisation (Status, Rolle)',
        'Neurobiologie und Willensfreiheit: Libet-Experiment, Roth/Singer/Prinz; philosophische Kritik (Qualia, Erklärungslücke, kausale Geschlossenheit)',
      ],
      '13/1': [
        'Recht und Gerechtigkeit: Aristoteles, Rawls (Schleier des Nichtwissens, Differenzprinzip), Rechtspositivismus, Naturrecht, Radbruch\'sche Formel (Eichmann-Prozess, Arendt)',
        'Strafrecht: Strafzwecktheorien, Kriminalitätstheorien, Tat-/Täterstrafrecht, Strafvollzug',
        'Menschenrechte und globale Friedensordnung (Schutzverantwortung, Völkerrecht, Migration, Galtung, Singer, Pogge, Arendt: Macht und Gewalt)',
      ],
      '13/2': [
        'Sinnorientierung: Eudaimonie bei Aristoteles, Epikur (Ataraxie, Hedonismus), Stoa (Apathie, logos, vita activa)',
        'Sinnkonzepte: Frankl (Selbsttranszendenz), Camus (Absurdität, Sisyphos-Mythos), Kant (Würdigkeit zum Glück), Resilienzforschung',
        'Empirische Glücksforschung (Flow, PERMA-Modell), Kommunikationspsychologie (Schulz v. Thun, Berne), Utopien/Dystopien (Ganzschrift)',
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
    // LehrplanPLUS KR (G9) gA – verifiziert anhand LIS_PDF_04-03-2026-8 (KR12) / 04-03-2026-7 (KR13)
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
        'Ethik der Lebensbereiche: Ehe/Familie, Katholische Soziallehre (Personalität, Solidarität, Subsidiarität, Gemeinwohl), Sozialenzykliken, Nachhaltigkeit, Digitalisierung',
      ],
      '13/2': [
        'Existentielle Fragen: Umgang mit Wahrheitsansprüchen (Exklusivismus, Inklusivismus, Pluralismus, interreligiöser Dialog)',
        'Christliche Ethik als Begründungsoption, Auferstehungshoffnung und Eschatologie (Reich-Gottes-Botschaft Jesu)',
        'Entwicklung eigener Lebensentwürfe: Rückblick auf die vier Kantischen Fragen (Wissen, Tun, Hoffen, Menschsein)',
      ],
    },
    // LehrplanPLUS KR (G9) eA – verifiziert anhand LIS_PDF_04-03-2026-9 (KR12) / 04-03-2026-6 (KR13)
    halbjahreEA: {
      '12/1': [
        'Personalität: Philosophische Anthropologie (Frankl + z. B. Gehlen, Scheler, Kurzweil), Identität, Menschenwürde, Religionsfreiheit, Konkurrenz der Menschenrechte',
        'Das christliche Menschenbild: Personbegriff, Gottebenbildlichkeit (Gen 1-3), Gleichstellung der Geschlechter (Gal 3,26-29, GG Art. 3), interreligiöser Menschenbild-Vergleich (z. B. Buddhismus)',
        'Vorstellungen vom Menschsein in Wirtschaft, Politik und Wissenschaft (KI, Transhumanismus), Engagement und Entfaltungsmöglichkeiten',
      ],
      '12/2': [
        'Transzendentalität: Gottesfrage, Erkenntnistheorie (Positivismus/Comte, Neopositivismus/Wittgenstein), Gottesbeweise (Anselm, Thomas v. Aquin, Pascal), Religionskritik (Feuerbach, Marx, Nietzsche, frz. Existentialismus, Neuer Atheismus)',
        'Bibel als Offenbarung (historisch-kritische Methode, kanonische Exegese), trinitarisches Gottesbild (mind. 2 Modelle, Credo: Apostolicum + Nicäno-Konstantinopolitanum), Kreationismus/intelligent design, Verhältnis Glaube und Naturwissenschaft',
        'Interreligiöser Vergleich: Offenbarungsverständnis und Gottesbild einer weiteren abrahamitischen Religion, populäre Gottesvorstellungen, kulturelle Ausdrucksformen des Glaubens',
      ],
      '13/1': [
        'Sozialität – Ethische Grundlegung: deontologische/teleologische Argumentation, mind. 3 Modelle (Naturrecht, Pflichtethik, Utilitarismus, Diskursethik, Hedonismus), Verantwortungsethik',
        'Biblische Ethik: Dekalog, Bergpredigt, Bundesbuch, prophetische Weisungen, Gewissensbildung (Gaudium et spes 16), kath. Moraltheologie, Rezeptionsgeschichte (z. B. „gerechter Krieg")',
        'Ethik der Lebensbereiche: Ehe/Familie, Berufswahl/Arbeitswelt, Kath. Soziallehre (Personalität, Solidarität, Subsidiarität, Gemeinwohl), Unternehmensleitbild-Analyse, Nachhaltigkeit, Digitalisierung',
      ],
      '13/2': [
        'Wahrheitsansprüche: Exklusivismus, Inklusivismus, Pluralismus, interreligiöser Dialog (z. B. Assisi 1986), Relativismus vs. verbindliche Wahrheitsdeutung',
        'Perspektiven christlicher Ethik: Konsensbildung (Diskursethik/Habermas), Rolle der Kirche, Letztbegründung in philosophischer und christlicher Ethik',
        'Auferstehungshoffnung und Eschatologie (säkulare und religiöse Zukunftskonzepte, Reich-Gottes-Botschaft Jesu), Entwicklung eigener Lebensentwürfe (vier Kantische Fragen)',
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
        'Rohstofflagerstätten, Rohstoffabbau und regenerative Energien (Verfügbarkeit, Konflikte, nachhaltiges Ressourcenmanagement)',
      ],
      '13/2': [
        'Bevölkerung und Migration (demographischer Übergang, Flucht und Vertreibung, Bevölkerungsentwicklung in Deutschland)',
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
        'Globalisierung, Entwicklung und Disparitäten (Indikatoren, Entwicklungstheorien, Standort Deutschland, Wirtschaftsdynamik)',
        'Ferntourismus und nachhaltiger Tourismus (Südostasien, Deutschland, Digitalisierung und Raumwahrnehmung)',
        'Rohstofflagerstätten, regenerative Energien und nachhaltiges Ressourcenmanagement (Verfügbarkeit, Konflikte, geopolitische Bedeutung, Mobilitätskonzepte)',
      ],
      '13/2': [
        'Bevölkerung, Migration und Demographie (demographischer Übergang, Flucht, Steuerung, Geopolitik, Tragfähigkeit der Erde, Bevölkerungsprognosen)',
        'Verstädterung, Megastädte und Global Cities (Lösungsansätze, Imageorientierung, Stadtmarketing, Megaevents)',
        'Nachhaltige Stadtentwicklung (Ökosystem Stadt, Stadtklima, Urban Gardening, Bevölkerungsentwicklung in Deutschland)',
      ],
    },
  },

  'Geschichte': {
    // G12 LB1 = 12/1, G12 LB2 = 12/2, G13 LB1 = 13/1, G13 LB2 = 13/2
    // LehrplanPLUS Geschichte gA. eA-Schwerpunkte separat in halbjahreEA.
    halbjahre: {
      '12/1': [
        'Die deutsche Revolution von 1848/49 und bürgerliche Gesellschaft (Vormärz, Hambacher Fest, Paulskirchenparlament)',
        'Politische und gesellschaftliche Modernisierung im Kaiserreich (Verfassung, Soziale Frage, Arbeiterbewegung, Sozialgesetzgebung)',
        'Demokratisierung und Gesellschaft in der Weimarer Republik (Novemberrevolution, Weimarer Reichsverfassung, Frauenbewegung)',
      ],
      '12/2': [
        'Scheitern der Weimarer Republik und NS-Diktatur (Präsidialkabinette, NS-Ideologie, Volksgemeinschaft, Holocaust/Shoa, Vernichtungskrieg)',
        'Die Bundesrepublik Deutschland und die DDR (Verfassung, Wirtschaft, Systemvergleich, Wiedervereinigung)',
        'Deutsche Einheit und die Bundesrepublik 1990–2009 (Aufarbeitung SED-Diktatur, Agenda 2010, Extremismus)',
      ],
      '13/1': [
        'Die historische Entwicklung des israelisch-palästinensischen Konflikts (Diaspora, Zionismus, Gründung Israels, Friedensbemühungen)',
        'USA im 20. und 21. Jahrhundert (Führungsmacht, Kalter Krieg, Weltordnung)',
        'Russland und China im 20. und 21. Jahrhundert (Zerfall der Sowjetunion, Transformation Chinas, UNO-Agieren)',
      ],
      '13/2': [
        'Historische Grundlagen moderner demokratischer Staatsordnungen (attische Demokratie, Heiliges Römisches Reich, Aufklärung: Menschenrechte, Volkssouveränität, Gewaltenteilung)',
        'Von nationalistischer Konfrontation zu europäischer Integration (Nationsvorstellungen um 1800, deutsch-französisches Verhältnis, europäische Einigung nach 1945)',
      ],
    },
    // eA-Schwerpunkte: Erweiterte Inhalte laut LehrplanPLUS Geschichte 12/13 eA
    halbjahreEA: {
      '12/1': [
        'Die Herausbildung einer bürgerlichen Gesellschaft (Französische Revolution 1789, Vormärz, Revolution 1848/49 als europäisches Revolutionsjahr, Paulskirchenparlament)',
        'Modernisierung im Kaiserreich und Weimarer Republik (Verfassung, Soziale Frage, Novemberrevolution 1918, Weimarer Reichsverfassung, Großstädte als moderne Lebenserfahrungen)',
        'Vertiefungsmodul: Jüdisches Leben zwischen Emanzipation und Ausgrenzung (Haskala, Landjudentum, jüdische Selbstzeugnisse, Beitrag zu Modernisierungsprozessen)',
      ],
      '12/2': [
        'Scheitern der Weimarer Republik – NS-Diktatur und Völkermord (Faschismus, NS-Ideologie, Weltanschauungs- und totaler Krieg, Widerstand gegen NS)',
        'Die Bundesrepublik Deutschland und die DDR (Verfassung, Wirtschaft, Protest in West und Ost, Grundgesetz im Wiedervereinigungsprozess)',
        'Bundesrepublik 1990–2013 und Erinnerungskultur (Aufarbeitung SED-Diktatur, Agenda 2010, Extremismus, Geschichtspolitik, Nationalfeiertage)',
      ],
      '13/1': [
        'Israelisch-palästinensischer Konflikt und internationale Konfliktfelder (Diaspora, Zionismus, Gründung Israels, Naher/Mittlerer Osten, Regionalmächte)',
        'USA im 20./21. Jh. (Führungsmacht, Kalter Krieg, geopolitische Neuausrichtung, NATO-Osterweiterung, Pazifikraum)',
        'Russland und China im 20./21. Jh. (Stalinismus, Gorbatschow, Maoismus, wirtschaftliche Transformation, geopolitische Interessenpolitik, Neue Seidenstraße)',
      ],
      '13/2': [
        'Historische Grundlagen moderner demokratischer Staatsordnungen (attische Demokratie, Imperium Romanum – Verwaltung und römisches Recht, Heiliges Römisches Reich – Goldene Bulle, Föderalismus, Aufklärung)',
        'Von nationalistischer Konfrontation zu europäischer Integration (Nationsvorstellungen in Deutschland, Frankreich und Polen, deutsch-französisches und deutsch-polnisches Verhältnis, Besatzung Polens im WWII, europäische Einigung)',
      ],
    },
  },

  'Italienisch': {
    // LehrplanPLUS gA (spät beginnende Fremdsprache): It12 + It13 getrennt, keine offizielle Halbjahr-Zuordnung.
    // eA (3. Fremdsprache): It12/13 als 2-Jahres-Block, ebenfalls keine offizielle Halbjahr-Zuordnung.
    halbjahre: {
      '12/1': [
        'L\'Italia di oggi: società, giovani, famiglia, sport, volontariato e vita quotidiana',
        'Facetten Italiens: Nord, Centro, Sud (turismo culturale, naturale, balneare)',
        'Made in Italy: prodotti, marchi, pubblicità e significato economico',
      ],
      '12/2': [
        'Storia italiana moderna: Fascismo, Resistenza e nascita della Repubblica (ggf. miracolo economico, anni di piombo)',
        'Arte e architettura italiana (Rinascimento) e cantautori nella dimensione politico-sociale',
        'Mondo del lavoro e studio (stage, soggiorno all\'estero, mercato del lavoro); Riflessione linguistica: la varietà dell\'italiano (dialetti, linguaggio giovanile)',
      ],
      '13/1': [
        'Immigrazione ed emigrazione nella storia e nel presente',
        'Criminalità organizzata e le sue conseguenze sulla società',
        'La problematica Nord-Sud e turismo (confronto tra regioni, patrimonio culturale)',
      ],
      '13/2': [
        'Il Risorgimento e la nascita dello Stato nazionale italiano',
        'Istituzioni politiche italiane e ruolo dell\'Italia nell\'UE',
        'Cultura italiana: cinema, opera, letteratura del 20°/21° sec.; Riflessione linguistica (nascita dell\'italiano, lingua standard)',
      ],
    },
    // eA-Schwerpunkte (3. Fremdsprache): Erweiterte Inhalte laut LehrplanPLUS It12/13 eA
    halbjahreEA: {
      '12/1': [
        'Società italiana: integrazione di minoranze, tendenze attuali, turismo',
        'Migrazioni da, verso e in Italia (emigrazione 19° sec., migrazione lavorativa 20°/21° sec., immigrazione: Italia come paese di destinazione e transito)',
        'Regioni autonome con forte identità (Alto Adige, ggf. enclavi: Vaticano, San Marino)',
      ],
      '12/2': [
        'Sostenibilità e risorse naturali (turismo, pesca, agricoltura, Slow Food, energia)',
        'Istituzioni politiche, struttura amministrativa, rapporto Chiesa e Stato (Patti Lateranensi); Il Risorgimento',
        'Bau- und Kunstgeschichte: Rinascimento, Barocco, Classicismo; patrimonio culturale',
      ],
      '13/1': [
        'Fasi decisive della storia italiana del 20°/21° sec. (Fascismo, Resistenza, colonialismo, Repubblica, miracolo economico, anni di piombo, criminalità organizzata, ruolo nell\'UE)',
        'Sviluppi attuali in scienza e tecnica (energia, intelligenza artificiale, ingegneria genetica)',
        'Musica e cinema come specchio del tempo (opera, canzoni della Resistenza, Neorealismo, tendenze attuali)',
      ],
      '13/2': [
        'Letteratura italiana: Tre Corone, lirica, romanzo del 20°/21° sec., novelle, dramma',
        'Paesaggio mediatico in Italia e la sua rilevanza sociale',
        'Nostalgia d\'Italia e scambio artistico, culturale ed economico tra Italia e Germania',
      ],
    },
  },

  'Latein': {
    // L12 LB2 = 12/1 (Philosophie), LB3 = 12/2 (Satire), L13 LB2 = 13/1 (Augustus), LB3 = 13/2 (Staatsphilosophie)
    halbjahre: {
      '12/1': [
        '"Philosophandum est" – Philosophische Haltungen (Cicero, Seneca)',
        'Stoische Ethik und Lebensführung (Seneca: Epistulae morales)',
        'Eklektizismus und akademische Skepsis (Cicero: Tusculanae disputationes, De finibus, De natura deorum)',
      ],
      '12/2': [
        '"Difficile est saturam non scribere" – Römische Satire',
        'Catull: satirische Darstellung gesellschaftlicher Missstände (Carmina)',
        'Petron: Satyrica / Cena Trimalchionis (Gesellschaftskritik, Vulgärlatein und Sprachvarietäten)',
      ],
      '13/1': [
        '"Imperium sine fine dedi" – Literatur und Herrschaft im augusteischen Rom',
        'Vergil: Aeneis (Staatsidee und Sendungsbewusstsein)',
        'Horaz: carmen 4,15 (Augusteisches Friedensideal) und Res gestae divi Augusti (augusteische Selbstdarstellung)',
      ],
      '13/2': [
        '"Res publica res populi" – Staatsphilosophische Betrachtungen',
        'Cicero: De re publica (Staatsdefinition, Verfassungskreislauf, Mischverfassung)',
        'Cicero: De officiis (Pflichtenlehre, bellum iustum, politische Verantwortung)',
      ],
    },
    // eA-Schwerpunkte: gA-Basis + zusätzliche Inhalte laut LehrplanPLUS L12/13 eA
    halbjahreEA: {
      '12/1': [
        'Stoische Ethik und Lebensführung (Seneca: Epistulae morales), Eklektizismus und akademische Skepsis (Cicero)',
        'Lukrez: De rerum natura (Epikureische Naturphilosophie, Atomlehre)',
        'Horaz: Ode 1,11 (carpe diem – epikureische Lebenshaltung)',
      ],
      '12/2': [
        'Catull: satirische Darstellung gesellschaftlicher Missstände (Carmina)',
        'Petron: Satyrica / Cena Trimalchionis (Gesellschaftskritik, Vulgärlatein und Sprachvarietäten)',
        'Horaz: Satiren / Verssatire (Diatribensatire, Erzählsatire)',
      ],
      '13/1': [
        'Vergil: Aeneis (Staatsidee und Sendungsbewusstsein im augusteischen Rom)',
        'Horaz: carmen 4,15 (Friedensideal), Res gestae divi Augusti (augusteische Selbstdarstellung)',
        'Livius: Ab urbe condita (Geschichtsdarstellung, exempla-Technik)',
      ],
      '13/2': [
        'Cicero: De re publica (Staatsdefinition, Verfassungskreislauf, Mischverfassung)',
        'Cicero: De officiis (Pflichtenlehre, bellum iustum, politische Verantwortung)',
        'Augustinus: De civitate Dei (christliche Staatsphilosophie, Auseinandersetzung mit antikem Staatsdenken)',
      ],
    },
  },

  'Mathematik': {
    // LehrplanPLUS Mathematik (G9) – nur eA, verifiziert anhand LIS_PDF_04-03-2026-14 (M12) / 04-03-2026-15 (M13)
    halbjahre: {
      '12/1': [
        'Untersuchung von Funktionen: ganzrationale Funktionen, Exponentialfunktion, Sinus-/Kosinusfunktion, Stammfunktion, Produkt- und Kettenregel',
        'Zufallsgrößen und Binomialverteilung: Erwartungswert, Standardabweichung, axiomatische Wahrscheinlichkeitsdefinition',
      ],
      '12/2': [
        'Einseitiger Signifikanztest (Hypothesentest, Fehler erster Art)',
        'Untersuchung von Funktionen: Quotientenregel, gebrochen-rationale Funktionen, Wurzelfunktion, natürliche Logarithmusfunktion, Umkehrfunktionen',
        'Grundlagen der Koordinatengeometrie im Raum: Vektoren, Geraden, Vektorprodukt, Normalenvektor',
      ],
      '13/1': [
        'Flächeninhalt und bestimmtes Integral: Hauptsatz, Integrationsregeln, uneigentliche Integrale, Rotationsvolumen',
        'Normalverteilung: Dichtefunktion, Sigma-Regeln, Standardisierung',
        'Geraden und Ebenen im Raum: Lagebeziehungen, Abstände, Hesse\'sche Normalform, Kugelgleichungen',
      ],
      '13/2': [
        'Anwendungen der Differential- und Integralrechnung: Extremwertprobleme, Parameterfunktionen, verknüpfte Funktionen',
        'Modellierung mit Funktionen (Wachstum, Zerfall)',
        'Vertiefung Koordinatengeometrie (Winkel, Schnitte, Abstände, Kugel-Ebene-Schnitt)',
      ],
    },
  },

  'Physik': {
    // Ph12 LB1 = 12/1 (Statische Felder), LB2+LB3 = 12/2 (Induktion/Schwingungen + EM Wellen)
    // Ph13 LB1+LB2+LB3 = 13/1 (Quanten + Atommodell + Struktur), LB4 = 13/2 (Kernphysik)
    halbjahre: {
      '12/1': [
        'Statische elektrische und magnetische Felder (Feldlinien, Feldstärke, Superposition)',
        'Kondensator: Kapazität, Auf-/Entladevorgang, Energieinhalt des elektrischen Feldes',
        'Magnetische Flussdichte und Lorentzkraft; Bewegung geladener Teilchen in E- und B-Feldern',
      ],
      '12/2': [
        'Elektromagnetische Induktion (Induktionsgesetz, Selbstinduktion) und Schwingungen (Schwingkreis, Thomson-Gleichung)',
        'Elektromagnetische Wellen: Erzeugung, Ausbreitung, Polarisation, Eigenschaften',
        'Interferenz am Doppelspalt und Gitter, Röntgenstrahlung, elektromagnetisches Spektrum',
      ],
      '13/1': [
        'Quantenobjekte Elektron und Photon (de Broglie-Beziehung, Wellenfunktion, Komplementarität)',
        'Atommodell der Quantenphysik: Potentialtopf, Orbitale, Quantenzahlen, Emission und Absorption, Franck-Hertz-Versuch',
        'Strukturuntersuchungen zum Aufbau der Materie und Grundaussagen des Standardmodells',
      ],
      '13/2': [
        'Kernphysik: Aufbau des Atomkerns, Bindungsenergie, Potentialtopfmodell, α-/β-/γ-Strahlung',
        'Radioaktiver Zerfall: Zerfallsgesetz, Halbwertszeit, C14-Methode, Strahlenschutz',
        'Kernenergietechnik: Kernspaltung, Kettenreaktion, Kernreaktor (Chancen und Risiken)',
      ],
    },
    // eA-Schwerpunkte: Zusätzliche Inhalte laut LehrplanPLUS Ph12/13 eA
    halbjahreEA: {
      '12/1': [
        'Coulombkraft und radialsymmetrisches Feld; Materie im E-Feld (Influenz, Polarisation, Dielektrikum)',
        'DGL für Auf-/Entladevorgang des Kondensators; Analogie E-Feld und Gravitationsfeld',
      ],
      '12/2': [
        'DGL der EM Schwingung; gedämpfte und erzwungene Schwingungen, Resonanz',
        'Wechselstromwiderstände (Spule, Kondensator), Zeigerdiagramme, Frequenzfilter',
        'Maxwellgleichungen; Einfachspalt, Mehrfachspalt, Bragg-Reflexion, Kohärenz',
      ],
      '13/1': [
        'Photoeffekt (Hallwachs, Einstein-Gleichung), Mach-Zehnder-Interferometer',
        'Heisenberg\'sche Unbestimmtheitsrelation, Quantenradierer, Delayed-Choice-Experiment, Dekohärenz',
        'Schrödinger-Gleichung, wasserstoffähnliche Systeme, Pauli-Prinzip, Moseley-Gesetz, Strukturuntersuchung mit Röntgen-/Synchrotronstrahlung',
      ],
      '13/2': [
        'Energie- und Impulsbilanzen bei Kernreaktionen; Nuklidkarte und Zerfallsreihen',
        'Erhaltungssätze in der Kern- und Elementarteilchenphysik; mittlere Lebensdauer',
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
    // LehrplanPLUS Sporttheorie (G9) eA – verifiziert anhand LIS_PDF_04-03-2026-20
    // LB 1 Trainingslehre = 12/1, LB 2 Bewegungslehre = 12/2, LB 3 Sport und Gesundheit = 13/1, LB 4 Psycho/Sozial/Gesellschaft = 13/2
    halbjahre: {
      '12/1': [
        'Trainingslehre: Trainingsziele/-inhalte/-mittel/-methoden, Belastungskomponenten, Reizstufenregel, Funktionszustandsregel, Superkompensation, Adaptation, Periodisierung, Leistungsdiagnostik, Ermüdung/Erholung/Übertraining',
        'Sportbiologische Grundlagen: Bewegungsapparat (Röhrenknochen, Wirbelsäule, Gelenkaufbau), Skelettmuskel, Muskelfasertypen, Kontraktionsformen, Gleittheorie; Energiebereitstellung (anaerob alaktazid/laktazid, aerob), Herz-Kreislauf-System (Herzfrequenz, Schlagvolumen, Minutenvolumen, Blutdruck), Atmungssystem, VO₂max',
        'Konditionelle Fähigkeiten: Krafttraining (Maximalkraft, Schnellkraft, Kraftausdauer, IK-Training), Ausdauertraining (Dauer-/Intervall-/Wiederholungsmethode, aerobe/anaerobe Schwelle, Karvonen-Formel), Schnelligkeitstraining (Reaktions-/Aktions-/Frequenzschnelligkeit), Beweglichkeitstraining (aktiv/passiv/statisch/dynamisch), weitere Trainingsformen (Mentales Training, Höhentraining, EMS, Faszientraining)',
      ],
      '12/2': [
        'Biomechanik: Körperschwerpunkt, Körperachsen, Gleichgewicht, Rotation/Translation, Trägheit, Reibung, biomechanische Prinzipien, morphologische und funktionale Bewegungsanalyse',
        'Motorisches Lernen: Nervensystem (Analysatoren, afferente/efferente Bahnen, Reflexe, intra-/intermuskuläre Koordination, motorische Einheit), Dreiphasenmodell (Grob-/Feinkoordination, variable Verfügbarkeit)',
        'Koordinative Fähigkeiten und Koordinationstraining, Technik- und Taktiktraining (Ganzheitsmethode, Vereinfachungsstrategien, differentielles Lernen, Spielbeobachtung/-analyse)',
      ],
      '13/1': [
        'Gesundheitsmodelle: Gesundheitsbegriff, Risikofaktoren, Salutogenese-Modell, gesundheitsorientiertes Training, Verletzungsprophylaxe, Entspannungstechniken',
        'Ernährung im Sport: Zusammensetzung/Energiegehalt von Nahrungsmitteln, Grund-/Leistungsumsatz, Sporternährung, Nahrungsergänzungsmittel',
        'Doping: Dopingmittel/-methoden (anabole Substanzen, Wachstums-/Peptidhormone, Diuretika, Stimulanzien, Narkotika, Blutdoping), Wirkungsweisen und gesundheitliche Risiken',
      ],
      '13/2': [
        'Sportpsychologie: Motivation und Sinnperspektiven, Emotion, Aggression',
        'Soziale und gesellschaftspolitische Aspekte: Bildung/Erziehung/Sozialverhalten, organisierter und nichtorganisierter Sport, Fairness, Doping, Medien und Kommerzialisierung, Umwelt und Sport',
      ],
    },
  },

  'Wirtschaft und Recht': {
    // LehrplanPLUS WR (G9) gA – verifiziert anhand lehrplanplus.bayern.de 15-03-2026
    // WR12 gA: LB1 BWL (16 Std.) = 12/1, LB2 VWL (26 Std.) = 12/2, LB3 Recht (14 Std.) → 13/1
    // WR13 gA: LB1 Recht (24 Std.) → 13/1, LB2 VWL (18 Std.) = 13/2
    halbjahre: {
      '12/1': [
        'Unternehmensaufbau: unternehmerische Zielsetzungen (ökonomisch, ökologisch, sozial, ethisch), Stakeholder, Break-even-Analyse (fixe und variable Kosten)',
        'Investition, Finanzierung und Erfolgsmessung: statische Investitionsverfahren (Gewinnvergleichsrechnung, Amortisationsrechnung), Eigen- vs. Fremdfinanzierung, Eigenkapital- und Umsatzrentabilität',
      ],
      '12/2': [
        'Magisches Viereck, Konjunkturzyklus, Konjunkturindikatoren und Zielbeziehungen',
        'Wachstum und Beschäftigung: Wirtschaftspolitik (Nachfrage-/Angebotstheorie), BIP (Verwendungsrechnung), konjunkturelle und strukturelle Arbeitslosigkeit, Staatsverschuldung, Klimaschutz',
        'Einkommen und soziale Sicherung: Tarifpolitik, Kranken-/Rentenversicherung (Umlage-/Kapitaldeckungsverfahren), demographischer Wandel, soziale Gerechtigkeit',
      ],
      '13/1': [
        'Rechtstechnische Grundlagen und gesetzliche Schuldverhältnisse: BGB-Systematik, Gutachtenstil, § 823 I BGB, gutgläubiger Eigentumserwerb',
        'Vertragliche Schuldverhältnisse beim Kauf: Leistungsstörungen (verspätete Leistung, Unmöglichkeit), Mangelfreiheit, Gewährleistung beim Verbrauchsgüterkauf, Verbraucherschutz (Beweislastumkehr, Widerrufsrecht)',
        'Strafrecht: Aufbau einer Straftat (Tatbestandsmäßigkeit, Rechtswidrigkeit, Schuld), Strafzwecktheorien, Strafzumessung',
      ],
      '13/2': [
        'Geld und Preisniveau: Preisniveaustabilität, Geldpolitik der EZB (Transmissionsmechanismus, Mandat, Unabhängigkeit), Wirkungsgrenzen',
        'Außenhandel und Währung: Leistungsbilanz, außenwirtschaftliches Gleichgewicht, Wechselkursbildung, außenhandels- und währungspolitische Maßnahmen',
      ],
    },
    // LehrplanPLUS WR (G9) eA – verifiziert anhand lehrplanplus.bayern.de 15-03-2026
    // WR12 eA: LB1 BWL (54 Std.) = 12/1, LB2 VWL (40 Std.) = 12/2, LB3 Recht (18 Std.) → 13/1
    // WR13 eA: LB1 Recht (48 Std.) → 13/1, LB2 VWL (36 Std.) = 13/2
    halbjahreEA: {
      '12/1': [
        'Unternehmensaufbau, Markt und Produktion: Stakeholder, Aufbau-/Ablauforganisation, Wertschöpfung, Beschaffungsarten (Einzelbeschaffung, JIT, Vorratsbeschaffung), Rationalisierung, Break-even-Analyse, ABC-Analyse, Marktwachstum-Marktanteils-Portfolio',
        'Jahresabschluss und Bilanzanalyse: Bilanz, GuV, Lagebericht, Bilanzkennzahlen (Anlageintensität, EK-Quote, Deckungsgrade, Liquiditätsgrade), Rentabilitätskennzahlen (EK-, GK-, Umsatzrentabilität, EBIT)',
        'Investition, Finanzierung und Unternehmensführung: statische Verfahren (Gewinnvergleichsrechnung, Amortisationsrechnung), Kapitalwertmethode, Leverage-Effekt, SWOT-Analyse, Wettbewerbsstrategien nach Porter, Managementfunktionen',
      ],
      '12/2': [
        'Magisches Viereck, Konjunkturzyklus, Konjunkturindikatoren und Zielbeziehungen',
        'Wachstum und Beschäftigung: Wirtschaftspolitik (Nachfrage-/Angebotstheorie), BIP (Verwendungs-/Entstehungsrechnung), Arbeitslosigkeitsarten (friktionell, saisonal, konjunkturell, strukturell), Staatsverschuldung, Klimaschutz',
        'Einkommen und soziale Sicherung: Tarifpolitik, Kranken-/Rentenversicherung, Umlage-/Kapitaldeckungsverfahren, demographischer Wandel, Moral Hazard, soziale Gerechtigkeit (Leistungs-, Chancen-, Bedarfs-, Generationengerechtigkeit)',
      ],
      '13/1': [
        'Rechtstechnische Grundlagen und gesetzliche Schuldverhältnisse: BGB-Systematik, Kaufhandlung, Trennungsprinzip, Gutachtenstil, § 823 I BGB, Gefährdungshaftung, gutgläubiger Eigentumserwerb',
        'Vertragliche Schuldverhältnisse und Verbraucherschutz: Vertragstypen (Kauf-, Werk-, Dienstvertrag), Leistungsstörungen (Nebenpflichtverletzung, verspätete Leistung, Unmöglichkeit), Mangelfreiheit, Gewährleistung, Widerrufsrecht, AGB, Vertragsfreiheit',
        'Strafrecht: Ordnungswidrigkeit vs. Straftat, Aufbau einer Straftat, Rechtfertigungsgründe (Notwehr, Notstand), Entschuldigungsgründe, Strafzwecktheorien, Strafzumessung, Radbruchsche Formel',
      ],
      '13/2': [
        'Geld und Preisniveau: Preisniveaustabilität, Geldpolitik der EZB (Zins-/Geldmengensteuerung, Transmissionsmechanismus, Mandat, Unabhängigkeit), Wirkungsgrenzen, aktuelle Fragen (Kryptowährungen, Währungsunion)',
        'Außenhandel und Währung: Leistungs-/Kapitalbilanz, außenwirtschaftliches Gleichgewicht, Wechselkursbildung, Ursachen/Folgen von Wechselkursschwankungen, außenhandels- und währungspolitische Maßnahmen',
        'Spieltheorie (Gefangenendilemma, dominante Strategie, Nash-Gleichgewicht, Pareto-Optimum) und vernetzte Betrachtung gesamtwirtschaftlicher Problemstellungen (Wechselwirkungen Geld-/Fiskalpolitik, Effizienz vs. Gerechtigkeit)',
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
    // LehrplanPLUS Informatik (G9) eA – verifiziert anhand LIS_PDF_04-03-2026/04-03-2026-2
    halbjahreEA: {
      '12/1': [
        'Rekursion: lineare und verzweigte Rekursion, Tiefensuche in Graphen, rekursive Problemlösung (z. B. ggT, Türme von Hanoi)',
        'Listen: einfach verkettete Liste, Stapel (LIFO), Warteschlange (FIFO), Kompositum-Entwurfsmuster, Sequenzdiagramm',
        'Bäume: geordneter Binärbaum, Einfügen/Suchen, Traversierung (Preorder, Inorder, Postorder), Spezialfälle (vollständig, balanciert, entartet), Huffman-Baum',
      ],
      '12/2': [
        'Funktionsweise eines Rechners: Von-Neumann-Architektur, Zweierkomplement, Logikgatter (AND, OR, NOT, NAND), Halb-/Volladdierer, Registermaschine, Assemblersprache, Befehlszyklus',
        'Betriebssysteme und Nebenläufigkeit: Kernel-/User-Mode, Prozesszustände, Scheduling (FCFS, Round-Robin, SJF, Priorität), Synchronisation, Deadlock, Coffman-Bedingungen, Monitor-/Semaphorkonzept',
        'Informationssicherheit und Softwareentwicklung: Schutzziele, Gefährdungskategorien, MVC, Observer-Pattern, agile Methoden, Testen, Versionsverwaltung',
      ],
      '13/1': [
        'Internet der Dinge: IoT-Systeme, Sensoren/Aktoren, Client-Server-Anwendung, Physical Computing, Sicherheitsmaßnahmen für IoT',
        'Künstliche Intelligenz: Wissensbasierte Systeme (Fakten, Regeln, Inferenzmaschine), Neuronale Netze (Forward Propagation, Backpropagation, Kostenfunktion), k-Means-Algorithmus, supervised/unsupervised/reinforcement Learning, ethische Fragen',
      ],
      '13/2': [
        'Formale Sprachen und Automaten: EBNF, Syntaxdiagramme, Ableitungsbaum, DEA/NEA, reguläre Sprachen, Turingmaschine, Turing-erkennbare Sprachen',
        'Algorithmen und Berechenbarkeit: Turing-Berechenbarkeit, Church-Turing-These, Laufzeitaufwand (O-Notation), Best/Average/Worst Case, Sortieralgorithmen (Bubblesort, Mergesort), Lösungsstrategien (Brute-Force, Greedy, Divide and Conquer), Probleme (SAT, Handlungsreisenden, Rucksack, Clique), Komplexitätsklassen P/NP, Halteproblem',
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
