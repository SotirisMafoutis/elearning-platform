var Views = window.Views = window.Views || {};
Views.instructor = {};

function statusLabel(s) { return { draft: 'Πρόχειρο', pending: 'Σε αναμονή έγκρισης', published: 'Δημοσιευμένο', rejected: 'Απορρίφθηκε' }[s] || s; }
function statusBadgeClass(s) { return { draft: '', pending: 'badge-info', published: 'badge-success', rejected: 'badge-error' }[s] || ''; }

Views.instructor.dashboard = async function (p, app) {
  // Έλεγχος έγκρισης (σε περίπτωση που εγκρίθηκε μετά τη σύνδεση).
  const me = await api('/auth/me');
  setSession(getToken(), me);

  const courses = await api('/courses?mine=true');
  app.innerHTML = `
    <h2>Τα Μαθήματά μου</h2>
    ${!me.is_approved ? `<div class="alert alert-warning">Ο λογαριασμός σας εκκρεμεί προς έγκριση από τον διαχειριστή. Μπορείτε να ετοιμάσετε μαθήματα, αλλά δεν θα δημοσιευτούν μέχρι να εγκριθεί ο λογαριασμός σας.</div>` : ''}
    <a class="btn btn-primary" href="#/instructor/courses/new">+ Νέο Μάθημα</a>
    <div class="card-grid">
      ${courses.length ? courses.map(c => `
        <div class="card">
          <h3><a href="#/instructor/courses/${c.id}">${escapeHtml(c.title)}</a></h3>
          <p class="muted">${escapeHtml(c.category_name || 'Χωρίς κατηγορία')}</p>
          <span class="badge ${statusBadgeClass(c.status)}">${statusLabel(c.status)}</span>
        </div>`).join('') : '<p class="muted">Δεν έχετε δημιουργήσει ακόμη κάποιο μάθημα.</p>'}
    </div>`;
};

Views.instructor.courseForm = async function (p, app) {
  const categories = await api('/categories');
  app.innerHTML = `
    <a href="#/instructor" class="back-link">← Τα Μαθήματά μου</a>
    <h2>Νέο Μάθημα</h2>
    <form id="courseForm">
      <label>Τίτλος Μαθήματος</label>
      <input type="text" name="title" required>
      <label>Περιγραφή</label>
      <textarea name="description" rows="4"></textarea>
      <label>Θεματική Κατηγορία</label>
      <select name="category_id">
        <option value="">— χωρίς κατηγορία —</option>
        ${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <label>Προαπαιτούμενες Γνώσεις</label>
      <textarea name="prerequisites" rows="2" placeholder="π.χ. Βασικές γνώσεις HTML/CSS"></textarea>
      <button class="btn btn-primary" type="submit">Δημιουργία Μαθήματος</button>
    </form>
    <div id="msg"></div>`;

  document.getElementById('courseForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/courses', {
        method: 'POST', body: {
          title: fd.get('title'), description: fd.get('description'), category_id: fd.get('category_id') || null, prerequisites: fd.get('prerequisites')
        }
      });
      location.hash = `#/instructor/courses/${r.id}`;
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };
};

