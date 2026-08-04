const routes = [
  { path: '/login', view: renderLogin, public: true },
  { path: '/register', view: renderRegister, public: true },
  { path: '/home', view: renderHome },
  { path: '/courses', view: (p, app) => Views.learner.browseCourses(p, app), roles: ['learner'] },
  { path: '/courses/:id', view: (p, app) => Views.learner.courseDetail(p, app), roles: ['learner'] },
  { path: '/my-courses', view: (p, app) => Views.learner.myCourses(p, app), roles: ['learner'] },
  { path: '/certificates', view: (p, app) => Views.learner.certificates(p, app), roles: ['learner'] },
  { path: '/quiz/:id', view: (p, app) => Views.learner.takeQuiz(p, app), roles: ['learner'] },

  { path: '/instructor', view: (p, app) => Views.instructor.dashboard(p, app), roles: ['instructor'] },
  { path: '/instructor/courses/new', view: (p, app) => Views.instructor.courseForm(p, app), roles: ['instructor'] },
  { path: '/instructor/courses/:id', view: (p, app) => Views.instructor.courseEdit(p, app), roles: ['instructor'] },
  { path: '/instructor/courses/:id/questions', view: (p, app) => Views.instructor.questionBank(p, app), roles: ['instructor'] },
  { path: '/instructor/courses/:id/quizzes', view: (p, app) => Views.instructor.quizManager(p, app), roles: ['instructor'] },
  { path: '/instructor/courses/:id/analytics', view: (p, app) => Views.instructor.analytics(p, app), roles: ['instructor'] },

  { path: '/admin', view: (p, app) => Views.admin.dashboard(p, app), roles: ['admin'] },
  { path: '/admin/instructors', view: (p, app) => Views.admin.instructors(p, app), roles: ['admin'] },
  { path: '/admin/courses', view: (p, app) => Views.admin.coursesReview(p, app), roles: ['admin'] },
  { path: '/admin/categories', view: (p, app) => Views.admin.categories(p, app), roles: ['admin'] },
  { path: '/admin/certificates', view: (p, app) => Views.admin.certificateTemplates(p, app), roles: ['admin'] },
  { path: '/admin/stats', view: (p, app) => Views.admin.stats(p, app), roles: ['admin'] },
];

