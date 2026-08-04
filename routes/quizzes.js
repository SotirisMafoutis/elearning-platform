const express = require('express');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkAndCompleteCourse } = require('../utils/progress');

const router = express.Router();

function ensureOwnCourse(courseId, instructorId) {
  return db.prepare('SELECT * FROM courses WHERE id=? AND instructor_id=?').get(courseId, instructorId);
}

//  ΤΡΑΠΕΖΑ ΕΡΩΤΗΣΕΩΝ 
router.get('/courses/:id/questions', authenticate, requireRole('instructor', 'admin'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
    return res.status(403).json({ error: 'Δεν έχετε πρόσβαση σε αυτό το μάθημα.' });
  }
  const questions = db.prepare('SELECT * FROM questions WHERE course_id=? ORDER BY id DESC').all(course.id);
  const options = db.prepare(`SELECT * FROM question_options WHERE question_id IN
                               (SELECT id FROM questions WHERE course_id=?) ORDER BY order_index`).all(course.id);
  const byQ = {};
  options.forEach(o => { (byQ[o.question_id] ||= []).push(o); });
  res.json(questions.map(q => ({ ...q, options: byQ[q.id] || [] })));
});

router.post('/courses/:id/questions', authenticate, requireRole('instructor'), (req, res) => {
  const course = ensureOwnCourse(req.params.id, req.user.id);
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  const { type, question_text, weight, explanation, module_id, options } = req.body || {};
  if (!['multiple_choice', 'true_false', 'matching'].includes(type) || !question_text || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Συμπληρώστε τύπο, εκφώνηση και τουλάχιστον δύο επιλογές/ζεύγη.' });
  }
  const insertQ = db.prepare(`INSERT INTO questions (course_id, module_id, type, question_text, weight, explanation) VALUES (?,?,?,?,?,?)`);
  const insertOpt = db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, match_key, side, order_index) VALUES (?,?,?,?,?,?)`);
  const id = db.transaction(() => {
    const info = insertQ.run(course.id, module_id || null, type, question_text, weight || 1, explanation || '');
    options.forEach((opt, i) => {
      insertOpt.run(info.lastInsertRowid, opt.option_text, opt.is_correct ? 1 : 0, opt.match_key || null, opt.side || null, i);
    });
    return info.lastInsertRowid;
  })();
  res.status(201).json({ id });
});

router.put('/questions/:id', authenticate, requireRole('instructor'), (req, res) => {
  const q = db.prepare('SELECT q.*, c.instructor_id FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.id=?').get(req.params.id);
  if (!q || q.instructor_id !== req.user.id) return res.status(404).json({ error: 'Η ερώτηση δεν βρέθηκε.' });
  const { question_text, weight, explanation, options } = req.body || {};
  db.transaction(() => {
    db.prepare('UPDATE questions SET question_text=?, weight=?, explanation=? WHERE id=?')
      .run(question_text ?? q.question_text, weight ?? q.weight, explanation ?? q.explanation, q.id);
    if (Array.isArray(options)) {
      db.prepare('DELETE FROM question_options WHERE question_id=?').run(q.id);
      const insertOpt = db.prepare(`INSERT INTO question_options (question_id, option_text, is_correct, match_key, side, order_index) VALUES (?,?,?,?,?,?)`);
      options.forEach((opt, i) => insertOpt.run(q.id, opt.option_text, opt.is_correct ? 1 : 0, opt.match_key || null, opt.side || null, i));
    }
  })();
  res.json({ message: 'Η ερώτηση ενημερώθηκε.' });
});

router.delete('/questions/:id', authenticate, requireRole('instructor'), (req, res) => {
  const q = db.prepare('SELECT q.*, c.instructor_id FROM questions q JOIN courses c ON c.id=q.course_id WHERE q.id=?').get(req.params.id);
  if (!q || q.instructor_id !== req.user.id) return res.status(404).json({ error: 'Η ερώτηση δεν βρέθηκε.' });
  db.prepare('DELETE FROM questions WHERE id=?').run(q.id);
  res.json({ message: 'Η ερώτηση διαγράφηκε.' });
});

//  ΔΙΑΧΕΙΡΙΣΗ ΚΟΥΙΖ 
router.get('/courses/:id/quizzes', authenticate, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  if (req.user.role === 'learner') {
    const enrollment = db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id, course.id);
    if (!enrollment) return res.status(403).json({ error: 'Πρέπει να εγγραφείτε στο μάθημα.' });
  } else if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
    return res.status(403).json({ error: 'Δεν έχετε πρόσβαση.' });
  }
  res.json(db.prepare('SELECT id, title, time_limit_seconds, passing_score, module_id FROM quizzes WHERE course_id=?').all(course.id));
});

router.post('/courses/:id/quizzes', authenticate, requireRole('instructor'), (req, res) => {
  const course = ensureOwnCourse(req.params.id, req.user.id);
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  const { title, time_limit_seconds, passing_score, module_id, question_ids } = req.body || {};
  if (!title || !Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ error: 'Δώστε τίτλο κουίζ και επιλέξτε τουλάχιστον μία ερώτηση.' });
  }
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO quizzes (course_id, module_id, title, time_limit_seconds, passing_score) VALUES (?,?,?,?,?)`)
      .run(course.id, module_id || null, title, time_limit_seconds || 600, passing_score ?? 50);
    const insertQQ = db.prepare('INSERT INTO quiz_questions (quiz_id, question_id) VALUES (?,?)');
    question_ids.forEach(qid => insertQQ.run(info.lastInsertRowid, qid));
    return info.lastInsertRowid;
  })();
  res.status(201).json({ id });
});

