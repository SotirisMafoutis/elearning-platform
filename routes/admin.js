const express = require('express');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

//  ΕΓΚΡΙΣΗ ΕΚΠΑΙΔΕΥΤΩΝ 
router.get('/instructors/pending', (req, res) => {
  res.json(db.prepare(`SELECT id, full_name, email, created_at FROM users WHERE role='instructor' AND is_approved=0`).all());
});

router.get('/instructors', (req, res) => {
  res.json(db.prepare(`SELECT id, full_name, email, is_approved, created_at FROM users WHERE role='instructor' ORDER BY created_at DESC`).all());
});

router.post('/instructors/:id/approve', (req, res) => {
  const info = db.prepare(`UPDATE users SET is_approved=1 WHERE id=? AND role='instructor'`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ο εκπαιδευτής δεν βρέθηκε.' });
  res.json({ message: 'Ο εκπαιδευτής εγκρίθηκε.' });
});

router.post('/instructors/:id/reject', (req, res) => {
  const info = db.prepare(`DELETE FROM users WHERE id=? AND role='instructor' AND is_approved=0`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Ο εκπαιδευτής δεν βρέθηκε ή είναι ήδη εγκεκριμένος.' });
  res.json({ message: 'Η αίτηση απορρίφθηκε.' });
});

//  ΕΓΚΡΙΣΗ ΔΗΜΟΣΙΕΥΣΗΣ ΜΑΘΗΜΑΤΩΝ 
router.get('/courses/pending', (req, res) => {
  res.json(db.prepare(`SELECT c.*, u.full_name AS instructor_name FROM courses c
                        JOIN users u ON u.id=c.instructor_id WHERE c.status='pending' ORDER BY c.created_at`).all());
});

router.post('/courses/:id/approve', (req, res) => {
  const info = db.prepare(`UPDATE courses SET status='published' WHERE id=? AND status='pending'`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε ή δεν είναι σε αναμονή έγκρισης.' });
  res.json({ message: 'Το μάθημα εγκρίθηκε και δημοσιεύτηκε.' });
});

router.post('/courses/:id/reject', (req, res) => {
  const info = db.prepare(`UPDATE courses SET status='rejected' WHERE id=? AND status='pending'`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε ή δεν είναι σε αναμονή έγκρισης.' });
  res.json({ message: 'Το μάθημα απορρίφθηκε.' });
});

//  ΚΑΤΗΓΟΡΙΕΣ 
router.post('/categories', (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Το όνομα κατηγορίας είναι υποχρεωτικό.' });
  try {
    const info = db.prepare('INSERT INTO categories (name, description) VALUES (?,?)').run(name, description || '');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Η κατηγορία υπάρχει ήδη.' });
  }
});

router.put('/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Η κατηγορία δεν βρέθηκε.' });
  const { name, description } = req.body || {};
  db.prepare('UPDATE categories SET name=?, description=? WHERE id=?').run(name ?? cat.name, description ?? cat.description, cat.id);
  res.json({ message: 'Η κατηγορία ενημερώθηκε.' });
});

router.delete('/categories/:id', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) c FROM courses WHERE category_id=?').get(req.params.id).c;
  if (inUse > 0) return res.status(400).json({ error: 'Η κατηγορία χρησιμοποιείται από υπάρχοντα μαθήματα και δεν μπορεί να διαγραφεί.' });
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ message: 'Η κατηγορία διαγράφηκε.' });
});

//  ΠΡΟΤΥΠΑ ΠΙΣΤΟΠΟΙΗΤΙΚΩΝ 
router.get('/certificate-templates', (req, res) => {
  res.json(db.prepare('SELECT * FROM certificate_templates ORDER BY id').all());
});

router.post('/certificate-templates', (req, res) => {
  const { name, title_text, body_text, is_default } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Το όνομα προτύπου είναι υποχρεωτικό.' });
  const id = db.transaction(() => {
    if (is_default) db.prepare('UPDATE certificate_templates SET is_default=0').run();
    return db.prepare(`INSERT INTO certificate_templates (name, title_text, body_text, is_default) VALUES (?,?,?,?)`)
      .run(name, title_text || 'Πιστοποιητικό Ολοκλήρωσης', body_text || '', is_default ? 1 : 0).lastInsertRowid;
  })();
  res.status(201).json({ id });
});

router.put('/certificate-templates/:id', (req, res) => {
  const tpl = db.prepare('SELECT * FROM certificate_templates WHERE id=?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Το πρότυπο δεν βρέθηκε.' });
  const { name, title_text, body_text, is_default } = req.body || {};
  db.transaction(() => {
    if (is_default) db.prepare('UPDATE certificate_templates SET is_default=0').run();
    db.prepare('UPDATE certificate_templates SET name=?, title_text=?, body_text=?, is_default=? WHERE id=?')
      .run(name ?? tpl.name, title_text ?? tpl.title_text, body_text ?? tpl.body_text, is_default ? 1 : tpl.is_default, tpl.id);
  })();
  res.json({ message: 'Το πρότυπο ενημερώθηκε.' });
});

router.delete('/certificate-templates/:id', (req, res) => {
  db.prepare('DELETE FROM certificate_templates WHERE id=?').run(req.params.id);
  res.json({ message: 'Το πρότυπο διαγράφηκε.' });
});

//  ΣΤΑΤΙΣΤΙΚΑ ΠΛΑΤΦΟΡΜΑΣ 
router.get('/stats', (req, res) => {
  const courses = db.prepare(`SELECT id, title FROM courses WHERE status='published'`).all();

  const overview = courses.map(course => {
    const totalEnrollments = db.prepare('SELECT COUNT(*) c FROM enrollments WHERE course_id=?').get(course.id).c;
    const completed = db.prepare('SELECT COUNT(*) c FROM enrollments WHERE course_id=? AND completed_at IS NOT NULL').get(course.id).c;
    const modules = db.prepare('SELECT id, title, order_index FROM modules WHERE course_id=? ORDER BY order_index').all(course.id);

    const funnel = modules.map(m => {
      const reached = db.prepare(`SELECT COUNT(*) c FROM module_progress mp JOIN enrollments e ON e.id=mp.enrollment_id
                                   WHERE e.course_id=? AND mp.module_id=? AND mp.completed=1`).get(course.id, m.id).c;
      return { module_id: m.id, title: m.title, reached };
    });

    let dropoutModule = null, maxDrop = -1, prevReached = totalEnrollments;
    funnel.forEach(f => {
      const drop = prevReached - f.reached;
      if (drop > maxDrop) { maxDrop = drop; dropoutModule = f.title; }
      prevReached = f.reached;
    });

    return {
      course_id: course.id,
      title: course.title,
      total_enrollments: totalEnrollments,
      completion_rate: totalEnrollments ? Math.round((completed / totalEnrollments) * 1000) / 10 : 0,
      funnel,
      dropout_point: totalEnrollments > 0 && maxDrop > 0 ? dropoutModule : null
    };
  });

  res.json(overview);
});

module.exports = router;
