// Απλό σενάριο ελέγχου (smoke test) όλης της ροής της πλατφόρμας.
// Εκτέλεση: node test/smoke-test.js  (ή npm test) με τον διακομιστή ήδη σε λειτουργία.
// Χρησιμοποιεί τυχαία email ώστε να μπορεί να ξανατρέξει χωρίς σύγκρουση.

const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
const suffix = Date.now();

async function req(reqPath, opts = {}) {
  const res = await fetch(BASE + reqPath, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${reqPath} -> HTTP ${res.status}: ${data && data.error}`);
  return data;
}

(async () => {
  console.log('1) Σύνδεση ως διαχειριστής...');
  const adminLogin = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@elearning.gr', password: 'Admin123!' }) });
  const adminAuth = { Authorization: `Bearer ${adminLogin.token}` };

  console.log('2) Εγγραφή εκπαιδευτή...');
  await req('/auth/register', { method: 'POST', body: JSON.stringify({
    full_name: 'Δοκιμαστικός Εκπαιδευτής', email: `instr${suffix}@test.gr`, password: 'Test1234', role: 'instructor'
  }) });
  const instrLogin = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: `instr${suffix}@test.gr`, password: 'Test1234' }) });
  const instrAuth = { Authorization: `Bearer ${instrLogin.token}` };

  console.log('3) Απόρριψη σε μη εγκεκριμένο εκπαιδευτή (αναμενόμενο 403)...');
  try {
    await req('/courses', { method: 'POST', headers: instrAuth, body: JSON.stringify({ title: 'Δεν πρέπει να περάσει' }) });
    throw new Error('Έπρεπε να αποτύχει αλλά πέτυχε!');
  } catch (e) {
    if (!e.message.includes('403')) throw e;
    console.log('   ✓ Σωστά μπλοκαρίστηκε.');
  }

  console.log('4) Έγκριση εκπαιδευτή από τον διαχειριστή...');
  await req(`/admin/instructors/${instrLogin.user.id}/approve`, { method: 'POST', headers: adminAuth });

  console.log('5) Δημιουργία μαθήματος + κατηγορίας...');
  const categories = await req('/categories', { headers: instrAuth });
  const course = await req('/courses', { method: 'POST', headers: instrAuth, body: JSON.stringify({
    title: 'Εισαγωγή στη JavaScript', description: 'Βασικές έννοιες JS.', category_id: categories[0].id, prerequisites: 'Καμία'
  }) });

  console.log('6) Προσθήκη δύο ενοτήτων...');
  const mod1 = await req(`/courses/${course.id}/modules`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    title: 'Μεταβλητές & Τύποι', video_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', notes: 'Σημειώσεις 1ης ενότητας.'
  }) });
  const mod2 = await req(`/courses/${course.id}/modules`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    title: 'Συναρτήσεις', video_url: '', notes: 'Σημειώσεις 2ης ενότητας.'
  }) });

  console.log('7) Προσθήκη ερωτήσεων (πολλαπλής επιλογής, σωστό/λάθος, αντιστοίχιση)...');
  const qMC = await req(`/courses/${course.id}/questions`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    type: 'multiple_choice', question_text: 'Ποιες είναι primitive τύποι στη JS;', weight: 2, explanation: 'string, number, boolean κ.λπ.',
    options: [{ option_text: 'string', is_correct: true }, { option_text: 'number', is_correct: true }, { option_text: 'Array', is_correct: false }]
  }) });
  const qTF = await req(`/courses/${course.id}/questions`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    type: 'true_false', question_text: 'Η JavaScript είναι compiled γλώσσα.', weight: 1, explanation: 'Είναι interpreted/JIT.',
    options: [{ option_text: 'Σωστό', is_correct: false }, { option_text: 'Λάθος', is_correct: true }]
  }) });
  const qMatch = await req(`/courses/${course.id}/questions`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    type: 'matching', question_text: 'Αντιστοιχίστε τον τελεστή με τη λειτουργία του.', weight: 2, explanation: '',
    options: [
      { option_text: '===', side: 'left', match_key: '0' }, { option_text: 'Αυστηρή ισότητα', side: 'right', match_key: '0' },
      { option_text: 'typeof', side: 'left', match_key: '1' }, { option_text: 'Επιστρέφει τον τύπο', side: 'right', match_key: '1' }
    ]
  }) });

  console.log('8) Δημιουργία κουίζ με τις 3 ερωτήσεις...');
  const quiz = await req(`/courses/${course.id}/quizzes`, { method: 'POST', headers: instrAuth, body: JSON.stringify({
    title: 'Κουίζ Ενότητας 1', module_id: mod1.id, time_limit_seconds: 300, passing_score: 60,
    question_ids: [qMC.id, qTF.id, qMatch.id]
  }) });

  console.log('9) Υποβολή & έγκριση μαθήματος...');
  await req(`/courses/${course.id}/submit`, { method: 'POST', headers: instrAuth });
  await req(`/admin/courses/${course.id}/approve`, { method: 'POST', headers: adminAuth });

  console.log('10) Εγγραφή & σύνδεση εκπαιδευόμενου...');
  await req('/auth/register', { method: 'POST', body: JSON.stringify({
    full_name: 'Δοκιμαστικός Εκπαιδευόμενος', email: `learn${suffix}@test.gr`, password: 'Test1234', role: 'learner'
  }) });
  const learnLogin = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: `learn${suffix}@test.gr`, password: 'Test1234' }) });
  const learnAuth = { Authorization: `Bearer ${learnLogin.token}` };

  console.log('11) Αναζήτηση & εγγραφή στο μάθημα...');
  const browse = await req(`/courses?search=JavaScript`, { headers: learnAuth });
  if (!browse.find(c => c.id === course.id)) throw new Error('Το μάθημα δεν εμφανίστηκε στην αναζήτηση!');
  await req(`/courses/${course.id}/enroll`, { method: 'POST', headers: learnAuth });

  console.log('12) Έλεγχος σειριακής κλειδώματος ενοτήτων (η ενότητα 2 πρέπει να αποτύχει πριν την 1)...');
  try {
    await req(`/modules/${mod2.id}/complete`, { method: 'POST', headers: learnAuth });
    throw new Error('Έπρεπε να μπλοκαριστεί η σειριακή πρόοδος!');
  } catch (e) {
    if (!e.message.includes('προηγούμενη')) throw e;
    console.log('   ✓ Σωστά μπλοκαρίστηκε.');
  }
  await req(`/modules/${mod1.id}/complete`, { method: 'POST', headers: learnAuth });
  await req(`/modules/${mod2.id}/complete`, { method: 'POST', headers: learnAuth });

  console.log('13) Συμμετοχή στο κουίζ (όλες σωστές)...');
  const takeData = await req(`/quizzes/${quiz.id}/take`, { headers: learnAuth });

  // Ασφάλεια: η προβολή του κουίζ προς τον εκπαιδευόμενο ΔΕΝ πρέπει να αποκαλύπτει
  // ποιες επιλογές είναι σωστές, ούτε τα κλειδιά αντιστοίχισης.
  const leaked = takeData.questions.some(q => q.options.some(o => 'is_correct' in o || 'match_key' in o));
  if (leaked) throw new Error('Διαρροή σωστών απαντήσεων στο endpoint /take!');
  console.log('   ✓ Δεν διέρρευσαν σωστές απαντήσεις στον εκπαιδευόμενο.');

  // Το "κλειδί απαντήσεων" έρχεται νόμιμα από την τράπεζα ερωτήσεων του εκπαιδευτή.
  const answerKey = await req(`/courses/${course.id}/questions`, { headers: instrAuth });
  const keyFor = id => answerKey.find(q => q.id === id);

  const mcCorrect = keyFor(qMC.id).options.filter(o => o.is_correct).map(o => o.id);
  const tfCorrect = keyFor(qTF.id).options.filter(o => o.is_correct).map(o => o.id);
  const matchPairs = keyFor(qMatch.id).options.filter(o => o.side === 'left').map(l => ({
    left_option_id: l.id,
    right_option_id: keyFor(qMatch.id).options.find(r => r.side === 'right' && r.match_key === l.match_key).id
  }));

  const submitResult = await req(`/quizzes/${quiz.id}/submit`, { method: 'POST', headers: learnAuth, body: JSON.stringify({
    attempt_id: takeData.attempt_id,
    answers: [
      { question_id: qMC.id, selected_option_ids: mcCorrect },
      { question_id: qTF.id, selected_option_ids: tfCorrect },
      { question_id: qMatch.id, matches: matchPairs }
    ]
  }) });
  console.log(`   Βαθμολογία: ${submitResult.score}% (${submitResult.passed ? 'επιτυχία' : 'αποτυχία'}) — αναμενόταν 100%`);
  if (submitResult.score !== 100) throw new Error('Λάθος βαθμολόγηση!');
  if (!submitResult.courseCompleted) throw new Error('Το μάθημα έπρεπε να έχει ολοκληρωθεί!');

  console.log('14) Έλεγχος προσωπικού πίνακα προόδου & πιστοποιητικού...');
  const dash = await req('/me/dashboard', { headers: learnAuth });
  if (dash.courses[0].progress_pct !== 100) throw new Error('Λάθος ποσοστό προόδου!');
  if (dash.certificates.length !== 1) throw new Error('Δεν εκδόθηκε πιστοποιητικό!');
  console.log(`   ✓ Πρόοδος ${dash.courses[0].progress_pct}%, μέση επίδοση ${dash.average_quiz_score}%, πιστοποιητικά: ${dash.certificates.length}`);

  console.log('15) Λήψη PDF πιστοποιητικού...');
  const pdfRes = await fetch(`${BASE}/certificates/${dash.certificates[0].id}/download`, { headers: learnAuth });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  if (!pdfRes.ok || buf.slice(0, 4).toString() !== '%PDF') throw new Error('Το PDF πιστοποιητικού δεν δημιουργήθηκε σωστά!');
  console.log(`   ✓ Λήφθηκε έγκυρο PDF (${buf.length} bytes).`);

  console.log('16) Ανάλυση επιδόσεων εκπαιδευτή...');
  const analytics = await req(`/courses/${course.id}/analytics`, { headers: instrAuth });
  if (analytics.learnerStats[0].average_score !== 100) throw new Error('Λάθος στατιστικά εκπαιδευόμενου!');
  console.log(`   ✓ ${analytics.questionStats.length} ερωτήσεις αναλύθηκαν, ${analytics.learnerStats.length} εκπαιδευόμενος/οι.`);

  console.log('17) Στατιστικά πλατφόρμας (διαχειριστής)...');
  const stats = await req('/admin/stats', { headers: adminAuth });
  const courseStat = stats.find(s => s.course_id === course.id);
  if (!courseStat || courseStat.completion_rate !== 100) throw new Error('Λάθος στατιστικά πλατφόρμας!');
  console.log(`   ✓ Ποσοστό ολοκλήρωσης: ${courseStat.completion_rate}%`);

  console.log('\n✅ Όλα τα βήματα ολοκληρώθηκαν επιτυχώς!');
})().catch(err => {
  console.error('\n❌ Σφάλμα στη δοκιμή:', err.message);
  process.exit(1);
});
