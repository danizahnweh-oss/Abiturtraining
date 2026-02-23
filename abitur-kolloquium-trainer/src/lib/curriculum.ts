/**
 * Lehrplan-Schwerpunkte für das bayerische Abitur-Kolloquium.
 * Basierend auf dem LehrplanPLUS Bayern Gymnasium Oberstufe.
 * Jedes Halbjahr hat 3 wählbare Schwerpunktthemen.
 */

export interface SubjectCurriculum {
  halbjahre: Record<string, string[]>;
}

export const CURRICULUM: Record<string, SubjectCurriculum> = {
  'Biologie': {
    halbjahre: {
      '11/1': [
        'Strukturelle und energetische Grundlagen des Lebens',
        'Enzymatik und Stoffwechselphysiologie',
        'Zellbiologie und Zellteilung',
      ],
      '11/2': [
        'Molekulargenetik und Genexpression',
        'Humangenetik und genetische Beratung',
        'Gentechnik und Biotechnologie',
      ],
      '12/1': [
        'Evolutionstheorien und Belege der Evolution',
        'Artbildung und Populationsgenetik',
        'Humanevolution und Stammesgeschichte',
      ],
      '12/2': [
        'Ökosysteme und Stoffkreisläufe',
        'Populationsökologie und Biodiversität',
        'Verhaltensbiologie und Neurobiologie',
      ],
    },
  },

  'Chemie': {
    halbjahre: {
      '11/1': [
        'Aromatische Kohlenwasserstoffe und Farbstoffe',
        'Kunststoffe und Polymerchemie',
        'Struktur-Eigenschafts-Beziehungen organischer Stoffe',
      ],
      '11/2': [
        'Reaktionskinetik und Katalyse',
        'Chemisches Gleichgewicht und Massenwirkungsgesetz',
        'Protolysen, pH-Wert und Puffersysteme',
      ],
      '12/1': [
        'Redoxreaktionen und Elektrochemie',
        'Galvanische Zellen und Elektrolyse',
        'Korrosion und Korrosionsschutz',
      ],
      '12/2': [
        'Naturstoffe: Kohlenhydrate und Fette',
        'Aminosäuren und Proteine',
        'Biomoleküle und Stoffwechselchemie',
      ],
    },
  },

  'Deutsch': {
    halbjahre: {
      '11/1': [
        'Aufklärung, Sturm und Drang, Klassik',
        'Romantik und ihre Gegenbewegungen',
        'Drama und Dramentheorie (18./19. Jh.)',
      ],
      '11/2': [
        'Realismus und Naturalismus',
        'Expressionismus und literarische Moderne',
        'Literatur der Weimarer Republik und des Exils',
      ],
      '12/1': [
        'Literatur nach 1945 (Trümmer- und Nachkriegsliteratur)',
        'Gegenwartsliteratur und aktuelle Romane',
        'Lyrik im Wandel der Epochen',
      ],
      '12/2': [
        'Sprachreflexion und Sprachwandel',
        'Medien, Kommunikation und Rhetorik',
        'Sachtextanalyse und Erörterung',
      ],
    },
  },

  'Englisch': {
    halbjahre: {
      '11/1': [
        'The Individual and Society',
        'Growing Up and Identity',
        'Social Issues and Diversity',
      ],
      '11/2': [
        'National Identity: The UK',
        'The American Dream and American Society',
        'Postcolonialism and Cultural Change',
      ],
      '12/1': [
        'Globalization and Global Challenges',
        'Science, Technology and Ethics',
        'The Media and the Digital Age',
      ],
      '12/2': [
        'Visions of the Future',
        'Utopia and Dystopia in Literature',
        'Sustainability and the Environment',
      ],
    },
  },

  'Ethik': {
    halbjahre: {
      '11/1': [
        'Theorie und Praxis des Handelns',
        'Grundpositionen der Ethik (Utilitarismus, Deontologie)',
        'Freiheit und Verantwortung',
      ],
      '11/2': [
        'Recht, Gerechtigkeit und Menschenwürde',
        'Politische Ethik und Staatsphilosophie',
        'Strafe und Schuld',
      ],
      '12/1': [
        'Angewandte Ethik (Medizin, Technik, Umwelt)',
        'Bioethik und Menschenbild',
        'Wirtschaftsethik und globale Gerechtigkeit',
      ],
      '12/2': [
        'Sinnfragen und Glückskonzeptionen',
        'Religion, Weltanschauung und Toleranz',
        'Identität und Lebensführung',
      ],
    },
  },

  'Französisch': {
    halbjahre: {
      '11/1': [
        'La France d\'aujourd\'hui: société et identité',
        'Les jeunes en France: défis et perspectives',
        'Paris et la province: vie urbaine et rurale',
      ],
      '11/2': [
        'La France et l\'Allemagne en Europe',
        'L\'histoire franco-allemande et la réconciliation',
        'L\'Europe: idéal et réalité',
      ],
      '12/1': [
        'Un monde en mouvement: migration et intégration',
        'La mondialisation et ses conséquences',
        'La francophonie: diversité culturelle',
      ],
      '12/2': [
        'Littérature et engagement',
        'Le cinéma français et la culture',
        'Arts, médias et société en France',
      ],
    },
  },

  'Geographie': {
    halbjahre: {
      '11/1': [
        'Geomorphologie und Landschaftsgenese',
        'Klima und Klimawandel',
        'Vegetationszonen und Böden',
      ],
      '11/2': [
        'Siedlungsentwicklung und Stadtgeographie',
        'Raumordnung und Raumplanung in Deutschland',
        'Mobilität, Verkehr und Infrastruktur',
      ],
      '12/1': [
        'Entwicklungsländer und Entwicklungstheorien',
        'Globalisierung und Weltwirtschaft',
        'Bevölkerungsentwicklung und Migration',
      ],
      '12/2': [
        'Ressourcen und Energie',
        'Nachhaltigkeit und Umweltschutz',
        'Tourismus und Raumwirksamkeit',
      ],
    },
  },

  'Geschichte': {
    halbjahre: {
      '11/1': [
        'Gesellschaft im Wandel (15.–19. Jahrhundert)',
        'Aufklärung, Französische Revolution und Napoleon',
        'Industrialisierung und soziale Frage',
      ],
      '11/2': [
        'Weimarer Republik: Chancen und Belastungen',
        'Nationalsozialismus und Holocaust',
        'Widerstand, Verfolgung und Alltag im NS-Staat',
      ],
      '12/1': [
        'Deutschland nach 1945: Teilung und Einheit',
        'Kalter Krieg und Ost-West-Konflikt',
        'Europäische Integration und transatlantische Beziehungen',
      ],
      '12/2': [
        'Nahostkonflikt und internationale Friedenssicherung',
        'Globalisierung und Migration im 21. Jahrhundert',
        'Erinnerungskultur und Geschichtspolitik',
      ],
    },
  },

  'Italienisch': {
    halbjahre: {
      '11/1': [
        'L\'Italia di oggi: società e identità',
        'I giovani in Italia: sfide e prospettive',
        'Nord e Sud: contrasti regionali',
      ],
      '11/2': [
        'L\'Italia in Europa e nel mondo',
        'Storia e cultura italiana del Novecento',
        'Migrazione e multiculturalità',
      ],
      '12/1': [
        'Il mondo del lavoro e l\'economia italiana',
        'Ambiente, sostenibilità e futuro',
        'La globalizzazione e le sue conseguenze',
      ],
      '12/2': [
        'Letteratura e cinema italiano',
        'Arte, musica e patrimonio culturale',
        'Media, comunicazione e società digitale',
      ],
    },
  },

  'Latein': {
    halbjahre: {
      '11/1': [
        'Römische Philosophie: Seneca und die Stoa',
        'Cicero: Staat, Rhetorik und Philosophie',
        'Epikureismus und Lebenskunst (Lukrez, Horaz)',
      ],
      '11/2': [
        'Römische Dichtung: Vergils Aeneis',
        'Ovids Metamorphosen und Liebeslyrik',
        'Horaz: Oden und Satiren',
      ],
      '12/1': [
        'Staat und Gesellschaft: Caesar und Sallust',
        'Livius und die römische Geschichtsschreibung',
        'Politische Rhetorik: Ciceros Reden',
      ],
      '12/2': [
        'Christentum und Antike: Augustinus',
        'Humanismus und Renaissance-Latein',
        'Rezeption der Antike in Kunst und Literatur',
      ],
    },
  },

  'Mathematik': {
    halbjahre: {
      '11/1': [
        'Analysis I: Funktionen und Ableitungen',
        'Kurvendiskussion und Optimierung',
        'Differenzialrechnung und Anwendungen',
      ],
      '11/2': [
        'Analysis II: Integralrechnung',
        'Wachstums- und Abnahmeprozesse',
        'Flächenberechnung und Stammfunktionen',
      ],
      '12/1': [
        'Stochastik: Wahrscheinlichkeitsrechnung',
        'Binomialverteilung und Hypothesentests',
        'Bedingte Wahrscheinlichkeit und Bayes',
      ],
      '12/2': [
        'Analytische Geometrie: Vektoren und Geraden',
        'Ebenen und Lagebeziehungen',
        'Abstände, Winkel und geometrische Anwendungen',
      ],
    },
  },

  'Physik': {
    halbjahre: {
      '11/1': [
        'Elektrische und magnetische Felder',
        'Elektromagnetische Induktion',
        'Schwingkreise und elektromagnetische Wellen',
      ],
      '11/2': [
        'Mechanische Schwingungen und Resonanz',
        'Mechanische Wellen und Interferenz',
        'Akustik und Wellenoptik',
      ],
      '12/1': [
        'Quantenphysik: Photoeffekt und Wellennatur',
        'Atomphysik und Spektrallinien',
        'Kernphysik und Radioaktivität',
      ],
      '12/2': [
        'Spezielle Relativitätstheorie',
        'Astrophysik und Kosmologie',
        'Elementarteilchenphysik und Standardmodell',
      ],
    },
  },

  'Politik und Gesellschaft': {
    halbjahre: {
      '11/1': [
        'Politisches System der Bundesrepublik Deutschland',
        'Demokratie und Partizipation',
        'Grundrechte und Verfassungsprinzipien',
      ],
      '11/2': [
        'Gesellschaftsstruktur und sozialer Wandel',
        'Sozialstaat und soziale Sicherung',
        'Medien, Öffentlichkeit und politische Willensbildung',
      ],
      '12/1': [
        'Internationale Politik und Sicherheitspolitik',
        'Vereinte Nationen und internationale Organisationen',
        'Konflikte und Friedenssicherung',
      ],
      '12/2': [
        'Europäische Union: Integration und Herausforderungen',
        'Globalisierung und internationale Wirtschaftsordnung',
        'Menschenrechte und humanitäres Völkerrecht',
      ],
    },
  },

  'Wirtschaft und Recht': {
    halbjahre: {
      '11/1': [
        'Wirtschaftliche Grundlagen und Marktmodelle',
        'Unternehmen und Unternehmensführung',
        'Berufswahl und Arbeitswelt',
      ],
      '11/2': [
        'Wirtschaftspolitik und Konjunktur',
        'Geld, Währung und Europäische Zentralbank',
        'Arbeitsmarkt und Beschäftigungspolitik',
      ],
      '12/1': [
        'Grundlagen des Rechts und Rechtsordnung',
        'Vertragsrecht und Verbraucherschutz',
        'Strafrecht und Jugendstrafrecht',
      ],
      '12/2': [
        'Internationale Wirtschaftsbeziehungen und Handel',
        'Entwicklungspolitik und Nachhaltigkeit',
        'Digitalisierung und Wirtschaftsethik',
      ],
    },
  },
};

/** Returns the available Halbjahre after striking one */
export function getAvailableHalbjahre(
  subject: string,
  gestrichenesHalbjahr: '12/1' | '12/2'
): string[] {
  const all = ['11/1', '11/2', '12/1', '12/2'];
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
