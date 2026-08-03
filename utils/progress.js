// Κοινή λογική: ελέγχει αν ένας εκπαιδευόμενος ολοκλήρωσε ένα μάθημα
// (όλες οι ενότητες + επιτυχία σε όλα τα κουίζ του μαθήματος) και, αν ναι,
// σημειώνει την ολοκλήρωση και εκδίδει αυτόματα πιστοποιητικό (αν δεν υπάρχει ήδη).

const db = require('../db/init');
const crypto = require('crypto');

function checkAndCompleteCourse(enrollmentId) {
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollmentId);
  if (!enrollment || enrollment.completed_at) return false;

  const totalModules = db.prepare('SELECT COUNT(*) c FROM modules WHERE course_id=?').get(enrollment.course_id).c;
  const doneModules = db.prepare('SELECT COUNT(*) c FROM module_progress WHERE enrollment_id=? AND completed=1').get(enrollmentId).c;
  if (totalModules === 0 || doneModules < totalModules) return false;

  const quizzes = db.prepare('SELECT id, passing_score FROM quizzes WHERE course_id=?').all(enrollment.course_id);
  for (const quiz of quizzes) {
    const best = db.prepare(`SELECT MAX(score) best FROM quiz_attempts WHERE user_id=? AND quiz_id=? AND submitted_at IS NOT NULL`)
      .get(enrollment.user_id, quiz.id);
    if (best.best === null || best.best < quiz.passing_score) return false;
  }

  db.prepare(`UPDATE enrollments SET completed_at=datetime('now') WHERE id=?`).run(enrollmentId);

  const existingCert = db.prepare('SELECT id FROM certificates WHERE user_id=? AND course_id=?')
    .get(enrollment.user_id, enrollment.course_id);
  if (!existingCert) {
    const tpl = db.prepare('SELECT id FROM certificate_templates WHERE is_default=1').get();
    const code = 'CERT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    db.prepare('INSERT INTO certificates (user_id, course_id, template_id, certificate_code) VALUES (?,?,?,?)')
      .run(enrollment.user_id, enrollment.course_id, tpl ? tpl.id : null, code);
  }
  return true;
}

module.exports = { checkAndCompleteCourse };