Views.instructor.courseEdit = async function (p, app) {
  const course = await api(`/courses/${p.id}`);
  const editable = ['draft', 'rejected'].includes(course.status);

  app.innerHTML = `
    <a href="#/instructor" class="back-link">← Τα Μαθήματά μου</a>
    <h2>${escapeHtml(course.title)} <span class="badge ${statusBadgeClass(course.status)}">${statusLabel(course.status)}</span></h2>

    <div class="tool-links">
      <a class="btn btn-secondary" href="#/instructor/courses/${course.id}/questions">Τράπεζα Ερωτήσεων</a>
      <a class="btn btn-secondary" href="#/instructor/courses/${course.id}/quizzes">Διαχείριση Κουίζ</a>
      <a class="btn btn-secondary" href="#/instructor/courses/${course.id}/analytics">Ανάλυση Επιδόσεων</a>
    </div>

    ${course.status === 'rejected' ? '<div class="alert alert-error">Το μάθημα απορρίφθηκε από τον διαχειριστή. Κάντε τις απαραίτητες αλλαγές και υποβάλετέ το ξανά για έγκριση.</div>' : ''}
    ${course.status === 'pending' ? '<div class="alert alert-info">Το μάθημα είναι σε αναμονή έγκρισης από τον διαχειριστή.</div>' : ''}

    ${editable ? `
    <form id="editForm">
      <label>Τίτλος</label>
      <input type="text" name="title" value="${escapeHtml(course.title)}" required>
      <label>Περιγραφή</label>
      <textarea name="description" rows="4">${escapeHtml(course.description || '')}</textarea>
      <label>Προαπαιτούμενες Γνώσεις</label>
      <textarea name="prerequisites" rows="2">${escapeHtml(course.prerequisites || '')}</textarea>
      <button class="btn btn-primary" type="submit">Αποθήκευση</button>
    </form>` : `<p>${escapeHtml(course.description || '')}</p>`}

    <h3>Ενότητες</h3>
    <div class="module-list">
      ${course.modules.map(m => `
        <div class="module-item"><div class="module-header">
          <span>${m.order_index}. ${escapeHtml(m.title)}</span>
          ${editable ? `<button class="btn btn-ghost del-module" data-id="${m.id}">Διαγραφή</button>` : ''}
        </div></div>`).join('') || '<p class="muted">Δεν έχουν προστεθεί ενότητες ακόμη.</p>'}
    </div>

    ${editable ? `
    <form id="moduleForm">
      <h4>Προσθήκη Ενότητας</h4>
      <label>Τίτλος Ενότητας</label>
      <input type="text" name="title" required>
      <label>URL Βίντεο (προαιρετικό, π.χ. YouTube)</label>
      <input type="url" name="video_url" placeholder="https://youtube.com/watch?v=...">
      <label>Σημειώσεις</label>
      <textarea name="notes" rows="3"></textarea>
      <button class="btn btn-secondary" type="submit">Προσθήκη Ενότητας</button>
    </form>
    <div style="display:flex; gap:.6rem; margin-top:1rem">
      <button id="submitBtn" class="btn btn-primary">Υποβολή για Έγκριση</button>
      <button id="deleteBtn" class="btn btn-ghost">Διαγραφή Μαθήματος</button>
    </div>` : `<button id="deleteBtn" class="btn btn-ghost" style="margin-top:1rem">Διαγραφή Μαθήματος</button>`}
    <div id="msg"></div>`;

  const editForm = document.getElementById('editForm');
  if (editForm) editForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/courses/${course.id}`, { method: 'PUT', body: { title: fd.get('title'), description: fd.get('description'), prerequisites: fd.get('prerequisites') } });
      router();
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };

  const moduleForm = document.getElementById('moduleForm');
  if (moduleForm) moduleForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api(`/courses/${course.id}/modules`, { method: 'POST', body: { title: fd.get('title'), video_url: fd.get('video_url'), notes: fd.get('notes') } });
      router();
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };

  app.querySelectorAll('.del-module').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Διαγραφή αυτής της ενότητας;')) return;
      await api(`/modules/${btn.dataset.id}`, { method: 'DELETE' });
      router();
    };
  });

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.onclick = async () => {
    try { await api(`/courses/${course.id}/submit`, { method: 'POST' }); router(); }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };

  document.getElementById('deleteBtn').onclick = async () => {
    if (!confirm('Οριστική διαγραφή ολόκληρου του μαθήματος;')) return;
    await api(`/courses/${course.id}`, { method: 'DELETE' });
    location.hash = '#/instructor';
  };
};

Views.instructor.questionBank = async function (p, app) {
  const [course, questions] = await Promise.all([api(`/courses/${p.id}`), api(`/courses/${p.id}/questions`)]);

  app.innerHTML = `
    <a href="#/instructor/courses/${p.id}" class="back-link">← ${escapeHtml(course.title)}</a>
    <h2>Τράπεζα Ερωτήσεων</h2>
    <div class="question-list">
      ${questions.length ? questions.map(q => `
        <div class="question-card">
          <p style="margin:0 0 .3rem"><strong>${escapeHtml(q.question_text)}</strong> <span class="muted">(${questionTypeLabel(q.type)} · βαρύτητα ${q.weight})</span></p>
          <ul>${q.options.map(o => `<li>${o.side ? `[${o.side === 'left' ? 'Α' : 'Β'}] ` : ''}${escapeHtml(o.option_text)} ${o.is_correct ? '✓' : ''}</li>`).join('')}</ul>
          ${q.explanation ? `<p class="muted" style="margin:0 0 .5rem">Επεξήγηση: ${escapeHtml(q.explanation)}</p>` : ''}
          <button class="btn btn-ghost del-q" data-id="${q.id}">Διαγραφή</button>
        </div>`).join('') : '<p class="muted">Δεν έχουν προστεθεί ερωτήσεις ακόμη.</p>'}
    </div>

    <h3>Προσθήκη Ερώτησης</h3>
    <form id="qForm">
      <label>Τύπος Ερώτησης</label>
      <select name="type" id="qType">
        <option value="multiple_choice">Πολλαπλής Επιλογής</option>
        <option value="true_false">Σωστό/Λάθος</option>
        <option value="matching">Αντιστοίχιση</option>
      </select>
      <label>Εκφώνηση</label>
      <textarea name="question_text" rows="2" required></textarea>
      <label>Βαθμολογική Βαρύτητα</label>
      <input type="number" name="weight" value="1" min="0.1" step="0.1">
      <label>Επεξήγηση (εμφανίζεται μετά την υποβολή)</label>
      <textarea name="explanation" rows="2"></textarea>
      <div id="optionsArea"></div>
      <button type="button" id="addOptionBtn" class="btn btn-ghost" style="align-self:flex-start; margin-top:.6rem">+ Επιλογή</button>
      <button class="btn btn-primary" type="submit">Αποθήκευση Ερώτησης</button>
    </form>
    <div id="msg"></div>`;

  const qType = document.getElementById('qType');
  const optionsArea = document.getElementById('optionsArea');
  const addOptionBtn = document.getElementById('addOptionBtn');

  function addMcOption() {
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `<input type="checkbox" class="mc-correct" title="Σωστή απάντηση"><input type="text" class="mc-text" placeholder="Κείμενο επιλογής" required><button type="button" class="btn btn-ghost remove-row">✕</button>`;
    div.querySelector('.remove-row').onclick = () => div.remove();
    optionsArea.querySelector('.mc-options').appendChild(div);
  }
  function addMatchPair() {
    const div = document.createElement('div');
    div.className = 'match-pair-row';
    div.innerHTML = `<input type="text" class="match-left" placeholder="Στοιχείο Α" required><span>↔</span><input type="text" class="match-right" placeholder="Αντίστοιχο Β" required><button type="button" class="btn btn-ghost remove-row">✕</button>`;
    div.querySelector('.remove-row').onclick = () => div.remove();
    optionsArea.querySelector('.match-pairs').appendChild(div);
  }
  function renderOptionsArea() {
    const type = qType.value;
    if (type === 'true_false') {
      optionsArea.innerHTML = `
        <label class="option-label"><input type="radio" name="correctTF" value="0" checked> Σωστό</label>
        <label class="option-label"><input type="radio" name="correctTF" value="1"> Λάθος</label>`;
      addOptionBtn.style.display = 'none';
    } else if (type === 'matching') {
      optionsArea.innerHTML = `<label style="font-weight:600; font-size:.82rem; color:var(--color-ink-muted)">Ζεύγη προς Αντιστοίχιση</label><div class="match-pairs"></div>`;
      addOptionBtn.style.display = 'inline-flex'; addOptionBtn.textContent = '+ Ζεύγος';
      addMatchPair(); addMatchPair();
    } else {
      optionsArea.innerHTML = `<label style="font-weight:600; font-size:.82rem; color:var(--color-ink-muted)">Επιλογές (σημειώστε τις σωστές)</label><div class="mc-options"></div>`;
      addOptionBtn.style.display = 'inline-flex'; addOptionBtn.textContent = '+ Επιλογή';
      addMcOption(); addMcOption();
    }
  }
  qType.onchange = renderOptionsArea;
  renderOptionsArea();
  addOptionBtn.onclick = () => (qType.value === 'matching' ? addMatchPair() : addMcOption());

  document.getElementById('qForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    let options = [];
    if (type === 'true_false') {
      const correct = fd.get('correctTF');
      options = [{ option_text: 'Σωστό', is_correct: correct === '0' }, { option_text: 'Λάθος', is_correct: correct === '1' }];
    } else if (type === 'matching') {
      optionsArea.querySelectorAll('.match-pair-row').forEach((row, i) => {
        options.push({ option_text: row.querySelector('.match-left').value, side: 'left', match_key: String(i) });
        options.push({ option_text: row.querySelector('.match-right').value, side: 'right', match_key: String(i) });
      });
    } else {
      optionsArea.querySelectorAll('.mc-option-row').forEach(row => {
        options.push({ option_text: row.querySelector('.mc-text').value, is_correct: row.querySelector('.mc-correct').checked });
      });
    }
    try {
      await api(`/courses/${p.id}/questions`, { method: 'POST', body: { type, question_text: fd.get('question_text'), weight: Number(fd.get('weight')), explanation: fd.get('explanation'), options } });
      router();
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };

  app.querySelectorAll('.del-q').forEach(btn => {
    btn.onclick = async () => { if (!confirm('Διαγραφή ερώτησης;')) return; await api(`/questions/${btn.dataset.id}`, { method: 'DELETE' }); router(); };
  });
};

Views.instructor.quizManager = async function (p, app) {
  const [course, questions, quizzes] = await Promise.all([api(`/courses/${p.id}`), api(`/courses/${p.id}/questions`), api(`/courses/${p.id}/quizzes`)]);

  app.innerHTML = `
    <a href="#/instructor/courses/${p.id}" class="back-link">← ${escapeHtml(course.title)}</a>
    <h2>Διαχείριση Κουίζ</h2>
    <div class="quiz-list">
      ${quizzes.length ? quizzes.map(q => `
        <div class="quiz-item">
          <span>${escapeHtml(q.title)} <span class="muted">— ${Math.round(q.time_limit_seconds / 60)}′, βάση ${q.passing_score}%</span></span>
          <button class="btn btn-ghost del-quiz" data-id="${q.id}">Διαγραφή</button>
        </div>`).join('') : '<p class="muted">Δεν έχουν δημιουργηθεί κουίζ ακόμη.</p>'}
    </div>

    ${questions.length ? `
    <h3>Νέο Κουίζ</h3>
    <form id="quizForm">
      <label>Τίτλος Κουίζ</label>
      <input type="text" name="title" required>
      <label>Σύνδεση με Ενότητα (προαιρετικό — κλειδώνει το κουίζ μέχρι να ολοκληρωθεί)</label>
      <select name="module_id">
        <option value="">— καμία —</option>
        ${course.modules.map(m => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join('')}
      </select>
      <label>Χρονικό Όριο (λεπτά)</label>
      <input type="number" name="time_limit_min" value="10" min="1">
      <label>Βάση Επιτυχίας (%)</label>
      <input type="number" name="passing_score" value="50" min="0" max="100">
      <label>Επιλογή Ερωτήσεων από την Τράπεζα</label>
      <div class="q-checklist">
        ${questions.map(q => `<label class="option-label"><input type="checkbox" name="qids" value="${q.id}"> ${escapeHtml(q.question_text)}</label>`).join('')}
      </div>
      <button class="btn btn-primary" type="submit">Δημιουργία Κουίζ</button>
    </form>` : `<p class="muted">Προσθέστε πρώτα ερωτήσεις στην <a href="#/instructor/courses/${p.id}/questions">Τράπεζα Ερωτήσεων</a> για να δημιουργήσετε κουίζ.</p>`}
    <div id="msg"></div>`;

  const quizForm = document.getElementById('quizForm');
  if (quizForm) quizForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qids = Array.from(fd.getAll('qids')).map(Number);
    if (!qids.length) { document.getElementById('msg').innerHTML = '<div class="alert alert-error">Επιλέξτε τουλάχιστον μία ερώτηση.</div>'; return; }
    try {
      await api(`/courses/${p.id}/quizzes`, {
        method: 'POST', body: {
          title: fd.get('title'), module_id: fd.get('module_id') || null,
          time_limit_seconds: Number(fd.get('time_limit_min')) * 60, passing_score: Number(fd.get('passing_score')), question_ids: qids
        }
      });
      router();
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };

  app.querySelectorAll('.del-quiz').forEach(btn => {
    btn.onclick = async () => { if (!confirm('Διαγραφή κουίζ;')) return; await api(`/quizzes/${btn.dataset.id}`, { method: 'DELETE' }); router(); };
  });
};

function difficultyLabel(idx) {
  if (idx >= 0.7) return `Εύκολη (${idx})`;
  if (idx >= 0.4) return `Μέτρια (${idx})`;
  return `Δύσκολη (${idx})`;
}

Views.instructor.analytics = async function (p, app) {
  const [course, data] = await Promise.all([api(`/courses/${p.id}`), api(`/courses/${p.id}/analytics`)]);

  app.innerHTML = `
    <a href="#/instructor/courses/${p.id}" class="back-link">← ${escapeHtml(course.title)}</a>
    <h2>Ανάλυση Επιδόσεων</h2>

    <h3>Στατιστικά ανά Ερώτηση</h3>
    <table class="data-table">
      <thead><tr><th>Ερώτηση</th><th>Τύπος</th><th>Προσπάθειες</th><th>Ποσοστό Επιτυχίας</th><th>Δείκτης Δυσκολίας</th></tr></thead>
      <tbody>
        ${data.questionStats.map(q => `
          <tr><td>${escapeHtml(q.question_text)}</td><td>${questionTypeLabel(q.type)}</td><td>${q.attempts}</td>
          <td>${q.success_rate !== null ? q.success_rate + '%' : '—'}</td>
          <td>${q.difficulty_index !== null ? difficultyLabel(q.difficulty_index) : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Δεν υπάρχουν ακόμη δεδομένα.</td></tr>'}
      </tbody>
    </table>

    <h3>Στατιστικά ανά Εκπαιδευόμενο</h3>
    <table class="data-table">
      <thead><tr><th>Εκπαιδευόμενος</th><th>Πρόοδος</th><th>Μέση Βαθμολογία</th><th>Τελευταίο Κουίζ</th><th>Κατάσταση</th></tr></thead>
      <tbody>
        ${data.learnerStats.map(l => `
          <tr><td>${escapeHtml(l.full_name)}</td><td>${l.progress_pct}%</td>
          <td>${l.average_score !== null ? l.average_score + '%' : '—'}</td>
          <td>${formatDate(l.last_quiz_at)}</td>
          <td>${l.completed ? '✓ Ολοκλήρωσε' : 'Σε εξέλιξη'}</td></tr>`).join('') || '<tr><td colspan="5">Δεν υπάρχουν εγγεγραμμένοι εκπαιδευόμενοι.</td></tr>'}
      </tbody>
    </table>`;
};
