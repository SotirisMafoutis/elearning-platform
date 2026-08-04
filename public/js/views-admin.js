var Views = window.Views = window.Views || {};
Views.admin = {};

Views.admin.dashboard = async function (p, app) {
  const [pendingInstructors, pendingCourses] = await Promise.all([api('/admin/instructors/pending'), api('/admin/courses/pending')]);
  app.innerHTML = `
    <h2>Πίνακας Διαχειριστή</h2>
    <div class="card-grid">
      <div class="card">
        <h3 style="font-family:var(--font-body); font-size:2rem; color:var(--color-gold)">
          ${pendingInstructors.length}
        </h3>
        <p class="muted">
          Εκπαιδευτές σε αναμονή έγκρισης
        </p>
          <a href="#/admin/instructors">Προβολή →</a>
        </div>
      <div class="card">
        <h3 style="font-family:var(--font-body); font-size:2rem; color:var(--color-gold)">
          ${pendingCourses.length}
        </h3>
        <p class="muted">Μαθήματα σε αναμονή έγκρισης</p>
        <a href="#/admin/courses">Προβολή →</a></div>
    </div>`;
};

Views.admin.instructors = async function (p, app) {
  const instructors = await api('/admin/instructors');
  app.innerHTML = `
    <h2>Εκπαιδευτές</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>Όνομα</th>
          <th>Email</th>
          <th>Κατάσταση</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${instructors.map(i => `
          <tr><td>${escapeHtml(i.full_name)}</td><td>${escapeHtml(i.email)}</td>
          <td>${i.is_approved ? '<span class="badge badge-success">Εγκεκριμένος</span>' : '<span class="badge badge-info">Σε αναμονή</span>'}</td>
          <td>${!i.is_approved ? `<button class="btn btn-primary approve-btn" data-id="${i.id}">Έγκριση</button> <button class="btn btn-ghost reject-btn" data-id="${i.id}">Απόρριψη</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">Δεν υπάρχουν εκπαιδευτές ακόμη.</td></tr>'}
      </tbody>
    </table>`;

  app.querySelectorAll('.approve-btn').forEach(b => b.onclick = async () => { 
    await api(`/admin/instructors/${b.dataset.id}/approve`, { method: 'POST' }); 
    router(); 
  });
  
  app.querySelectorAll('.reject-btn').forEach(b => b.onclick = async () => { 
    if (confirm('Απόρριψη αίτησης εκπαιδευτή;')) { 
      await api(`/admin/instructors/${b.dataset.id}/reject`, { method: 'POST' }); router(); 
    } 
  });
};

Views.admin.coursesReview = async function (p, app) {
  const pending = await api('/admin/courses/pending');
  app.innerHTML = `
    <h2>Μαθήματα προς Έγκριση</h2>
    ${pending.length ? pending.map(c => `
      <div class="card" style="margin-bottom:1rem">
        <h3>${escapeHtml(c.title)}</h3>
        <p class="muted">Εκπαιδευτής: ${escapeHtml(c.instructor_name)}</p>
        <p>${escapeHtml(c.description || '')}</p>
        ${c.prerequisites ? `<p class="muted">Προαπαιτούμενα: ${escapeHtml(c.prerequisites)}</p>` : ''}
        <button class="btn btn-primary approve-c" data-id="${c.id}">Έγκριση & Δημοσίευση</button>
        <button class="btn btn-ghost reject-c" data-id="${c.id}">Απόρριψη</button>
      </div>`).join('') : '<p class="muted">Δεν υπάρχουν μαθήματα σε αναμονή έγκρισης.</p>'}`;

  app.querySelectorAll('.approve-c').forEach(b => b.onclick = async () => { await api(`/admin/courses/${b.dataset.id}/approve`, { method: 'POST' }); router(); });
  app.querySelectorAll('.reject-c').forEach(b => b.onclick = async () => { if (confirm('Απόρριψη μαθήματος;')) { await api(`/admin/courses/${b.dataset.id}/reject`, { method: 'POST' }); router(); } });
};

Views.admin.categories = async function (p, app) {
  const categories = await api('/categories');
  app.innerHTML = `
    <h2>Θεματικές Κατηγορίες</h2>
    <table class="data-table">
      <thead><tr><th>Όνομα</th><th>Περιγραφή</th><th></th></tr></thead>
      <tbody>
        ${categories.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.description || '')}</td>
          <td><button class="btn btn-ghost del-cat" data-id="${c.id}">Διαγραφή</button></td></tr>`).join('') || '<tr><td colspan="3">Δεν υπάρχουν κατηγορίες.</td></tr>'}
      </tbody>
    </table>
    <h3>Νέα Κατηγορία</h3>
    <form id="catForm">
      <label>Όνομα</label>
      <input type="text" name="name" required>
      <label>Περιγραφή</label>
      <input type="text" name="description">
      <button class="btn btn-primary" type="submit">Προσθήκη Κατηγορίας</button>
    </form>
    <div id="msg"></div>`;

  document.getElementById('catForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await api('/admin/categories', { method: 'POST', body: { name: fd.get('name'), description: fd.get('description') } }); router(); }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };
  app.querySelectorAll('.del-cat').forEach(b => b.onclick = async () => {
    try { await api(`/admin/categories/${b.dataset.id}`, { method: 'DELETE' }); router(); }
    catch (err) { alert(err.message); }
  });
};

Views.admin.certificateTemplates = async function (p, app) {
  const templates = await api('/admin/certificate-templates');
  app.innerHTML = `
    <h2>Πρότυπα Πιστοποιητικών</h2>
    <div class="template-list">
      ${templates.map(t => `
        <div class="card">
          <h3>${escapeHtml(t.name)} ${t.is_default ? '<span class="badge badge-success">Προεπιλογή</span>' : ''}</h3>
          <p style="font-family:var(--font-display); font-weight:600">${escapeHtml(t.title_text)}</p>
          <p class="muted">${escapeHtml(t.body_text)}</p>
          ${!t.is_default ? `<button class="btn btn-secondary set-default" data-id="${t.id}">Ορισμός ως Προεπιλογή</button>` : ''}
          <button class="btn btn-ghost del-tpl" data-id="${t.id}">Διαγραφή</button>
        </div>`).join('') || '<p class="muted">Δεν υπάρχουν πρότυπα.</p>'}
    </div>
    <h3>Νέο Πρότυπο</h3>
    <form id="tplForm">
      <label>Όνομα Προτύπου</label>
      <input type="text" name="name" required>
      <label>Τίτλος Πιστοποιητικού</label>
      <input type="text" name="title_text" value="Πιστοποιητικό Ολοκλήρωσης">
      <label>Κείμενο (διαθέσιμα: {{learner_name}}, {{course_title}}, {{avg_score}})</label>
      <textarea name="body_text" rows="3">Απονέμεται στον/στην {{learner_name}} για την επιτυχή ολοκλήρωση του μαθήματος «{{course_title}}» με μέση επίδοση {{avg_score}}%.</textarea>
      <label class="option-label" style="margin-top:.9rem"><input type="checkbox" name="is_default"> Ορισμός ως προεπιλεγμένο πρότυπο</label>
      <button class="btn btn-primary" type="submit">Δημιουργία Προτύπου</button>
    </form>
    <div id="msg"></div>`;

  document.getElementById('tplForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/certificate-templates', { method: 'POST', body: { name: fd.get('name'), title_text: fd.get('title_text'), body_text: fd.get('body_text'), is_default: fd.get('is_default') === 'on' } });
      router();
    } catch (err) { document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`; }
  };
  app.querySelectorAll('.set-default').forEach(b => b.onclick = async () => { await api(`/admin/certificate-templates/${b.dataset.id}`, { method: 'PUT', body: { is_default: true } }); router(); });
  app.querySelectorAll('.del-tpl').forEach(b => b.onclick = async () => { if (confirm('Διαγραφή προτύπου;')) { await api(`/admin/certificate-templates/${b.dataset.id}`, { method: 'DELETE' }); router(); } });
};

