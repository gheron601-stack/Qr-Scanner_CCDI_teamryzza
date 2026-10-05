import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateSessionQRToken } from '../services/qrService.js';
import { broadcastSessionEvent } from '../socket/socketHandler.js';
import { generateSessionRosterCSV } from '../services/exportService.js';

const router = express.Router();

// Helper to calculate session live stats
function computeSessionStats(sessionId) {
  const session = db.prepare('SELECT section_id, status FROM class_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  const totalEnrolled = db.prepare('SELECT COUNT(*) as count FROM enrollments WHERE section_id = ?').get(session.section_id).count;
  const records = db.prepare('SELECT status, COUNT(*) as count FROM attendance_records WHERE session_id = ? GROUP BY status').all(sessionId);

  let present = 0, late = 0, absent = 0, excused = 0;
  records.forEach(r => {
    if (r.status === 'present') present = r.count;
    if (r.status === 'late') late = r.count;
    if (r.status === 'absent') absent = r.count;
    if (r.status === 'excused') excused = r.count;
  });

  const totalRecorded = present + late + absent + excused;
  const pending = Math.max(0, totalEnrolled - totalRecorded);

  return {
    totalEnrolled,
    present,
    late,
    absent: session.status === 'closed' ? absent + pending : absent,
    excused,
    pending: session.status === 'closed' ? 0 : pending,
    attendanceRate: totalEnrolled > 0 
      ? Math.round(((present + late + excused) / totalEnrolled) * 100) 
      : 0
  };
}

// 1. Create a new Class Session
router.post('/', authenticate, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const { sectionId, lateCutoffMinutes = 15 } = req.body;
    if (!sectionId) {
      return res.status(400).json({ error: 'Section ID is required' });
    }

    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sectionId);
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Check if there is already an active session for this section
    const existingActive = db.prepare("SELECT id FROM class_sessions WHERE section_id = ? AND status = 'active'").get(sectionId);
    if (existingActive) {
      return res.status(400).json({ 
        error: 'An active session is already in progress for this section.',
        activeSessionId: existingActive.id
      });
    }

    const sessionId = uuidv4();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const startTimeStr = now.toISOString();

    db.prepare(`
      INSERT INTO class_sessions (id, section_id, instructor_id, date, start_time, late_cutoff_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(sessionId, sectionId, req.user.id, dateStr, startTimeStr, parseInt(lateCutoffMinutes) || 15);

    // Automatically link any prepared presentation for this section to this new session
    try {
      const prepPres = db.prepare('SELECT id FROM session_presentations WHERE section_id = ? AND (session_id IS NULL OR session_id = "") ORDER BY created_at DESC LIMIT 1').get(sectionId);
      if (prepPres) {
        db.prepare('UPDATE session_presentations SET session_id = ? WHERE id = ?').run(sessionId, prepPres.id);
      }
      db.prepare('UPDATE session_prompts SET session_id = ? WHERE section_id = ? AND (session_id IS NULL OR session_id = "")').run(sessionId, sectionId);
    } catch (e) {
      console.warn('Could not auto-link prepared presentation/drafts:', e.message);
    }

    // Generate initial dynamic QR token
    const tokenData = await generateSessionQRToken(sessionId, 1);

    res.status(201).json({
      message: 'Class session started successfully',
      sessionId,
      session: {
        id: sessionId,
        sectionId,
        sectionName: section.name,
        date: dateStr,
        startTime: startTimeStr,
        lateCutoffMinutes: parseInt(lateCutoffMinutes) || 15,
        status: 'active'
      },
      token: tokenData
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session: ' + err.message });
  }
});

// 2. Get Session Details and Full Live Attendance State
router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const session = db.prepare(`
      SELECT cs.*, 
             s.name as section_name, s.room, s.schedule, s.academic_term,
             sub.code as subject_code, sub.title as subject_title,
             u.name as instructor_name, u.email as instructor_email
      FROM class_sessions cs
      JOIN sections s ON cs.section_id = s.id
      JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN users u ON cs.instructor_id = u.id
      WHERE cs.id = ?
    `).get(id);

    if (!session) {
      return res.status(404).json({ error: 'Class session not found' });
    }

    // Get all enrolled students + their attendance status for this session
    const roster = db.prepare(`
      SELECT u.id, u.id_number, u.name, u.email, u.avatar_url,
             ar.id as attendance_id, ar.status, ar.scanned_at, ar.method, ar.ip_address
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      LEFT JOIN attendance_records ar ON ar.student_id = u.id AND ar.session_id = ?
      WHERE e.section_id = ?
      ORDER BY u.name ASC
    `).all(id, session.section_id);

    const stats = computeSessionStats(id);

    // Audit logs for this session
    const auditLogs = db.prepare(`
      SELECT al.*, u.name as changed_by_name, stu.name as student_name, stu.id_number as student_id_number
      FROM attendance_audit_logs al
      LEFT JOIN users u ON al.changed_by = u.id
      LEFT JOIN users stu ON al.student_id = stu.id
      WHERE al.session_id = ?
      ORDER BY al.timestamp DESC
    `).all(id);

    res.json({
      session,
      roster,
      stats,
      auditLogs
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching session: ' + err.message });
  }
});

// 3. Rotate Token (Called by projector screen every 30s or on-demand)
router.get('/:id/rotate-token', authenticate, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const session = db.prepare('SELECT id, status, token_version FROM class_sessions WHERE id = ?').get(id);

    if (!session) {
      return res.status(404).json({ error: 'Class session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Cannot rotate token for a closed session' });
    }

    const nextVersion = (session.token_version || 0) + 1;
    const tokenData = await generateSessionQRToken(id, nextVersion);

    // Broadcast to connected clients in this session room
    broadcastSessionEvent(id, 'qr_rotated', tokenData);

    res.json(tokenData);
  } catch (err) {
    res.status(500).json({ error: 'Error rotating QR token: ' + err.message });
  }
});

// 4. Manual Override of Student Attendance Status
router.post('/:id/manual-override', authenticate, authorize('instructor', 'admin'), (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { studentId, newStatus, reason } = req.body;

    if (!studentId || !newStatus || !reason) {
      return res.status(400).json({ error: 'studentId, newStatus (present/late/absent/excused), and reason are required' });
    }

    const validStatuses = ['present', 'late', 'absent', 'excused'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be present, late, absent, or excused' });
    }

    const session = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const student = db.prepare('SELECT id, id_number, name FROM users WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check existing record
    const existingRec = db.prepare('SELECT id, status FROM attendance_records WHERE session_id = ? AND student_id = ?').get(sessionId, studentId);
    let previousStatus = existingRec ? existingRec.status : 'unrecorded';
    let recordId = existingRec ? existingRec.id : uuidv4();
    const nowIso = new Date().toISOString();

    if (existingRec) {
      db.prepare(`
        UPDATE attendance_records
        SET status = ?, method = 'manual_override', scanned_at = ?
        WHERE id = ?
      `).run(newStatus, nowIso, recordId);
    } else {
      db.prepare(`
        INSERT INTO attendance_records (id, session_id, student_id, scanned_at, status, method, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, 'manual_override', 'manual', 'Instructor Override')
      `).run(recordId, sessionId, studentId, nowIso, newStatus);
    }

    // Insert into audit trail
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO attendance_audit_logs (id, attendance_record_id, session_id, student_id, changed_by, previous_status, new_status, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, recordId, sessionId, studentId, req.user.id, previousStatus, newStatus, reason, nowIso);

    const stats = computeSessionStats(sessionId);

    // Broadcast live update to room
    broadcastSessionEvent(sessionId, 'manual_override_updated', {
      studentId,
      studentName: student.name,
      newStatus,
      previousStatus,
      reason,
      changedByName: req.user.name,
      timestamp: nowIso,
      stats
    });

    res.json({
      message: `Student ${student.name} successfully updated to ${newStatus}`,
      recordId,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: 'Manual override failed: ' + err.message });
  }
});

// 5. Finalize and Close Session
router.post('/:id/close', authenticate, authorize('instructor', 'admin'), (req, res) => {
  try {
    const { id } = req.params;
    const session = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const nowIso = new Date().toISOString();

    // Mark remaining unscanned enrolled students as absent
    const unscannedStudents = db.prepare(`
      SELECT u.id
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      LEFT JOIN attendance_records ar ON ar.student_id = u.id AND ar.session_id = ?
      WHERE e.section_id = ? AND ar.id IS NULL
    `).all(id, session.section_id);

    const insertAbsent = db.prepare(`
      INSERT INTO attendance_records (id, session_id, student_id, scanned_at, status, method, ip_address, user_agent)
      VALUES (?, ?, ?, ?, 'absent', 'manual_override', 'system', 'Auto-closed Absent')
    `);

    const insertExcused = db.prepare(`
      INSERT INTO attendance_records (id, session_id, student_id, scanned_at, status, method, ip_address, user_agent)
      VALUES (?, ?, ?, ?, 'excused', 'manual_override', 'system', 'Auto-excused from Advance Notice')
    `);

    const checkExcuse = db.prepare(`
      SELECT id FROM absence_excuse_requests 
      WHERE student_id = ? AND session_id = ? AND status = 'approved'
    `);

    unscannedStudents.forEach(stu => {
      const recordId = uuidv4();
      // Check if student has an approved advance excuse for this session
      const excuse = checkExcuse.get(stu.id, id);
      
      if (excuse) {
        insertExcused.run(recordId, id, stu.id, nowIso);
      } else {
        insertAbsent.run(recordId, id, stu.id, nowIso);
      }
    });

    // Mark session closed
    db.prepare(`
      UPDATE class_sessions 
      SET status = 'closed', end_time = ?, current_token = NULL, current_backup_code = NULL
      WHERE id = ?
    `).run(nowIso, id);

    const stats = computeSessionStats(id);

    broadcastSessionEvent(id, 'session_closed', {
      sessionId: id,
      closedAt: nowIso,
      stats
    });

    res.json({
      message: 'Class session closed and finalized successfully',
      autoMarkedAbsentCount: unscannedStudents.length,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close session: ' + err.message });
  }
});

// 6. Export Session CSV
router.get('/:id/export-csv', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const result = generateSessionRosterCSV(id);

    if (!result) {
      return res.status(404).json({ error: 'Session record not found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate CSV: ' + err.message });
  }
});

export default router;
