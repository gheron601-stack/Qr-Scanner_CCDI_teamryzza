import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import db from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { broadcastSessionEvent } from '../socket/socketHandler.js';
import { parsePptxBuffer, generateSuggestedQuestions } from '../services/pptParser.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getUploadsDir = () => {
  const dir = path.resolve(__dirname, '../../uploads/presentations');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Upload and analyze presentation (.pptx) for a session
router.post('/session/:sessionId/presentation', authenticate, authorize('instructor'), upload.single('presentation'), (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No presentation file was uploaded.' });
    }

    const session = db.prepare('SELECT id FROM class_sessions WHERE id = ? AND instructor_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(403).json({ error: 'Invalid or unauthorized session.' });
    }

    const originalName = req.file.originalname || 'presentation.pptx';
    let slides = [];
    try {
      slides = parsePptxBuffer(req.file.buffer);
    } catch (parseErr) {
      console.warn('PPTX parsing warning:', parseErr.message);
      // Fallback: create mock slide structure if file format varies
      slides = [
        { slideNumber: 1, title: originalName.replace(/\.[^/.]+$/, ''), bullets: ['Key concepts covered in today’s class presentation.'], text: 'Key concepts covered in today’s class presentation.' }
      ];
    }

    const suggestedQuestions = generateSuggestedQuestions(slides);
    const presId = uuidv4();

    try {
      const uploadsDir = getUploadsDir();
      fs.writeFileSync(path.join(uploadsDir, `${presId}.pptx`), req.file.buffer);
    } catch (saveErr) {
      console.warn('Could not save presentation file to disk:', saveErr.message);
    }

    db.prepare(`
      INSERT INTO session_presentations (id, session_id, filename, original_name, file_size, slide_count, extracted_slides_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(presId, sessionId, originalName, originalName, req.file.size, slides.length, JSON.stringify(slides));

    res.json({
      success: true,
      presentation: {
        id: presId,
        filename: originalName,
        slide_count: slides.length
      },
      slides,
      suggestedQuestions
    });
  } catch (error) {
    console.error('Error handling presentation upload:', error);
    res.status(500).json({ error: error.message || 'Failed to process presentation.' });
  }
});

// Get presentation and draft recap questions for a session
router.get('/session/:sessionId/drafts', authenticate, (req, res) => {
  try {
    const { sessionId } = req.params;

    // 1. Fetch class session to know its section_id
    const session = db.prepare('SELECT id, section_id FROM class_sessions WHERE id = ?').get(sessionId);
    const sectionId = session?.section_id;

    // 2. Automatically link any unlinked presentation and draft questions for this section to this session
    if (sectionId) {
      try {
        db.prepare(`
          UPDATE session_presentations 
          SET session_id = ? 
          WHERE section_id = ? AND (session_id IS NULL OR session_id = '')
        `).run(sessionId, sectionId);

        db.prepare(`
          UPDATE session_prompts 
          SET session_id = ? 
          WHERE section_id = ? AND (session_id IS NULL OR session_id = '')
        `).run(sessionId, sectionId);
      } catch (linkErr) {
        console.warn('Auto-link in drafts route warning:', linkErr.message);
      }
    }

    // 3. Query presentation
    const presentation = db.prepare(`
      SELECT id, filename, original_name, file_size, slide_count, extracted_slides_json, created_at 
      FROM session_presentations 
      WHERE session_id = ? OR (section_id = ? AND section_id IS NOT NULL AND section_id != '')
      ORDER BY created_at DESC LIMIT 1
    `).get(sessionId, sectionId || '');

    let slides = [];
    if (presentation?.extracted_slides_json) {
      try {
        slides = JSON.parse(presentation.extracted_slides_json);
      } catch (e) {}
    }

    // 4. Query draft prompts
    const draftPrompts = db.prepare(`
      SELECT * FROM session_prompts 
      WHERE (session_id = ? OR (section_id = ? AND section_id IS NOT NULL AND section_id != '')) AND status = 'draft' 
      ORDER BY created_at ASC
    `).all(sessionId, sectionId || '');

    const formattedDrafts = draftPrompts.map(p => ({
      ...p,
      options: JSON.parse(p.options_json)
    }));

    res.json({
      presentation: presentation || null,
      slides,
      drafts: formattedDrafts
    });
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch draft recap prompts' });
  }
});

// Upload and analyze presentation (.pptx) in advance for a section (Lecture Prep before class session)
router.post('/section/:sectionId/presentation', authenticate, authorize('instructor', 'admin'), upload.single('presentation'), (req, res) => {
  try {
    const { sectionId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No presentation file was uploaded.' });
    }

    const section = (req.user.role === 'admin')
      ? db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId)
      : db.prepare('SELECT id FROM sections WHERE id = ? AND instructor_id = ?').get(sectionId, req.user.id);
    if (!section) {
      return res.status(403).json({ error: 'Invalid or unauthorized section.' });
    }

    const originalName = req.file.originalname || 'presentation.pptx';
    let slides = [];
    try {
      slides = parsePptxBuffer(req.file.buffer);
    } catch (parseErr) {
      console.warn('PPTX parsing warning:', parseErr.message);
      slides = [
        { slideNumber: 1, title: originalName.replace(/\.[^/.]+$/, ''), bullets: ['Key concepts covered in today’s class presentation.'], text: 'Key concepts covered in today’s class presentation.' }
      ];
    }

    const suggestedQuestions = generateSuggestedQuestions(slides);
    const presId = uuidv4();

    try {
      const uploadsDir = getUploadsDir();
      fs.writeFileSync(path.join(uploadsDir, `${presId}.pptx`), req.file.buffer);
    } catch (saveErr) {
      console.warn('Could not save presentation file to disk:', saveErr.message);
    }

    db.prepare(`
      INSERT INTO session_presentations (id, section_id, filename, original_name, file_size, slide_count, extracted_slides_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(presId, sectionId, originalName, originalName, req.file.size, slides.length, JSON.stringify(slides));

    res.json({
      success: true,
      presentation: {
        id: presId,
        filename: originalName,
        slide_count: slides.length
      },
      slides,
      suggestedQuestions
    });
  } catch (error) {
    console.error('Error handling section presentation upload:', error);
    res.status(500).json({ error: error.message || 'Failed to process presentation.' });
  }
});

