# Konfiguration für den DTA-Downloader
# Epochen, Autoren und Genre-Filter für Bayern G9 Abitur

# OAI-PMH Endpoint
OAI_BASE_URL = "https://clarin.bbaw.de/oai-dta/"

# DTA Download Endpoints
DTA_BASE_URL = "https://www.deutschestextarchiv.de"
DTA_TEXT_URL = f"{DTA_BASE_URL}/book/download_txt/{{dta_id}}"   # Plain Text
DTA_TEI_URL = f"{DTA_BASE_URL}/book/download_xml/{{dta_id}}"    # TEI-XML
DTA_WEB_URL = f"{DTA_BASE_URL}/{{dta_id}}"

# Rate-Limiting
REQUEST_DELAY = 1.0  # Sekunden zwischen Requests

# Abitur-relevante Epochen (Bayern G9)
EPOCHS = {
    "aufklaerung": {
        "name": "Aufklärung",
        "start": 1720,
        "end": 1785,
        "halbjahr": "12/1",
        "authors": [
            "Lessing", "Wieland", "Klopstock", "Gottsched", "Gellert",
        ],
    },
    "sturm-und-drang": {
        "name": "Sturm und Drang",
        "start": 1765,
        "end": 1790,
        "halbjahr": "12/1",
        "authors": [
            "Goethe", "Schiller", "Herder", "Lenz", "Klinger", "Bürger",
        ],
    },
    "weimarer-klassik": {
        "name": "Weimarer Klassik",
        "start": 1786,
        "end": 1832,
        "halbjahr": "12/1",
        "authors": [
            "Goethe", "Schiller", "Hölderlin", "Kleist",
        ],
    },
    "romantik": {
        "name": "Romantik",
        "start": 1795,
        "end": 1848,
        "halbjahr": "12/1",
        "authors": [
            "Hoffmann", "Eichendorff", "Novalis", "Brentano", "Tieck",
            "Heine", "Arnim", "Chamisso", "Mörike",
        ],
    },
    "realismus": {
        "name": "Poetischer Realismus",
        "start": 1848,
        "end": 1890,
        "halbjahr": "12/2",
        "authors": [
            "Fontane", "Storm", "Keller", "Meyer", "Raabe", "Stifter",
            "Droste-Hülshoff", "Hebbel", "Grillparzer",
        ],
    },
    "naturalismus": {
        "name": "Naturalismus",
        "start": 1880,
        "end": 1900,
        "halbjahr": "12/2",
        "authors": [
            "Hauptmann", "Holz", "Schlaf",
        ],
    },
}

# Bekannte Werke mit fester Epochenzuordnung
# (für Fälle wo der Autor in mehreren Epochen aktiv war)
KNOWN_WORKS = {
    # Goethe: Sturm und Drang vs. Klassik
    "goethe_werther": "sturm-und-drang",
    "goethe_goetz": "sturm-und-drang",
    "goethe_urfaust": "sturm-und-drang",
    "goethe_iphigenie": "weimarer-klassik",
    "goethe_tasso": "weimarer-klassik",
    "goethe_faust01": "weimarer-klassik",
    "goethe_faust02": "weimarer-klassik",
    "goethe_wahlverwandtschaften": "weimarer-klassik",
    "goethe_wilhelm": "weimarer-klassik",
    # Schiller: Sturm und Drang vs. Klassik
    "schiller_raeuber": "sturm-und-drang",
    "schiller_kabale": "sturm-und-drang",
    "schiller_wallenstein": "weimarer-klassik",
    "schiller_tell": "weimarer-klassik",
    "schiller_maria": "weimarer-klassik",
    "schiller_jungfrau": "weimarer-klassik",
    # Heine: Romantik (trotz spätem Schaffen)
    "heine_buch": "romantik",
    "heine_wintermaerchen": "romantik",
}

# Genre-Filter: nur belletristische Texte
# DTA-Hauptklassifikation (dtamain)
ALLOWED_GENRES_MAIN = {"Belletristik"}

# DTA-Subklassifikation (dtasub) — alle literarischen Formen
ALLOWED_GENRES_SUB = {
    "Lyrik", "Drama", "Prosa", "Roman", "Novelle", "Erzählung",
    "Märchen", "Fabel", "Ballade", "Epos", "Versepos",
}

# Minimale Textlänge (Zeichen) — Fragmente ausfiltern
MIN_TEXT_LENGTH = 500

# Maximale Excerpt-Länge
EXCERPT_LENGTH = 2000
