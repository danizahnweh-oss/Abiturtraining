# DTA-Download via OAI-PMH und REST-API
import os
import time
import hashlib
import requests
from lxml import etree

from config import OAI_BASE_URL, DTA_BASE_URL, REQUEST_DELAY

# OAI-PMH Namespaces
OAI_NS = "http://www.openarchives.org/OAI/2.0/"
DC_NS = "http://purl.org/dc/elements/1.1/"
NSMAP = {"oai": OAI_NS, "dc": DC_NS}


class DTADownloader:
    """Lädt Metadaten und Volltexte vom Deutschen Textarchiv herunter."""

    def __init__(self, cache_dir=None):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "myAbiFlow-DTA-Downloader/1.0 (Abitur-Training; kontakt@myabiflow.de)"
        })
        self.cache_dir = cache_dir or os.path.join(os.path.dirname(__file__), ".cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self._last_request_time = 0

    def _rate_limit(self):
        """Wartet zwischen Requests (Rate-Limiting)."""
        elapsed = time.time() - self._last_request_time
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        self._last_request_time = time.time()

    def _get_cache_path(self, url):
        """Cache-Pfad für eine URL."""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        return os.path.join(self.cache_dir, url_hash)

    def _fetch(self, url, params=None, use_cache=True):
        """HTTP GET mit Rate-Limiting und Cache."""
        cache_key = url + (str(sorted(params.items())) if params else "")
        cache_path = self._get_cache_path(cache_key)

        if use_cache and os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                return f.read()

        self._rate_limit()
        # Retry mit exponential Backoff bei Verbindungsfehlern
        max_retries = 5
        for attempt in range(max_retries):
            try:
                resp = self.session.get(url, params=params, timeout=60)
                resp.raise_for_status()
                break
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt * 3  # 3, 6, 12, 24 Sek.
                    print(f"  ⚠ Verbindungsfehler (Versuch {attempt+1}/{max_retries}), warte {wait}s: {e}")
                    time.sleep(wait)
                else:
                    raise
        text = resp.text

        if use_cache:
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write(text)

        return text

    def harvest_metadata(self):
        """
        Harvested alle Metadaten via OAI-PMH ListRecords.
        Gibt eine Liste von Dicts zurück mit: id, title, creator, date, subject, description.
        """
        records = []
        params = {
            "verb": "ListRecords",
            "metadataPrefix": "oai_dc",
        }
        page = 0

        while True:
            page += 1
            print(f"  OAI-PMH Seite {page} laden...")

            xml_text = self._fetch(OAI_BASE_URL, params=params, use_cache=True)
            root = etree.fromstring(xml_text.encode("utf-8"))

            # Records auf dieser Seite parsen
            for record in root.findall(".//oai:record", NSMAP):
                header = record.find("oai:header", NSMAP)
                metadata = record.find("oai:metadata", NSMAP)

                if header is None or metadata is None:
                    continue

                # Gelöschte Records überspringen
                status = header.get("status", "")
                if status == "deleted":
                    continue

                identifier = header.findtext("oai:identifier", "", NSMAP)
                # DTA-ID aus OAI-Identifier extrahieren (z.B. "oai:deutschestextarchiv.de:goethe_faust01_1808")
                dta_id = identifier.split(":")[-1] if ":" in identifier else identifier

                dc = metadata.find("{http://www.openarchives.org/OAI/2.0/oai_dc/}dc")
                if dc is None:
                    continue

                record_data = {
                    "dta_id": dta_id,
                    "identifier": identifier,
                    "title": dc.findtext(f"{{{DC_NS}}}title", ""),
                    "creator": dc.findtext(f"{{{DC_NS}}}creator", ""),
                    "date": dc.findtext(f"{{{DC_NS}}}date", ""),
                    "subjects": [s.text for s in dc.findall(f"{{{DC_NS}}}subject") if s.text],
                    "description": dc.findtext(f"{{{DC_NS}}}description", ""),
                    "type": dc.findtext(f"{{{DC_NS}}}type", ""),
                }
                records.append(record_data)

            # Resumption-Token prüfen
            token_elem = root.find(".//oai:resumptionToken", NSMAP)
            if token_elem is not None and token_elem.text:
                # Nächste Seite mit Token
                params = {
                    "verb": "ListRecords",
                    "resumptionToken": token_elem.text,
                }
            else:
                break

        print(f"  → {len(records)} Records geladen.")
        return records

    def download_text(self, dta_id):
        """Lädt den Plain-Text eines DTA-Dokuments herunter."""
        url = f"{DTA_BASE_URL}/book/download_txt/{dta_id}"
        try:
            return self._fetch(url, use_cache=True)
        except requests.RequestException as e:
            print(f"  ⚠ Fehler beim Download von {dta_id}: {e}")
            return None

    def download_tei(self, dta_id):
        """Lädt das TEI-XML eines DTA-Dokuments herunter."""
        url = f"{DTA_BASE_URL}/book/download_xml/{dta_id}"
        try:
            return self._fetch(url, use_cache=True)
        except requests.RequestException as e:
            print(f"  ⚠ Fehler beim TEI-Download von {dta_id}: {e}")
            return None