// Stream/download raw PPTX file for in-browser exact presentation projection
router.get('/presentation/:presentationId/file', (req, res) => {
  try {
    const { presentationId } = req.params;
    const presentation = db.prepare('SELECT id, filename, original_name FROM session_presentations WHERE id = ?').get(presentationId);
    if (!presentation) {
      return res.status(404).json({ error: 'Presentation not found.' });
    }

    const filePath = path.join(getUploadsDir(), `${presentationId}.pptx`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Presentation file not found on disk.' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(presentation.filename)}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error streaming presentation file:', error);
    res.status(500).json({ error: 'Failed to retrieve presentation file.' });
  }
});

// Get lecture preparation drafts & presentation for a section
router.get('/section/:sectionId/drafts', authenticate, (req, res) => {
  try {
    const { sectionId } = req.params;
    const presentation = db.prepare(`
      SELECT id, filename, original_name, file_size, slide_count, extracted_slides_json, created_at 
      FROM session_presentations 
      WHERE section_id = ? 
      ORDER BY created_at DESC LIMIT 1
    `).get(sectionId);

    let slides = [];
    if (presentation?.extracted_slides_json) {
      try {
        slides = JSON.parse(presentation.extracted_slides_json);
      } catch (e) {}
    }

    const draftPrompts = db.prepare(`
      SELECT * FROM session_prompts 
      WHERE section_id = ? AND status = 'draft' 
      ORDER BY created_at ASC
    `).all(sectionId);

    const formattedDrafts = draftPrompts.map(p => ({
      ...p,
      options: JSON.parse(p.options_json)
    }));

    res.json({
      presentation: presentation || null,
      slides,
      drafts: formattedDrafts
    });
  } catch (error) {
    console.error('Error fetching section drafts:', error);
    res.status(500).json({ error: 'Failed to fetch section lecture drafts' });
  }
});

