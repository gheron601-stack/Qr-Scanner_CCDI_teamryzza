import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const dbDir = isVercel ? '/tmp' : path.resolve(__dirname, '../../database');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'ccdi_qrscan.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and Foreign Keys for high concurrency and referential integrity
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      id_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'instructor', 'student')) NOT NULL,
      department TEXT DEFAULT 'College of Information & Communications Technology',
      avatar_url TEXT,
      total_xp INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      units INTEGER DEFAULT 3,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
      instructor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      academic_term TEXT NOT NULL,
      room TEXT NOT NULL,
      schedule TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, section_id)
    );

    CREATE TABLE IF NOT EXISTS class_sessions (
      id TEXT PRIMARY KEY,
      section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
      instructor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      late_cutoff_minutes INTEGER DEFAULT 15,
      status TEXT CHECK(status IN ('active', 'closed', 'cancelled')) DEFAULT 'active',
      current_token TEXT,
      current_backup_code TEXT,
      token_version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      scanned_at DATETIME NOT NULL,
      status TEXT CHECK(status IN ('present', 'late', 'absent', 'excused')) NOT NULL,
      method TEXT CHECK(method IN ('qr_scan', 'manual_override', 'backup_code')) DEFAULT 'qr_scan',
      ip_address TEXT,
      user_agent TEXT,
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_audit_logs (
      id TEXT PRIMARY KEY,
      attendance_record_id TEXT,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Single-column indexes
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_section ON class_sessions(section_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id);

    -- Composite indexes for hot query paths
    -- UNIQUE composite: covers the duplicate-scan check and the primary scan lookup
    -- (session_id, student_id) WHERE clause in scanRoutes.js
    CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_student
      ON attendance_records(session_id, student_id);

    -- Covers analytics queries: WHERE section_id = ? AND status = 'closed'
    CREATE INDEX IF NOT EXISTS idx_sessions_section_status
      ON class_sessions(section_id, status);

    -- ── S-Class: Active Presence (Pop Quizzes & Presentations) ──────────────
    CREATE TABLE IF NOT EXISTS session_presentations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      slide_count INTEGER DEFAULT 0,
      extracted_slides_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_prompts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      group_id TEXT,
      question_text TEXT NOT NULL,
      image_url TEXT,
      options_json TEXT NOT NULL,
      correct_option TEXT NOT NULL,
      time_limit_seconds INTEGER DEFAULT 20,
      status TEXT CHECK(status IN ('draft', 'active', 'completed')) DEFAULT 'draft',
      end_time INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_responses (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      selected_option TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL,
      points_awarded INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prompt_id) REFERENCES session_prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(prompt_id, student_id)
    );

    CREATE INDEX IF NOT EXISTS idx_session_prompts ON session_prompts(session_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_responses_student ON prompt_responses(student_id);

    -- ── S-Class: Excuse Letter Workflow ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS excuse_requests (
      id TEXT PRIMARY KEY,
      attendance_record_id TEXT NOT NULL UNIQUE,
      student_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      attachment_url TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_excuse_status ON excuse_requests(status);
    CREATE INDEX IF NOT EXISTS idx_excuse_student ON excuse_requests(student_id);

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON admin_audit_logs(timestamp);

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_audience TEXT DEFAULT 'all',
      priority TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS absence_excuse_requests (
      id TEXT PRIMARY KEY,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES class_sessions(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      documentation_url TEXT,
      status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      review_notes TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_excuse_requests_status ON absence_excuse_requests(status);

    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      recipient_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      recipient_name TEXT,
      recipient_contact TEXT,
      channel TEXT DEFAULT 'email',
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME
    );

    -- ── Gamification Tables ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS student_xp (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      session_id TEXT REFERENCES class_sessions(id) ON DELETE SET NULL,
      attendance_record_id TEXT,
      xp_earned INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_student_xp_student ON student_xp(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_xp_session ON student_xp(session_id);

    CREATE TABLE IF NOT EXISTS student_badges (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key TEXT NOT NULL,
      badge_name TEXT NOT NULL,
      badge_description TEXT,
      badge_xp INTEGER DEFAULT 0,
      badge_tier INTEGER DEFAULT 1,
      badge_emoji TEXT,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, badge_key)
    );
    CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);
  `);
  
  // Safe Migrations for existing DBs
  try { db.exec("ALTER TABLE users ADD COLUMN total_xp INTEGER DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE session_prompts ADD COLUMN group_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE session_prompts ADD COLUMN image_url TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE session_prompts ADD COLUMN end_time INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE notification_logs ADD COLUMN read_at DATETIME;"); } catch (e) {}
  try { db.exec("ALTER TABLE session_presentations ADD COLUMN section_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE session_prompts ADD COLUMN section_id TEXT;"); } catch (e) {}
  // Gamification tables migration (in case DB already exists without them)
  try { db.exec(`CREATE TABLE IF NOT EXISTS student_xp (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, section_id TEXT, session_id TEXT, attendance_record_id TEXT, xp_earned INTEGER NOT NULL, reason TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_student_xp_student ON student_xp(student_id);`); } catch (e) {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS student_badges (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, badge_key TEXT NOT NULL, badge_name TEXT NOT NULL, badge_description TEXT, badge_xp INTEGER DEFAULT 0, badge_tier INTEGER DEFAULT 1, badge_emoji TEXT, earned_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id, badge_key));`); } catch (e) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);`); } catch (e) {}
  // Column migrations for existing badge tables
  try { db.exec(`ALTER TABLE student_badges ADD COLUMN badge_description TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE student_badges ADD COLUMN badge_xp INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE student_badges ADD COLUMN badge_tier INTEGER DEFAULT 1;`); } catch (e) {}
  console.log('Database tables initialized successfully with foreign keys and WAL mode.');
}

export function logAdminAction(adminId, adminName, action, targetType, targetId, details = {}) {
  try {
    db.prepare(`
      INSERT INTO admin_audit_logs (id, admin_id, admin_name, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), adminId, adminName, action, targetType, targetId, JSON.stringify(details));
  } catch (err) {
    console.error('Failed to log admin action:', err.message);
  }
}

export default db;
