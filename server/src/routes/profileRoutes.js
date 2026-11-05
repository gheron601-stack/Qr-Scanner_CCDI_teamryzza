import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import db from '../config/db.js';

const router = Router();

// ── Safe Migration: add phone column if it doesn't exist ──────────────────────
try {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL;');
} catch (err) {
  // Column already exists — ignore
  if (!err.message?.includes('duplicate column name')) {
    console.warn('[profileRoutes] Migration warning:', err.message);
  }
}

// ── GET /api/profile/me ───────────────────────────────────────────────────────
// Returns current authenticated user's profile fields
router.get('/me', authenticate, (req, res) => {
  try {
    const user = db
      .prepare(
        `SELECT id, id_number, name, email, role, department, avatar_url, phone, total_xp
         FROM users WHERE id = ?`
      )
      .get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user });
  } catch (err) {
    console.error('[GET /api/profile/me]', err.message);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ── PATCH /api/profile/me ─────────────────────────────────────────────────────
// Updates name, phone, department for the current user
router.patch('/me', authenticate, (req, res) => {
  const { name, phone, department } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Full name is required.' });
  }

  // Basic phone pattern validation server-side (allow digits, spaces, +, -, parens)
  if (phone && !/^[\d\s\+\-\(\)]+$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  try {
    db.prepare(
      `UPDATE users SET name = ?, phone = ?, department = ? WHERE id = ?`
    ).run(name.trim(), phone?.trim() || null, department?.trim() || null, req.user.id);

    const updated = db
      .prepare(
        `SELECT id, id_number, name, email, role, department, avatar_url, phone, total_xp
         FROM users WHERE id = ?`
      )
      .get(req.user.id);

    res.json({ user: updated });
  } catch (err) {
    console.error('[PATCH /api/profile/me]', err.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── POST /api/profile/avatar ──────────────────────────────────────────────────
// Receives base64 data URL, stores in avatar_url column
router.post('/avatar', authenticate, (req, res) => {
  const { avatar_base64 } = req.body;

  if (!avatar_base64 || typeof avatar_base64 !== 'string') {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  // Must be a valid data URL for an image
  if (!avatar_base64.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image format. Must be a data URL.' });
  }

  // Max ~2.7 MB base64 string (corresponds to ~2 MB file)
  const MAX_BASE64_LENGTH = 2.7 * 1024 * 1024;
  if (avatar_base64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ error: 'Image too large. Maximum file size is 2 MB.' });
  }

  try {
    db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`).run(
      avatar_base64,
      req.user.id
    );

    res.json({ avatar_url: avatar_base64 });
  } catch (err) {
    console.error('[POST /api/profile/avatar]', err.message);
    res.status(500).json({ error: 'Failed to save avatar.' });
  }
});

export default router;