// Save prepared recap questions for a section in advance
router.post('/section/:sectionId/drafts', authenticate, authorize('instructor', 'admin'), (req, res) => {
  try {
    const { sectionId } = req.params;
    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required.' });
    }

    const section = (req.user.role === 'admin')
      ? db.prepare('SELECT id FROM sections WHERE id = ?').get(sectionId)
      : db.prepare('SELECT id FROM sections WHERE id = ? AND instructor_id = ?').get(sectionId, req.user.id);
    if (!section) {
      return res.status(403).json({ error: 'Invalid or unauthorized section.' });
    }

    // Check if there is an active class session currently open for this section
    const activeSession = db.prepare("SELECT id FROM class_sessions WHERE section_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(sectionId);
    const targetSessionId = activeSession ? activeSession.id : null;

    // Clear existing drafts for this section (or active session)
    db.prepare("DELETE FROM session_prompts WHERE (section_id = ? OR session_id = ?) AND status = 'draft'").run(sectionId, targetSessionId || '');

    const insertPrompt = db.prepare(`
      INSERT INTO session_prompts (id, section_id, session_id, group_id, question_text, image_url, options_json, correct_option, time_limit_seconds, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    const groupId = uuidv4().substring(0, 8);
    let count = 0;
    questions.forEach((q) => {
      if (!q.question_text || !q.options || !q.correct_option) return;
      insertPrompt.run(
        uuidv4(),
        sectionId,
        targetSessionId,
        groupId,
        q.question_text,
        q.image_url || null,
        JSON.stringify(q.options),
        q.correct_option,
        parseInt(q.time_limit_seconds) || 20
      );
      count++;
    });

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error saving section draft prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to save section recap questions.' });
  }
});


// Save prepared recap questions in advance
router.post('/session/:sessionId/drafts', authenticate, authorize('instructor'), (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required.' });
    }

    const session = db.prepare('SELECT id FROM class_sessions WHERE id = ? AND instructor_id = ?').get(sessionId, req.user.id);
    if (!session) {
      return res.status(403).json({ error: 'Invalid or unauthorized session.' });
    }

    // Clear existing drafts for this session
    db.prepare("DELETE FROM session_prompts WHERE session_id = ? AND status = 'draft'").run(sessionId);

    const insertPrompt = db.prepare(`
      INSERT INTO session_prompts (id, session_id, group_id, question_text, image_url, options_json, correct_option, time_limit_seconds, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    const groupId = uuidv4().substring(0, 8);
    questions.forEach((q) => {
      if (!q.question_text || !q.options || !q.correct_option) return;
      insertPrompt.run(
        uuidv4(),
        sessionId,
        groupId,
        q.question_text,
        q.image_url || null,
        JSON.stringify(q.options),
        q.correct_option,
        parseInt(q.time_limit_seconds) || 20
      );
    });

    res.json({ success: true, count: questions.length });
  } catch (error) {
    console.error('Error saving draft prompts:', error);
    res.status(500).json({ error: 'Failed to save recap questions in advance.' });
  }
});

// Delete all draft recap questions
router.delete('/session/:sessionId/drafts', authenticate, authorize('instructor'), (req, res) => {
  try {
    const { sessionId } = req.params;
    db.prepare("DELETE FROM session_prompts WHERE session_id = ? AND status = 'draft'").run(sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear draft prompts.' });
  }
});


// Get active prompt for a session (for students joining late)
router.get('/session/:sessionId/active', authenticate, (req, res) => {
  try {
    const { sessionId } = req.params;
    const prompt = db.prepare(`
      SELECT * FROM session_prompts 
      WHERE session_id = ? AND status = 'active'
    `).get(sessionId);

    if (!prompt) return res.json({ prompt: null });

    const response = {
      ...prompt,
      options: JSON.parse(prompt.options_json),
      end_time: prompt.end_time
    };
    delete response.correct_option;
    delete response.options_json;

    res.json({ prompt: response });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Launch a prompt - also accepts is_last flag to know if leaderboard should follow
router.post('/session/:sessionId/launch', authenticate, authorize('instructor'), (req, res) => {
  try {
    const { sessionId } = req.params;
    const { question_text, options, correct_option, time_limit_seconds, image_url, group_id, is_last } = req.body;

    const session = db.prepare('SELECT id FROM class_sessions WHERE id = ? AND instructor_id = ? AND status = ?').get(sessionId, req.user.id, 'active');
    if (!session) {
      return res.status(403).json({ error: 'Invalid or inactive session.' });
    }

    const promptId = uuidv4();
    const optionsJson = JSON.stringify(options);
    const timeLimitSec = parseInt(time_limit_seconds) || 20;
    const endTime = Date.now() + (timeLimitSec * 1000);

    db.prepare(`
      INSERT INTO session_prompts (id, session_id, group_id, question_text, image_url, options_json, correct_option, time_limit_seconds, status, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(promptId, sessionId, group_id || null, question_text, image_url || null, optionsJson, correct_option, timeLimitSec, endTime);

    broadcastSessionEvent(sessionId, 'prompt:start', {
      id: promptId,
      group_id: group_id || null,
      question_text,
      image_url: image_url || null,
      options,
      time_limit_seconds: timeLimitSec,
      end_time: endTime,
      is_last: !!is_last
    });

    // Auto-close after time limit + 1s buffer
    setTimeout(() => {
      const current = db.prepare("SELECT status FROM session_prompts WHERE id = ?").get(promptId);
      if (current && current.status === 'active') {
        closePrompt(promptId, sessionId, !!is_last);
      }
    }, (timeLimitSec * 1000) + 1000);

    res.json({ success: true, promptId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to launch prompt' });
  }
});

// Instructor manually ends prompt early
router.post('/session/:sessionId/prompt/:promptId/close', authenticate, authorize('instructor'), (req, res) => {
  try {
    const { sessionId, promptId } = req.params;
    const { is_last } = req.body;

    const session = db.prepare('SELECT id FROM class_sessions WHERE id = ? AND instructor_id = ?').get(sessionId, req.user.id);
    if (!session) return res.status(403).json({ error: 'Unauthorized' });

    const prompt = db.prepare('SELECT status FROM session_prompts WHERE id = ?').get(promptId);
    if (prompt && prompt.status === 'active') {
      closePrompt(promptId, sessionId, !!is_last);
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to close prompt early' });
  }
});

// Internal: close a prompt, reveal answer, optionally fire leaderboard
function closePrompt(promptId, sessionId, isLast = false) {
  try {
    db.prepare("UPDATE session_prompts SET status = 'completed' WHERE id = ?").run(promptId);

    // Tally votes
    const statsRow = db.prepare(`
      SELECT selected_option, COUNT(*) as count 
      FROM prompt_responses 
      WHERE prompt_id = ? 
      GROUP BY selected_option
    `).all(promptId);

    const stats = {};
    statsRow.forEach(row => { stats[row.selected_option] = row.count; });

    const prompt = db.prepare('SELECT * FROM session_prompts WHERE id = ?').get(promptId);

    // Reveal the correct answer to everyone
    broadcastSessionEvent(sessionId, 'prompt:reveal', {
      promptId,
      correctOption: prompt.correct_option,
      stats
    });

    // Only fire leaderboard if this is explicitly the last question
    if (isLast) {
      setTimeout(() => {
        const leaderboard = buildLeaderboard(sessionId);
        broadcastSessionEvent(sessionId, 'prompt:leaderboard', { leaderboard });
      }, 8000); // 8s so students can see the final answer reveal
    }
  } catch (e) {
    console.error("Error closing prompt:", e);
  }
}

// Build top-10 leaderboard for the session
function buildLeaderboard(sessionId) {
  try {
    const promptIds = db.prepare(`SELECT id FROM session_prompts WHERE session_id = ?`)
      .all(sessionId).map(r => r.id);

    if (promptIds.length === 0) return [];

    const placeholders = promptIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT u.id, u.name, u.avatar_url, u.id_number,
             COALESCE(SUM(pr.points_awarded), 0) as total_points,
             COUNT(CASE WHEN pr.is_correct = 1 THEN 1 END) as correct_count,
             COUNT(pr.id) as answered_count
      FROM prompt_responses pr
      JOIN users u ON pr.student_id = u.id
      WHERE pr.prompt_id IN (${placeholders})
      GROUP BY u.id
      ORDER BY total_points DESC, correct_count DESC
      LIMIT 10
    `).all(...promptIds);
  } catch (e) {
    console.error("Error building leaderboard:", e);
    return [];
  }
}

// Student submits an answer
router.post('/:promptId/submit', authenticate, (req, res) => {
  try {
    const { promptId } = req.params;
    const { selectedOption } = req.body;
    const studentId = req.user.id;

    if (req.user.role === 'instructor' || req.user.role === 'admin') {
      return res.status(403).json({ error: 'Instructors cannot participate in Quick Recap.' });
    }

    const prompt = db.prepare('SELECT * FROM session_prompts WHERE id = ?').get(promptId);
    if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
    if (prompt.status !== 'active') return res.status(400).json({ error: 'Prompt is no longer active' });

    const isCorrect = prompt.correct_option === selectedOption;
    let points = 0;

    if (isCorrect) {
      const maxTime = prompt.time_limit_seconds * 1000;
      const startTime = prompt.end_time - maxTime;
      const timeTaken = Math.max(0, Math.min(Date.now() - startTime, maxTime));
      // Kahoot-style scoring: 50 base + up to 50 speed bonus
      points = 50 + Math.round(50 * (1 - timeTaken / maxTime));
    }

    try {
      db.prepare(`
        INSERT INTO prompt_responses (id, prompt_id, student_id, selected_option, is_correct, points_awarded)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), promptId, studentId, selectedOption, isCorrect ? 1 : 0, points);

      if (points > 0) {
        db.prepare(`UPDATE users SET total_xp = total_xp + ? WHERE id = ?`).run(points, studentId);
      }
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Already answered' });
      }
      throw e;
    }

    const totalPresent = db.prepare(`
      SELECT COUNT(*) as count FROM attendance_records 
      WHERE session_id = ? AND status IN ('present', 'late')
    `).get(prompt.session_id).count;
    const answeredCount = db.prepare(`SELECT COUNT(*) as count FROM prompt_responses WHERE prompt_id = ?`).get(promptId).count;

    broadcastSessionEvent(prompt.session_id, 'prompt:update', { answeredCount, totalPresent });

    res.json({ success: true, isCorrect, points });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

export default router;
