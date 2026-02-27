import html2pdf from 'html2pdf.js';

interface FeedbackPdfOptions {
  subject: string;
  schwerpunkt: string;
  level: string;
  feedbackText: string;
}

export async function downloadFeedbackPdf(opts: FeedbackPdfOptions) {
  const { subject, schwerpunkt, level, feedbackText } = opts;
  const datum = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Feedback-Text in HTML umwandeln (Markdown-Überschriften → <h3>, Absätze → <p>)
  const htmlBody = feedbackText
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) return `<h3 style="margin:16px 0 8px;font-size:15px;color:#047857;">${trimmed.slice(3)}</h3>`;
      if (trimmed.startsWith('- ')) return `<li style="margin:2px 0;margin-left:16px;">${trimmed.slice(2)}</li>`;
      if (trimmed === '') return '<br/>';
      // Fett-Markierungen
      const withBold = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return `<p style="margin:4px 0;line-height:1.6;">${withBold}</p>`;
    })
    .join('');

  const container = document.createElement('div');
  container.innerHTML = `
    <div style="font-family:'Inter',system-ui,sans-serif;color:#1e293b;padding:24px;max-width:100%;">
      <div style="border-bottom:2px solid #10b981;padding-bottom:16px;margin-bottom:20px;">
        <h1 style="font-size:22px;margin:0 0 4px;">Kolloquium – Feedback</h1>
        <p style="font-size:13px;color:#64748b;margin:0;">
          ${subject} (${level}) · ${schwerpunkt} · ${datum}
        </p>
      </div>
      <div style="font-size:13px;">${htmlBody}</div>
      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
        Erstellt mit myAbiFlow Kolloquiumstrainer · myabiflow.de
      </div>
    </div>
  `;

  document.body.appendChild(container);

  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: `Kolloquium-Feedback-${subject}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(container)
    .save();

  document.body.removeChild(container);
}
