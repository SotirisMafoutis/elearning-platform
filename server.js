const express = require('express');
const path = require('path');
require('./db/init'); // αρχικοποιεί/σπέρνει τη βάση δεδομένων πριν φορτωθούν τα routes

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/courses'));
app.use('/api', require('./routes/attachments'));
app.use('/api', require('./routes/quizzes'));
app.use('/api', require('./routes/analytics'));
app.use('/api', require('./routes/certificates'));
app.use('/api/admin', require('./routes/admin'));

// Οτιδήποτε άλλο εξυπηρετεί το SPA (index.html) ώστε να δουλεύει το client-side routing.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Γενικός χειριστής σφαλμάτων, ώστε ένα απρόσμενο σφάλμα να επιστρέφει καθαρό JSON.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Παρουσιάστηκε εσωτερικό σφάλμα διακομιστή.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ο διακομιστής τρέχει: http://localhost:${PORT}`));
