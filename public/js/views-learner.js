var Views = window.Views = window.Views || {};
Views.learner = {};

function renderVideoEmbed(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `<iframe width="100%" height="360" src="https://www.youtube.com/embed/${yt[1]}" title="Βίντεο ενότητας" frameborder="0" allowfullscreen></iframe>`;
  return `<video controls width="100%"><source src="${escapeHtml(url)}"></video>`;
}

Views.learner.browseCourses = async function (p, app) {
  const search = p.query.get('search') || '';
  const categoryId = p.query.get('category_id') || '';
  let qs = '';
  if (search) qs += `${qs ? '&' : '?'}search=${encodeURIComponent(search)}`;
  if (categoryId) qs += `${qs ? '&' : '?'}category_id=${encodeURIComponent(categoryId)}`;

  const [categories, courses, myEnrollments] = await Promise.all([
    api('/categories'), api('/courses' + qs), api('/me/enrollments')
  ]);
  const enrolledIds = new Set(myEnrollments.map(e => e.course_id));

  app.innerHTML = `
    <h2>Κατάλογος Μαθημάτων</h2>
    <form id="filterForm" class="filter-bar">
      <input type="text" name="search" placeholder="Αναζήτηση μαθήματος..." value="${escapeHtml(search)}">
      <select name="category_id">
        <option value="">Όλες οι κατηγορίες</option>
        ${categories.map(c => `<option value="${c.id}" ${categoryId == c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" type="submit">Φιλτράρισμα</button>
    </form>
    <div class="card-grid">
      ${courses.length ? courses.map(c => `
        <div class="card">
          <h3><a href="#/courses/${c.id}">${escapeHtml(c.title)}</a></h3>
          <p class="muted">${escapeHtml(c.category_name || 'Χωρίς κατηγορία')} · Εκπαιδευτής: ${escapeHtml(c.instructor_name)}</p>
          <p>${escapeHtml((c.description || '').slice(0, 130))}${(c.description || '').length > 130 ? '…' : ''}</p>
          ${enrolledIds.has(c.id) ? '<span class="badge badge-success">Ήδη εγγεγραμμένος/η</span>' : `<a class="btn btn-primary" href="#/courses/${c.id}">Προβολή Μαθήματος</a>`}
        </div>`).join('') : '<p class="muted">Δεν βρέθηκαν μαθήματα με αυτά τα κριτήρια.</p>'}
    </div>`;

  document.getElementById('filterForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const params = new URLSearchParams();
    if (fd.get('search')) params.set('search', fd.get('search'));
    if (fd.get('category_id')) params.set('category_id', fd.get('category_id'));
    const qsStr = params.toString();
    location.hash = `#/courses${qsStr ? '?' + qsStr : ''}`;
  };
};

Views.learner.courseDetail = async function (p, app) {
  const course = await api(`/courses/${p.id}`);
  const progressMap = {};
  (course.progress || []).forEach(pr => { progressMap[pr.module_id] = !!pr.completed; });

  const modules = course.modules;
  let nextUnlockedIndex = 0;
  while (nextUnlockedIndex < modules.length && progressMap[modules[nextUnlockedIndex].id]) nextUnlockedIndex++;

  const isEnrolled = !!course.enrollment;

  app.innerHTML = `
    <a href="#/courses" class="back-link">← Πίσω στα μαθήματα</a>
    <h2>${escapeHtml(course.title)}</h2>
    <p class="muted">${escapeHtml(course.category_name || 'Χωρίς κατηγορία')} · Εκπαιδευτής: ${escapeHtml(course.instructor_name)}</p>
    <p>${escapeHtml(course.description || '')}</p>
    ${course.prerequisites ? `<p><strong>Προαπαιτούμενες γνώσεις:</strong> ${escapeHtml(course.prerequisites)}</p>` : ''}
    ${!isEnrolled
      ? `<button id="enrollBtn" class="btn btn-primary">Εγγραφή στο Μάθημα</button>`
      : `<span class="badge ${course.enrollment.completed_at ? 'badge-success' : 'badge-info'}">${course.enrollment.completed_at ? '✓ Ολοκληρωμένο' : 'Σε εξέλιξη'}</span>`}
    <div id="msg"></div>

    ${isEnrolled ? `
      <h3 style="margin-top:2rem">Ενότητες</h3>
      <div class="module-list">
        ${modules.map((m, i) => {
        const done = !!progressMap[m.id];
        const unlocked = i <= nextUnlockedIndex;
        return `
          <div class="module-item ${done ? 'done' : ''} ${!unlocked ? 'locked' : ''}">
            <div class="module-header">
              <span>${i + 1}. ${escapeHtml(m.title)}</span>
              ${done ? '<span class="badge badge-success">Ολοκληρώθηκε</span>' : unlocked ? '' : '<span class="badge">🔒 Κλειδωμένη</span>'}
            </div>
            ${unlocked ? `
              <div class="module-body">
                ${m.video_url ? `<div class="video-wrap">${renderVideoEmbed(m.video_url)}</div>` : ''}
                ${m.notes ? `<div class="notes">${escapeHtml(m.notes).replace(/\n/g, '<br>')}</div>` : ''}
                ${!done ? `<button class="btn btn-secondary complete-btn" data-id="${m.id}">Σήμανση ως Ολοκληρωμένη</button>` : ''}
              </div>` : ''}
          </div>`;
        }).join('') || '<p class="muted">Δεν έχουν προστεθεί ενότητες ακόμη.</p>'}
      </div>

      <h3>Κουίζ Αυτοαξιολόγησης</h3>
      <div class="quiz-list">
        ${course.quizzes.length ? course.quizzes.map(q => {
        const gateOk = q.module_id ? !!progressMap[q.module_id] : true;
        return `<div class="quiz-item">
            <span>${escapeHtml(q.title)} <span class="muted">(${Math.round(q.time_limit_seconds / 60)}′ · βάση επιτυχίας ${q.passing_score}%)</span></span>
            ${gateOk ? `<a class="btn btn-primary" href="#/quiz/${q.id}">Έναρξη Κουίζ</a>` : `<span class="badge">🔒 Ολοκληρώστε πρώτα τη σχετική ενότητα</span>`}
          </div>`;
        }).join('') : '<p class="muted">Δεν υπάρχουν ακόμη διαθέσιμα κουίζ.</p>'}
      </div>` : ''}
  `;

  const enrollBtn = document.getElementById('enrollBtn');
  if (enrollBtn) enrollBtn.onclick = async () => {
    try { await api(`/courses/${course.id}/enroll`, { method: 'POST' }); router(); }
    catch (e) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(e.message)}</div>`; }
  };

  app.querySelectorAll('.complete-btn').forEach(btn => {
    btn.onclick = async () => {
      try {
        const r = await api(`/modules/${btn.dataset.id}/complete`, { method: 'POST' });
        router();
        if (r.courseCompleted) setTimeout(() => alert('Συγχαρητήρια! Ολοκληρώσατε το μάθημα και εκδόθηκε το πιστοποιητικό σας — θα το βρείτε στη σελίδα «Πιστοποιητικά».'), 100);
      } catch (e) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(e.message)}</div>`; }
    };
  });
};

