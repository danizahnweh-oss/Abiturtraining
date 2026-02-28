import { jsPDF } from 'jspdf';

interface FeedbackPdfOptions {
  subject: string;
  schwerpunkt: string;
  level: string;
  feedbackText: string;
}

// Farben
const COLOR = {
  heading: [4, 120, 87] as [number, number, number],       // emerald-700
  text: [30, 41, 59] as [number, number, number],           // slate-800
  light: [100, 116, 139] as [number, number, number],       // slate-500
  accent: [16, 185, 129] as [number, number, number],       // emerald-500
  border: [226, 232, 240] as [number, number, number],      // slate-200
  bullet: [16, 185, 129] as [number, number, number],       // emerald-500
};

const PAGE = {
  marginLeft: 20,
  marginRight: 20,
  marginTop: 20,
  marginBottom: 20,
  width: 210, // A4
  height: 297,
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

export async function downloadFeedbackPdf(opts: FeedbackPdfOptions) {
  const { subject, schwerpunkt, level, feedbackText } = opts;
  const datum = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let y = PAGE.marginTop;

  // --- Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLOR.heading);
  doc.text('Kolloquium – Feedback', PAGE.marginLeft, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.light);
  doc.text(`${subject} (${level})  ·  ${schwerpunkt}  ·  ${datum}`, PAGE.marginLeft, y);
  y += 5;

  // Trennlinie
  doc.setDrawColor(...COLOR.accent);
  doc.setLineWidth(0.6);
  doc.line(PAGE.marginLeft, y, PAGE.width - PAGE.marginRight, y);
  y += 10;

  // --- Feedback-Text parsen und rendern ---
  const lines = feedbackText.split('\n');

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Seitenumbruch prüfen
    if (y > PAGE.height - PAGE.marginBottom - 10) {
      doc.addPage();
      y = PAGE.marginTop;
    }

    // Leerzeile
    if (trimmed === '') {
      y += 4;
      continue;
    }

    // Markdown-Überschrift (## ...)
    if (trimmed.startsWith('## ')) {
      y += 3; // Extra Abstand vor Überschrift
      if (y > PAGE.height - PAGE.marginBottom - 10) {
        doc.addPage();
        y = PAGE.marginTop;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...COLOR.heading);
      const headingText = stripMarkdown(trimmed.slice(3));
      const headingLines = doc.splitTextToSize(headingText, CONTENT_WIDTH);
      doc.text(headingLines, PAGE.marginLeft, y);
      y += headingLines.length * 6 + 4;
      continue;
    }

    // Markdown-Überschrift (### ...)
    if (trimmed.startsWith('### ')) {
      y += 2;
      if (y > PAGE.height - PAGE.marginBottom - 10) {
        doc.addPage();
        y = PAGE.marginTop;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...COLOR.heading);
      const headingText = stripMarkdown(trimmed.slice(4));
      const headingLines = doc.splitTextToSize(headingText, CONTENT_WIDTH);
      doc.text(headingLines, PAGE.marginLeft, y);
      y += headingLines.length * 5.5 + 3;
      continue;
    }

    // Aufzählung (- ...)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = stripMarkdown(trimmed.slice(2));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...COLOR.text);

      // Bullet-Punkt
      doc.setFillColor(...COLOR.bullet);
      doc.circle(PAGE.marginLeft + 2, y - 1.2, 0.8, 'F');

      const bulletLines = doc.splitTextToSize(bulletText, CONTENT_WIDTH - 8);
      doc.text(bulletLines, PAGE.marginLeft + 6, y);
      y += bulletLines.length * 4.5 + 2;

      // Seitenumbruch nach langen Aufzählungen
      if (y > PAGE.height - PAGE.marginBottom - 10) {
        doc.addPage();
        y = PAGE.marginTop;
      }
      continue;
    }

    // Normaler Absatz
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR.text);

    const plainText = stripMarkdown(trimmed);
    const wrappedLines = doc.splitTextToSize(plainText, CONTENT_WIDTH);

    // Prüfen ob der ganze Absatz noch auf die Seite passt
    const blockHeight = wrappedLines.length * 4.5;
    if (y + blockHeight > PAGE.height - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }

    doc.text(wrappedLines, PAGE.marginLeft, y);
    y += blockHeight + 2;
  }

  // --- Footer ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.light);
    doc.setDrawColor(...COLOR.border);
    doc.line(PAGE.marginLeft, PAGE.height - 15, PAGE.width - PAGE.marginRight, PAGE.height - 15);
    doc.text(
      'Erstellt mit myAbiFlow Kolloquiumstrainer · myabiflow.de',
      PAGE.width / 2, PAGE.height - 10,
      { align: 'center' },
    );
    doc.text(
      `Seite ${i} / ${totalPages}`,
      PAGE.width - PAGE.marginRight, PAGE.height - 10,
      { align: 'right' },
    );
  }

  doc.save(`Kolloquium-Feedback-${subject}.pdf`);
}

/** Entfernt Markdown-Formatierungen (**fett**, *kursiv*) aus Text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // **fett** → fett
    .replace(/\*(.*?)\*/g, '$1')        // *kursiv* → kursiv
    .replace(/`(.*?)`/g, '$1');         // `code` → code
}
