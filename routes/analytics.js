const express = require('express');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/courses/:id/analytics', authenticate, requireRole('instructor', 'admin'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
    return res.status(403).json({ error: 'Δεν έχετε πρόσβαση σε αυτό το μάθημα.' });
  }

  const questions = db.prepare('SELECT * FROM questions WHERE course_id=?').all(course.id);
  const questionStats = questions.map(q => {
    const answers = db.prepare(`SELECT qa.* FROM quiz_answers qa JOIN quiz_attempts att ON att.id=qa.attempt_id
                                 WHERE qa.question_id=? AND att.submitted_at IS NOT NULL`).all(q.id);
    const total = answers.length;
    const correct = answers.filter(a => a.is_correct).length;
    return {
      question_id: q.id,
      question_text: q.question_text,
      type: q.type,
      attempts: total,
      success_rate: total ? Math.round((correct / total) * 1000) / 10 : null,
      // Κλασικός δείκτης δυσκολίας (p-value): αναλογία σωστών απαντήσεων. Χαμηλότερη τιμή = πιο δύσκολη ερώτηση.
      difficulty_index: total ? Math.round((correct / total) * 100) / 100 : null
    };
  });

  const learners = db.prepare(`SELECT u.id, u.full_name, e.id AS enrollment_id, e.completed_at
                                FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=?`).all(course.id);
  const totalModules = db.prepare('SELECT COUNT(*) c FROM modules WHERE course_id=?').get(course.id).c;

  const learnerStats = learners.map(l => {
    const doneModules = db.prepare('SELECT COUNT(*) c FROM module_progress WHERE enrollment_id=? AND completed=1').get(l.enrollment_id).c;
    const avgScore = db.prepare(`SELECT AVG(score) a FROM quiz_attempts att JOIN quizzes z ON z.id=att.quiz_id
                                  WHERE z.course_id=? AND att.user_id=? AND att.submitted_at IS NOT NULL`).get(course.id, l.id);
    const lastQuiz = db.prepare(`SELECT MAX(att.submitted_at) last FROM quiz_attempts att JOIN quizzes z ON z.id=att.quiz_id
                                  WHERE z.course_id=? AND att.user_id=? AND att.submitted_at IS NOT NULL`).get(course.id, l.id);
    return {
      learner_id: l.id,
      full_name: l.full_name,
      progress_pct: totalModules ? Math.round((doneModules / totalModules) * 100) : 0,
      average_score: avgScore.a !== null ? Math.round(avgScore.a * 10) / 10 : null,
      last_quiz_at: lastQuiz.last,
      completed: !!l.completed_at
    };
  });

  res.json({ questionStats, learnerStats });
});

module.exports = router;