Views.learner.myCourses = async function (p, app) {
  const dash = await api('/me/dashboard');
  app.innerHTML = `
    <h2>Η Πρόοδός μου</h2>
    <p>Μέση επίδοση σε κουίζ: <strong>${dash.average_quiz_score !== null ? dash.average_quiz_score + '%' : '—'}</strong></p>
    <div class="progress-list">
      ${dash.courses.length ? dash.courses.map(c => `
        <div class="progress-item">
          <div class="progress-item-header">
            <a href="#/courses/${c.course_id}">${escapeHtml(c.title)}</a>
            ${c.completed_at ? '<span class="badge badge-success">Ολοκληρωμένο</span>' : ''}
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${c.progress_pct}%"></div></div>
          <span class="muted">${c.progress_pct}% · ${c.done_modules}/${c.total_modules} ενότητες</span>
        </div>`).join('') : '<p class="muted">Δεν έχετε εγγραφεί σε κάποιο μάθημα ακόμη. <a href="#/courses">Περιηγηθείτε στον κατάλογο</a>.</p>'}
    </div>`;
};

Views.learner.certificates = async function (p, app) {
  const dash = await api('/me/dashboard');
  app.innerHTML = `
    <h2>Τα Πιστοποιητικά μου</h2>
    <div class="cert-list">
      ${dash.certificates.length ? dash.certificates.map(c => `
        <div class="cert-item">
          <span>${escapeHtml(c.course_title)}</span>
          <span class="muted hint">${c.certificate_code}</span>
          <button class="btn btn-primary dl-btn" data-id="${c.id}">⬇ Λήψη PDF</button>
        </div>`).join('') : '<p class="muted">Δεν έχετε αποκτήσει ακόμη κάποιο πιστοποιητικό. Ολοκληρώστε ένα μάθημα (ενότητες + κουίζ) για να αποκτήσετε το πρώτο σας.</p>'}
    </div>`;
  app.querySelectorAll('.dl-btn').forEach(btn => {
    btn.onclick = () => downloadFile(`/certificates/${btn.dataset.id}/download`, `certificate-${btn.dataset.id}.pdf`);
  });
};

function questionTypeLabel(t) {
  return { multiple_choice: 'Πολλαπλής Επιλογής', true_false: 'Σωστό/Λάθος', matching: 'Αντιστοίχιση' }[t] || t;
}

