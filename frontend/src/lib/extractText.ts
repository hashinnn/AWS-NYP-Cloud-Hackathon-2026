/**
 * UC-006 step 3 — client-side text extraction. The file NEVER goes to
 * Lambda (AGENTS §3): PDFs are read with pdfjs-dist and DOCX with mammoth,
 * in the browser, and only the text is posted to /api/briefs/extract.
 *
 * Both libraries are dynamically imported so students who never upload a
 * brief never download a PDF engine.
 */

// Deadlines almost always sit in the first pages; the server truncates to
// its own token budget anyway, so reading further is wasted work.
const MAX_PDF_PAGES = 4;

export const SUPPORTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
};

export const MAX_BYTES = 5 * 1024 * 1024;

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  for (let i = 1; i <= pages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild line breaks from each item's Y position — the deterministic
    // extractor downstream is line-based, and a page flattened to one long
    // line would hide every bullet and heading from it.
    let text = '';
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) text += '\n';
      else if (text) text += ' ';
      text += item.str ?? '';
      if (y !== undefined) lastY = y;
    }
    parts.push(text);
  }
  return parts.join('\n');
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || '';
}

/**
 * Returns the extracted text, or null when this file kind cannot be read in
 * the browser (images, and anything that fails to parse) — the caller then
 * takes the UC-006 E2 route: the form prefilled with the filename, never a
 * dead end.
 */
export async function extractText(file: File): Promise<string | null> {
  const kind = SUPPORTED_TYPES[file.type];
  if (!kind || kind === 'image') return null;

  try {
    const buffer = await file.arrayBuffer();
    return kind === 'pdf' ? await extractPdf(buffer) : await extractDocx(buffer);
  } catch {
    return null; // corrupt or unreadable — E2, not an error dialog
  }
}
