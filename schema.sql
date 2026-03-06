-- myAbiFlow D1 Schema (EU-Standort: WEUR)
-- Tabellen fuer Schueler und Ergebnisse

CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  name_lower      TEXT NOT NULL UNIQUE,
  level           TEXT NOT NULL DEFAULT '',
  salt            TEXT,
  hash            TEXT,
  hidden_subjects TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_name_lower ON students(name_lower);

CREATE TABLE IF NOT EXISTS results (
  id           TEXT PRIMARY KEY,
  student_id   INTEGER REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  course       TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'mediation',
  topic        TEXT NOT NULL DEFAULT '',
  content      TEXT,
  language     TEXT,
  total        REAL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);

-- Kompetenzprofil: Detailliertes KI-Feedback pro Ergebnis
CREATE TABLE IF NOT EXISTS result_details (
  result_id      TEXT PRIMARY KEY REFERENCES results(id) ON DELETE CASCADE,
  strengths      TEXT,  -- JSON-Array: ["Klare Struktur", "Gute Fachbegriffe"]
  weaknesses     TEXT,  -- JSON-Array: ["Fehlende Quellenarbeit", "Argumentationsluecken"]
  error_types    TEXT,  -- JSON: {"rs": 3, "gr": 5, "inhalt": 2, "fachbegriffe": 1}
  missing_topics TEXT,  -- JSON-Array: fehlende inhaltliche Aspekte
  afb_scores     TEXT,  -- JSON: {"I": 80, "II": 60, "III": 30} (Prozent je AFB)
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_result_details_result_id ON result_details(result_id);