function renderQuestionInput(q, qi) {
  let inputHtml = '';
  if (q.type === 'matching') {
    const lefts = q.options.filter(o => o.side === 'left');
    const rights = q.options.filter(o => o.side === 'right');
    inputHtml = lefts.map(l => `
      <div class="match-row">
        <span>${escapeHtml(l.option_text)}</span>
        <span>↔</span>
        <select data-q="${q.id}" data-left="${l.id}" class="match-select">
          <option value="">— επιλέξτε αντιστοιχία —</option>
          ${rights.map(r => `<option value="${r.id}">${escapeHtml(r.option_text)}</option>`).join('')}
        </select>
      </div>`).join('');
  } else if (q.type === 'true_false') {
    inputHtml = q.options.map(o => `
      <label class="option-label"><input type="radio" name="q${q.id}" value="${o.id}"> ${escapeHtml(o.option_text)}</label>`).join('');
  } else {
    inputHtml = `<p class="muted" style="margin:.2rem 0 .5rem">Επιλέξτε όλες τις σωστές απαντήσεις.</p>` + q.options.map(o => `
      <label class="option-label"><input type="checkbox" name="q${q.id}" value="${o.id}"> ${escapeHtml(o.option_text)}</label>`).join('');
  }
  return `<div class="question-block" data-qid="${q.id}"><p class="question-text">${qi + 1}. ${escapeHtml(q.question_text)}
    <span class="muted">(${questionTypeLabel(q.type)})</span></p>${inputHtml}</div>`;
}

function collectAnswer(q) {
  if (q.type === 'matching') {
    const matches = [];
    document.querySelectorAll(`.match-select[data-q="${q.id}"]`).forEach(sel => {
      if (sel.value) matches.push({ left_option_id: Number(sel.dataset.left), right_option_id: Number(sel.value) });
    });
    return { question_id: q.id, matches };
  }
  const selected_option_ids = Array.from(document.querySelectorAll(`input[name="q${q.id}"]:checked`)).map(i => Number(i.value));
  return { question_id: q.id, selected_option_ids };
}

Views.learner.takeQuiz = async function (p, app) {
  const data = await api(`/quizzes/${p.id}/take`);
  let timeLeft = data.quiz.time_limit_seconds;
  let submitted = false;

  app.innerHTML = `
    <div class="quiz-header">
      <h2 style="margin:0">${escapeHtml(data.quiz.title)}</h2>
      <div id="timer" class="timer"></div>
    </div>
    <form id="quizForm">
      ${data.questions.map((q, qi) => renderQuestionInput(q, qi)).join('')}
      <button class="btn btn-primary" type="submit">Υποβολή Απαντήσεων</button>
    </form>
    <div id="quizResult"></div>`;

  const timerEl = document.getElementById('timer');
  const updateTimer = () => {
    const m = Math.floor(Math.max(timeLeft, 0) / 60), s = Math.max(timeLeft, 0) % 60;
    timerEl.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    if (timeLeft <= 30) timerEl.classList.add('timer-warning');
  };
  updateTimer();
  const interval = setInterval(() => {
    timeLeft--;
    updateTimer();
    if (timeLeft <= 0) { clearInterval(interval); if (!submitted) doSubmit(); }
  }, 1000);

  async function doSubmit() {
    if (submitted) return;
    submitted = true;
    clearInterval(interval);
    const form = document.getElementById('quizForm');
    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    const answers = data.questions.map(q => collectAnswer(q));
    try {
      const result = await api(`/quizzes/${data.quiz.id}/submit`, { method: 'POST', body: { attempt_id: data.attempt_id, answers } });
      renderResult(result);
    } catch (e) {
      document.getElementById('quizResult').innerHTML = `<div class="alert alert-error">${escapeHtml(e.message)}</div>`;
      submitBtn.disabled = false;
      submitted = false;
    }
  }

  document.getElementById('quizForm').onsubmit = (e) => { e.preventDefault(); doSubmit(); };

  function renderResult(result) {
    document.getElementById('quizForm').style.display = 'none';
    document.getElementById('quizResult').innerHTML = `
      <div class="quiz-result ${result.passed ? 'passed' : 'failed'}">
        <h3>${result.passed ? '✓ Επιτύχατε το κουίζ!' : '✗ Δεν επιτεύχθηκε η βάση επιτυχίας'}</h3>
        <p style="margin:0">Βαθμολογία: <strong>${result.score}%</strong> (βάση επιτυχίας: ${result.passing_score}%)</p>
      </div>
      ${result.courseCompleted ? '<div class="alert alert-success">🎓 Συγχαρητήρια! Ολοκληρώσατε το μάθημα και εκδόθηκε το πιστοποιητικό σας.</div>' : ''}
      <h3>Ανασκόπηση Απαντήσεων</h3>
      <div class="review-list">
        ${result.results.map((r, i) => `
          <div class="review-item ${r.is_correct ? 'correct' : 'incorrect'}">
            <p style="margin:0"><strong>${i + 1}. ${escapeHtml(r.question_text)}</strong> ${r.is_correct ? '✓' : '✗'}</p>
            ${r.explanation ? `<p class="explanation">${escapeHtml(r.explanation)}</p>` : ''}
          </div>`).join('')}
      </div>
      <a class="btn btn-secondary" href="#/courses/${data.quiz.course_id}">← Επιστροφή στο μάθημα</a>`;
  }
};
