// Αρχικοποίηση βάσης δεδομένων (SQLite μέσω better-sqlite3).
// Δημιουργεί το σχήμα αν δεν υπάρχει και σπέρνει (seed) βασικά δεδομένα:
// έναν λογαριασμό διαχειριστή, προεπιλεγμένες κατηγορίες και πρότυπο πιστοποιητικού.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('learner','instructor','admin')),
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prerequisites TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  video_url TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS module_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  UNIQUE(enrollment_id, module_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('multiple_choice','true_false','matching')),
  question_text TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  explanation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Για ερωτήσεις πολλαπλής επιλογής / σωστού-λάθους: is_correct σημαίνει σωστή επιλογή.
-- Για ερωτήσεις αντιστοίχισης: side ('left'/'right') + match_key ομαδοποιούν τα σωστά ζεύγη.
CREATE TABLE IF NOT EXISTS question_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  match_key TEXT,
  side TEXT CHECK(side IN ('left','right')),
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  time_limit_seconds INTEGER NOT NULL DEFAULT 600,
  passing_score REAL NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  UNIQUE(quiz_id, question_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score REAL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_json TEXT,
  is_correct INTEGER,
  points_earned REAL
);

CREATE TABLE IF NOT EXISTS certificate_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title_text TEXT NOT NULL DEFAULT 'Πιστοποιητικό Ολοκλήρωσης',
  body_text TEXT NOT NULL DEFAULT 'Απονέμεται στον/στην {{learner_name}} για την επιτυχή ολοκλήρωση του μαθήματος «{{course_title}}».',
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES certificate_templates(id) ON DELETE SET NULL,
  certificate_code TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, course_id)
);
`);

// Ελαφριά μετάβαση σχήματος για ήδη υπάρχουσες βάσεις δεδομένων: προσθέτει τη νέα
// στήλη/πίνακα μόνο αν λείπει, ώστε να μην χαθούν υπάρχοντα δεδομένα.
const courseColumns = db.prepare("PRAGMA table_info(courses)").all().map(c => c.name);
if (!courseColumns.includes('content_text')) {
  db.exec('ALTER TABLE courses ADD COLUMN content_text TEXT');
}

db.exec(`
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function seed() {
  const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (catCount === 0) {
    const insCat = db.prepare('INSERT INTO categories (name, description) VALUES (?,?)');
    const defaults = [
      ['Προγραμματισμός', 'Ανάπτυξη λογισμικού, γλώσσες προγραμματισμού και εργαλεία.'],
      ['Επιχειρήσεις & Διοίκηση', 'Διοίκηση επιχειρήσεων, μάρκετινγκ και επιχειρηματικότητα.'],
      ['Ξένες Γλώσσες', 'Εκμάθηση ξένων γλωσσών σε όλα τα επίπεδα.'],
      ['Σχεδιασμός & Πολυμέσα', 'Γραφιστική, σχεδιασμός εμπειρίας χρήστη και πολυμέσα.']
    ];
    defaults.forEach(([name, description]) => insCat.run(name, description));
  }

  const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
  if (adminCount === 0) {
    const hash = bcrypt.hashSync('Admin123!', 10);
    db.prepare(`INSERT INTO users (full_name, email, password_hash, role, is_approved) VALUES (?,?,?,'admin',1)`)
      .run('Διαχειριστής Πλατφόρμας', 'admin@elearning.gr', hash);
  }

  const tplCount = db.prepare('SELECT COUNT(*) c FROM certificate_templates').get().c;
  if (tplCount === 0) {
    db.prepare(`INSERT INTO certificate_templates (name, title_text, body_text, is_default) VALUES (?,?,?,1)`).run(
      'Προεπιλεγμένο Πρότυπο',
      'Πιστοποιητικό Ολοκλήρωσης',
      'Απονέμεται στον/στην {{learner_name}} για την επιτυχή ολοκλήρωση του μαθήματος «{{course_title}}» με μέση επίδοση {{avg_score}}%.'
    );
  }
}
seed();

module.exports = db;
