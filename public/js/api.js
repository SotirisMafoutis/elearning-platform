// Απλός client για το REST API + διαχείριση της συνεδρίας (JWT) στο localStorage.
const API_BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });

  if (res.status === 401) {
    clearSession();
    location.hash = '#/login';
    throw new Error('Η συνεδρία έληξε. Παρακαλώ συνδεθείτε ξανά.');
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* χωρίς σώμα απάντησης */ }
  if (!res.ok) throw new Error((data && data.error) || 'Παρουσιάστηκε σφάλμα.');
  return data;
}

async function downloadFile(path, filename) {
  const token = getToken();
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { alert('Η λήψη απέτυχε.'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Ανεβάζει ένα αρχείο (multipart/form-data) με το token της συνεδρίας. Δεν ορίζουμε
// εμείς το Content-Type — ο browser βάζει αυτόματα το σωστό boundary για FormData.
async function uploadFile(path, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(API_BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });

  if (res.status === 401) {
    clearSession();
    location.hash = '#/login';
    throw new Error('Η συνεδρία έληξε. Παρακαλώ συνδεθείτε ξανά.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* χωρίς σώμα απάντησης */ }
  if (!res.ok) throw new Error((data && data.error) || 'Το ανέβασμα του αρχείου απέτυχε.');
  return data;
}

// Φέρνει ένα αρχείο με αυθεντικοποίηση και επιστρέφει ένα blob URL, χρήσιμο για
// ενσωματωμένη προβολή (π.χ. PDF σε <iframe>) χωρίς να διαρρεύσει το token σε URL.
async function getFileBlobUrl(path) {
  const token = getToken();
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Η φόρτωση του αρχείου απέτυχε.');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('el-GR', { year: 'numeric', month: 'short', day: 'numeric' });
}
