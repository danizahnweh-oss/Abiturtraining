# Filter für Abitur-relevante DTA-Texte
import re
from config import EPOCHS, KNOWN_WORKS, ALLOWED_GENRES_MAIN, MIN_TEXT_LENGTH


def filter_records(records):
    """
    Filtert OAI-PMH-Metadaten nach Abitur-Relevanz.
    Gibt eine Liste von Records zurück, die literarisch und zeitlich relevant sind.
    Jeder Record bekommt zusätzlich ein 'epoch'-Feld.
    """
    filtered = []
    for record in records:
        epoch = classify_record(record)
        if epoch:
            record["epoch"] = epoch
            filtered.append(record)
    return filtered


def classify_record(record):
    """
    Prüft ob ein Record abitur-relevant ist und ordnet eine Epoche zu.
    Gibt den Epochen-Schlüssel zurück oder None.
    """
    # Jahr extrahieren
    year = _extract_year(record.get("date", ""))
    if year is None:
        return None

    # Zeitraum prüfen (1720-1900)
    if year < 1720 or year > 1900:
        return None

    # Genre prüfen (über subjects)
    subjects = record.get("subjects", [])
    if not _is_literary(subjects):
        # Wenn keine Genre-Info vorhanden, trotzdem behalten (OAI-DC hat oft wenig Infos)
        # Wir filtern später genauer mit TEI-Metadaten
        pass

    # Epoche zuordnen
    dta_id = record.get("dta_id", "")
    creator = record.get("creator", "")

    # Zuerst: bekannte Werke prüfen
    for known_prefix, epoch_key in KNOWN_WORKS.items():
        if dta_id.startswith(known_prefix):
            return epoch_key

    # Dann: Autor + Jahr basierte Zuordnung
    return _assign_epoch(creator, year)


def refine_filter(record, tei_metadata):
    """
    Verfeinert den Filter mit TEI-Metadaten (Genre-Klassifikation).
    Gibt True zurück wenn der Text behalten werden soll.
    """
    if tei_metadata is None:
        return False

    genre_main = tei_metadata.get("genre_main", "")

    # Genre-Hauptklassifikation prüfen
    if genre_main and genre_main not in ALLOWED_GENRES_MAIN:
        return False

    return True


def refine_with_text(text):
    """Prüft ob der extrahierte Text die Mindestlänge hat."""
    if not text:
        return False
    return len(text) >= MIN_TEXT_LENGTH


def _extract_year(date_str):
    """Extrahiert eine Jahreszahl aus einem Datumsstring."""
    match = re.search(r"(\d{4})", str(date_str))
    if match:
        return int(match.group(1))
    return None


def _is_literary(subjects):
    """Prüft ob die Subjects auf einen literarischen Text hinweisen."""
    for subject in subjects:
        subject_lower = subject.lower()
        if any(term in subject_lower for term in [
            "belletristik", "lyrik", "drama", "prosa", "roman",
            "novelle", "erzählung", "gedicht", "märchen", "fabel",
        ]):
            return True
    return False


def _assign_epoch(creator, year):
    """
    Ordnet eine Epoche zu basierend auf Autor und Erscheinungsjahr.
    Bei Überlappung wird der Autor-Match bevorzugt.
    """
    creator_last = _extract_lastname(creator)

    # Passende Epochen nach Jahr finden
    matching_epochs = []
    for key, epoch in EPOCHS.items():
        if epoch["start"] <= year <= epoch["end"]:
            matching_epochs.append(key)

    if not matching_epochs:
        return None

    if len(matching_epochs) == 1:
        return matching_epochs[0]

    # Mehrere Epochen möglich → Autor als Tiebreaker
    if creator_last:
        for key in matching_epochs:
            epoch_authors = EPOCHS[key]["authors"]
            if any(creator_last.lower() == a.lower() for a in epoch_authors):
                return key

    # Fallback: die spätere Epoche nehmen (chronologisch weiter)
    best = max(matching_epochs, key=lambda k: EPOCHS[k]["start"])
    return best


def _extract_lastname(creator):
    """Extrahiert den Nachnamen aus einem Autoren-String."""
    if not creator:
        return ""
    # Formate: "Nachname, Vorname" oder "Vorname Nachname"
    if "," in creator:
        return creator.split(",")[0].strip()
    parts = creator.strip().split()
    if parts:
        return parts[-1]
    return ""
