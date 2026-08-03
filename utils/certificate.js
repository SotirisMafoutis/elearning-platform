// Δημιουργία PDF πιστοποιητικού ολοκλήρωσης με χρήση pdfkit.
// Χρησιμοποιούμε τη γραμματοσειρά DejaVu Sans (ενσωματωμένη στο assets/fonts)
// επειδή οι ενσωματωμένες γραμματοσειρές του pdfkit (Helvetica κ.λπ.) δεν
// υποστηρίζουν ελληνικούς χαρακτήρες.

const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

function fillTemplate(str, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`{{${key}}}`).join(value === null || value === undefined ? '—' : String(value)),
    str || ''
  );
}

function renderCertificatePDF({ res, learnerName, courseTitle, issuedAt, code, template, avgScore }) {
  const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });
  doc.registerFont('Body', FONT_REGULAR);
  doc.registerFont('Heading', FONT_BOLD);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${code}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height;
  const titleText = (template && template.title_text) || 'Πιστοποιητικό Ολοκλήρωσης';
  const bodyText = fillTemplate(template && template.body_text, {
    learner_name: learnerName,
    course_title: courseTitle,
    avg_score: avgScore !== null && avgScore !== undefined ? avgScore : '—'
  }) || `Απονέμεται στον/στην ${learnerName} για την επιτυχή ολοκλήρωση του μαθήματος «${courseTitle}».`;

  // Φόντο & διακοσμητικά πλαίσια
  doc.rect(0, 0, W, H).fill('#FFFFFF');
  doc.rect(24, 24, W - 48, H - 48).lineWidth(2).stroke('#22364F');
  doc.rect(34, 34, W - 68, H - 68).lineWidth(0.75).stroke('#C99A3D');

  doc.fillColor('#C99A3D').font('Heading').fontSize(11)
    .text('EDUQUIZ · ΠΛΑΤΦΟΡΜΑ ΗΛΕΚΤΡΟΝΙΚΗΣ ΜΑΘΗΣΗΣ', 0, 70, { align: 'center', characterSpacing: 2 });

  doc.fillColor('#22364F').font('Heading').fontSize(34)
    .text(titleText, 80, 110, { align: 'center', width: W - 160 });

  doc.moveTo(W / 2 - 60, 168).lineTo(W / 2 + 60, 168).lineWidth(1.5).stroke('#C99A3D');

  doc.fillColor('#2A3441').font('Body').fontSize(16)
    .text(bodyText, 110, 205, { align: 'center', width: W - 220, lineGap: 6 });

  doc.fillColor('#5B6675').font('Body').fontSize(10)
    .text(`Κωδικός Πιστοποιητικού: ${code}`, 0, H - 96, { align: 'center' })
    .text(`Ημερομηνία Έκδοσης: ${issuedAt}`, 0, H - 80, { align: 'center' });

  doc.end();
}

module.exports = { renderCertificatePDF };
