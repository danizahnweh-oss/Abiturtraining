-- PostgreSQL Schema für myAbiFlow
-- Ersetzt Cloudflare D1 (SQLite)
-- Ausführen: psql -h HOST -U myabiflow -d myabiflow -f schema.sql

-- ============================================================
-- Haupt-Datenbank (myabiflow-db)
-- ============================================================

-- Schüler
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_lower TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    level VARCHAR(3) DEFAULT 'gA',
    hidden_subjects TEXT DEFAULT '[]',
    class_group TEXT,
    email TEXT,
    exam_subjects TEXT DEFAULT '{}',
    reminder_interval INTEGER DEFAULT 0,
    last_reminder_sent TEXT,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_students_name_lower ON students(name_lower);

-- Ergebnisse
CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT,
    course TEXT,
    type TEXT NOT NULL,
    topic TEXT,
    content TEXT,
    language VARCHAR(5) DEFAULT 'de',
    total REAL,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at);
CREATE INDEX IF NOT EXISTS idx_results_student_name ON results(LOWER(TRIM(student_name)));

-- Kompetenzprofile (Details pro Ergebnis)
CREATE TABLE IF NOT EXISTS result_details (
    id SERIAL PRIMARY KEY,
    result_id TEXT REFERENCES results(id) ON DELETE CASCADE,
    strengths TEXT DEFAULT '[]',
    weaknesses TEXT DEFAULT '[]',
    error_types TEXT DEFAULT '{}',
    afb_scores TEXT DEFAULT '{}',
    missing_topics TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_result_details_result_id ON result_details(result_id);

-- Lehrkräfte
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    salt TEXT,
    hash TEXT,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Klassen-Codes (für Schüler-Zuordnung)
CREATE TABLE IF NOT EXISTS teacher_codes (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    label TEXT,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Schüler-Lehrer-Zuordnung
CREATE TABLE IF NOT EXISTS student_teacher_links (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    subject TEXT,
    code_id INTEGER REFERENCES teacher_codes(id),
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    UNIQUE(student_id, teacher_id, subject)
);

-- Klassenpasswörter
CREATE TABLE IF NOT EXISTS class_passwords (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    password TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    free_access INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Lernpläne (KI-generiert, gecacht)
CREATE TABLE IF NOT EXISTS learning_plans (
    id SERIAL PRIMARY KEY,
    student_name_lower TEXT NOT NULL,
    plan_json TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_learning_plans_student ON learning_plans(student_name_lower);

-- Asynchrone Korrektur-Jobs
CREATE TABLE IF NOT EXISTS grading_jobs (
    id TEXT PRIMARY KEY,
    result_id TEXT,
    status VARCHAR(20) DEFAULT 'queued',
    endpoint TEXT,
    input_data TEXT,
    result_data TEXT,
    attempts INTEGER DEFAULT 0,
    error_msg TEXT,
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    updated_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_grading_jobs_status ON grading_jobs(status);

-- ============================================================
-- Tutor-Datenbank (tutor-db) – im gleichen Schema
-- ============================================================

-- pgvector Extension für RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- Wissensdatenbank für Flowie
CREATE TABLE IF NOT EXISTS tutor_knowledge (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    subject TEXT,
    metadata TEXT DEFAULT '{}',
    embedding VECTOR(768),
    created_at TEXT DEFAULT (TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS idx_tutor_embedding ON tutor_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Schüler-Feedback zur Website
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
    category TEXT,
    message TEXT,
    page TEXT,
    student_name TEXT,
    valuable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_student ON feedback(student_name, valuable);

-- ============================================================
-- Hilfsfunktionen
-- ============================================================

-- Automatische Bereinigung alter Grading-Jobs (> 30 Tage)
-- Wird vom Cron-Job aufgerufen
CREATE OR REPLACE FUNCTION cleanup_old_grading_jobs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM grading_jobs
    WHERE created_at < TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    AND status IN ('completed', 'failed');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
