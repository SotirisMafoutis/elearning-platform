// Middleware ελέγχου ταυτότητας (JWT) και ρόλων.
// Αν δεν έχει οριστεί η μεταβλητή περιβάλλοντος JWT_SECRET, δημιουργείται τυχαίο
// μυστικό κλειδί στην πρώτη εκτέλεση και αποθηκεύεται στο data/.jwt-secret,
// ώστε τα tokens να παραμένουν έγκυρα μεταξύ επανεκκινήσεων του διακομιστή.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/init');

function getOrCreateSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const dataDir = path.join(__dirname, '..', 'data');
  const secretPath = path.join(dataDir, '.jwt-secret');
  try {
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (e) { /* συνεχίζουμε στη δημιουργία νέου */ }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretPath, secret, 'utf8');
  } catch (e) { /* αν αποτύχει η αποθήκευση, το token απλά δεν θα επιβιώσει σε restart */ }
  return secret;
}

const JWT_SECRET = getOrCreateSecret();

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Μη έγκυρο ή ληγμένο token. Παρακαλώ συνδεθείτε ξανά.' });
  }
  // Το JWT αποδεικνύει μόνο την ταυτότητα (id). Ο ρόλος και η έγκριση διαβάζονται
  // πάντα φρέσκα από τη βάση, ώστε μια έγκριση/απόρριψη από τον διαχειριστή να
  // ισχύει άμεσα, χωρίς να χρειάζεται νέα σύνδεση για να ανανεωθεί το token.
  const current = db.prepare('SELECT id, role, full_name, is_approved FROM users WHERE id=?').get(payload.id);
  if (!current) return res.status(401).json({ error: 'Ο λογαριασμός δεν βρέθηκε. Παρακαλώ συνδεθείτε ξανά.' });
  req.user = { id: current.id, role: current.role, full_name: current.full_name, is_approved: !!current.is_approved };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη λειτουργία.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, JWT_SECRET };
