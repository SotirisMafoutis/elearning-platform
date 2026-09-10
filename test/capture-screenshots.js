const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT = '/tmp/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSelector(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { timeout });
}

async function shoot(page, name) {
  await sleep(250); // μικρή παύση για ολοκλήρωση animations/fonts
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log('  📸', name);
}

async function login(page, email, password) {
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle0' });
  await waitForSelector(page, '#loginForm');
  await page.type('#loginForm [name="email"]', email);
  await page.type('#loginForm [name="password"]', password);
  await Promise.all([
    page.waitForFunction(() => !location.hash.includes('/login'), { timeout: 8000 }),
    page.click('#loginForm button[type="submit"]'),
  ]);
  await sleep(400);
}

async function goto(page, hash, selector) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  if (selector) await waitForSelector(page, selector).catch(() => {});
  await sleep(350);
}

(async () => {
  const execPath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none', '--force-color-profile=srgb', '--lang=el-GR'],
    defaultViewport: { width: 1440, height: 900 },
    executablePath: execPath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9' });

    // ============ ΣΕΛΙΔΕΣ ΕΙΣΟΔΟΥ ============
    console.log('Είσοδος / Εγγραφή');
    await page.goto(BASE + '/#/login', { waitUntil: 'networkidle0' });
    await waitForSelector(page, '#loginForm');
    await shoot(page, '01-login.png');

    await goto(page, '#/register', '#registerForm');
    await shoot(page, '02-register.png');

    // ============ ΕΚΠΑΙΔΕΥΟΜΕΝΟΣ (Γιώργος — μερική πρόοδος) ============
    console.log('Εκπαιδευόμενος: Γιώργος Αντωνίου');
    await login(page, 'giorgos.antoniou@example.gr', 'test1234');

    await goto(page, '#/courses', '.card-grid, .empty-state');
    await shoot(page, '03-learner-course-catalog.png');

    await goto(page, '#/courses/1', '.module-list, .module-item');
    await shoot(page, '04-learner-course-detail.png');

    // άνοιγμα πρώτης ενότητας (ήδη ολοκληρωμένης) για να φανεί το βίντεο/σημειώσεις
    const moduleHeader = await page.$('.module-header, .module-item');
    if (moduleHeader) { await moduleHeader.click(); await sleep(400); }
    await shoot(page, '05-learner-module-open.png');

    await goto(page, '#/my-courses', '.progress-bar, .empty-state');
    await shoot(page, '06-learner-my-progress.png');

    // Κουίζ — λήψη οθόνης πριν την υποβολή
    await goto(page, '#/quiz/1', '#quizForm');
    await shoot(page, '07-learner-quiz-taking.png');

    // Απάντηση ΣΩΣΤΑ (ώστε το screenshot αποτελέσματος να δείχνει επιτυχία) & υποβολή
    await page.evaluate(() => {
      // Ερ.1 (Πολλαπλής Επιλογής): let, const, var
      document.querySelectorAll('#quizForm input[type=checkbox]').forEach(cb => {
        const label = cb.closest('label') || cb.parentElement;
        const txt = (label.textContent || '').trim();
        cb.checked = ['let', 'const', 'var'].includes(txt);
      });
      // Ερ.2 (Σωστό/Λάθος): Λάθος
      document.querySelectorAll('#quizForm input[type=radio]').forEach(r => {
        const label = r.closest('label') || r.parentElement;
        if ((label.textContent || '').trim() === 'Λάθος') r.checked = true;
      });
      // Ερ.3 (Αντιστοίχιση): επιλογή σωστού ζεύγους σε κάθε select βάσει του ορατού αριστερού label
      const pairMap = { Number: '42', String: '"Γεια σου"', Boolean: 'true' };
      document.querySelectorAll('#quizForm select').forEach(sel => {
        const row = sel.closest('.match-row') || sel.parentElement;
        const leftText = (row.textContent || '').trim();
        const key = Object.keys(pairMap).find(k => leftText.startsWith(k));
        if (!key) return;
        const wanted = pairMap[key];
        [...sel.options].forEach(opt => { if (opt.text.trim() === wanted) sel.value = opt.value; });
      });
    });
    await sleep(150);
    await page.evaluate(() => document.getElementById('quizForm').requestSubmit ? document.getElementById('quizForm').requestSubmit() : document.querySelector('#quizForm button[type=submit]').click());
    await waitForSelector(page, '#quizResult', 8000).catch(() => {});
    await sleep(400);
    await shoot(page, '08-learner-quiz-result.png');

    // Πιστοποιητικά — χρήση της Ελένης που έχει ήδη ολοκληρώσει το μάθημα
    console.log('Εκπαιδευόμενος: Ελένη Βασιλείου (ολοκληρωμένο μάθημα)');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'eleni.vasileiou@example.gr', 'test1234');
    await goto(page, '#/certificates', '.cert-list, .empty-state');
    await shoot(page, '09-learner-certificates.png');
    await goto(page, '#/my-courses', '.progress-bar');
    await shoot(page, '10-learner-course-completed.png');

    // ============ ΕΚΠΑΙΔΕΥΤΗΣ (Μαρία Παπαδοπούλου) ============
    console.log('Εκπαιδευτής: Μαρία Παπαδοπούλου');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'maria.papadopoulou@example.gr', 'test1234');

    await goto(page, '#/instructor', '.card-grid, .empty-state');
    await shoot(page, '11-instructor-dashboard.png');

    await goto(page, '#/instructor/courses/new', '#courseForm');
    await shoot(page, '12-instructor-new-course.png');

    // Επεξεργασία πρόχειρου μαθήματος (course id 3)
    await goto(page, '#/instructor/courses/3', '#moduleForm, .module-list');
    await shoot(page, '13-instructor-edit-course.png');

    // Τράπεζα ερωτήσεων (μάθημα 1, δημοσιευμένο, με 3 ερωτήσεις)
    await goto(page, '#/instructor/courses/1/questions', '#qForm, .data-table');
    await shoot(page, '14-instructor-question-bank.png');

    // Διαχείριση κουίζ
    await goto(page, '#/instructor/courses/1/quizzes', '#quizForm, .data-table');
    await shoot(page, '15-instructor-quiz-manager.png');

    // Ανάλυση επίδοσης
    await goto(page, '#/instructor/courses/1/analytics', '.data-table, .stats-card');
    await shoot(page, '16-instructor-analytics.png');

    // ============ ΔΙΑΧΕΙΡΙΣΤΗΣ ============
    console.log('Διαχειριστής');
    await page.evaluate(() => localStorage.clear());
    await login(page, 'admin@elearning.gr', 'Admin123!');

    await goto(page, '#/admin', '.card-grid, .stats-card');
    await shoot(page, '17-admin-dashboard.png');

    await goto(page, '#/admin/instructors', '.data-table, .empty-state');
    await shoot(page, '18-admin-instructor-approvals.png');

    await goto(page, '#/admin/courses', '.data-table, .empty-state');
    await shoot(page, '19-admin-course-approvals.png');

    await goto(page, '#/admin/categories', '#catForm, .data-table');
    await shoot(page, '20-admin-categories.png');

    await goto(page, '#/admin/certificates', '.template-list, .data-table');
    await shoot(page, '21-admin-certificate-templates.png');

    await goto(page, '#/admin/stats', '.stats-card, .funnel-bar-bg');
    await shoot(page, '22-admin-platform-stats.png');

    console.log('\n✅ Όλα τα screenshots δημιουργήθηκαν στο', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ΣΦΑΛΜΑ:', e); process.exit(1); });
