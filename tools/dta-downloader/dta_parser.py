# TEI-XML Parser für DTA-Texte
import re
from lxml import etree

TEI_NS = "http://www.tei-c.org/ns/1.0"
NSMAP = {"tei": TEI_NS}


def parse_tei_metadata(tei_xml):
    """
    Extrahiert Metadaten aus dem TEI-Header.
    Gibt ein Dict zurück mit: title, author, year, genre_main, genre_sub.
    """
    try:
        root = etree.fromstring(tei_xml.encode("utf-8") if isinstance(tei_xml, str) else tei_xml)
    except etree.XMLSyntaxError:
        return None

    header = root.find(f"{{{TEI_NS}}}teiHeader")
    if header is None:
        return None

    # Titel
    title = header.findtext(f".//{{{TEI_NS}}}titleStmt/{{{TEI_NS}}}title", "").strip()

    # Autor
    author_elem = header.find(f".//{{{TEI_NS}}}titleStmt/{{{TEI_NS}}}author")
    author = ""
    if author_elem is not None:
        # Autor kann als Text oder als strukturiertes Element vorliegen
        persname = author_elem.find(f".//{{{TEI_NS}}}persName")
        if persname is not None:
            # Vorname + Nachname zusammensetzen
            forename = persname.findtext(f"{{{TEI_NS}}}forename", "").strip()
            surname = persname.findtext(f"{{{TEI_NS}}}surname", "").strip()
            if forename and surname:
                author = f"{forename} {surname}"
            elif surname:
                author = surname
            else:
                author = _get_text_content(persname)
        else:
            author = _get_text_content(author_elem)
    author = author.strip()

    # Erscheinungsjahr
    year = None
    date_elem = header.find(f".//{{{TEI_NS}}}publicationStmt/{{{TEI_NS}}}date")
    if date_elem is None:
        date_elem = header.find(f".//{{{TEI_NS}}}sourceDesc//{{{TEI_NS}}}date")
    if date_elem is not None:
        date_text = date_elem.get("when", "") or _get_text_content(date_elem)
        year_match = re.search(r"(\d{4})", date_text)
        if year_match:
            year = int(year_match.group(1))

    # Genre-Klassifikation
    genre_main = ""
    genre_sub = ""
    for classCode in header.findall(f".//{{{TEI_NS}}}classCode"):
        scheme = classCode.get("scheme", "")
        text = (classCode.text or "").strip()
        if "dtamain" in scheme:
            genre_main = text
        elif "dtasub" in scheme:
            genre_sub = text

    return {
        "title": title,
        "author": author,
        "year": year,
        "genre_main": genre_main,
        "genre_sub": genre_sub,
    }


def extract_text(tei_xml):
    """
    Extrahiert den Volltext aus dem TEI-Body.
    Normalisiert historische Schreibweisen (langes ſ → s).
    """
    try:
        root = etree.fromstring(tei_xml.encode("utf-8") if isinstance(tei_xml, str) else tei_xml)
    except etree.XMLSyntaxError:
        return ""

    body = root.find(f".//{{{TEI_NS}}}body")
    if body is None:
        return ""

    # Rekursiv Text extrahieren
    text = _extract_body_text(body)

    # Normalisierungen
    text = _normalize_text(text)

    return text.strip()


def _extract_body_text(elem):
    """Rekursive Textextraktion aus TEI-Body-Elementen."""
    tag = _local_tag(elem.tag)

    # Elemente die übersprungen werden
    if tag in ("fw", "figure", "graphic"):
        return ""

    parts = []

    # Textteil vor dem ersten Kind
    if elem.text:
        parts.append(elem.text)

    for child in elem:
        child_tag = _local_tag(child.tag)

        if child_tag == "lb":
            # Zeilenumbruch
            parts.append("\n")
        elif child_tag == "pb":
            # Seitenumbruch — ignorieren
            pass
        elif child_tag == "note":
            # Fußnoten in Klammern
            note_text = _extract_body_text(child).strip()
            if note_text:
                parts.append(f" [{note_text}]")
        elif child_tag in ("div", "div1", "div2", "div3"):
            # Abschnitte mit Absatz davor
            parts.append("\n\n")
            parts.append(_extract_body_text(child))
            parts.append("\n\n")
        elif child_tag in ("p", "lg"):
            # Absätze und Strophen
            parts.append("\n\n")
            parts.append(_extract_body_text(child))
            parts.append("\n")
        elif child_tag == "l":
            # Verszeile
            parts.append(_extract_body_text(child))
            parts.append("\n")
        elif child_tag == "sp":
            # Redebeitrag (Drama)
            parts.append("\n")
            parts.append(_extract_body_text(child))
            parts.append("\n")
        elif child_tag == "speaker":
            # Sprechername
            parts.append("\n")
            parts.append(_extract_body_text(child).strip())
            parts.append(": ")
        elif child_tag == "stage":
            # Regieanweisung
            stage_text = _extract_body_text(child).strip()
            if stage_text:
                parts.append(f"({stage_text}) ")
        elif child_tag == "head":
            # Überschrift
            parts.append("\n\n## ")
            parts.append(_extract_body_text(child).strip())
            parts.append("\n\n")
        else:
            # Alle anderen Elemente: Text rekursiv extrahieren
            parts.append(_extract_body_text(child))

        # Tail-Text (Text nach dem schließenden Tag)
        if child.tail:
            parts.append(child.tail)

    return "".join(parts)


def _normalize_text(text):
    """Normalisiert historische Schreibweisen."""
    # Langes ſ → s
    text = text.replace("ſ", "s")

    # Mehrfache Leerzeilen reduzieren
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Leerzeichen normalisieren (aber Zeilenumbrüche behalten)
    text = re.sub(r"[ \t]+", " ", text)

    # Leerzeichen am Zeilenanfang/-ende entfernen
    text = re.sub(r" *\n *", "\n", text)

    return text


def _local_tag(tag):
    """Entfernt den Namespace aus einem Tag-Namen."""
    if not isinstance(tag, str):
        return ""
    if "}" in tag:
        return tag.split("}")[1]
    return tag


def _get_text_content(elem):
    """Gibt den gesamten Textinhalt eines Elements zurück (inkl. Kinder)."""
    return "".join(elem.itertext()).strip()
