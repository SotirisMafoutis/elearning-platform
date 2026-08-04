const express = require('express');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkAndCompleteCourse } = require('../utils/progress');

const router = express.Router();

//  ΚΑΤΗΓΟΡΙΕΣ 
router.get('/categories', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

//  ΑΝΑΖΗΤΗΣΗ / ΛΙΣΤΑ ΜΑΘΗΜΑΤΩΝ 
router.get('/courses', authenticate, (req, res) => {
  const { category_id, search, mine } = req.query;
  let sql = `SELECT c.*, cat.name AS category_name, u.full_name AS instructor_name
             FROM courses c
             LEFT JOIN categories cat ON cat.id = c.category_id
             JOIN users u ON u.id = c.instructor_id
             WHERE 1=1`;
  const params = [];

  if (req.user.role === 'learner') {
    sql += ` AND c.status = 'published'`;
  } else if (req.user.role === 'instructor') {
    if (mine === 'true') {
      sql += ` AND c.instructor_id = ?`;
      params.push(req.user.id);
    } else {
      sql += ` AND (c.status = 'published' OR c.instructor_id = ?)`;
      params.push(req.user.id);
    }
  } // ο διαχειριστής βλέπει τα πάντα

  if (category_id) { sql += ' AND c.category_id = ?'; params.push(category_id); }
  if (search) { sql += ' AND (c.title LIKE ? OR c.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY c.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

//  ΛΕΠΤΟΜΕΡΕΙΕΣ ΜΑΘΗΜΑΤΟΣ 
router.get('/courses/:id', authenticate, (req, res) => {
  const course = db.prepare(`
    SELECT c.*, 
      cat.name AS category_name, 
      u.full_name AS instructor_name
    FROM courses c 
    LEFT JOIN categories cat ON cat.id = c.category_id
    JOIN users u ON u.id = c.instructor_id 
    WHERE c.id = ?`
  ).get(req.params.id);
  
  if (!course) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });

  const isOwner = req.user.role === 'instructor' && course.instructor_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (course.status !== 'published' && !isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Το μάθημα δεν είναι διαθέσιμο.' });
  }

  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index').all(course.id);
  const quizzes = db.prepare('SELECT id, title, time_limit_seconds, passing_score, module_id FROM quizzes WHERE course_id = ?').all(course.id);

  let enrollment = null, progress = [];
  if (req.user.role === 'learner') {
    enrollment = db.prepare(`
      SELECT * 
      FROM enrollments 
      WHERE user_id=? AND course_id=?`
    ).get(req.user.id, course.id);

    if (enrollment) {
      progress = db.prepare(`
        SELECT module_id, 
          completed, 
          completed_at 
        FROM module_progress 
        WHERE enrollment_id=?`
      ).all(enrollment.id);
    }
  }

  res.json({ ...course, modules, quizzes, enrollment, progress });
});

//  ΔΗΜΙΟΥΡΓΙΑ / ΕΠΕΞΕΡΓΑΣΙΑ ΜΑΘΗΜΑΤΟΣ (Εκπαιδευτής) 
router.post('/courses', authenticate, requireRole('instructor'), (req, res) => {
  if (!req.user.is_approved) return res.status(403).json({ error: 'Ο λογαριασμός σας δεν έχει εγκριθεί ακόμη από τον διαχειριστή.' });
  const { title, description, category_id, prerequisites } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Ο τίτλος μαθήματος είναι υποχρεωτικός.' });
  const info = db.prepare(`
    INSERT INTO courses (title, description, category_id, instructor_id, prerequisites, status)
    VALUES (?,?,?,?,?,'draft')`
  ).run(title, description || '', category_id || null, req.user.id, prerequisites || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/courses/:id', authenticate, requireRole('instructor'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  
  if (!course || course.instructor_id !== req.user.id) {
    return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  }

  if (!['draft', 'rejected'].includes(course.status)) {
    return res.status(400).json({ error: 'Μπορείτε να επεξεργαστείτε μαθήματα μόνο όσο είναι σε πρόχειρη κατάσταση.' });
  }
  const { title, description, category_id, prerequisites } = req.body || {};
  db.prepare(`UPDATE courses SET title=?, description=?, category_id=?, prerequisites=?, status='draft' WHERE id=?`)
    .run(title || course.title, description ?? course.description, category_id ?? course.category_id, prerequisites ?? course.prerequisites, course.id);
  res.json({ message: 'Το μάθημα ενημερώθηκε.' });
});

router.post('/courses/:id/submit', authenticate, requireRole('instructor'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  
  if (!course || course.instructor_id !== req.user.id) {
      return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  }

  const moduleCount = db.prepare('SELECT COUNT(*) c FROM modules WHERE course_id=?').get(course.id).c;
  
  if (moduleCount === 0){
    return res.status(400).json({ error: 'Προσθέστε τουλάχιστον μία ενότητα πριν την υποβολή για έγκριση.' });
  } 
  db.prepare(`
    UPDATE courses 
    SET status='pending' 
    WHERE id=?`
  ).run(course.id);
  res.json({ message: 'Το μάθημα υποβλήθηκε για έγκριση από τον διαχειριστή.' });
});

router.delete('/courses/:id', authenticate, requireRole('instructor'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!course || course.instructor_id !== req.user.id){
    return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  } 
  db.prepare('DELETE FROM courses WHERE id=?').run(course.id);
  res.json({ message: 'Το μάθημα διαγράφηκε.' });
});

//  ΕΝΟΤΗΤΕΣ 
router.post('/courses/:id/modules', authenticate, requireRole('instructor'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!course || course.instructor_id !== req.user.id){
    return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' });
  } 
  const { title, video_url, notes } = req.body || {};
  if (!title){
    return res.status(400).json({ error: 'Ο τίτλος ενότητας είναι υποχρεωτικός.' });
  } 
  const nextOrder = db.prepare(`
    SELECT COALESCE(MAX(order_index),0)+1 n 
    FROM modules 
    WHERE course_id=?`
  ).get(course.id).n;

  const info = db.prepare('INSERT INTO modules (course_id, title, order_index, video_url, notes) VALUES (?,?,?,?,?)')
    .run(course.id, title, nextOrder, video_url || '', notes || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/modules/:id', authenticate, requireRole('instructor'), (req, res) => {
  const mod = db.prepare('SELECT m.*, c.instructor_id FROM modules m JOIN courses c ON c.id=m.course_id WHERE m.id=?').get(req.params.id);
  if (!mod || mod.instructor_id !== req.user.id){
    return res.status(404).json({ error: 'Η ενότητα δεν βρέθηκε.' });
  } 
  const { title, order_index, video_url, notes } = req.body || {};
  db.prepare('UPDATE modules SET title=?, order_index=?, video_url=?, notes=? WHERE id=?')
    .run(title ?? mod.title, order_index ?? mod.order_index, video_url ?? mod.video_url, notes ?? mod.notes, mod.id);
  res.json({ message: 'Η ενότητα ενημερώθηκε.' });
});

router.delete('/modules/:id', authenticate, requireRole('instructor'), (req, res) => {
  const mod = db.prepare('SELECT m.*, c.instructor_id FROM modules m JOIN courses c ON c.id=m.course_id WHERE m.id=?').get(req.params.id);
  if (!mod || mod.instructor_id !== req.user.id) return res.status(404).json({ error: 'Η ενότητα δεν βρέθηκε.' });
  db.prepare('DELETE FROM modules WHERE id=?').run(mod.id);
  res.json({ message: 'Η ενότητα διαγράφηκε.' });
});

//  ΕΓΓΡΑΦΗ ΣΕ ΜΑΘΗΜΑ 
router.post('/courses/:id/enroll', authenticate, requireRole('learner'), (req, res) => {
  const course = db.prepare(`
    SELECT * 
    FROM courses 
    WHERE id=? AND status='published'`
  ).get(req.params.id);

  if (!course){
    return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε ή δεν είναι διαθέσιμο.' });
  } 
  
  const existing = db.prepare(`
    SELECT id 
    FROM enrollments 
    WHERE user_id=? AND course_id=?`
  ).get(req.user.id, course.id);
  
  if (existing){
    return res.status(409).json({ error: 'Είστε ήδη εγγεγραμμένος/η σε αυτό το μάθημα.' });
  } 
  const info = db.prepare(`
    INSERT INTO enrollments (
      user_id, course_id
    ) VALUES (?,?)`
  ).run(req.user.id, course.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

//  ΣΗΜΑΝΣΗ ΟΛΟΚΛΗΡΩΣΗΣ ΕΝΟΤΗΤΑΣ (σειριακά) 
router.post('/modules/:id/complete', authenticate, requireRole('learner'), (req, res) => {
  const mod = db.prepare('SELECT * FROM modules WHERE id=?').get(req.params.id);
  
  if (!mod){
    return res.status(404).json({ error: 'Η ενότητα δεν βρέθηκε.' });
  } 
  
  const enrollment = db.prepare(`
    SELECT * 
    FROM enrollments 
    WHERE user_id=? AND course_id=?`
  ).get(req.user.id, mod.course_id);

  if (!enrollment){
    return res.status(403).json({ error: 'Δεν είστε εγγεγραμμένος/η σε αυτό το μάθημα.' });
  } 

  const modules = db.prepare(`
    SELECT * 
    FROM modules 
    WHERE course_id=? 
    ORDER BY order_index`
  ).all(mod.course_id);

  const idx = modules.findIndex(m => m.id === mod.id);
  if (idx > 0) {
    const prev = db.prepare(`
      SELECT completed 
      FROM module_progress 
      WHERE enrollment_id=? AND module_id=?`
    ).get(enrollment.id, modules[idx - 1].id);
    if (!prev || !prev.completed) {
      return res.status(400).json({ error: 'Πρέπει πρώτα να ολοκληρώσετε την προηγούμενη ενότητα.' });
    }
  }

  db.prepare(`INSERT INTO module_progress (
      enrollment_id, 
      module_id, 
      completed, 
      completed_at
    )VALUES (?,?,1, datetime('now'))
    ON CONFLICT(
      enrollment_id, 
      module_id) 
    DO UPDATE 
      SET completed=1, completed_at=datetime('now')`
    ).run(enrollment.id, mod.id);

  const courseCompleted = checkAndCompleteCourse(enrollment.id);
  res.json({ message: 'Η ενότητα ολοκληρώθηκε.', courseCompleted });
});

//  ΠΡΟΣΩΠΙΚΟΣ ΠΙΝΑΚΑΣ ΕΚΠΑΙΔΕΥΟΜΕΝΟΥ 
router.get('/me/enrollments', authenticate, requireRole('learner'), (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, c.title,
      (SELECT COUNT(*) FROM modules WHERE course_id=c.id) AS total_modules,
      (SELECT COUNT(*) FROM module_progress mp WHERE mp.enrollment_id=e.id AND mp.completed=1) AS done_modules
    FROM enrollments e 
    JOIN courses c ON c.id=e.course_id
    WHERE e.user_id=? ORDER BY e.enrolled_at DESC`
  ).all(req.user.id);

  res.json(rows.map(r => ({ ...r, progress_pct: r.total_modules ? Math.round((r.done_modules / r.total_modules) * 100) : 0 })));
});

router.get('/me/dashboard', authenticate, requireRole('learner'), (req, res) => {
  const enrollments = db.prepare(`
    SELECT e.*, c.title,
      (SELECT COUNT(*) FROM modules WHERE course_id=c.id) AS total_modules,
      (SELECT COUNT(*) FROM module_progress mp WHERE mp.enrollment_id=e.id AND mp.completed=1) AS done_modules
    FROM enrollments e 
    JOIN courses c ON c.id=e.course_id 
    WHERE e.user_id=?`
  ).all(req.user.id);

  const avgScoreRow = db.prepare(`
    SELECT AVG(score) avg 
    FROM quiz_attempts 
    WHERE user_id=? AND submitted_at IS NOT NULL`
  ).get(req.user.id);
  
  const certificates = db.prepare(`
    SELECT cert.*, 
    c.title AS course_title 
    FROM certificates cert
    JOIN courses c ON c.id=cert.course_id 
    WHERE cert.user_id=?`
  ).all(req.user.id);

  res.json({
    courses: enrollments.map(r => ({ ...r, progress_pct: r.total_modules ? Math.round((r.done_modules / r.total_modules) * 100) : 0 })),
    average_quiz_score: avgScoreRow.avg ? Math.round(avgScoreRow.avg * 10) / 10 : null,
    certificates
  });
});

module.exports = router;