router.delete('/quizzes/:id', authenticate, requireRole('instructor'), (req, res) => {
  const quiz = db.prepare('SELECT z.*, c.instructor_id FROM quizzes z JOIN courses c ON c.id=z.course_id WHERE z.id=?').get(req.params.id);
  if (!quiz || quiz.instructor_id !== req.user.id) return res.status(404).json({ error: 'Το κουίζ δεν βρέθηκε.' });
  db.prepare('DELETE FROM quizzes WHERE id=?').run(quiz.id);
  res.json({ message: 'Το κουίζ διαγράφηκε.' });
});

//  ΣΥΜΜΕΤΟΧΗ ΣΕ ΚΟΥΙΖ 
router.get('/quizzes/:id/take', authenticate, requireRole('learner'), (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Το κουίζ δεν βρέθηκε.' });
  const enrollment = db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id, quiz.course_id);
  if (!enrollment) return res.status(403).json({ error: 'Πρέπει να εγγραφείτε στο μάθημα πριν συμμετάσχετε στο κουίζ.' });

  const qIds = db.prepare('SELECT question_id FROM quiz_questions WHERE quiz_id=?').all(quiz.id).map(r => r.question_id);
  const questions = qIds.map(qid => {
    const q = db.prepare('SELECT id, type, question_text, weight FROM questions WHERE id=?').get(qid);
    const options = db.prepare('SELECT id, option_text, side, order_index FROM question_options WHERE question_id=? ORDER BY order_index').all(qid);
    return { ...q, options };
  });

  const attemptInfo = db.prepare('INSERT INTO quiz_attempts (user_id, quiz_id) VALUES (?,?)').run(req.user.id, quiz.id);

  res.json({
    attempt_id: attemptInfo.lastInsertRowid,
    quiz: { id: quiz.id, title: quiz.title, time_limit_seconds: quiz.time_limit_seconds, passing_score: quiz.passing_score, course_id: quiz.course_id },
    questions
  });
});

router.post('/quizzes/:id/submit', authenticate, requireRole('learner'), (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Το κουίζ δεν βρέθηκε.' });
  const { attempt_id, answers } = req.body || {};
  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id=? AND user_id=? AND quiz_id=?').get(attempt_id, req.user.id, quiz.id);
  if (!attempt) return res.status(404).json({ error: 'Η προσπάθεια δεν βρέθηκε.' });
  if (attempt.submitted_at) return res.status(400).json({ error: 'Η προσπάθεια έχει ήδη υποβληθεί.' });

  const qIds = db.prepare('SELECT question_id FROM quiz_questions WHERE quiz_id=?').all(quiz.id).map(r => r.question_id);
  let totalWeight = 0, earnedWeight = 0;
  const results = [];

  const score = db.transaction(() => {
    for (const qid of qIds) {
      const question = db.prepare('SELECT * FROM questions WHERE id=?').get(qid);
      const options = db.prepare('SELECT * FROM question_options WHERE question_id=?').all(qid);
      const given = (answers || []).find(a => a.question_id === qid) || {};
      totalWeight += question.weight;

      let isCorrect = false, earned = 0, extra = {};

      if (question.type === 'matching') {
        const lefts = options.filter(o => o.side === 'left');
        const rights = options.filter(o => o.side === 'right');
        const matches = Array.isArray(given.matches) ? given.matches : [];
        let correctPairs = 0;
        lefts.forEach(l => {
          const chosen = matches.find(m => m.left_option_id === l.id);
          const rightMatch = rights.find(r => r.match_key === l.match_key);
          if (chosen && rightMatch && chosen.right_option_id === rightMatch.id) correctPairs++;
        });
        const fraction = lefts.length ? correctPairs / lefts.length : 0;
        earned = question.weight * fraction;
        isCorrect = fraction === 1;
        extra = { correct_pairs: lefts.map(l => ({ left_option_id: l.id, right_option_id: (rights.find(r => r.match_key === l.match_key) || {}).id })) };
      } else {
        const correctIds = options.filter(o => o.is_correct).map(o => o.id).sort((a, b) => a - b);
        const selected = Array.isArray(given.selected_option_ids) ? [...given.selected_option_ids].sort((a, b) => a - b) : [];
        isCorrect = selected.length > 0 && JSON.stringify(selected) === JSON.stringify(correctIds);
        earned = isCorrect ? question.weight : 0;
        extra = { correct_option_ids: correctIds, selected_option_ids: selected };
      }

      earnedWeight += earned;
      db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, answer_json, is_correct, points_earned) VALUES (?,?,?,?,?)')
        .run(attempt.id, qid, JSON.stringify(given), isCorrect ? 1 : 0, earned);

      results.push({ question_id: qid, question_text: question.question_text, type: question.type, is_correct: isCorrect, explanation: question.explanation, options, ...extra });
    }
    const s = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 1000) / 10 : 0;
    db.prepare(`UPDATE quiz_attempts SET score=?, submitted_at=datetime('now') WHERE id=?`).run(s, attempt.id);
    return s;
  })();

  const enrollment = db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id, quiz.course_id);
  const courseCompleted = enrollment ? checkAndCompleteCourse(enrollment.id) : false;

  res.json({ score, passed: score >= quiz.passing_score, passing_score: quiz.passing_score, results, courseCompleted });
});

module.exports = router;
