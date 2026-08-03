const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/init');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Εγγραφή: εκπαιδευόμενοι εγκρίνονται αυτόματα, εκπαιδευτές χρειάζονται έγκριση διαχειριστή.
router.post('/register', (req, res) => {
  const { full_name, email, password, role } = req.body || {};
  if (!full_name || !email || !password || !['learner', 'instructor'].includes(role)) {
    return res.status(400).json({ error: 'Συμπληρώστε ονοματεπώνυμο, email, κωδικό και ιδιότητα (εκπαιδευόμενος/εκπαιδευτής).' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Το email χρησιμοποιείται ήδη.' });

  const hash = bcrypt.hashSync(password, 10);
  const isApproved = role === 'learner' ? 1 : 0;
  const info = db.prepare('INSERT INTO users (full_name, email, password_hash, role, is_approved) VALUES (?,?,?,?,?)')
    .run(full_name, email, hash, role, isApproved);

  res.status(201).json({
    message: role === 'instructor'
      ? 'Ο λογαριασμός εκπαιδευτή δημιουργήθηκε και αναμένει έγκριση από τον διαχειριστή.'
      : 'Η εγγραφή ολοκληρώθηκε επιτυχώς. Μπορείτε να συνδεθείτε.',
    userId: info.lastInsertRowid
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Συμπληρώστε email και κωδικό.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Λανθασμένο email ή κωδικός.' });
  }
  const token = jwt.sign(
    { id: user.id, role: user.role, full_name: user.full_name, is_approved: !!user.is_approved },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, is_approved: !!user.is_approved }
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, full_name, email, role, is_approved FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε.' });
  res.json({ ...user, is_approved: !!user.is_approved });
});

module.exports = router;
