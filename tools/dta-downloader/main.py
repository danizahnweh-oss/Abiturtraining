#!/usr/bin/env python3
"""
DTA-Downloader: Lädt literarische Texte vom Deutschen Textarchiv
herunter und bereitet sie für myAbiFlow (Deutsch-Abitur) auf.

Nutzung:
    python main.py --output ../../data/dta-texte/
    python main.py --epoch aufklaerung --max-texts 5
    python main.py --dry-run
    python main.py --author Goethe
"""
import argparse
import json
import os
import sys
from datetime import date

from config import EPOCHS, EXCERPT_LENGTH, DTA_WEB_URL
from dta_download import DTADownloader
from dta_filter import filter_records, refine_filter, refine_with_text
from dta_parser import parse_tei_metadata, extract_text


def main():
    parser = argparse.ArgumentParser(description="DTA-Downloader für myAbiFlow")
    parser.add_argument("--output", default="../../data/dta-texte/",
                        help="Ausgabeverzeichnis (Standard: ../../data/dta-texte/)")
    parser.add_argument("--epoch", help="Nur eine bestimmte Epoche (z.B. 'aufklaerung')")
    parser.add_argument("--author", help="Nur Texte eines bestimmten Autors (Nachname)")
    parser.add_argument("--max-texts", type=int, default=0,
                        help="Maximale Anzahl Texte pro Epoche (0 = unbegrenzt)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur Metadaten anzeigen, keine Volltexte herunterladen")
    parser.add_argument("--cache-dir", help="Cache-Verzeichnis für heruntergeladene Dateien")
    args = parser.parse_args()

    # Ausgabeverzeichnis relativ zum Script auflösen
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, args.output) if not os.path.isabs(args.output) else args.output
    output_dir = os.path.normpath(output_dir)

    print(f"DTA-Downloader für myAbiFlow")
    print(f"{'=' * 40}")
    print(f"Ausgabe: {output_dir}")
    if args.epoch:
        if args.epoch not in EPOCHS:
            print(f"Fehler: Unbekannte Epoche '{args.epoch}'")
            print(f"Verfügbar: {', '.join(EPOCHS.keys())}")
            sys.exit(1)
        print(f"Epoche: {EPOCHS[args.epoch]['name']}")
    if args.author:
        print(f"Autor: {args.author}")
    if args.max_texts:
        print(f"Max pro Epoche: {args.max_texts}")
    if args.dry_run:
        print(f"Modus: Dry-Run (keine Volltexte)")
    print()

    # Schritt 1: Metadaten harvesten
    print("Schritt 1: Metadaten via OAI-PMH laden...")
    downloader = DTADownloader(cache_dir=args.cache_dir)
    all_records = downloader.harvest_metadata()
    print(f"  → {len(all_records)} Gesamt-Records vom DTA\n")

    # Schritt 2: Nach Abitur-Relevanz filtern
    print("Schritt 2: Nach Abitur-Relevanz filtern...")
    filtered = filter_records(all_records)

    # Optional: nach Epoche filtern
    if args.epoch:
        filtered = [r for r in filtered if r.get("epoch") == args.epoch]

    # Optional: nach Autor filtern
    if args.author:
        author_lower = args.author.lower()
        filtered = [r for r in filtered if author_lower in r.get("creator", "").lower()]

    # Deduplizierung: gleiche dta_id nur einmal behalten
    seen_ids = set()
    unique = []
    for r in filtered:
        dta_id = r.get("dta_id", "")
        if dta_id and dta_id not in seen_ids:
            seen_ids.add(dta_id)
            unique.append(r)
    filtered = unique

    print(f"  → {len(filtered)} abitur-relevante Texte gefunden (dedupliziert)\n")

    # Statistik nach Epochen
    epoch_counts = {}
    for r in filtered:
        e = r.get("epoch", "unbekannt")
        epoch_counts[e] = epoch_counts.get(e, 0) + 1
    print("  Verteilung nach Epochen:")
    for e_key in EPOCHS:
        count = epoch_counts.get(e_key, 0)
        if count > 0:
            print(f"    {EPOCHS[e_key]['name']}: {count} Texte")
    print()

    if args.dry_run:
        # Dry-Run: nur Metadaten anzeigen
        print("Dry-Run: Gefundene Texte:")
        print("-" * 60)
        for r in filtered[:50]:  # Erste 50 anzeigen
            epoch_name = EPOCHS.get(r.get("epoch", ""), {}).get("name", "?")
            print(f"  [{epoch_name}] {r['creator']}: {r['title']} ({r['date']})")
            print(f"    DTA-ID: {r['dta_id']}")
        if len(filtered) > 50:
            print(f"  ... und {len(filtered) - 50} weitere")
        print(f"\nGesamt: {len(filtered)} Texte")
        return

    # Schritt 3: Volltexte herunterladen und aufbereiten
    print("Schritt 3: Volltexte herunterladen und aufbereiten...")
    os.makedirs(output_dir, exist_ok=True)

    corpus_index = {
        "generated": str(date.today()),
        "source": "Deutsches Textarchiv (deutschestextarchiv.de)",
        "license": "CC-BY-NC-3.0",
        "total_texts": 0,
        "epochs": {},
    }

    # Pro Epoche verarbeiten
    epoch_texts_count = {}
    total_saved = 0

    for record in filtered:
        epoch_key = record.get("epoch")
        if not epoch_key:
            continue

        dta_id = record["dta_id"]

        # Bereits heruntergeladene Dateien überspringen (Resume)
        epoch_dir = os.path.join(output_dir, epoch_key, "texte")
        filename = _safe_filename(dta_id) + ".json"
        filepath = os.path.join(epoch_dir, filename)
        if os.path.exists(filepath):
            epoch_texts_count[epoch_key] = epoch_texts_count.get(epoch_key, 0) + 1
            total_saved += 1
            continue

        # Max-Texts pro Epoche prüfen
        if args.max_texts:
            current_count = epoch_texts_count.get(epoch_key, 0)
            if current_count >= args.max_texts:
                continue

        dta_id = record["dta_id"]
        print(f"  Lade: {record['creator']} – {record['title']}...", end=" ", flush=True)

        # TEI-XML herunterladen für bessere Metadaten
        tei_xml = downloader.download_tei(dta_id)
        if tei_xml is None:
            print("✗ (TEI nicht verfügbar)")
            continue

        # TEI-Metadaten parsen
        tei_meta = parse_tei_metadata(tei_xml)
        if not refine_filter(record, tei_meta):
            print("✗ (kein literarischer Text)")
            continue

        # Volltext extrahieren
        text = extract_text(tei_xml)
        if not refine_with_text(text):
            print("✗ (zu kurz)")
            continue

        # JSON-Objekt erstellen
        epoch_info = EPOCHS[epoch_key]
        text_data = {
            "id": dta_id,
            "dta_id": dta_id,
            "title": (tei_meta or {}).get("title") or record.get("title", ""),
            "author": (tei_meta or {}).get("author") or record.get("creator", ""),
            "year": (tei_meta or {}).get("year"),
            "epoch": epoch_key,
            "epoch_name": epoch_info["name"],
            "genre": (tei_meta or {}).get("genre_sub") or (tei_meta or {}).get("genre_main", ""),
            "source": "Deutsches Textarchiv",
            "source_url": DTA_WEB_URL.format(dta_id=dta_id),
            "license": "CC-BY-NC-3.0",
            "text_full": text,
            "text_length": len(text),
            "text_excerpt": text[:EXCERPT_LENGTH],
            "curriculum_relevance": {
                "halbjahr": epoch_info["halbjahr"],
            },
        }

        # Speichern
        epoch_dir = os.path.join(output_dir, epoch_key, "texte")
        os.makedirs(epoch_dir, exist_ok=True)

        # Dateiname: autor_titel (bereinigt)
        filename = _safe_filename(dta_id) + ".json"
        filepath = os.path.join(epoch_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(text_data, f, ensure_ascii=False, indent=2)

        epoch_texts_count[epoch_key] = epoch_texts_count.get(epoch_key, 0) + 1
        total_saved += 1
        print(f"✓ ({len(text)} Zeichen)")

    # Epochen-Indices und Gesamt-Index erstellen
    print(f"\nSchritt 4: Indices erstellen...")
    for epoch_key, count in epoch_texts_count.items():
        epoch_info = EPOCHS[epoch_key]
        epoch_dir = os.path.join(output_dir, epoch_key)
        texte_dir = os.path.join(epoch_dir, "texte")

        # Alle gespeicherten Texte für den Epochen-Index sammeln
        texts_list = []
        if os.path.exists(texte_dir):
            for fname in sorted(os.listdir(texte_dir)):
                if fname.endswith(".json"):
                    fpath = os.path.join(texte_dir, fname)
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    texts_list.append({
                        "id": data["id"],
                        "title": data["title"],
                        "author": data["author"],
                        "year": data["year"],
                        "genre": data["genre"],
                        "text_length": data["text_length"],
                    })

        epoch_index = {
            "epoch": epoch_key,
            "epoch_name": epoch_info["name"],
            "period": f"{epoch_info['start']}–{epoch_info['end']}",
            "halbjahr": epoch_info["halbjahr"],
            "text_count": len(texts_list),
            "texts": texts_list,
        }

        with open(os.path.join(epoch_dir, "index.json"), "w", encoding="utf-8") as f:
            json.dump(epoch_index, f, ensure_ascii=False, indent=2)

        # Für Gesamtindex
        authors = list(set(t["author"].split()[-1] for t in texts_list if t["author"]))
        corpus_index["epochs"][epoch_key] = {
            "name": epoch_info["name"],
            "count": len(texts_list),
            "authors": sorted(authors),
        }

    corpus_index["total_texts"] = total_saved

    with open(os.path.join(output_dir, "corpus-index.json"), "w", encoding="utf-8") as f:
        json.dump(corpus_index, f, ensure_ascii=False, indent=2)

    print(f"\nFertig! {total_saved} Texte gespeichert in {output_dir}")
    print(f"Gesamtindex: {os.path.join(output_dir, 'corpus-index.json')}")


def _safe_filename(text):
    """Erstellt einen sicheren Dateinamen."""
    # Nur Buchstaben, Zahlen, Unterstriche und Bindestriche
    safe = text.lower()
    safe = safe.replace(" ", "_")
    safe = "".join(c for c in safe if c.isalnum() or c in ("_", "-"))
    return safe[:100]  # Maximale Länge


if __name__ == "__main__":
    main()
