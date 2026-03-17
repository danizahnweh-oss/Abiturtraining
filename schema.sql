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
  class_group     TEXT DEFAULT NULL,
  school          TEXT DEFAULT NULL,
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

-- Lehrer-Code-System: Mehrere Lehrkraefte mit eigenen Klassen-Codes
CREATE TABLE IF NOT EXISTS teachers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  email      TEXT,
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teachers_name_lower ON teachers(name_lower);

CREATE TABLE IF NOT EXISTS teacher_codes (
  id         TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  label      TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_codes_teacher ON teacher_codes(teacher_id);

CREATE TABLE IF NOT EXISTS student_teacher_links (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name_lower TEXT NOT NULL,
  code               TEXT NOT NULL,
  teacher_id         TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject            TEXT NOT NULL,
  linked_at          TEXT NOT NULL,
  UNIQUE(student_name_lower, code, subject)
);

CREATE INDEX IF NOT EXISTS idx_stl_student ON student_teacher_links(student_name_lower);
CREATE INDEX IF NOT EXISTS idx_stl_teacher ON student_teacher_links(teacher_id);
CREATE INDEX IF NOT EXISTS idx_stl_code ON student_teacher_links(code);

-- Klassenpasswoerter: Registrierungspasswoerter pro Klasse/Gruppe
CREATE TABLE IF NOT EXISTS class_passwords (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  password   TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_class_passwords_active ON class_passwords(active);

-- KI-Lernplan: Gecachte wöchentliche Trainingsplaene
CREATE TABLE IF NOT EXISTS learning_plans (
  id                 TEXT PRIMARY KEY,
  student_name_lower TEXT NOT NULL,
  plan_json          TEXT NOT NULL,
  profile_hash       TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lp_student ON learning_plans(student_name_lower);