function parseHash() {
  let hash = location.hash.replace(/^#/, '') || '/home';
  const [pathPart, queryPart] = hash.split('?');
  return { path: pathPart, query: new URLSearchParams(queryPart || '') };
}

function matchRoute(path) {
  for (const route of routes) {
    const routeParts = route.path.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (routeParts[i] !== pathParts[i]) {
        ok = false; break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

async function router() {
  const { path, query } = parseHash();
  const match = matchRoute(path);
  const app = document.getElementById('app');
  const user = getUser();

  renderHeader();

  if (!match) {
    app.innerHTML = `<p class="muted">Η σελίδα δεν βρέθηκε. <a href="#/home">Αρχική</a></p>`;
    return;
  }

  const { route, params } = match;
  const p = { ...params, query };

  if (!route.public && !user) { location.hash = '#/login'; return; }
  if (route.roles && user && !route.roles.includes(user.role)) {
    app.innerHTML = `<p class="muted">Δεν έχετε πρόσβαση σε αυτή τη σελίδα. <a href="#/home">Αρχική</a></p>`;
    return;
  }
  if (route.public && user && (path === '/login' || path === '/register')) { location.hash = '#/home'; return; }

  app.innerHTML = `<p class="loading">Φόρτωση…</p>`;
  try {
    await route.view(p, app);
  } catch (err) {
    app.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message || 'Παρουσιάστηκε σφάλμα.')}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);


function renderHeader() {
  const header = document.getElementById('header');
  header.className = 'site-header';
  const user = getUser();

  if (!user) {
    header.innerHTML = `<a href="#/login" class="brand">◆ EduQuiz</a>`;
    return;
  }

  const roleLabels = { learner: 'Εκπαιδευόμενος', instructor: 'Εκπαιδευτής', admin: 'Διαχειριστής' };
  let links = [];
  if (user.role === 'learner') {
    links = [['/courses', 'Μαθήματα'], ['/my-courses', 'Η πρόοδός μου'], ['/certificates', 'Πιστοποιητικά']];
  } else if (user.role === 'instructor') {
    links = [['/instructor', 'Τα μαθήματά μου'], ['/instructor/courses/new', '+ Νέο μάθημα']];
  } else if (user.role === 'admin') {
    links = [['/admin', 'Πίνακας'], ['/admin/instructors', 'Εκπαιδευτές'], ['/admin/courses', 'Μαθήματα'], ['/admin/categories', 'Κατηγορίες'], ['/admin/certificates', 'Πρότυπα'], ['/admin/stats', 'Στατιστικά']];
  }

  header.innerHTML = `
    <a href="#/home" class="brand">◆ EduQuiz</a>
    <nav>${links.map(([href, label]) => `<a href="#${href}">${escapeHtml(label)}</a>`).join('')}</nav>
    <div class="user-menu">
      <span>${escapeHtml(user.full_name || user.email)} <span class="badge badge-info">${roleLabels[user.role] || user.role}</span></span>
      <button class="btn btn-ghost" id="logoutBtn">Έξοδος</button>
    </div>`;

  document.getElementById('logoutBtn').onclick = () => { clearSession(); location.hash = '#/login'; router(); };
}

//  Είσοδος / Εγγραφή
function renderLogin(p, app) {
  app.innerHTML = `
    <div class="auth-card">
      <h2>Σύνδεση</h2>
      <form id="loginForm">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email">
        <label>Κωδικός</label>
        <input type="password" name="password" required autocomplete="current-password">
        <button class="btn btn-primary" type="submit" style="align-self:stretch; justify-content:center;">Σύνδεση</button>
      </form>
      <div id="msg"></div>
      <p>Δεν έχετε λογαριασμό; <a href="#/register">Εγγραφή</a></p>
      <p class="hint">Διαχειριστής (demo): admin@elearning.gr / Admin123!</p>
    </div>`;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      setSession(data.token, data.user);
      location.hash = '#/home';
      router();
    } catch (err) {
      document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  };
}

function renderRegister(p, app) {
  app.innerHTML = `
    <div class="auth-card">
      <h2>Εγγραφή</h2>
      <form id="registerForm">
        <label>Ονοματεπώνυμο</label>
        <input type="text" name="full_name" required>
        <label>Email</label>
        <input type="email" name="email" required>
        <label>Κωδικός (τουλάχιστον 6 χαρακτήρες)</label>
        <input type="password" name="password" minlength="6" required>
        <label>Ρόλος</label>
        <select name="role">
          <option value="learner">Εκπαιδευόμενος</option>
          <option value="instructor">Εκπαιδευτής</option>
        </select>
        <p class="muted" style="font-size:.82rem;">Οι λογαριασμοί εκπαιδευτών χρειάζονται έγκριση από τον διαχειριστή πριν δημιουργήσουν μαθήματα.</p>
        <button class="btn btn-primary" type="submit" style="align-self:stretch; justify-content:center;">Δημιουργία λογαριασμού</button>
      </form>
      <div id="msg"></div>
      <p>Έχετε ήδη λογαριασμό; <a href="#/login">Σύνδεση</a></p>
    </div>`;

  document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api('/auth/register', { method: 'POST', body: { full_name: fd.get('full_name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('role') } });
      document.getElementById('msg').innerHTML = `<div class="alert alert-success">${escapeHtml(data.message)}</div>`;
      e.target.reset();
      setTimeout(() => { location.hash = '#/login'; router(); }, 1600);
    } catch (err) {
      document.getElementById('msg').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  };
}

function renderHome() {
  const user = getUser();
  const dest = { learner: '#/courses', instructor: '#/instructor', admin: '#/admin' }[user.role] || '#/login';
  location.hash = dest;
  router();
}
