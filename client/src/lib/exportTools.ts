// Teacher tools: CSV export of a class ranking and a printable certificate (PNG, drawn on a canvas).
// Nothing here talks to the network.

export interface ExportRow {
  rank: number;
  name: string;
  wpm: number;
  accuracy: number;
  score: number;
}

/** One CSV cell. Quotes when needed and defuses spreadsheet formulas (=, +, -, @, tab, CR at the start). */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function classCsv(className: string, round: number, rows: ExportRow[], waiting: string[] = []): string {
  const lines: string[] = [];
  lines.push(['Class', 'Round', 'Rank', 'Name', 'WPM', 'Accuracy %', 'Score', 'Status'].map(csvCell).join(','));
  for (const r of rows) {
    lines.push([className, round, r.rank, r.name, Math.round(r.wpm), Math.round(r.accuracy), Math.round(r.score), 'finished'].map(csvCell).join(','));
  }
  for (const n of waiting) {
    lines.push([className, round, '', n, '', '', '', 'not finished'].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function safeFileName(s: string): string {
  const out = s.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return out || 'typerush';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(csv: string, fileName: string): void {
  // The BOM makes Excel open UTF-8 (Hindi names) correctly.
  downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), fileName);
}

export interface CertificateInfo {
  name: string;
  title: string; // e.g. "Class 10-A, round 3"
  wpm: number;
  accuracy: number;
  rank: number | null;
  date: string; // already formatted
  issuer: string; // teacher or "TypeRush"
}

/** Draws a landscape certificate. Honest wording: a participation/result record, not an exam certificate. */
export function drawCertificate(canvas: HTMLCanvasElement, c: CertificateInfo): void {
  const W = 1600;
  const H = 1130;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#fffdf7';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1f3a8a';
  g.lineWidth = 14;
  g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = '#f59e0b';
  g.lineWidth = 4;
  g.strokeRect(68, 68, W - 136, H - 136);
  g.textAlign = 'center';
  g.fillStyle = '#1f3a8a';
  g.font = 'bold 74px system-ui, "Segoe UI", sans-serif';
  g.fillText('Certificate of Achievement', W / 2, 260);
  g.fillStyle = '#444';
  g.font = '34px system-ui, "Segoe UI", sans-serif';
  g.fillText('This is to certify that', W / 2, 360);
  g.fillStyle = '#111';
  let size = 96;
  g.font = `bold ${size}px system-ui, "Segoe UI", "Nirmala UI", sans-serif`;
  while (g.measureText(c.name).width > W - 300 && size > 36) {
    size -= 4;
    g.font = `bold ${size}px system-ui, "Segoe UI", "Nirmala UI", sans-serif`;
  }
  g.fillText(c.name, W / 2, 500);
  g.fillStyle = '#444';
  g.font = '34px system-ui, "Segoe UI", sans-serif';
  g.fillText(`took part in the typing race "${c.title}" on TypeRush`, W / 2, 590);
  g.fillText('and recorded', W / 2, 640);
  g.fillStyle = '#1f3a8a';
  g.font = 'bold 64px system-ui, "Segoe UI", sans-serif';
  const rank = c.rank ? `   |   Rank #${c.rank}` : '';
  g.fillText(`${Math.round(c.wpm)} WPM   |   ${Math.round(c.accuracy)}% accuracy${rank}`, W / 2, 750);
  g.fillStyle = '#555';
  g.font = '30px system-ui, "Segoe UI", sans-serif';
  g.fillText(`Date: ${c.date}`, W / 2, 870);
  g.fillText(`Issued by: ${c.issuer}`, W / 2, 920);
  g.fillStyle = '#888';
  g.font = '24px system-ui, "Segoe UI", sans-serif';
  g.fillText('A TypeRush class result. Speeds are checked for plausibility only; this is not an official exam certificate.', W / 2, 1010);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
