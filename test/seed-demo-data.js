const BASE = 'http://localhost:3000/api';

async function req(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
const post = (p, b, t) => req('POST', p, b, t);
const get = (p, t) => req('GET', p, undefined, t);

(async () => {
  const adminLogin = await post('/auth/login', { email: 'admin@elearning.gr', password: 'Admin123!' });
  const adminToken = adminLogin.token;

  // --- Εκπαιδευτής (εγκεκριμένος) ---
  const instrEmail = 'maria.papadopoulou@example.gr';
  await post('/auth/register', { full_name: 'Μαρία Παπαδοπούλου', email: instrEmail, password: 'test1234', role: 'instructor' });
  const pending = await get('/admin/instructors/pending', adminToken);
  const instr = pending.find(i => i.email === instrEmail);
  await post(`/admin/instructors/${instr.id}/approve`, {}, adminToken);
  const instrToken = (await post('/auth/login', { email: instrEmail, password: 'test1234' })).token;

  // δεύτερος εκπαιδευτής σε αναμονή έγκρισης (για screenshot λίστας εκκρεμών)
  await post('/auth/register', { full_name: 'Νίκος Οικονόμου', email: 'nikos.oikonomou@example.gr', password: 'test1234', role: 'instructor' });

  const cats = await get('/categories', adminToken);
  const progCat = cats.find(c => c.name.includes('Προγραμματισμός'));
  const langCat = cats.find(c => c.name.includes('Ξένες'));

  const course = await post('/courses', {
    title: 'Εισαγωγή στην JavaScript',
    description: 'Μάθετε τα θεμέλια της JavaScript: μεταβλητές, συναρτήσεις, αντικείμενα και ασύγχρονο προγραμματισμό, μέσα από πρακτικά παραδείγματα.',
    category_id: progCat.id,
    prerequisites: 'Βασικές γνώσεις HTML & CSS',
  }, instrToken);

  const mod1 = await post(`/courses/${course.id}/modules`, { title: 'Μεταβλητές & Τύποι Δεδομένων', video_url: 'https://www.youtube.com/watch?v=W6NZfCO5SIk', notes: 'Σε αυτή την ενότητα θα γνωρίσουμε τις μεταβλητές (let, const, var) και τους βασικούς τύπους δεδομένων της JavaScript.' }, instrToken);
  const mod2 = await post(`/courses/${course.id}/modules`, { title: 'Συναρτήσεις & Εμβέλεια', video_url: 'https://www.youtube.com/watch?v=xUI5Tsl2JpY', notes: 'Πώς ορίζουμε και καλούμε συναρτήσεις και πώς λειτουργεί η εμβέλεια (scope) των μεταβλητών.' }, instrToken);
  const mod3 = await post(`/courses/${course.id}/modules`, { title: 'Ασύγχρονος Προγραμματισμός', video_url: '', notes: 'Callbacks, Promises και async/await.' }, instrToken);

  const q1 = await post(`/courses/${course.id}/questions`, {
    type: 'multiple_choice',
    question_text: 'Ποιες από τις παρακάτω είναι έγκυρες λέξεις-κλειδιά δήλωσης μεταβλητών στη JavaScript;',
    weight: 2,
    explanation: 'Οι let, const και var είναι όλες έγκυρες λέξεις-κλειδιά δήλωσης μεταβλητών.',
    options: [
      { option_text: 'let', is_correct: true },
      { option_text: 'const', is_correct: true },
      { option_text: 'var', is_correct: true },
      { option_text: 'variable', is_correct: false },
    ],
  }, instrToken);

  const q2 = await post(`/courses/${course.id}/questions`, {
    type: 'true_false',
    question_text: 'Η const επιτρέπει την επανάθεση τιμής στη μεταβλητή μετά την αρχική της δήλωση.',
    weight: 1,
    explanation: 'Η const δημιουργεί σταθερή αναφορά — δεν επιτρέπεται επανάθεση τιμής μετά τη δήλωση.',
    options: [
      { option_text: 'Σωστό', is_correct: false },
      { option_text: 'Λάθος', is_correct: true },
    ],
  }, instrToken);

  const q3 = await post(`/courses/${course.id}/questions`, {
    type: 'matching',
    question_text: 'Αντιστοιχίστε κάθε τύπο δεδομένων με το σωστό παράδειγμα',
    weight: 3,
    explanation: 'Κάθε τύπος δεδομένων στη JavaScript έχει τη δική του αναπαράσταση.',
    options: [
      { option_text: 'Number', side: 'left', match_key: 'k1' },
      { option_text: '42', side: 'right', match_key: 'k1' },
      { option_text: 'String', side: 'left', match_key: 'k2' },
      { option_text: '"Γεια σου"', side: 'right', match_key: 'k2' },
      { option_text: 'Boolean', side: 'left', match_key: 'k3' },
      { option_text: 'true', side: 'right', match_key: 'k3' },
    ],
  }, instrToken);

  const quiz = await post(`/courses/${course.id}/quizzes`, {
    title: 'Κουίζ: Βασικές Έννοιες JavaScript',
    time_limit_seconds: 600,
    passing_score: 70,
    question_ids: [q1.id, q2.id, q3.id],
  }, instrToken);

  await post(`/courses/${course.id}/submit`, {}, instrToken);
  await post(`/admin/courses/${course.id}/approve`, {}, adminToken);

  const course2 = await post('/courses', {
    title: 'Αγγλικά για Επαγγελματίες',
    description: 'Βελτιώστε τα επαγγελματικά σας αγγλικά: γραπτή επικοινωνία, παρουσιάσεις και συνεντεύξεις.',
    category_id: langCat.id,
    prerequisites: '',
  }, instrToken);
  await post(`/courses/${course2.id}/modules`, { title: 'Business Email Writing', video_url: '', notes: 'Πώς να γράφετε επαγγελματικά email στα αγγλικά.' }, instrToken);
  await post(`/courses/${course2.id}/submit`, {}, instrToken);

  // --- Τρίτο μάθημα: παραμένει σε πρόχειρη κατάσταση (draft) για screenshot επεξεργασίας ---
  const course3 = await post('/courses', {
    title: 'Ανάλυση Δεδομένων με Python',
    description: 'Εισαγωγή στην ανάλυση δεδομένων: pandas, NumPy και βασικές τεχνικές οπτικοποίησης.',
    category_id: progCat.id,
    prerequisites: 'Βασικές γνώσεις Python',
  }, instrToken);
  await post(`/courses/${course3.id}/modules`, { title: 'Εισαγωγή στο pandas', video_url: '', notes: 'Βασικές δομές δεδομένων: Series και DataFrame.' }, instrToken);

  const learnerEmail = 'giorgos.antoniou@example.gr';
  await post('/auth/register', { full_name: 'Γιώργος Αντωνίου', email: learnerEmail, password: 'test1234', role: 'learner' });
  const learnerToken = (await post('/auth/login', { email: learnerEmail, password: 'test1234' })).token;
  await post(`/courses/${course.id}/enroll`, {}, learnerToken);
  await post(`/modules/${mod1.id}/complete`, {}, learnerToken);
  await post(`/modules/${mod2.id}/complete`, {}, learnerToken);

  const learner2Email = 'eleni.vasileiou@example.gr';
  await post('/auth/register', { full_name: 'Ελένη Βασιλείου', email: learner2Email, password: 'test1234', role: 'learner' });
  const learner2Token = (await post('/auth/login', { email: learner2Email, password: 'test1234' })).token;
  await post(`/courses/${course.id}/enroll`, {}, learner2Token);
  await post(`/modules/${mod1.id}/complete`, {}, learner2Token);
  await post(`/modules/${mod2.id}/complete`, {}, learner2Token);
  await post(`/modules/${mod3.id}/complete`, {}, learner2Token);

  const take = await get(`/quizzes/${quiz.id}/take`, learner2Token);
  const answers = take.questions.map(q => {
    if (q.type === 'multiple_choice') {
      return { question_id: q.id, selected_option_ids: q.options.filter(o => ['let', 'const', 'var'].includes(o.option_text)).map(o => o.id) };
    }
    if (q.type === 'true_false') {
      return { question_id: q.id, selected_option_ids: [q.options.find(o => o.option_text === 'Λάθος').id] };
    }
    if (q.type === 'matching') {
      const left = q.options.filter(o => o.side === 'left');
      const right = q.options.filter(o => o.side === 'right');
      const pairMap = { Number: '42', String: '"Γεια σου"', Boolean: 'true' };
      return { question_id: q.id, matches: left.map(l => ({ left_option_id: l.id, right_option_id: right.find(r => r.option_text === pairMap[l.option_text]).id })) };
    }
    return { question_id: q.id };
  });
  const submitResp = await post(`/quizzes/${quiz.id}/submit`, { attempt_id: take.attempt_id, answers }, learner2Token);
  console.log('Ελένη ολοκλήρωσε το κουίζ με σκορ:', submitResp.score + '%');

  console.log('\n=== SEED ΟΛΟΚΛΗΡΩΘΗΚΕ ===');
  console.log('course.id =', course.id, '| quiz.id =', quiz.id, '| course2.id =', course2.id, '| course3.id (draft) =', course3.id);
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