Views.admin.stats = async function (p, app) {
  const stats = await api('/admin/stats');
  app.innerHTML = `
    <h2>Στατιστικά Πλατφόρμας</h2>
    ${stats.length ? stats.map(s => `
      <div class="card stats-card">
        <h3>${escapeHtml(s.title)}</h3>
        <p style="margin-bottom:.6rem">Εγγραφές: <strong>${s.total_enrollments}</strong> · Ποσοστό Ολοκλήρωσης: <strong>${s.completion_rate}%</strong></p>
        ${s.dropout_point ? `<div class="alert alert-warning" style="margin:0 0 .8rem">⚠ Κύριο σημείο εγκατάλειψης: <strong>${escapeHtml(s.dropout_point)}</strong></div>` : ''}
        <div class="funnel">
          ${s.funnel.map(f => `
            <div class="funnel-row">
              <span class="funnel-label" title="${escapeHtml(f.title)}">${escapeHtml(f.title)}</span>
              <div class="funnel-bar-bg"><div class="funnel-bar" style="width:${s.total_enrollments ? Math.round((f.reached / s.total_enrollments) * 100) : 0}%"></div></div>
              <span class="funnel-count">${f.reached}/${s.total_enrollments}</span>
            </div>`).join('')}
        </div>
      </div>`).join('') : '<p class="muted">Δεν υπάρχουν ακόμη δημοσιευμένα μαθήματα με δεδομένα εγγραφών.</p>'}`;
};
