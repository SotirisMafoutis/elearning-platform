const express = require('express');
const db = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { renderCertificatePDF } = require('../utils/certificate');

const router = express.Router();

router.get('/certificates/:id/download', authenticate, requireRole('learner'), (req, res) => {
  const cert = db.prepare(`SELECT cert.*, u.full_name, c.title AS course_title
                            FROM certificates cert
                            JOIN users u ON u.id = cert.user_id
                            JOIN courses c ON c.id = cert.course_id
                            WHERE cert.id = ?`).get(req.params.id);
  if (!cert || cert.user_id !== req.user.id) return res.status(404).json({ error: 'Το πιστοποιητικό δεν βρέθηκε.' });

  const template = cert.template_id ? db.prepare('SELECT * FROM certificate_templates WHERE id=?').get(cert.template_id) : null;
  const avgRow = db.prepare(`SELECT AVG(score) a FROM quiz_attempts att JOIN quizzes z ON z.id=att.quiz_id
                              WHERE z.course_id=? AND att.user_id=? AND att.submitted_at IS NOT NULL`).get(cert.course_id, cert.user_id);

  renderCertificatePDF({
    res,
    learnerName: cert.full_name,
    courseTitle: cert.course_title,
    issuedAt: cert.issued_at,
    code: cert.certificate_code,
    template,
    avgScore: avgRow.a !== null ? Math.round(avgRow.a * 10) / 10 : null
  });
});

module.exports = router;
