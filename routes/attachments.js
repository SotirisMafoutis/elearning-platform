// Διαχείριση συνημμένων αρχείων μαθήματος (ανέβασμα, λίστα, προβολή/λήψη, διαγραφή).
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Επιτρεπόμενοι τύποι αρχείων: έγγραφα, εικόνες και συμπιεσμένα αρχεία μαθήματος.
// Εσκεμμένα αποκλείονται εκτελέσιμα/scripts (.exe, .js, .html, .svg κ.λπ.) για ασφάλεια.
const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.zip': 'application/zip',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB ανά αρχείο
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MIME_BY_EXT[ext]) return cb(new Error('Μη επιτρεπτός τύπος αρχείου.'));
    cb(null, true);
  },
});

// Επιστρέφει το μάθημα αν ο τρέχων χρήστης έχει δικαίωμα πρόσβασης σε αυτό, αλλιώς
// στέλνει το κατάλληλο σφάλμα και επιστρέφει null.
function ensureCourseAccess(req, res, courseId, requireInstructorOwner) {
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  if (!course) { res.status(404).json({ error: 'Το μάθημα δεν βρέθηκε.' }); return null; }
  const isOwner = req.user.role === 'instructor' && course.instructor_id === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (requireInstructorOwner) {
    if (!isOwner) { res.status(403).json({ error: 'Δεν έχετε πρόσβαση σε αυτό το μάθημα.' }); return null; }
    return course;
  }
  if (isOwner || isAdmin) return course;
  if (req.user.role === 'learner') {
    const enrollment = db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id, courseId);
    if (!enrollment) { res.status(403).json({ error: 'Πρέπει να εγγραφείτε στο μάθημα για να δείτε τα συνημμένα του.' }); return null; }
    return course;
  }
  res.status(403).json({ error: 'Δεν έχετε πρόσβαση.' });
  return null;
}

// ================= ΑΝΕΒΑΣΜΑ ΣΥΝΗΜΜΕΝΟΥ (Εκπαιδευτής, ιδιοκτήτης μαθήματος) =================
router.post('/courses/:id/attachments', authenticate, requireRole('instructor'), (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.message === 'Μη επιτρεπτός τύπος αρχείου.' ? err.message : 'Σφάλμα κατά τη μεταφόρτωση (πιθανώς πολύ μεγάλο αρχείο — όριο 25MB).';
      return res.status(400).json({ error: msg });
    }
    const course = ensureCourseAccess(req, res, req.params.id, true);
    if (!course) { if (req.file) fs.unlink(req.file.path, () => {}); return; }
    if (!req.file) return res.status(400).json({ error: 'Δεν επιλέχθηκε αρχείο.' });

    const mimeType = MIME_BY_EXT[path.extname(req.file.originalname).toLowerCase()] || 'application/octet-stream';
    const info = db.prepare('INSERT INTO attachments (course_id, original_name, stored_name, mime_type, size_bytes) VALUES (?,?,?,?,?)')
      .run(course.id, req.file.originalname, req.file.filename, mimeType, req.file.size);
    res.status(201).json({ id: info.lastInsertRowid, original_name: req.file.originalname, mime_type: mimeType, size_bytes: req.file.size });
  });
});

// ================= ΛΙΣΤΑ ΣΥΝΗΜΜΕΝΩΝ ΜΑΘΗΜΑΤΟΣ =================
router.get('/courses/:id/attachments', authenticate, (req, res) => {
  const course = ensureCourseAccess(req, res, req.params.id, false);
  if (!course) return;
  const rows = db.prepare('SELECT id, original_name, mime_type, size_bytes, uploaded_at FROM attachments WHERE course_id=? ORDER BY uploaded_at').all(course.id);
  res.json(rows);
});

// ================= ΠΡΟΒΟΛΗ / ΛΗΨΗ ΑΡΧΕΙΟΥ =================
router.get('/attachments/:id/file', authenticate, (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Το συνημμένο δεν βρέθηκε.' });
  const course = ensureCourseAccess(req, res, att.course_id, false);
  if (!course) return;

  const filePath = path.join(uploadDir, att.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Το αρχείο δεν βρέθηκε στον διακομιστή.' });

  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ================= ΔΙΑΓΡΑΦΗ ΣΥΝΗΜΜΕΝΟΥ (Εκπαιδευτής, ιδιοκτήτης μαθήματος) =================
router.delete('/attachments/:id', authenticate, requireRole('instructor'), (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Το συνημμένο δεν βρέθηκε.' });
  const course = ensureCourseAccess(req, res, att.course_id, true);
  if (!course) return;

  db.prepare('DELETE FROM attachments WHERE id=?').run(att.id);
  fs.unlink(path.join(uploadDir, att.stored_name), () => {});
  res.json({ message: 'Το συνημμένο διαγράφηκε.' });
});

module.exports = router;
